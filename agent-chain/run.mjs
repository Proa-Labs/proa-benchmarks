import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";

const MINIMAL_BASE =
	process.env.AGENT_CHAIN_MINIMAL_URL || "http://127.0.0.1:5600";
const HYDRATED_BASE =
	process.env.AGENT_CHAIN_HYDRATED_URL || "http://127.0.0.1:5601";
const RUNS = Number(process.env.AGENT_CHAIN_RUNS || 10);
const NAVIGATION_TIMEOUT_MS = Number(
	process.env.AGENT_CHAIN_TIMEOUT_MS || 30_000,
);

function percentile(values, percentileValue) {
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
	);
	return sorted[index];
}

function summarize(records, field) {
	const values = records.map((record) => record[field]);
	return {
		p50: percentile(values, 0.5),
		p95: percentile(values, 0.95),
		mean: values.reduce((sum, value) => sum + value, 0) / values.length,
	};
}

async function preflight() {
	const [minimalHealth, hydratedHealth] = await Promise.all([
		fetch(`${MINIMAL_BASE}/health`).then((response) => response.json()),
		fetch(`${HYDRATED_BASE}/health`).then((response) => response.json()),
	]);
	const parityRun = "parity";
	for (const path of [
		"/start",
		"/vendor/aster",
		"/submit",
		"/result?code_aster=AST-731&code_cobalt=COB-918&code_ember=EMB-562",
	]) {
		const separator = path.includes("?") ? "&" : "?";
		const [minimal, hydrated] = await Promise.all([
			fetch(`${MINIMAL_BASE}${path}${separator}run=${parityRun}`),
			fetch(`${HYDRATED_BASE}${path}${separator}run=${parityRun}`),
		]);
		const minimalDigest = minimal.headers.get("x-agent-chain-root-sha256");
		const hydratedDigest = hydrated.headers.get("x-agent-chain-root-sha256");
		if (!minimalDigest || minimalDigest !== hydratedDigest) {
			throw new Error(
				`root HTML parity failed for ${path}: ${minimalDigest} != ${hydratedDigest}`,
			);
		}
	}
	return { minimalHealth, hydratedHealth };
}

async function runWorkflow(browser, variant, baseUrl, runIndex) {
	const runId = `${variant}-${runIndex}-${randomUUID().slice(0, 8)}`;
	const context = await browser.newContext({ serviceWorkers: "block" });
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send("Network.enable");
	await cdp.send("Performance.enable");
	await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });

	const networkRequests = new Map();
	const cacheRequestIds = new Set();
	let transferredBytes = 0;
	let jsTransferredBytes = 0;
	let jsResponses = 0;
	let jsCacheHits = 0;
	const uniqueJsUrls = new Set();

	cdp.on("Network.requestServedFromCache", (event) => {
		cacheRequestIds.add(event.requestId);
	});
	cdp.on("Network.responseReceived", (event) => {
		const isScript = new URL(event.response.url).pathname.startsWith(
			"/assets/",
		);
		networkRequests.set(event.requestId, { url: event.response.url, isScript });
		if (isScript) {
			jsResponses += 1;
			uniqueJsUrls.add(event.response.url);
			if (
				event.response.fromDiskCache ||
				event.response.fromPrefetchCache ||
				cacheRequestIds.has(event.requestId)
			) {
				jsCacheHits += 1;
			}
		}
	});
	cdp.on("Network.loadingFinished", (event) => {
		const request = networkRequests.get(event.requestId);
		transferredBytes += event.encodedDataLength || 0;
		if (request?.isScript) jsTransferredBytes += event.encodedDataLength || 0;
	});

	let navigationMs = 0;
	let scriptMs = 0;

	async function measuredNavigation(action) {
		const before = await cdp.send("Performance.getMetrics");
		const beforeByName = Object.fromEntries(
			before.metrics.map((metric) => [metric.name, metric.value]),
		);
		const started = performance.now();
		await action();
		await page.waitForLoadState("load", { timeout: NAVIGATION_TIMEOUT_MS });
		if (variant === "hydrated") {
			await page.waitForFunction(
				() => document.documentElement.dataset.agentHydrated === "true",
				null,
				{ timeout: NAVIGATION_TIMEOUT_MS },
			);
			const hydrationError = await page.evaluate(
				() => document.documentElement.dataset.agentHydrationError || null,
			);
			if (hydrationError)
				throw new Error(`React hydration mismatch: ${hydrationError}`);
		}
		navigationMs += performance.now() - started;
		const { metrics } = await cdp.send("Performance.getMetrics");
		const byName = Object.fromEntries(
			metrics.map((metric) => [metric.name, metric.value]),
		);
		scriptMs +=
			((byName.ScriptDuration || 0) - (beforeByName.ScriptDuration || 0)) *
			1_000;
	}

	const started = performance.now();
	try {
		await measuredNavigation(() =>
			page.goto(`${baseUrl}/start?run=${runId}`, {
				waitUntil: "load",
				timeout: NAVIGATION_TIMEOUT_MS,
			}),
		);
		const vendorUrls = await page
			.locator("[data-vendor-link]")
			.evaluateAll((links) =>
				links.map((link) => ({ id: link.dataset.vendorLink, href: link.href })),
			);
		if (vendorUrls.length !== 5)
			throw new Error(`expected 5 vendor links, found ${vendorUrls.length}`);

		const actionRequired = [];
		for (const vendorUrl of vendorUrls) {
			await measuredNavigation(() =>
				page.goto(vendorUrl.href, {
					waitUntil: "load",
					timeout: NAVIGATION_TIMEOUT_MS,
				}),
			);
			const id = await page
				.locator("[data-vendor-dossier]")
				.getAttribute("data-vendor-id");
			const status = (
				await page.locator('[data-field="status"]').textContent()
			)?.trim();
			const code = (
				await page.locator('[data-field="code"]').textContent()
			)?.trim();
			if (id !== vendorUrl.id || !status || !code)
				throw new Error(`invalid dossier for ${vendorUrl.id}`);
			if (status === "Action required") actionRequired.push({ id, code });
		}

		await measuredNavigation(() =>
			page.goto(`${baseUrl}/submit?run=${runId}`, {
				waitUntil: "load",
				timeout: NAVIGATION_TIMEOUT_MS,
			}),
		);
		for (const vendor of actionRequired) {
			await page.locator(`[name="code_${vendor.id}"]`).fill(vendor.code);
		}
		await measuredNavigation(() =>
			Promise.all([
				page.waitForNavigation({
					waitUntil: "load",
					timeout: NAVIGATION_TIMEOUT_MS,
				}),
				page.getByRole("button", { name: "Submit report" }).click(),
			]),
		);
		await page
			.locator('[data-submission-result="accepted"]')
			.waitFor({ timeout: NAVIGATION_TIMEOUT_MS });

		const wallMs = performance.now() - started;
		const serverMetrics = await fetch(`${baseUrl}/metrics?run=${runId}`).then(
			(response) => response.json(),
		);
		if (serverMetrics.acceptedSubmissions !== 1) {
			throw new Error(
				`server did not record an accepted submission: ${JSON.stringify(serverMetrics)}`,
			);
		}
		return {
			variant,
			wallMs,
			navigationMs,
			scriptMs,
			transferredBytes,
			jsTransferredBytes,
			jsResponses,
			jsCacheHits,
			uniqueJsUrls: uniqueJsUrls.size,
			serverAssetRequests: serverMetrics.assetRequests,
			serverAssetBytes: serverMetrics.assetBytes,
		};
	} finally {
		await context.close();
	}
}

