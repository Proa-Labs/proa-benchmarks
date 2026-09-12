/**
 * Marko SSR Benchmark
 *
 * Renders the same page structure as the Rust benchmarks:
 * 4 sections × 8 cards × 5 list items ≈ 25KB HTML
 *
 * Marko 5 (eBay's SSR-first templating engine) compiles `.marko` files
 * to optimized JS render functions ahead of time. We pre-compile via
 * `@marko/compiler` to a CJS module and require it.
 *
 * Run with: node bench.mjs
 */

import { compileFile } from "@marko/compiler";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

const input = {
  sections: Array.from({ length: NUM_SECTIONS }, (_, s) => ({
    dataSection: s % 2 === 0 ? "even" : "odd",
    title: SECTION_TITLES[s] ?? SECTION_TITLES[3],
    cards: Array.from({ length: CARDS_PER_SECTION }, (_, c) => ({
      dataCardId: c % 2 === 0 ? "even" : "odd",
      title: CARD_TITLES[c % 4],
      features: FEATURES.slice(0, ITEMS_PER_CARD),
    })),
  })),
};

// --- Compile the Marko template to standalone JS (CJS) ---
const sourcePath = join(__dirname, "page.marko");
const compiled = await compileFile(sourcePath, {
  output: "html",
  optimize: true,
  modules: "cjs",
  writeVersionComment: false,
  resolveVirtualDependency(_filename, dep) {
    return dep.virtualPath;
  },
});

// Write the compiled output alongside the source so Node's module resolver
// can find the local `marko` install (a /tmp path can't reach our node_modules).
const compiledFile = join(__dirname, "page.compiled.cjs");
writeFileSync(compiledFile, compiled.code);

const Template = require(compiledFile).default;

// Marko 6 exposes `Template.render(input)` returning a PromiseLike<string>;
// Marko 5 exposed `Template.renderToString(input)`. Support both.
async function renderOnce() {
  if (typeof Template.render === "function") {
    return await Template.render(input);
  }
  return await Template.renderToString(input);
}

// Warmup + verify
let html = await renderOnce();
console.log(`Output size: ${Buffer.byteLength(html)} bytes`);
console.log(`First 200 chars: ${html.slice(0, 200)}`);
console.log();

const iterations = 10_000;
for (let i = 0; i < 100; i++) await renderOnce();

const start = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) await renderOnce();
const elapsed = Number(process.hrtime.bigint() - start);
const avgUs = elapsed / iterations / 1000;

console.log("=== Marko Latency ===");
console.log(`  Iterations: ${iterations}`);
console.log(`  Total: ${(elapsed / 1_000_000).toFixed(2)} ms`);
console.log(`  Average: ${avgUs.toFixed(2)} µs/render`);
console.log();

const result = {
  framework: "Marko",
  language: "JavaScript",
  latency_us: parseFloat(avgUs.toFixed(2)),
  output_bytes: Buffer.byteLength(html),
  iterations,
  timestamp: new Date().toISOString(),
};

writeFileSync(
  join(__dirname, "..", "..", "results", "marko.json"),
  JSON.stringify(result, null, 2)
);
console.log("Results written to results/marko.json");
