/**
 * Deno + React 19 SSR Benchmark
 *
 * Renders the same page structure as the Rust benchmarks:
 * 4 sections × 8 cards × 5 list items ≈ 25KB HTML
 *
 * Run with: deno run --allow-write --allow-read bench.mjs
 */

import { createElement as h } from "react";
import { renderToString } from "react-dom/server";

// Dev-mode React SSR is 3-8x slower and not a fair comparison; require prod.
if (globalThis.process?.env?.NODE_ENV !== "production") {
  throw new Error(
    "React (Deno) SSR benchmark requires NODE_ENV=production. Run: NODE_ENV=production deno run --allow-env --allow-read --allow-write bench.mjs",
  );
}

const NUM_SECTIONS = 4;
const CARDS_PER_SECTION = 8;
const ITEMS_PER_CARD = 5;

const SECTION_TITLES = [
  "Performance Metrics",
  "Rendering Speed",
  "Memory Efficiency",
  "Framework Comparison",
];

const CARD_TITLES = [
  "Latency Analysis",
  "Throughput Metrics",
  "Memory Usage",
  "CPU Utilization",
];

const FEATURES = [
  "Sub-millisecond response times",
  "Zero-copy rendering pipeline",
  "SIMD-accelerated escaping",
  "Pre-allocated buffers",
  "Minimal heap allocations",
];

function FeatureList() {
  return h(
    "ul",
    { className: "feature-list" },
    Array.from({ length: ITEMS_PER_CARD }, (_, i) =>
      h("li", { key: i, className: "feature-item" }, FEATURES[i] ?? FEATURES[4])
    )
  );
}

function Card({ cardIdx }) {
  const cardClass = cardIdx % 2 === 0 ? "even" : "odd";
  const title = CARD_TITLES[cardIdx % 4];

  return h(
    "article",
    { className: "card", "data-card-id": cardClass },
    h(
      "div",
      { className: "card-header" },
      h("img", {
        src: "/images/benchmark.png",
        alt: "Benchmark chart",
        className: "card-image",
      })
    ),
    h(
      "div",
      { className: "card-body" },
      h("h3", { className: "card-title" }, title),
      h(
        "p",
        { className: "card-description" },
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
      ),
      h(FeatureList, null),
      h(
        "button",
        { className: "btn-primary", type: "button" },
        "View Details"
      )
    )
  );
}

function Section({ sectionIdx }) {
  const sectionClass = sectionIdx % 2 === 0 ? "even" : "odd";
  const title = SECTION_TITLES[sectionIdx] ?? SECTION_TITLES[3];

  return h(
    "section",
    { className: "card-section", "data-section": sectionClass },
    h("h2", { className: "section-title" }, title),
    h(
      "div",
      { className: "card-grid" },
      Array.from({ length: CARDS_PER_SECTION }, (_, i) =>
        h(Card, { key: i, cardIdx: i })
      )
    )
  );
}

function BenchmarkPage() {
  return h(
    "html",
    { lang: "en" },
    h(
      "head",
      null,
      h("title", null, "SSR Benchmark Page"),
      h("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      })
    ),
    h(
      "body",
      null,
      h(
        "header",
        { className: "hero-section" },
        h("h1", { className: "title" }, "SSR Framework Benchmark"),
        h("p", { className: "subtitle" }, "Comparing SSR frameworks")
      ),
      h(
        "main",
        { className: "main-content" },
        Array.from({ length: NUM_SECTIONS }, (_, i) =>
          h(Section, { key: i, sectionIdx: i })
        )
      ),
      h(
        "footer",
        { className: "footer" },
        h("p", null, "Rendered with React 19 on Deno")
      )
    )
  );
}

// Warmup
let html = renderToString(h(BenchmarkPage, null));
const encoder = new TextEncoder();
const htmlBytes = encoder.encode(html);
console.log(`Output size: ${htmlBytes.byteLength} bytes`);
console.log(`First 200 chars: ${html.slice(0, 200)}`);
console.log();

// --- Precise latency measurement ---
const iterations = 10_000;

// Warmup
for (let i = 0; i < 100; i++) {
  renderToString(h(BenchmarkPage, null));
}

const start = performance.now();
for (let i = 0; i < iterations; i++) {
  renderToString(h(BenchmarkPage, null));
}
const elapsedMs = performance.now() - start;
const avgUs = (elapsedMs * 1000) / iterations;

console.log("=== Deno + React 19 Latency ===");
console.log(`  Iterations: ${iterations}`);
console.log(`  Total: ${elapsedMs.toFixed(2)} ms`);
console.log(`  Average: ${avgUs.toFixed(2)} µs/render`);
console.log();

// --- JSON output ---
const result = {
  framework: "React 19 (Deno)",
  language: "JavaScript",
  runtime: "Deno",
  latency_us: parseFloat(avgUs.toFixed(2)),
  output_bytes: htmlBytes.byteLength,
  iterations,
  timestamp: new Date().toISOString(),
};

const resultsPath = new URL("../../results/deno-react.json", import.meta.url);
await Deno.writeTextFile(resultsPath, JSON.stringify(result, null, 2));
console.log("Results written to results/deno-react.json");
