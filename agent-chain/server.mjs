import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { build } from "esbuild";
import { App, VENDORS } from "./app.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = process.env.AGENT_CHAIN_HOST || "127.0.0.1";
const MINIMAL_PORT = Number(process.env.AGENT_CHAIN_MINIMAL_PORT || 5600);
const HYDRATED_PORT = Number(process.env.AGENT_CHAIN_HYDRATED_PORT || 5601);
const ASSET_LATENCY_MS = Number(process.env.AGENT_CHAIN_ASSET_LATENCY_MS || 40);
const ASSET_KBPS = Number(process.env.AGENT_CHAIN_ASSET_KBPS || 10_000);
const JS_GZIP_KIB = Number(process.env.AGENT_CHAIN_JS_GZIP_KIB || 64);

const STYLE = `
:root { color-scheme: light; font: 16px/1.45 system-ui, sans-serif; }
body { margin: 0; color: #202124; background: #f7f7f5; }
main { width: min(680px, calc(100% - 48px)); margin: 48px auto; padding: 32px; background: white; border: 1px solid #ddd; border-radius: 12px; }
h1 { margin-top: 0; }
li { margin: 10px 0; }
dt { margin-top: 16px; color: #666; }
dd { margin: 2px 0; font: 600 18px/1.4 ui-monospace, monospace; }
form { display: grid; gap: 16px; }
label { display: grid; gap: 6px; }
input { padding: 9px 11px; font: inherit; }
button { width: fit-content; padding: 10px 16px; font: inherit; }
`;

function deterministicNoise(length) {
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	let state = 0x9e3779b9;
	let output = "";
	for (let index = 0; index < length; index += 1) {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		output += alphabet[state >>> 26];
	}
	return output;
}

function paddedBundle(baseBundle, targetBytes) {
	const wrap = (noise) =>
		`${baseBundle}\nconst __agentChainPayload="${noise}";globalThis.__agentChainPayloadBytes=__agentChainPayload.length;\n`;
	const baseGzip = gzipSync(baseBundle, { level: 9 });
	if (baseGzip.length >= targetBytes)
		return { source: baseBundle, gzip: baseGzip };

	let maximum = Math.max(8_192, (targetBytes - baseGzip.length) * 2);
	let noise = deterministicNoise(maximum);
	while (gzipSync(wrap(noise), { level: 9 }).length < targetBytes) {
		maximum *= 2;
		noise = deterministicNoise(maximum);
	}

	let low = 0;
	let high = maximum;
	while (high - low > 256) {
		const middle = Math.floor((low + high) / 2);
		const length = gzipSync(wrap(noise.slice(0, middle)), { level: 9 }).length;
		if (length < targetBytes) low = middle;
		else high = middle;
	}

	const lowSource = wrap(noise.slice(0, low));
	const highSource = wrap(noise.slice(0, high));
	const lowGzip = gzipSync(lowSource, { level: 9 });
	const highGzip = gzipSync(highSource, { level: 9 });
	if (targetBytes - lowGzip.length <= highGzip.length - targetBytes) {
		return { source: lowSource, gzip: lowGzip };
	}
	return { source: highSource, gzip: highGzip };
}

const clientBuild = await build({
	entryPoints: [join(HERE, "client.mjs")],
	bundle: true,
	minify: true,
	write: false,
	format: "esm",
	platform: "browser",
	target: ["es2020"],
	legalComments: "none",
	define: { "process.env.NODE_ENV": '"production"' },
});
const baseBundle = clientBuild.outputFiles[0].text;
const clientBundle = paddedBundle(baseBundle, JS_GZIP_KIB * 1024);

const metricsByVariant = {
	minimal: new Map(),
	hydrated: new Map(),
};

function safeRunId(value) {
	return /^[a-zA-Z0-9_-]{1,80}$/.test(value || "") ? value : "untracked";
}

function metricsFor(variant, runId) {
	const map = metricsByVariant[variant];
	if (!map.has(runId)) {
		map.set(runId, {
			pageRequests: 0,
			assetRequests: 0,
			assetBytes: 0,
			acceptedSubmissions: 0,
		});
	}
	return map.get(runId);
}

function propsFor(pathname, searchParams) {
	const runId = safeRunId(searchParams.get("run"));
	if (pathname === "/" || pathname === "/start") {
		return {
			status: 200,
			assetKey: "coordinator",
			props: { page: "start", vendors: VENDORS, runId },
		};
	}
	if (pathname.startsWith("/vendor/")) {
		const id = pathname.slice("/vendor/".length);
		const vendor = VENDORS.find((candidate) => candidate.id === id);
		if (vendor) {
			return {
				status: 200,
				assetKey: `vendor-${id}`,
				props: { page: "vendor", vendor, runId },
			};
		}
	}
	if (pathname === "/submit") {
		return {
			status: 200,
			assetKey: "coordinator",
			props: { page: "submit", vendors: VENDORS, runId },
		};
	}
	if (pathname === "/result") {
		const errors = [];
		for (const vendor of VENDORS) {
			const submitted = searchParams.get(`code_${vendor.id}`) || "";
			if (vendor.status === "Action required" && submitted !== vendor.code) {
				errors.push(`${vendor.name} is missing its correct code`);
			}
			if (vendor.status !== "Action required" && submitted !== "") {
				errors.push(`${vendor.name} should have been left empty`);
			}
		}
		return {
			status: 200,
			assetKey: "coordinator",
			accepted: errors.length === 0,
			props: { page: "result", accepted: errors.length === 0, errors, runId },
		};
	}
	return {
		status: 404,
		assetKey: "coordinator",
		props: { page: "missing", runId },
	};
}

