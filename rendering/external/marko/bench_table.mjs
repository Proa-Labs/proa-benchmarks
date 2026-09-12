/**
 * Marko Heavy Data Table Benchmark
 *
 * Mirrors `rendering/src/bin/data_table_bench.rs` and
 * `rendering/src/data_table_page.rs`. Renders a 1000-row × 12-column
 * dashboard with per-cell formatting (currency, dates, badges, escaping)
 * and reports mean/P50/P95/P99/max latency in JSON for direct comparison
 * with the Proa results.
 *
 * Run:
 *   node bench_table.mjs
 *   node bench_table.mjs --rows 500 --iters 200
 */

import { compileFile } from "@marko/compiler";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---- args ----
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return Number(argv[i + 1]);
}
const ROWS = arg("--rows", 1000);
const ITERS = arg("--iters", 500);
const WARMUP = arg("--warmup", 50);

// ---- dataset (mirror data_table_page::build_dataset) ----
const NAMES = [
  "Alice <admin>",
  "Bob & Charlie",
  'Dana "the boss" Lin',
  "Eve O'Brien",
  "Frank > Smith",
  "Grace Hopper & Co.",
  "Heidi <script>",
  "Ivan & Sons",
  'Judy Q. "Public"',
  "Karl <tag>",
  "Liu & Wang",
  "Mallory >&<",
  "Niaj <user>",
  "Olivia & Co.",
  "Peggy 'Quote'",
  "Quinn & Sons",
];
const EMAILS = [
  "alice+filter@example.com",
  "bob&charlie@example.com",
  "dana@example.org",
  "eve@example.io",
  "frank>smith@example.net",
  "grace@hopper.dev",
  "heidi@example.com",
  "ivan&sons@example.co",
  "judy@public.gov",
  "karl@example.com",
  "liu@wang.cn",
  "mallory@evil.example",
  "niaj@example.bd",
  "olivia@co.example",
  "peggy@quoted.example",
  "quinn@example.io",
];
const COUNTRIES = ["USA", "CAN", "GBR", "DEU", "FRA", "JPN", "AUS", "BRA"];
const TAG_SETS = [
  ["new", "priority"],
  ["enterprise", "vip"],
  ["trial"],
  ["enterprise", "vip", "priority"],
  ["churn-risk"],
  ["new"],
  ["priority", "review"],
  ["vip"],
];
const STATUSES = ["Active", "Pending", "Disabled", "Cancelled", "Refunded"];

function buildDataset(n) {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const amount = 12345 + ((i * 137) % 99999);
    rows[i] = {
      id: 100000 + i,
      name: NAMES[i % NAMES.length],
      email: EMAILS[i % EMAILS.length],
      status: STATUSES[i % 5],
      amountCents: amount,
      taxCents: Math.trunc((amount * 8) / 100),
      createdUnix: 1700000000 + i * 86400,
      updatedUnix: 1710000000 + i * 3600,
      scoreBps: 5000 + ((i * 31) % 5000),
      country: COUNTRIES[i % COUNTRIES.length],
      tags: TAG_SETS[i % TAG_SETS.length],
    };
  }
  return rows;
}

// ---- compile template ----
const sourcePath = join(__dirname, "page_table.marko");
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
const compiledFile = join(__dirname, "page_table.compiled.mjs");
writeFileSync(compiledFile, compiled.code);
const Template = (await import(pathToFileURL(compiledFile).href)).default;

// Marko 6 exposes `Template.render(input)` returning a PromiseLike<string>;
// Marko 5 exposed `Template.renderToString(input)`. Support both.
async function renderOnce() {
  if (typeof Template.render === "function") {
    return await Template.render(input);
  }
  return await Template.renderToString(input);
}

// ---- bench ----
const rows = buildDataset(ROWS);
const input = { rows };

console.log("=== Marko Data Table Bench ===");
console.log(`  rows:   ${ROWS}`);
console.log(`  warmup: ${WARMUP}`);
console.log(`  iters:  ${ITERS}`);

// Verify output once.
let html = await renderOnce();
const outputBytes = Buffer.byteLength(html);
console.log(`  output: ${outputBytes} bytes`);
console.log(`  first 240 chars: ${html.slice(0, 240)}`);
console.log();

// Warmup.
for (let i = 0; i < WARMUP; i++) {
  html = await renderOnce();
}

// Measured.
const samples = new BigInt64Array(ITERS);
const totalStart = process.hrtime.bigint();
for (let i = 0; i < ITERS; i++) {
  const start = process.hrtime.bigint();
  html = await renderOnce();
  samples[i] = process.hrtime.bigint() - start;
}
const totalElapsed = Number(process.hrtime.bigint() - totalStart);

// Sort and compute stats.
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
  benchmark: "data_table",
  rows: ROWS,
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

const outPath = join(__dirname, "..", "..", "results", "data_table_marko.json");
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`Results written to ${outPath}`);
