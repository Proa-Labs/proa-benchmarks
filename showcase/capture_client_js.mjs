// Copyright Proa Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cpus, freemem, hostname, platform, release, totalmem } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	brotliCompressSync,
	gzipSync,
	constants as zlibConstants,
} from "node:zlib";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { chromium } from "playwright";

import {
	executedIntervals,
	mergeIntervals,
	stableStringHash,
	shuffled,
	summarizeNumbers,
	utf8BytesForIntervals,
} from "./client_js_stats.mjs";
import {
	INTERACTIVE_PAGES,
	PAGE_METADATA,
	runInteractionWorkload,
} from "./workloads.mjs";

const require = createRequire(import.meta.url);
const playwrightVersion = require("playwright/package.json").version;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const COVERAGE_SOURCE = Symbol("coverageSource");
const COVERAGE_INTERVALS = Symbol("coverageIntervals");

const PROFILE_CATALOG = {
	desktop: {
		viewport: { width: 1_440, height: 1_000 },
		deviceScaleFactor: 1,
		cpuSlowdown: 1,
		latencyMs: 5,
		downloadKbps: 100_000,
		uploadKbps: 100_000,
	},
	mobile4x: {
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
		cpuSlowdown: 4,
		latencyMs: 40,
		downloadKbps: 10_000,
		uploadKbps: 5_000,
	},
};

function usage(message) {
	if (message) process.stderr.write(`${message}\n\n`);
	process.stderr.write(`Usage: node showcase/capture_client_js.mjs [options]

Options:
  --dump PATH             Linked showcase dump binary
  --pages CSV             Interactive pages (default: all four)
  --profiles CSV          desktop,mobile4x (default: both)
  --runs N                Recorded cold-context samples per cell (default: 30)
  --browser-restarts N    Independent browser processes (default: 3)
  --warmup-runs N         Discarded samples per cell and browser (default: 2)
  --settle-ms N           Quiet interval after load and actions (default: 75)
  --seed N                Deterministic order/bootstrap seed (default: 8402026)
  --bootstrap N           Bootstrap resamples per summary metric (default: 5000)
  --chrome PATH           Override pinned Playwright Chromium
  --out PATH              Raw JSON output path
  --help                  Show this help
`);
	process.exit(message ? 2 : 0);
}

function parsePositiveInteger(value, name, { allowZero = false } = {}) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
		usage(`${name} requires ${allowZero ? "a non-negative" : "a positive"} integer`);
	}
	return parsed;
}

function parseArgs(argv) {
	const options = {
		dump:
			process.env.PROA_SHOWCASE_DUMP ||
			resolve(repositoryRoot, "fixtures/airbnb-parity-dump/target/showcase-dump"),
		pages: [...INTERACTIVE_PAGES],
		profiles: ["desktop", "mobile4x"],
		runs: 30,
		browserRestarts: 3,
		warmupRuns: 2,
		settleMs: 75,
		seed: 8_402_026,
		bootstrap: 5_000,
		chrome: process.env.PROA_SHOWCASE_CHROME || null,
		out: resolve(repositoryRoot, "showcase/results/client_js_raw.json"),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const name = argv[index];
		if (name === "--help") usage();
		const value = argv[index + 1];
		if (!value) usage(`${name} requires a value`);
		switch (name) {
			case "--dump":
				options.dump = resolve(value);
				break;
			case "--pages":
				options.pages = value.split(",").filter(Boolean);
				break;
			case "--profiles":
				options.profiles = value.split(",").filter(Boolean);
				break;
			case "--runs":
				options.runs = parsePositiveInteger(value, name);
				break;
			case "--browser-restarts":
				options.browserRestarts = parsePositiveInteger(value, name);
				break;
			case "--warmup-runs":
				options.warmupRuns = parsePositiveInteger(value, name, { allowZero: true });
				break;
			case "--settle-ms":
				options.settleMs = parsePositiveInteger(value, name, { allowZero: true });
				break;
			case "--seed":
				options.seed = parsePositiveInteger(value, name, { allowZero: true });
				break;
			case "--bootstrap":
				options.bootstrap = parsePositiveInteger(value, name);
				break;
			case "--chrome":
				options.chrome = resolve(value);
				break;
			case "--out":
				options.out = resolve(value);
				break;
			default:
				usage(`unknown option: ${name}`);
		}
		index += 1;
	}
	if (options.pages.length === 0) usage("--pages must select at least one page");
	for (const page of options.pages) {
		if (!INTERACTIVE_PAGES.includes(page)) {
			usage(`no client-JavaScript workload is defined for page ${page}`);
		}
	}
	if (options.profiles.length === 0) usage("--profiles must select at least one profile");
	for (const profile of options.profiles) {
		if (!PROFILE_CATALOG[profile]) usage(`unknown profile: ${profile}`);
	}
	options.browserRestarts = Math.min(options.browserRestarts, options.runs);
	return options;
}

