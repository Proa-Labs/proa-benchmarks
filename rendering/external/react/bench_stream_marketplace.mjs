/**
 * React 19 streaming trace for a synthetic marketplace PDP.
 *
 * Matches the Proa `stream_trace` workload:
 * - static product shell
 * - six independently delayed sections
 * - Suspense fallback in the shell
 * - later streamed HTML replacing each fallback
 *
 * Run with:
 *   cd rendering/external/react
 *   npm ci
 *   node bench_stream_marketplace.mjs --iterations 25
 */

import { Suspense, createElement as h, use } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ITERATIONS = 20;
const DEFAULT_WARMUP = 3;
const SHELL_MARKER = 'data-benchmark-shell="marketplace"';

const PANELS = [
  {
    key: "shipping",
    title: "Shipping and delivery",
    fallbackLabel: "Loading shipping and delivery",
    delayMs: 8,
    eyebrow: "Fast path",
    body: "Get it by Tuesday with 2-day shipping. Local pickup available at checkout.",
  },
  {
    key: "seller",
    title: "Seller reputation",
    fallbackLabel: "Loading seller reputation",
    delayMs: 16,
    eyebrow: "Trust",
    body: "Top Rated seller with 99.8% positive feedback across 24,118 completed orders.",
  },
  {
    key: "returns",
    title: "Returns and protection",
    fallbackLabel: "Loading returns and protection",
    delayMs: 24,
    eyebrow: "Policy",
    body: "30-day free returns plus purchase protection when the item arrives not as described.",
  },
  {
    key: "similar",
    title: "Similar sponsored items",
    fallbackLabel: "Loading similar sponsored items",
    delayMs: 42,
    eyebrow: "Discovery",
    body: "Canon FD 50mm f/1.4, Nikon Series E 50mm f/1.8, and Olympus Zuiko 50mm f/1.8.",
  },
  {
    key: "reviews",
    title: "Buyer reviews",
    fallbackLabel: "Loading buyer reviews",
    delayMs: 65,
    eyebrow: "Social proof",
    body: "Vintage glass with excellent character. Buyers mention sharp center detail and smooth bokeh.",
  },
  {
    key: "qa",
    title: "Questions and answers",
    fallbackLabel: "Loading questions and answers",
    delayMs: 90,
    eyebrow: "Long tail",
    body: "Adapters tested on Sony E-mount and Fuji X. Aperture ring remains fully manual.",
  },
];

function Hero() {
  return h(
    "section",
    { className: "hero-shell" },
    h(
      "div",
      { className: "media-column" },
      h(
        "div",
        { className: "gallery" },
        h("div", { className: "photo" }, "Lens photo"),
        h(
          "div",
          { className: "thumbs" },
          h("span", null, "Front element"),
          h("span", null, "Side profile"),
          h("span", null, "Mount"),
        ),
      ),
    ),
    h(
      "div",
      { className: "summary-column" },
      h("p", { className: "eyebrow" }, "eBay-like marketplace PDP"),
      h("h1", null, "Canon FD 50mm f/1.4 S.S.C. Vintage Prime Lens"),
      h("p", { className: "price" }, "Bid US $129.50"),
      h("p", { className: "meta" }, "Condition: Used · Watchers: 214 · 12 bids"),
      h(
        "div",
        { className: "actions" },
        h("span", null, "Place bid"),
        h("span", null, "Buy it now"),
        h("span", null, "Add to watchlist"),
      ),
    ),
  );
}

function FallbackPanel({ panel }) {
  return h(
    "section",
    {
      className: "marketplace-panel fallback",
      "data-panel": panel.key,
      "data-panel-fallback": panel.key,
    },
    h("p", { className: "panel-eyebrow" }, "Fallback"),
    h("h2", null, panel.fallbackLabel),
    h("p", null, "Waiting on upstream service..."),
  );
}

function ReadyPanel({ panel }) {
  return h(
    "section",
    {
      className: "marketplace-panel ready",
      "data-panel": panel.key,
      "data-panel-ready": panel.key,
    },
    h("p", { className: "panel-eyebrow" }, panel.eyebrow),
    h("h2", null, panel.title),
    h("p", null, panel.body),
  );
}

function DelayedPanel({ panel, promise }) {
  use(promise);
  return h(ReadyPanel, { panel });
}

function App({ promises }) {
  return h(
    "main",
    { className: "marketplace-pdp", "data-benchmark-shell": "marketplace" },
    h(Hero, null),
    h(
      "div",
      { className: "content-grid" },
      ...PANELS.map((panel) =>
        h(
          Suspense,
          {
            key: panel.key,
            fallback: h(FallbackPanel, { panel }),
          },
          h(DelayedPanel, { panel, promise: promises[panel.key] }),
        ),
      ),
    ),
  );
}