function formatMs(value) {
	return `${value.toFixed(1)} ms`;
}

function formatBytes(value) {
	return `${(value / 1024).toFixed(1)} KiB`;
}

async function main() {
	const health = await preflight();
	console.log("AGENT_CHAIN_PARITY exact_root_html=true");
	console.log(
		`AGENT_CHAIN_CONFIG runs=${RUNS} bundle_gzip=${health.hydratedHealth.bundleGzipBytes} bundle_raw=${health.hydratedHealth.bundleRawBytes} asset_latency_ms=${health.hydratedHealth.assetLatencyMs} asset_kbps=${health.hydratedHealth.assetKbps} cache_disabled=false`,
	);

	const browser = await chromium.launch({ headless: true });
	const records = { minimal: [], hydrated: [] };
	try {
		for (let index = 0; index < RUNS; index += 1) {
			const order =
				index % 2 === 0 ? ["minimal", "hydrated"] : ["hydrated", "minimal"];
			for (const variant of order) {
				const baseUrl = variant === "minimal" ? MINIMAL_BASE : HYDRATED_BASE;
				const record = await runWorkflow(browser, variant, baseUrl, index);
				records[variant].push(record);
				process.stdout.write(
					`  ${variant.padEnd(8)} run=${String(index + 1).padStart(2)} total=${formatMs(record.wallMs)} js=${formatMs(record.scriptMs)} js_wire=${formatBytes(record.jsTransferredBytes)}\n`,
				);
			}
		}
	} finally {
		await browser.close();
	}

	const summary = {};
	for (const variant of ["minimal", "hydrated"]) {
		summary[variant] = {
			total: summarize(records[variant], "wallMs"),
			navigation: summarize(records[variant], "navigationMs"),
			script: summarize(records[variant], "scriptMs"),
			jsWire: summarize(records[variant], "jsTransferredBytes"),
		};
	}
	const delta = summary.hydrated.total.p50 - summary.minimal.total.p50;
	const ratio = summary.hydrated.total.p50 / summary.minimal.total.p50;

	console.log(
		"\nvariant   total p50   total p95   navigation p50   script p50   JS wire p50",
	);
	console.log(
		"────────  ──────────  ──────────  ──────────────   ──────────   ───────────",
	);
	for (const variant of ["minimal", "hydrated"]) {
		const row = summary[variant];
		console.log(
			`${variant.padEnd(8)}  ${formatMs(row.total.p50).padStart(10)}  ${formatMs(row.total.p95).padStart(10)}  ${formatMs(row.navigation.p50).padStart(14)}   ${formatMs(row.script.p50).padStart(10)}   ${formatBytes(row.jsWire.p50).padStart(11)}`,
		);
	}
	console.log(
		`\nAGENT_CHAIN_RESULT hydrated_delta_p50_ms=${delta.toFixed(1)} hydrated_ratio=${ratio.toFixed(2)}x bundle_cold_misses=${records.hydrated[0].serverAssetRequests} browser_cache_reuses=${records.hydrated[0].jsResponses - records.hydrated[0].serverAssetRequests}`,
	);
}

main().catch((error) => {
	console.error("AGENT_CHAIN_FAILED", error.stack || error);
	process.exitCode = 1;
});