function runBinary(path, args, description, { encoding = null } = {}) {
	const result = spawnSync(path, args, {
		encoding,
		maxBuffer: 256 * 1024 * 1024,
	});
	if (result.error) throw new Error(`failed to run ${description}: ${result.error.message}`);
	if (result.status !== 0) {
		throw new Error(
			`${description} exited ${result.status}: ${Buffer.from(result.stderr ?? "").toString("utf8")}`,
		);
	}
	return result.stdout;
}

function runOptional(command, args, cwd = repositoryRoot) {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	return result.status === 0 ? result.stdout.trim() : null;
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function compressed(buffer) {
	return {
		gzip: gzipSync(buffer, { level: 9 }),
		brotli: brotliCompressSync(buffer, {
			params: {
				[zlibConstants.BROTLI_PARAM_QUALITY]: 11,
			},
		}),
	};
}

function makeAsset(key, kind, body) {
	const compression = compressed(body);
	return {
		key,
		kind,
		body,
		gzip: compression.gzip,
		brotli: compression.brotli,
		sha256: sha256(body),
	};
}

function assetMetadata(asset) {
	return {
		key: asset.key,
		kind: asset.kind,
		rawBytes: asset.body.length,
		gzip9Bytes: asset.gzip.length,
		brotli11Bytes: asset.brotli.length,
		sha256: asset.sha256,
	};
}

function loadFixture(dumpPath, selectedPages) {
	const availablePages = runBinary(dumpPath, ["--list-pages"], "showcase page listing", {
		encoding: "utf8",
	})
		.trim()
		.split(/\s+/);
	for (const page of selectedPages) {
		if (!availablePages.includes(page)) throw new Error(`linked fixture does not contain page ${page}`);
	}
	const assetIds = runBinary(dumpPath, ["--list-assets"], "linked asset listing", {
		encoding: "utf8",
	})
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const assets = new Map();
	assets.set(
		"runtime-core",
		makeAsset("runtime-core", "runtime", runBinary(dumpPath, ["--runtime"], "core runtime")),
	);
	assets.set(
		"runtime-query",
		makeAsset(
			"runtime-query",
			"query-runtime",
			runBinary(dumpPath, ["--query-runtime"], "query runtime"),
		),
	);
	for (const assetId of assetIds) {
		assets.set(
			assetId,
			makeAsset(
				assetId,
				assetId.startsWith("component_") ? "component-fragment" : "island-owner",
				runBinary(dumpPath, ["--asset", assetId], `linked asset ${assetId}`),
			),
		);
	}
	const documents = new Map();
	for (const page of selectedPages) {
		const body = runBinary(dumpPath, ["--page", page], `showcase page ${page}`);
		documents.set(page, makeAsset(page, "document", body));
	}
	return { availablePages, assetIds, assets, documents };
}

function resolveJavascriptAsset(pathname, assets) {
	if (/^\/rsjs-runtime-query(?:\.[0-9a-f]+)?\.js$/.test(pathname)) {
		return assets.get("runtime-query");
	}
	if (/^\/rsjs-runtime(?:\.[0-9a-f]+)?\.js$/.test(pathname)) {
		return assets.get("runtime-core");
	}
	if (!pathname.endsWith(".js")) return null;
	const filename = basename(pathname, ".js");
	const candidates = [filename, filename.replace(/\.[0-9a-f]{8,64}$/, "")];
	for (const candidate of candidates) {
		if (assets.has(candidate)) return assets.get(candidate);
	}
	return null;
}

function startFixtureServer(fixture) {
	let activeCapture = null;
	const serverErrors = [];
	const server = createServer((request, response) => {
		try {
			const url = new URL(request.url, "http://127.0.0.1");
			const pageMatch = url.pathname.match(/^\/pages\/([a-z0-9-]+)$/);
			if (pageMatch) {
				const document = fixture.documents.get(pageMatch[1]);
				if (!document) {
					response.writeHead(404).end("unknown page");
					return;
				}
				response.writeHead(200, {
					"cache-control": "no-store",
					"content-encoding": "gzip",
					"content-length": document.gzip.length,
					"content-type": "text/html; charset=utf-8",
				});
				response.end(document.gzip);
				return;
			}
			if (url.pathname.endsWith(".js") || url.pathname.startsWith("/rsjs-runtime")) {
				const asset = resolveJavascriptAsset(url.pathname, fixture.assets);
				if (!asset) {
					const message = `unmapped JavaScript request: ${url.pathname}`;
					serverErrors.push(message);
					response.writeHead(404, { "content-type": "text/plain" }).end(message);
					return;
				}
				activeCapture?.requests.push({ path: url.pathname, asset: asset.key });
				response.writeHead(200, {
					"cache-control": "no-store",
					"content-encoding": "gzip",
					"content-length": asset.gzip.length,
					"content-type": "text/javascript; charset=utf-8",
					"timing-allow-origin": "*",
				});
				response.end(asset.gzip);
				return;
			}
			response.writeHead(204, { "cache-control": "no-store" });
			response.end();
		} catch (error) {
			serverErrors.push(error.stack ?? error.message);
			response.writeHead(500, { "content-type": "text/plain" });
			response.end("fixture server error");
		}
	});
	return {
		server,
		serverErrors,
		setActiveCapture(capture) {
			activeCapture = capture;
		},
	};
}

function metricMap(metrics) {
	return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

function performanceDelta(before, after) {
	const milliseconds = (name) => ((after[name] ?? 0) - (before[name] ?? 0)) * 1_000;
	return {
		scriptMs: milliseconds("ScriptDuration"),
		v8CompileMs: milliseconds("V8CompileDuration"),
		taskMs: milliseconds("TaskDuration"),
		layoutMs: milliseconds("LayoutDuration"),
		recalcStyleMs: milliseconds("RecalcStyleDuration"),
	};
}

async function forceGcAndMeasureHeap(cdp) {
	await cdp.send("HeapProfiler.collectGarbage");
	const usage = await cdp.send("Runtime.getHeapUsage");
	return {
		usedBytes: usage.usedSize,
		totalBytes: usage.totalSize,
		embedderUsedBytes: usage.embedderHeapUsedSize,
		backingStorageBytes: usage.backingStorageSize,
	};
}

async function takeCoverage(cdp, origin) {
	const raw = await cdp.send("Profiler.takePreciseCoverage");
	const scripts = [];
	for (const entry of raw.result) {
		if (!entry.url.startsWith(origin) || !new URL(entry.url).pathname.endsWith(".js")) continue;
		const { scriptSource } = await cdp.send("Debugger.getScriptSource", {
			scriptId: entry.scriptId,
		});
		const intervals = executedIntervals(entry.functions, scriptSource.length);
		const sourceBytes = Buffer.byteLength(scriptSource);
		const executedBytes = utf8BytesForIntervals(scriptSource, intervals);
		const script = {
			url: entry.url,
			sourceSha256: sha256(scriptSource),
			sourceBytes,
			executedBytes,
			executedPercent: sourceBytes === 0 ? 0 : (executedBytes / sourceBytes) * 100,
			functionCount: entry.functions.length,
			rangeCount: entry.functions.reduce((sum, fn) => sum + (fn.ranges?.length ?? 0), 0),
		};
		script[COVERAGE_SOURCE] = scriptSource;
		script[COVERAGE_INTERVALS] = intervals;
		scripts.push(script);
	}
	scripts.sort((left, right) => left.url.localeCompare(right.url));
	return summarizeCoverageScripts(scripts);
}

function summarizeCoverageScripts(scripts) {
	const sourceBytes = scripts.reduce((sum, script) => sum + script.sourceBytes, 0);
	const executedBytes = scripts.reduce((sum, script) => sum + script.executedBytes, 0);
	return {
		sourceBytes,
		executedBytes,
		executedPercent: sourceBytes === 0 ? 0 : (executedBytes / sourceBytes) * 100,
		scripts,
	};
}

function cumulativeCoverage(initial, interaction) {
	const byUrl = new Map();
	for (const phase of [initial, interaction]) {
		for (const script of phase.scripts) {
			const existing = byUrl.get(script.url);
			if (!existing) {
				const combined = { ...script };
				combined[COVERAGE_SOURCE] = script[COVERAGE_SOURCE];
				combined[COVERAGE_INTERVALS] = [...script[COVERAGE_INTERVALS]];
				byUrl.set(script.url, combined);
				continue;
			}
			if (existing.sourceSha256 !== script.sourceSha256) {
				throw new Error(`JavaScript source changed during one run: ${script.url}`);
			}
			existing[COVERAGE_INTERVALS] = mergeIntervals([
				...existing[COVERAGE_INTERVALS],
				...script[COVERAGE_INTERVALS],
			]);
		}
	}
	const scripts = [...byUrl.values()].map((script) => {
		const executedBytes = utf8BytesForIntervals(
			script[COVERAGE_SOURCE],
			script[COVERAGE_INTERVALS],
		);
		return {
			...script,
			executedBytes,
			executedPercent:
				script.sourceBytes === 0 ? 0 : (executedBytes / script.sourceBytes) * 100,
		};
	});
	scripts.sort((left, right) => left.url.localeCompare(right.url));
	return summarizeCoverageScripts(scripts);
}

function navigationTiming(raw) {
	return {
		dnsMs: raw.domainLookupEnd - raw.domainLookupStart,
		connectMs: raw.connectEnd - raw.connectStart,
		requestToFirstByteMs: raw.responseStart - raw.requestStart,
		ttfbFromNavigationStartMs: raw.responseStart,
		responseDownloadMs: raw.responseEnd - raw.responseStart,
		domInteractiveMs: raw.domInteractive,
		domContentLoadedMs: raw.domContentLoadedEventEnd,
		loadMs: raw.loadEventEnd,
	};
}

async function browserTimings(page) {
	return page.evaluate(() => {
		const navigation = performance.getEntriesByType("navigation")[0]?.toJSON();
		const paints = Object.fromEntries(
			performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]),
		);
		return {
			navigation,
			firstPaintMs: paints["first-paint"] ?? null,
			firstContentfulPaintMs: paints["first-contentful-paint"] ?? null,
			largestContentfulPaintMs: window.__proaBenchmarkObserver?.lcpMs ?? null,
			longTaskCount: window.__proaBenchmarkObserver?.longTaskCount ?? 0,
			longTaskDurationMs: window.__proaBenchmarkObserver?.longTaskDurationMs ?? 0,
		};
	});
}

