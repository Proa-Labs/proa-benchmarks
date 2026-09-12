import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";

const RUNS = Number(process.env.AGENT_TRAVEL_RUNS || 10);
const LATENCY_MS = Number(process.env.AGENT_TRAVEL_LATENCY_MS || 40);
const DOWNLOAD_KBPS = Number(
	process.env.AGENT_TRAVEL_DOWNLOAD_KBPS || 100_000,
);
const CHROME =
	process.env.AGENT_TRAVEL_CHROME ||
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DUMP_BINARY =
	process.env.AGENT_TRAVEL_PROA_DUMP ||
	"target/airbnb-parity-dump";
const JAVASCRIPT_ENABLED =
	process.env.AGENT_TRAVEL_DISABLE_JAVASCRIPT !== "1";

function percentile(values, percentileValue) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[
		Math.min(
			sorted.length - 1,
			Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
		)
	];
}

function metricMap(metrics) {
	return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

function readDump(path, args, description) {
	const result = spawnSync(path, args, {
		encoding: null,
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(
			`failed to read ${description}: ${result.stderr.toString()}`,
		);
	}
	return result.stdout;
}

const documentHtml = readDump(DUMP_BINARY, [], "the Proa parity document");
const documentText = documentHtml.toString("utf8");
const islandMatch = documentText.match(/src="(\/rsjs\/island\/[^"]+\.js)"/);
if (!islandMatch) {
	throw new Error("Airbnb parity document did not contain its RSJS island asset");
}

const runtimeSource = readDump(DUMP_BINARY, ["--runtime"], "the Proa core runtime");
const queryRuntimeSource = readDump(
	DUMP_BINARY,
	["--query-runtime"],
	"the Proa query runtime",
);
function renderAsset(path) {
	const assetId = path
		.split("/")
		.at(-1)
		.replace(/\.js$/, "")
		.replace(/\.[0-9a-f]{8}$/, "");
	return readDump(
		DUMP_BINARY,
		["--asset", assetId],
		`linked RSJS asset ${assetId}`,
	);
}

const islandSource = renderAsset(islandMatch[1]);

const assets = new Map([
	["/", { type: "text/html; charset=utf-8", body: documentHtml }],
	[
		"/rsjs-runtime.js",
		{ type: "text/javascript; charset=utf-8", body: runtimeSource },
	],
	[
		"/rsjs-runtime-query.js",
		{ type: "text/javascript; charset=utf-8", body: queryRuntimeSource },
	],
	[
		islandMatch[1],
		{ type: "text/javascript; charset=utf-8", body: islandSource },
	],
]);
const servedJs = new Map();

const server = createServer((request, response) => {
	const url = new URL(request.url, "http://127.0.0.1");
	let asset = assets.get(url.pathname);
	if (
		!asset &&
		/^\/rsjs-runtime-query(?:\.[0-9a-f]{8})?\.js$/.test(url.pathname)
	) {
		asset = assets.get("/rsjs-runtime-query.js");
	}
	if (
		!asset &&
		/^\/rsjs-runtime(?:\.[0-9a-f]{8})?\.js$/.test(url.pathname)
	) {
		asset = assets.get("/rsjs-runtime.js");
	}
	if (!asset && url.pathname.startsWith("/rsjs/island/") && url.pathname.endsWith(".js")) {
		asset = {
			type: "text/javascript; charset=utf-8",
			body: renderAsset(url.pathname),
		};
		assets.set(url.pathname, asset);
	}
	if (!asset) {
		response.writeHead(204, { "cache-control": "no-store" });
		response.end();
		return;
	}
	const compressed = gzipSync(asset.body, { level: 9 });
	if (asset.type.startsWith("text/javascript")) {
		servedJs.set(url.pathname, {
			rawBytes: asset.body.length,
			gzipBytes: compressed.length,
		});
	}
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-encoding": "gzip",
		"content-length": compressed.length,
		"content-type": asset.type,
	});
	response.end(compressed);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const url = `http://127.0.0.1:${address.port}/`;
const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const records = [];

try {
	for (let run = 0; run < RUNS; run += 1) {
		const context = await browser.newContext({
			serviceWorkers: "block",
			javaScriptEnabled: JAVASCRIPT_ENABLED,
		});
		const page = await context.newPage();
		const pageErrors = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") pageErrors.push(message.text());
		});
		page.on("requestfailed", (request) =>
			pageErrors.push(
				`${request.failure()?.errorText || "request failed"}: ${request.url()}`,
			),
		);
		const cdp = await context.newCDPSession(page);
		await cdp.send("Network.enable");
		await cdp.send("Performance.enable");
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: LATENCY_MS,
			downloadThroughput: (DOWNLOAD_KBPS * 1_000) / 8,
			uploadThroughput: (DOWNLOAD_KBPS * 1_000) / 8,
			connectionType: "wifi",
		});
		const before = metricMap((await cdp.send("Performance.getMetrics")).metrics);
		const started = performance.now();
		await page.goto(url, { waitUntil: "load", timeout: 15_000 });
		await page.waitForTimeout(50);
		if (JAVASCRIPT_ENABLED && pageErrors.length) {
			throw new Error(
				`Proa page emitted browser errors: ${pageErrors.join(" | ")}`,
			);
		}
		const pageReadyMs = performance.now() - started;
		const after = metricMap((await cdp.send("Performance.getMetrics")).metrics);
		const record = {
			run: run + 1,
			pageReadyMs,
			scriptCpuMs:
				((after.ScriptDuration || 0) - (before.ScriptDuration || 0)) * 1_000,
			v8CompileCpuMs:
				((after.V8CompileDuration || 0) -
					(before.V8CompileDuration || 0)) *
				1_000,
			taskCpuMs:
				((after.TaskDuration || 0) - (before.TaskDuration || 0)) * 1_000,
		};
		records.push(record);
		console.log(`TRAVEL_PROA_JS_RUN ${JSON.stringify(record)}`);
		await context.close();
	}
} finally {
	await browser.close();
	await new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}

const uniqueJsAssets = [...servedJs.values()];
const result = {
	runs: RUNS,
	javascriptEnabled: JAVASCRIPT_ENABLED,
	latencyMs: LATENCY_MS,
	downloadKbps: DOWNLOAD_KBPS,
	runtimeRawBytes: runtimeSource.length,
	runtimeGzipBytes: gzipSync(runtimeSource, { level: 9 }).length,
	queryRuntimeRawBytes: queryRuntimeSource.length,
	queryRuntimeGzipBytes: gzipSync(queryRuntimeSource, { level: 9 }).length,
	islandRawBytes: islandSource.length,
	islandGzipBytes: gzipSync(islandSource, { level: 9 }).length,
	uniqueJsRequests: uniqueJsAssets.length,
	totalRawBytes: uniqueJsAssets.reduce(
		(sum, asset) => sum + asset.rawBytes,
		0,
	),
	totalGzipBytes: uniqueJsAssets.reduce(
		(sum, asset) => sum + asset.gzipBytes,
		0,
	),
	pageReadyP50Ms: percentile(
		records.map((record) => record.pageReadyMs),
		0.5,
	),
	scriptCpuP50Ms: percentile(
		records.map((record) => record.scriptCpuMs),
		0.5,
	),
	v8CompileCpuP50Ms: percentile(
		records.map((record) => record.v8CompileCpuMs),
		0.5,
	),
	jsCpuP50Ms: percentile(
		records.map(
			(record) => record.scriptCpuMs + record.v8CompileCpuMs,
		),
		0.5,
	),
};
console.log(`TRAVEL_PROA_JS_RESULT ${JSON.stringify(result)}`);
