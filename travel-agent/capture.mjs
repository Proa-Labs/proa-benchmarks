import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { SURFACES, TRIP } from "./surfaces.mjs";

const RUNS = Number(process.env.AGENT_TRAVEL_RUNS || 3);
const LATENCY_MS = Number(process.env.AGENT_TRAVEL_LATENCY_MS || 40);
const DOWNLOAD_KBPS = Number(
	process.env.AGENT_TRAVEL_DOWNLOAD_KBPS || 100_000,
);
const TIMEOUT_MS = Number(process.env.AGENT_TRAVEL_TIMEOUT_MS || 30_000);
const CAPTURE_AFTER_READY_MS = Number(
	process.env.AGENT_TRAVEL_CAPTURE_AFTER_READY_MS || 2_000,
);
const CHROME =
	process.env.AGENT_TRAVEL_CHROME ||
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DISABLE_JAVASCRIPT = process.env.AGENT_TRAVEL_DISABLE_JAVASCRIPT === "1";
const OUTPUT_PATH = process.env.AGENT_TRAVEL_OUTPUT || "";
const SURFACE_FILTER = new Set(
	(process.env.AGENT_TRAVEL_SURFACES || "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean),
);
const SELECTED_SURFACES = SURFACE_FILTER.size
	? SURFACES.filter((surface) => SURFACE_FILTER.has(surface.id))
	: SURFACES;

function percentile(values, percentileValue) {
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
	);
	return sorted[index];
}