function requestedJavascriptSummary(requests, assets) {
	const uniqueKeys = [...new Set(requests.map((request) => request.asset))].sort();
	const selected = uniqueKeys.map((key) => assets.get(key));
	return {
		requestCount: requests.length,
		uniqueRequestCount: uniqueKeys.length,
		assets: uniqueKeys,
		rawBytes: selected.reduce((sum, asset) => sum + asset.body.length, 0),
		gzip9BodyBytes: selected.reduce((sum, asset) => sum + asset.gzip.length, 0),
		brotli11BodyBytes: selected.reduce((sum, asset) => sum + asset.brotli.length, 0),
	};
}

async function configureCdp(cdp, profile) {
	await Promise.all([
		cdp.send("Network.enable"),
		cdp.send("Performance.enable"),
		cdp.send("Profiler.enable"),
		cdp.send("Debugger.enable"),
		cdp.send("HeapProfiler.enable"),
	]);
	await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuSlowdown });
	await cdp.send("Network.emulateNetworkConditions", {
		offline: false,
		latency: profile.latencyMs,
		downloadThroughput: (profile.downloadKbps * 1_000) / 8,
		uploadThroughput: (profile.uploadKbps * 1_000) / 8,
		connectionType: profile.isMobile ? "cellular4g" : "wifi",
	});
	await cdp.send("Profiler.startPreciseCoverage", {
		callCount: true,
		detailed: true,
		allowTriggeredUpdates: false,
	});
}