function escapeScriptJson(value) {
	return JSON.stringify(value)
		.replaceAll("<", "\\u003c")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

function documentHtml(rootMarkup, props, variant, assetKey) {
	const hydration =
		variant === "hydrated"
			? `<script id="agent-chain-data" type="application/json">${escapeScriptJson(props)}</script><script type="module" src="/assets/${assetKey}.js?run=${encodeURIComponent(props.runId)}"></script>`
			: "";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent chain benchmark</title><style>${STYLE}</style></head><body><div id="root">${rootMarkup}</div>${hydration}</body></html>`;
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function writeShapedAsset(response) {
	if (ASSET_LATENCY_MS > 0) await delay(ASSET_LATENCY_MS);
	response.writeHead(200, {
		"content-type": "application/javascript; charset=utf-8",
		"content-encoding": "gzip",
		"content-length": clientBundle.gzip.length,
		"cache-control": "public, max-age=31536000, immutable",
		vary: "accept-encoding",
	});

	if (ASSET_KBPS <= 0) {
		response.end(clientBundle.gzip);
		return;
	}

	const bytesPerSecond = (ASSET_KBPS * 1_000) / 8;
	const chunkSize = Math.max(1_024, Math.floor(bytesPerSecond / 200));
	const transferStarted = performance.now();
	for (let offset = 0; offset < clientBundle.gzip.length; offset += chunkSize) {
		const end = Math.min(offset + chunkSize, clientBundle.gzip.length);
		const targetElapsedMs = (end / bytesPerSecond) * 1_000;
		const remainingMs = targetElapsedMs - (performance.now() - transferStarted);
		if (remainingMs > 0) await delay(remainingMs);
		if (!response.write(clientBundle.gzip.subarray(offset, end))) {
			await new Promise((resolve) => response.once("drain", resolve));
		}
	}
	response.end();
}

function handlerFor(variant) {
	return async (request, response) => {
		try {
			const url = new URL(
				request.url || "/",
				`http://${request.headers.host || HOST}`,
			);
			const runId = safeRunId(url.searchParams.get("run"));

			if (url.pathname === "/health") {
				response.writeHead(200, {
					"content-type": "application/json",
					"cache-control": "no-store",
				});
				response.end(
					JSON.stringify({
						status: "ok",
						variant,
						bundleRawBytes: Buffer.byteLength(clientBundle.source),
						bundleGzipBytes: clientBundle.gzip.length,
						assetLatencyMs: ASSET_LATENCY_MS,
						assetKbps: ASSET_KBPS,
					}),
				);
				return;
			}

			if (url.pathname === "/metrics") {
				response.writeHead(200, {
					"content-type": "application/json",
					"cache-control": "no-store",
				});
				response.end(JSON.stringify(metricsFor(variant, runId)));
				return;
			}

			if (url.pathname.startsWith("/assets/") && variant === "hydrated") {
				const metrics = metricsFor(variant, runId);
				metrics.assetRequests += 1;
				metrics.assetBytes += clientBundle.gzip.length;
				await writeShapedAsset(response);
				return;
			}

			const page = propsFor(url.pathname, url.searchParams);
			const rootMarkup = renderToString(h(App, page.props));
			const rootDigest = createHash("sha256").update(rootMarkup).digest("hex");
			const metrics = metricsFor(variant, page.props.runId);
			metrics.pageRequests += 1;
			if (page.accepted) metrics.acceptedSubmissions += 1;

			response.writeHead(page.status, {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "no-store",
				"x-agent-chain-root-sha256": rootDigest,
			});
			response.end(
				documentHtml(rootMarkup, page.props, variant, page.assetKey),
			);
		} catch (error) {
			response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
			response.end(error.stack || String(error));
		}
	};
}

function listen(port, variant) {
	const server = createServer(handlerFor(variant));
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, HOST, () => resolve(server));
	});
}

const [minimalServer, hydratedServer] = await Promise.all([
	listen(MINIMAL_PORT, "minimal"),
	listen(HYDRATED_PORT, "hydrated"),
]);

console.log(
	`AGENT_CHAIN_SERVER minimal=http://${HOST}:${MINIMAL_PORT} hydrated=http://${HOST}:${HYDRATED_PORT} bundle_raw=${Buffer.byteLength(clientBundle.source)} bundle_gzip=${clientBundle.gzip.length} latency_ms=${ASSET_LATENCY_MS} kbps=${ASSET_KBPS}`,
);

async function shutdown() {
	await Promise.all([
		new Promise((resolve) => minimalServer.close(resolve)),
		new Promise((resolve) => hydratedServer.close(resolve)),
	]);
}

process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