function metricMap(metrics) {
	return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

function metricDelta(after, before, name) {
	return ((after[name] || 0) - (before[name] || 0)) * 1_000;
}

function classifyPage(state, navigationError) {
	if (navigationError) return "navigation-error";
	const combined = `${state.title} ${state.text}`.toLowerCase();
	if (
		combined.includes("what is a bot") ||
		combined.includes("verify you are human") ||
		combined.includes("access denied")
	) {
		return "automation-blocked";
	}
	if (
		combined.includes("bad gateway") ||
		combined.includes("an error") ||
		combined.includes("something unexpected")
	) {
		return "site-error";
	}
	return state.actionable ? "actionable" : "empty-or-incomplete";
}

async function captureSurface(browser, surface, runIndex) {
	const context = await browser.newContext({
		serviceWorkers: "block",
		javaScriptEnabled: !DISABLE_JAVASCRIPT,
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send("Network.enable");
	await cdp.send("Performance.enable");
	await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
	await cdp.send("Network.emulateNetworkConditions", {
		offline: false,
		latency: LATENCY_MS,
		downloadThroughput: (DOWNLOAD_KBPS * 1_000) / 8,
		uploadThroughput: (DOWNLOAD_KBPS * 1_000) / 8,
		connectionType: "wifi",
	});

	const requests = new Map();
	const finished = [];
	let requestFailures = 0;
	cdp.on("Network.responseReceived", (event) => {
		requests.set(event.requestId, {
			resourceType: event.type,
			url: event.response.url,
			fromCache:
				event.response.fromDiskCache || event.response.fromPrefetchCache,
		});
	});
	cdp.on("Network.loadingFinished", (event) => {
		const request = requests.get(event.requestId);
		if (request) {
			finished.push({
				...request,
				encodedBytes: event.encodedDataLength || 0,
			});
		}
	});
	cdp.on("Network.loadingFailed", () => {
		requestFailures += 1;
	});

	const before = metricMap((await cdp.send("Performance.getMetrics")).metrics);
	const started = performance.now();
	let navigationResponse = null;
	let navigationError = null;
	let domContentLoadedMs = null;
	let actionableMs = null;

	try {
		navigationResponse = await page.goto(surface.url, {
			waitUntil: "domcontentloaded",
			timeout: TIMEOUT_MS,
		});
		domContentLoadedMs = performance.now() - started;
	} catch (error) {
		navigationError = error instanceof Error ? error.message : String(error);
	}

	const readinessDeadline = started + TIMEOUT_MS;
	while (!navigationError && performance.now() < readinessDeadline) {
		const readiness = await page
			.evaluate(
				({ minTextLength, readinessText }) => {
					const text = document.body?.innerText || "";
					return {
						textLength: text.length,
						matches: readinessText.every((value) => text.includes(value)),
					};
				},
				{
					minTextLength: surface.minTextLength,
					readinessText: surface.readinessText,
				},
			)
			.catch(() => ({ textLength: 0, matches: false }));
		if (
			readiness.textLength >= surface.minTextLength &&
			readiness.matches
		) {
			actionableMs = performance.now() - started;
			break;
		}
		await page.waitForTimeout(50);
	}

	if (!navigationError) {
		await page.waitForTimeout(CAPTURE_AFTER_READY_MS);
	}
	const elapsedMs = performance.now() - started;
	const after = metricMap((await cdp.send("Performance.getMetrics")).metrics);
	const state = await page
		.evaluate(
			({ minTextLength, readinessText }) => {
				const text = document.body?.innerText || "";
				return {
					url: location.href,
					title: document.title,
					text: text.slice(0, 1_000),
					textLength: text.length,
					htmlLength: document.documentElement?.outerHTML?.length || 0,
					scriptElements: document.scripts.length,
					actionable:
						text.length >= minTextLength &&
						readinessText.every((value) => text.includes(value)),
				};
			},
			{
				minTextLength: surface.minTextLength,
				readinessText: surface.readinessText,
			},
		)
		.catch(() => ({
			url: page.url(),
			title: "",
			text: "",
			textLength: 0,
			htmlLength: 0,
			scriptElements: 0,
			actionable: false,
		}));

	const scriptResources = finished.filter(
		(resource) => resource.resourceType === "Script",
	);
	const record = {
		surface: surface.id,
		label: surface.label,
		run: runIndex + 1,
		classification: classifyPage(state, navigationError),
		status: navigationResponse?.status() || null,
		finalUrl: state.url,
		domContentLoadedMs,
		actionableMs,
		captureWindowMs: elapsedMs,
		scriptBytes: scriptResources.reduce(
			(sum, resource) => sum + resource.encodedBytes,
			0,
		),
		scriptRequests: scriptResources.length,
		totalBytes: finished.reduce(
			(sum, resource) => sum + resource.encodedBytes,
			0,
		),
		totalRequests: finished.length,
		scriptCpuMs: metricDelta(after, before, "ScriptDuration"),
		taskCpuMs: metricDelta(after, before, "TaskDuration"),
		textLength: state.textLength,
		htmlLength: state.htmlLength,
		scriptElements: state.scriptElements,
		requestFailures,
		navigationError,
	};
	await context.close();
	return record;
}

async function main() {
	console.log(
		`TRAVEL_CAPTURE_CONFIG trip=${JSON.stringify(TRIP)} runs=${RUNS} latency_ms=${LATENCY_MS} download_kbps=${DOWNLOAD_KBPS} javascript_enabled=${!DISABLE_JAVASCRIPT} cache_disabled=false`,
	);
	const browser = await chromium.launch({
		headless: true,
		executablePath: CHROME,
	});
	const records = [];
	try {
		for (let runIndex = 0; runIndex < RUNS; runIndex += 1) {
			for (const surface of SELECTED_SURFACES) {
				const record = await captureSurface(browser, surface, runIndex);
				records.push(record);
				console.log(`TRAVEL_CAPTURE_RUN ${JSON.stringify(record)}`);
			}
		}
	} finally {
		await browser.close();
	}

	const summaries = [];
	for (const surface of SELECTED_SURFACES) {
		const sampled = records.filter(
			(record) =>
				record.surface === surface.id && !record.navigationError,
		);
		const actionable = records.filter(
			(record) =>
				record.surface === surface.id &&
				record.classification === "actionable",
		);
		const classifications = Object.fromEntries(
			[...new Set(records
				.filter((record) => record.surface === surface.id)
				.map((record) => record.classification))].map((classification) => [
				classification,
				records.filter(
					(record) =>
						record.surface === surface.id &&
						record.classification === classification,
				).length,
			]),
		);
		const summary = {
			surface: surface.id,
			label: surface.label,
			classifications,
			actionableRuns: actionable.length,
			sampledRuns: sampled.length,
			actionableP50Ms: actionable.length
				? percentile(actionable.map((record) => record.actionableMs), 0.5)
				: null,
			domContentLoadedP50Ms: sampled.length
				? percentile(sampled.map((record) => record.domContentLoadedMs), 0.5)
				: null,
			scriptBytesP50: sampled.length
				? percentile(sampled.map((record) => record.scriptBytes), 0.5)
				: null,
			scriptRequestsP50: sampled.length
				? percentile(sampled.map((record) => record.scriptRequests), 0.5)
				: null,
			scriptCpuP50Ms: sampled.length
				? percentile(sampled.map((record) => record.scriptCpuMs), 0.5)
				: null,
		};
		summaries.push(summary);
		console.log(`TRAVEL_CAPTURE_RESULT ${JSON.stringify(summary)}`);
	}

	if (OUTPUT_PATH) {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(
			OUTPUT_PATH,
			`${JSON.stringify(
				{
					capturedAt: new Date().toISOString(),
					trip: TRIP,
					config: {
						runs: RUNS,
						latencyMs: LATENCY_MS,
						downloadKbps: DOWNLOAD_KBPS,
						javascriptEnabled: !DISABLE_JAVASCRIPT,
					},
					records,
					summaries,
				},
				null,
				2,
			)}\n`,
		);
	}
}

main().catch((error) => {
	console.error("TRAVEL_CAPTURE_FAILED", error.stack || error);
	process.exitCode = 1;
});