async function runOne({
	browser,
	baseUrl,
	fixture,
	fixtureServer,
	pageName,
	profileName,
	options,
	record,
	browserInstance,
	block,
	sequence,
}) {
	const profile = PROFILE_CATALOG[profileName];
	const capture = { requests: [] };
	fixtureServer.setActiveCapture(capture);
	const context = await browser.newContext({
		viewport: profile.viewport,
		deviceScaleFactor: profile.deviceScaleFactor,
		isMobile: profile.isMobile ?? false,
		hasTouch: profile.hasTouch ?? false,
		serviceWorkers: "block",
	});
	await context.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.protocol === "http:" && url.origin === baseUrl) {
			await route.continue();
		} else if (url.protocol === "data:" || url.protocol === "blob:") {
			await route.continue();
		} else {
			await route.fulfill({ status: 204, body: "" });
		}
	});
	await context.addInitScript(() => {
		window.__proaBenchmarkObserver = {
			lcpMs: null,
			longTaskCount: 0,
			longTaskDurationMs: 0,
		};
		try {
			new PerformanceObserver((list) => {
				const entries = list.getEntries();
				const last = entries.at(-1);
				if (last) window.__proaBenchmarkObserver.lcpMs = last.startTime;
			}).observe({ type: "largest-contentful-paint", buffered: true });
		} catch {}
		try {
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					window.__proaBenchmarkObserver.longTaskCount += 1;
					window.__proaBenchmarkObserver.longTaskDurationMs += entry.duration;
				}
			}).observe({ type: "longtask", buffered: true });
		} catch {}
	});
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(`console: ${message.text()}`);
	});
	page.on("requestfailed", (request) => {
		errors.push(`requestfailed: ${request.failure()?.errorText ?? "unknown"}: ${request.url()}`);
	});
	const cdp = await context.newCDPSession(page);
	const networkScripts = new Map();
	cdp.on("Network.responseReceived", (event) => {
		if (event.type === "Script" && event.response.url.startsWith(baseUrl)) {
			networkScripts.set(event.requestId, {
				url: event.response.url,
				status: event.response.status,
				mimeType: event.response.mimeType,
				protocol: event.response.protocol,
				fromDiskCache: event.response.fromDiskCache,
				fromServiceWorker: event.response.fromServiceWorker,
				encodedDataLength: event.response.encodedDataLength,
			});
		}
	});
	cdp.on("Network.loadingFinished", (event) => {
		const script = networkScripts.get(event.requestId);
		if (script) script.encodedDataLength = event.encodedDataLength;
	});

	try {
		await configureCdp(cdp, profile);
		const perfBefore = metricMap((await cdp.send("Performance.getMetrics")).metrics);
		const navigationStarted = performance.now();
		const response = await page.goto(`${baseUrl}/pages/${pageName}`, {
			waitUntil: "load",
			timeout: 30_000,
		});
		const loadWallMs = performance.now() - navigationStarted;
		if (!response || response.status() !== 200) {
			throw new Error(`navigation returned ${response?.status() ?? "no response"}`);
		}
		await page.waitForTimeout(options.settleMs);
		const readyWallMs = performance.now() - navigationStarted;
		const islandCount = await page.locator("rsjs-island").count();
		const moduleScriptCount = await page.locator('script[type="module"][src]').count();
		if (islandCount === 0) throw new Error(`${pageName} rendered no RSJS island`);
		if (moduleScriptCount < 2) {
			throw new Error(
				`${pageName} rendered ${moduleScriptCount} module scripts; expected runtime and owner module`,
			);
		}
		const perfAfterInitial = metricMap((await cdp.send("Performance.getMetrics")).metrics);
		const initialTimings = await browserTimings(page);
		const initialCoverage = await takeCoverage(cdp, baseUrl);
		const initialHeap = await forceGcAndMeasureHeap(cdp);
		const longTasksBeforeInteraction = await page.evaluate(() => ({
			count: window.__proaBenchmarkObserver.longTaskCount,
			durationMs: window.__proaBenchmarkObserver.longTaskDurationMs,
		}));
		const perfBeforeInteraction = metricMap((await cdp.send("Performance.getMetrics")).metrics);
		const interactionStarted = performance.now();
		const workload = await runInteractionWorkload(pageName, page);
		await page.evaluate(
			() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))),
		);
		await page.waitForTimeout(options.settleMs);
		const interactionWallMs = performance.now() - interactionStarted;
		const perfAfterInteraction = metricMap((await cdp.send("Performance.getMetrics")).metrics);
		const finalTimings = await browserTimings(page);
		const interactionCoverage = await takeCoverage(cdp, baseUrl);
		const finalHeap = await forceGcAndMeasureHeap(cdp);
		await cdp.send("Profiler.stopPreciseCoverage");

		if (errors.length > 0) throw new Error(errors.join(" | "));
		if (fixtureServer.serverErrors.length > 0) {
			throw new Error(fixtureServer.serverErrors.join(" | "));
		}
		const js = requestedJavascriptSummary(capture.requests, fixture.assets);
		const network = [...networkScripts.values()].sort((left, right) => left.url.localeCompare(right.url));
		if (network.some((entry) => entry.fromDiskCache || entry.fromServiceWorker)) {
			throw new Error("a supposedly cold JavaScript request was served from a cache");
		}
		const result = {
			sequence,
			block,
			browserInstance,
			page: pageName,
			profile: profileName,
			document: assetMetadata(fixture.documents.get(pageName)),
			dom: { islandCount, moduleScriptCount },
			javascript: {
				...js,
				networkEncodedBytes: network.reduce(
					(sum, script) => sum + (script.encodedDataLength ?? 0),
					0,
				),
				network,
			},
			navigation: {
				loadWallMs,
				readyWallMs,
				...navigationTiming(initialTimings.navigation),
				firstPaintMs: initialTimings.firstPaintMs,
				firstContentfulPaintMs: initialTimings.firstContentfulPaintMs,
				largestContentfulPaintMs: initialTimings.largestContentfulPaintMs,
				longTaskCount: longTasksBeforeInteraction.count,
				longTaskDurationMs: longTasksBeforeInteraction.durationMs,
			},
			initial: {
				cpu: performanceDelta(perfBefore, perfAfterInitial),
				heapAfterForcedGc: initialHeap,
				coverage: initialCoverage,
			},
			interaction: {
				workload,
				wallMs: interactionWallMs,
				cpu: performanceDelta(perfBeforeInteraction, perfAfterInteraction),
				heapAfterForcedGc: finalHeap,
				longTaskCount: finalTimings.longTaskCount - longTasksBeforeInteraction.count,
				longTaskDurationMs:
					finalTimings.longTaskDurationMs - longTasksBeforeInteraction.durationMs,
				coverage: interactionCoverage,
			},
			cumulativeCoverage: cumulativeCoverage(initialCoverage, interactionCoverage),
		};
		if (record) {
			process.stdout.write(
				`SHOWCASE_CLIENT_JS_RUN ${JSON.stringify({
					sequence,
					block,
					browserInstance,
					page: pageName,
					profile: profileName,
					rawBytes: js.rawBytes,
					gzip9Bytes: js.gzip9BodyBytes,
					initialScriptMs: result.initial.cpu.scriptMs,
					interactionScriptMs: result.interaction.cpu.scriptMs,
				})}\n`,
			);
		}
		return result;
	} finally {
		fixtureServer.setActiveCapture(null);
		await context.close();
	}
}