function createPromises() {
  return Object.fromEntries(PANELS.map((panel) => [panel.key, delay(panel.delayMs)]));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function traceIteration() {
  const promises = createPromises();
  let responseReadyMs = 0;
  let shellVisibleMs = null;
  let firstChunkMs = null;
  let allReadyMs = null;
  const fallbackVisibleMs = {};
  const readyVisibleMs = {};
  let html = "";
  const start = process.hrtime.bigint();

  await new Promise((resolve, reject) => {
    let abortTimer = null;
    let settled = false;
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        const nowMs = elapsedMs(start);
        if (firstChunkMs == null) {
          firstChunkMs = nowMs;
        }

        html += chunk.toString("utf8");
        if (shellVisibleMs == null && html.includes(SHELL_MARKER)) {
          shellVisibleMs = nowMs;
        }

        for (const panel of PANELS) {
          const fallbackMarker = `data-panel-fallback="${panel.key}"`;
          if (!(panel.key in fallbackVisibleMs) && html.includes(fallbackMarker)) {
            fallbackVisibleMs[panel.key] = nowMs;
          }

          const readyMarker = `data-panel-ready="${panel.key}"`;
          if (!(panel.key in readyVisibleMs) && html.includes(readyMarker)) {
            readyVisibleMs[panel.key] = nowMs;
          }
        }

        callback();
      },
    });

    sink.once("finish", () => {
      settled = true;
      if (abortTimer) {
        clearTimeout(abortTimer);
      }
      resolve();
    });
    sink.once("error", (error) => {
      settled = true;
      if (abortTimer) {
        clearTimeout(abortTimer);
      }
      reject(error);
    });

    let shellPiped = false;
    const { pipe, abort } = renderToPipeableStream(h(App, { promises }), {
      onShellReady() {
        responseReadyMs = elapsedMs(start);
        shellPiped = true;
        pipe(sink);
      },
      onAllReady() {
        allReadyMs = elapsedMs(start);
      },
      onShellError(error) {
        settled = true;
        if (abortTimer) {
          clearTimeout(abortTimer);
        }
        reject(error);
      },
      onError(error) {
        if (!shellPiped) {
          settled = true;
          if (abortTimer) {
            clearTimeout(abortTimer);
          }
          reject(error);
        } else {
          console.error(error);
        }
      },
    });

    abortTimer = setTimeout(() => {
      if (!settled) {
        abort();
      }
    }, 10_000);
    abortTimer.unref?.();
  });

  return {
    responseReadyMs,
    firstChunkMs: firstChunkMs ?? responseReadyMs,
    completeMs: elapsedMs(start),
    shellVisibleMs,
    allReadyMs: allReadyMs ?? elapsedMs(start),
    fallbackVisibleMs,
    readyVisibleMs,
  };
}

async function warmup() {
  for (let i = 0; i < DEFAULT_WARMUP; i += 1) {
    await traceIteration();
  }
}

async function run(iterations) {
  const traces = [];
  for (let i = 0; i < iterations; i += 1) {
    traces.push(await traceIteration());
  }
  return traces;
}

function summarize(values) {
  if (values.length === 0) {
    return { avgMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const avgMs = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    avgMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}

function percentile(sortedValues, ratio) {
  const index = Math.round((sortedValues.length - 1) * ratio);
  return sortedValues[index];
}

function summaryJson(traces) {
  const fallbackVisibleMs = Object.fromEntries(
    PANELS.map((panel) => [
      panel.key,
      summarize(traces.flatMap((trace) => trace.fallbackVisibleMs[panel.key] ?? [])),
    ]),
  );

  const readyVisibleMs = Object.fromEntries(
    PANELS.map((panel) => [
      panel.key,
      summarize(traces.flatMap((trace) => trace.readyVisibleMs[panel.key] ?? [])),
    ]),
  );

  return {
    responseReadyMs: summarize(traces.map((trace) => trace.responseReadyMs)),
    firstChunkMs: summarize(traces.map((trace) => trace.firstChunkMs)),
    shellVisibleMs: summarize(traces.flatMap((trace) => trace.shellVisibleMs ?? [])),
    allReadyMs: summarize(traces.map((trace) => trace.allReadyMs)),
    completeMs: summarize(traces.map((trace) => trace.completeMs)),
    fallbackVisibleMs,
    readyVisibleMs,
  };
}

function printSummary(label, traces) {
  console.log(label);
  console.log(`  response ready: ${fmtStat(summarize(traces.map((trace) => trace.responseReadyMs)))}`);
  console.log(`  first chunk:    ${fmtStat(summarize(traces.map((trace) => trace.firstChunkMs)))}`);
  console.log(`  shell visible:  ${fmtStat(summarize(traces.flatMap((trace) => trace.shellVisibleMs ?? [])))}`);
  console.log(`  all ready:      ${fmtStat(summarize(traces.map((trace) => trace.allReadyMs)))}`);
  console.log(`  complete:       ${fmtStat(summarize(traces.map((trace) => trace.completeMs)))}`);
  console.log("  panel ready:");
  for (const panel of PANELS) {
    const stat = summarize(traces.flatMap((trace) => trace.readyVisibleMs[panel.key] ?? []));
    console.log(`    ${panel.key.padEnd(12)} ${fmtStat(stat)}`);
  }
}

function fmtStat(stat) {
  return `avg ${stat.avgMs.toFixed(2)} ms | p50 ${stat.p50Ms.toFixed(2)} | p95 ${stat.p95Ms.toFixed(2)} | min ${stat.minMs.toFixed(2)} | max ${stat.maxMs.toFixed(2)}`;
}

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function parseIterations(argv) {
  const index = argv.indexOf("--iterations");
  if (index === -1 || index === argv.length - 1) {
    return DEFAULT_ITERATIONS;
  }
  const parsed = Number.parseInt(argv[index + 1], 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_ITERATIONS;
}

const iterations = parseIterations(process.argv.slice(2));
console.log("React 19 streaming trace: marketplace PDP");
console.log(`Warmup iterations: ${DEFAULT_WARMUP}`);
console.log(`Measured iterations: ${iterations}`);
console.log();

await warmup();
const traces = await run(iterations);

printSummary("React renderToPipeableStream", traces);

const __dirname = dirname(fileURLToPath(import.meta.url));
const result = {
  scenario: "marketplace_pdp_stream_trace",
  runtime: "react-19-node",
  warmupIterations: DEFAULT_WARMUP,
  iterations,
  panels: PANELS,
  metrics: summaryJson(traces),
};

const outputPath = join(__dirname, "..", "..", "results", "react-stream-marketplace.json");
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log();
console.log(`Results written to ${outputPath}`);
