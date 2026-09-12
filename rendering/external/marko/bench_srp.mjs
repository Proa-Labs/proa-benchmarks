/**
 * Marko 6 synthetic marketplace SRP benchmark
 *
 * Mirrors `rendering/src/bin/ebay_srp_bench.rs`. Renders a 60-listing
 * search results page (faceted sidebar + listing grid) with per-listing
 * formatting and reports mean/P50/P95/P99/max latency in JSON.
 */

import { compileFile } from "@marko/compiler";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildListings, FACETS } from "./helpers_srp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return Number(argv[i + 1]);
}
const LISTINGS = arg("--listings", 60);
const ITERS = arg("--iters", 500);
const WARMUP = arg("--warmup", 50);
const NOW_UNIX = 1730100000;

const sourcePath = join(__dirname, "page_srp.marko");
const compiled = await compileFile(sourcePath, {
  output: "html",
  optimize: true,
  modules: "esm",
  writeVersionComment: false,
  translator: require.resolve("marko/translator"),
  resolveVirtualDependency(_filename, dep) {
    return dep.virtualPath;
  },
});
const compiledFile = join(__dirname, "page_srp.compiled.mjs");
writeFileSync(compiledFile, compiled.code);
const Template = (await import(pathToFileURL(compiledFile).href)).default;

const listings = buildListings(LISTINGS);
const input = {
  query: "field recorder",
  totalResults: 32062,
  facets: FACETS,
  listings,
  nowUnix: NOW_UNIX,
};

async function renderOnce() {
  if (typeof Template.render === "function") {
    return await Template.render(input);
  }
  return await Template.renderToString(input);
}

console.log("=== Marko synthetic marketplace SRP benchmark ===");
console.log(`  listings: ${LISTINGS}`);
console.log(`  warmup:   ${WARMUP}`);
console.log(`  iters:    ${ITERS}`);

let html = await renderOnce();
const outputBytes = Buffer.byteLength(html);
console.log(`  output:   ${outputBytes} bytes`);
console.log(`  first 200 chars: ${html.slice(0, 200)}`);
console.log();

for (let i = 0; i < WARMUP; i++) {
  html = await renderOnce();
}

const samples = new BigInt64Array(ITERS);
const totalStart = process.hrtime.bigint();
for (let i = 0; i < ITERS; i++) {
  const start = process.hrtime.bigint();
  html = await renderOnce();
  samples[i] = process.hrtime.bigint() - start;
}
const totalElapsed = Number(process.hrtime.bigint() - totalStart);

const sortedNs = Array.from(samples, (v) => Number(v));
sortedNs.sort((a, b) => a - b);

function pct(arr, p) {
  if (!arr.length) return 0;
  const rank = (p / 100) * (arr.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (rank - lo);
}

const sumNs = sortedNs.reduce((a, b) => a + b, 0);
const meanNs = sumNs / sortedNs.length;
const minNs = sortedNs[0];
const maxNs = sortedNs[sortedNs.length - 1];
const p50 = pct(sortedNs, 50);
const p95 = pct(sortedNs, 95);
const p99 = pct(sortedNs, 99);
const rps = ITERS / (totalElapsed / 1e9);

const us = (ns) => (ns / 1000).toFixed(2);

console.log("=== Latency (per render) ===");
console.log(`  min:  ${us(minNs).padStart(9)} µs`);
console.log(`  mean: ${us(meanNs).padStart(9)} µs`);
console.log(`  p50:  ${us(p50).padStart(9)} µs`);
console.log(`  p95:  ${us(p95).padStart(9)} µs`);
console.log(`  p99:  ${us(p99).padStart(9)} µs`);
console.log(`  max:  ${us(maxNs).padStart(9)} µs`);
console.log();
console.log("=== Throughput ===");
console.log(`  total:    ${(totalElapsed / 1e6).toFixed(2)} ms`);
console.log(`  per-sec:  ${rps.toFixed(0)} renders/sec`);
console.log();

const result = {
  framework: "Marko",
  language: "JavaScript",
  benchmark: "ebay_srp",
  listings: LISTINGS,
  iterations: ITERS,
  warmup: WARMUP,
  output_bytes: outputBytes,
  latency_us: parseFloat(us(meanNs)),
  min_us: parseFloat(us(minNs)),
  mean_us: parseFloat(us(meanNs)),
  p50_us: parseFloat(us(p50)),
  p95_us: parseFloat(us(p95)),
  p99_us: parseFloat(us(p99)),
  max_us: parseFloat(us(maxNs)),
  renders_per_sec: parseFloat(rps.toFixed(0)),
  timestamp: new Date().toISOString(),
};

const outPath = join(__dirname, "..", "..", "results", "ebay_srp_marko.json");
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`Results written to ${outPath}`);