function splitRuns(total, parts) {
	const base = Math.floor(total / parts);
	const remainder = total % parts;
	return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function getPath(record, path) {
	return path.split(".").reduce((value, key) => value?.[key], record);
}

const SUMMARY_METRICS = [
	["navigation.requestToFirstByteMs", "ms"],
	["navigation.loadMs", "ms"],
	["navigation.readyWallMs", "ms"],
	["navigation.firstContentfulPaintMs", "ms"],
	["navigation.largestContentfulPaintMs", "ms"],
	["navigation.longTaskDurationMs", "ms"],
	["initial.cpu.scriptMs", "ms"],
	["initial.cpu.v8CompileMs", "ms"],
	["initial.cpu.taskMs", "ms"],
	["initial.cpu.layoutMs", "ms"],
	["initial.cpu.recalcStyleMs", "ms"],
	["initial.heapAfterForcedGc.usedBytes", "bytes"],
	["initial.heapAfterForcedGc.embedderUsedBytes", "bytes"],
	["interaction.wallMs", "ms"],
	["interaction.cpu.scriptMs", "ms"],
	["interaction.cpu.v8CompileMs", "ms"],
	["interaction.cpu.taskMs", "ms"],
	["interaction.cpu.layoutMs", "ms"],
	["interaction.cpu.recalcStyleMs", "ms"],
	["interaction.heapAfterForcedGc.usedBytes", "bytes"],
	["interaction.heapAfterForcedGc.embedderUsedBytes", "bytes"],
	["interaction.longTaskDurationMs", "ms"],
	["initial.coverage.executedPercent", "percent"],
	["interaction.coverage.executedPercent", "percent"],
	["cumulativeCoverage.executedPercent", "percent"],
	["cumulativeCoverage.executedBytes", "bytes"],
	["javascript.networkEncodedBytes", "bytes"],
];

function summarizeRecords(records, options) {
	const summaries = [];
	for (const page of options.pages) {
		for (const profile of options.profiles) {
			const selected = records.filter(
				(record) => record.page === page && record.profile === profile,
			);
			const metrics = {};
			for (const [path, unit] of SUMMARY_METRICS) {
				const values = selected
					.map((record) => getPath(record, path))
					.filter((value) => typeof value === "number" && Number.isFinite(value));
				metrics[path] = {
					unit,
					...summarizeNumbers(values, {
						seed: options.seed ^ stableStringHash(`${page}:${profile}:${path}`),
						resamples: options.bootstrap,
					}),
				};
			}
			const assetSets = [
				...new Set(selected.map((record) => JSON.stringify(record.javascript.assets))),
			].map((encoded) => JSON.parse(encoded));
			summaries.push({
				page,
				profile,
				description: PAGE_METADATA[page].description,
				runs: selected.length,
				browserInstances: new Set(selected.map((record) => record.browserInstance)).size,
				document: selected[0]?.document,
				javascript: {
					assetSets,
					requestCount: selected[0]?.javascript.requestCount,
					uniqueRequestCount: selected[0]?.javascript.uniqueRequestCount,
					rawBytes: selected[0]?.javascript.rawBytes,
					gzip9BodyBytes: selected[0]?.javascript.gzip9BodyBytes,
					brotli11BodyBytes: selected[0]?.javascript.brotli11BodyBytes,
				},
				metrics,
			});
		}
	}
	return summaries;
}

async function provenance(options, fixture, browserVersions) {
	const binary = await readFile(options.dump);
	const binaryStat = await stat(options.dump);
	const fixtureLock = await readFile(
		resolve(repositoryRoot, "fixtures/airbnb-parity-dump/Cargo.lock"),
		"utf8",
	);
	const proaRevision = fixtureLock.match(
		/name = "proa_showcase"[\s\S]*?source = "git\+[^#]+#([0-9a-f]{40})"/,
	)?.[1];
	const inputPaths = [
		"fixtures/airbnb-parity-dump/Cargo.toml",
		"fixtures/airbnb-parity-dump/Cargo.lock",
		"fixtures/airbnb-parity-dump/src/main.rs",
		"package.json",
		"pnpm-lock.yaml",
		"pnpm-workspace.yaml",
		"showcase/capture_client_js.mjs",
		"showcase/client_js_stats.mjs",
		"showcase/workloads.mjs",
	];
	const inputs = await Promise.all(
		inputPaths.map(async (relativePath) => {
			const body = await readFile(resolve(repositoryRoot, relativePath));
			return {
				path: relativePath,
				bytes: body.length,
				sha256: sha256(body),
			};
		}),
	);
	return {
		generatedAt: new Date().toISOString(),
		repository: {
			commit: runOptional("git", ["rev-parse", "HEAD"]),
			branch: runOptional("git", ["branch", "--show-current"]),
			status: runOptional("git", ["status", "--short"]),
		},
		proaRevision: proaRevision ?? null,
		fixtureBinary: {
			path: options.dump,
			bytes: binaryStat.size,
			sha256: sha256(binary),
			modifiedAt: binaryStat.mtime.toISOString(),
			buildCommand:
				"cargo-proa proa build --root fixtures/airbnb-parity-dump --no-check --no-assets -p proa_bench_airbnb_parity_dump --artifact-out target/showcase-dump",
		},
		inputs,
		runtimeAssets: [...fixture.assets.values()].map(assetMetadata),
		node: process.version,
		playwright: playwrightVersion,
		browserVersions,
		browserExecutable: options.chrome ?? chromium.executablePath(),
		host: {
			hostname: hostname(),
			platform: platform(),
			osRelease: release(),
			cpuModel: cpus()[0]?.model ?? null,
			logicalCpuCount: cpus().length,
			totalMemoryBytes: totalmem(),
			freeMemoryBytesAtReport: freemem(),
		},
	};
}

const options = parseArgs(process.argv.slice(2));
await stat(options.dump).catch((error) => {
	throw new Error(
		`showcase dump binary is unavailable at ${options.dump}: ${error.message}. Build it with cargo-proa first.`,
	);
});
const fixture = loadFixture(options.dump, options.pages);
for (const [page, document] of fixture.documents) {
	const html = document.body.toString("utf8");
	if (!html.includes("<rsjs-island")) throw new Error(`${page} fixture has no RSJS island`);
	if (!html.includes('/rsjs-runtime.js"')) {
		throw new Error(`${page} fixture omitted the RSJS runtime script`);
	}
}

const fixtureServer = startFixtureServer(fixture);
await new Promise((resolveListen, rejectListen) => {
	fixtureServer.server.once("error", rejectListen);
	fixtureServer.server.listen(0, "127.0.0.1", resolveListen);
});
const address = fixtureServer.server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const cells = options.pages.flatMap((page) =>
	options.profiles.map((profile) => ({ page, profile })),
);
const records = [];
const browserVersions = [];
let sequence = 0;
let globalBlock = 0;
const blocksPerBrowser = splitRuns(options.runs, options.browserRestarts);

try {
	for (let browserIndex = 0; browserIndex < blocksPerBrowser.length; browserIndex += 1) {
		const launchOptions = { headless: true };
		if (options.chrome) launchOptions.executablePath = options.chrome;
		const browser = await chromium.launch(launchOptions);
		browserVersions.push(await browser.version());
		try {
			for (let warmup = 0; warmup < options.warmupRuns; warmup += 1) {
				const warmupCells = shuffled(
					cells,
					options.seed ^ stableStringHash(`warmup:${browserIndex}:${warmup}`),
				);
				for (const cell of warmupCells) {
					process.stdout.write(
						`SHOWCASE_CLIENT_JS_WARMUP browser=${browserIndex + 1} run=${warmup + 1} page=${cell.page} profile=${cell.profile}\n`,
					);
					await runOne({
						browser,
						baseUrl,
						fixture,
						fixtureServer,
						pageName: cell.page,
						profileName: cell.profile,
						options,
						record: false,
						browserInstance: browserIndex + 1,
						block: 0,
						sequence: 0,
					});
				}
			}
			for (let localBlock = 0; localBlock < blocksPerBrowser[browserIndex]; localBlock += 1) {
				globalBlock += 1;
				const orderedCells = shuffled(
					cells,
					options.seed ^ stableStringHash(`block:${globalBlock}`),
				);
				for (const cell of orderedCells) {
					sequence += 1;
					records.push(
						await runOne({
							browser,
							baseUrl,
							fixture,
							fixtureServer,
							pageName: cell.page,
							profileName: cell.profile,
							options,
							record: true,
							browserInstance: browserIndex + 1,
							block: globalBlock,
							sequence,
						}),
					);
				}
			}
		} finally {
			await browser.close();
		}
	}
} finally {
	await new Promise((resolveClose, rejectClose) =>
		fixtureServer.server.close((error) => (error ? rejectClose(error) : resolveClose())),
	);
}

const report = {
	schemaVersion: 1,
	method: {
		unit: "one navigation in a fresh browser context followed by a page-specific verified interaction trace",
		order: "complete randomized blocks; one sample from every page/profile cell per block",
		cache: "disabled through CDP; service workers blocked; a new context is used for every sample",
		transport:
			"loopback HTTP; documents and JavaScript served with deterministic gzip level 9; Brotli-11 sizes computed offline",
		coverage:
			"V8 precise block coverage, split into initial-load and interaction phases; UTF-16 offsets converted to UTF-8 bytes",
		heap: "Runtime.getHeapUsage immediately after an explicit HeapProfiler.collectGarbage",
		confidenceIntervals: `deterministic 95% percentile bootstrap of the median (${options.bootstrap} resamples)`,
		externalResources: "fulfilled locally with HTTP 204; only fixture HTML and linked RSJS JavaScript are measured",
	},
	configuration: {
		pages: options.pages,
		profiles: Object.fromEntries(options.profiles.map((name) => [name, PROFILE_CATALOG[name]])),
		runsPerCell: options.runs,
		browserRestarts: options.browserRestarts,
		blocksPerBrowser,
		warmupRunsPerCellPerBrowser: options.warmupRuns,
		settleMs: options.settleMs,
		seed: options.seed,
		bootstrapResamples: options.bootstrap,
	},
	provenance: await provenance(options, fixture, [...new Set(browserVersions)]),
	summaries: summarizeRecords(records, options),
	records,
};
await mkdir(dirname(options.out), { recursive: true });
await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
	`SHOWCASE_CLIENT_JS_RESULT ${JSON.stringify({
		out: options.out,
		records: records.length,
		cells: cells.length,
		runsPerCell: options.runs,
	})}\n`,
);
