/**
 * Marko 6 bench for the synthetic marketplace listings template.
 * Renders only the <li class="s-card"> blocks (the variable workload);
 * the surrounding authored shell is constant for both Proa and Marko.
 */
import { compileFile } from "@marko/compiler";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildListings } from "./helpers_srp_real.mjs";

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

const sourcePath = join(__dirname, "page_srp_real.marko");
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
const compiledFile = join(__dirname, "page_srp_real.compiled.mjs");
writeFileSync(compiledFile, compiled.code);
const Template = (await import(pathToFileURL(compiledFile).href)).default;

const listings = buildListings(LISTINGS);
const input = { listings };

async function renderOnce() {
  if (typeof Template.render === "function") return await Template.render(input);
  return await Template.renderToString(input);
}

console.log("=== Marko Synthetic Marketplace SRP Bench ===");
console.log(`  listings: ${LISTINGS}`);
console.log(`  warmup:   ${WARMUP}`);
console.log(`  iters:    ${ITERS}`);

let html = await renderOnce();
const outputBytes = Buffer.byteLength(html);
console.log(`  output:   ${outputBytes} bytes`);
console.log();

for (let i = 0; i < WARMUP; i++) html = await renderOnce();

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

function pct(a, p) {
  const r = (p / 100) * (a.length - 1);
  const lo = Math.floor(r), hi = Math.ceil(r);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (r - lo);
}
const meanNs = sortedNs.reduce((a, b) => a + b, 0) / sortedNs.length;
const us = (ns) => (ns / 1000).toFixed(2);
const rps = ITERS / (totalElapsed / 1e9);

console.log("=== Latency (per render) ===");
console.log(`  min:  ${us(sortedNs[0]).padStart(9)} µs`);
console.log(`  mean: ${us(meanNs).padStart(9)} µs`);
console.log(`  p50:  ${us(pct(sortedNs, 50)).padStart(9)} µs`);
console.log(`  p95:  ${us(pct(sortedNs, 95)).padStart(9)} µs`);
console.log(`  p99:  ${us(pct(sortedNs, 99)).padStart(9)} µs`);
console.log(`  max:  ${us(sortedNs[sortedNs.length - 1]).padStart(9)} µs`);
console.log();
console.log(`Throughput: ${rps.toFixed(0)} renders/sec`);

const result = {
  framework: "Marko",
  language: "JavaScript",
  benchmark: "ebay_srp_real",
  listings: LISTINGS,
  iterations: ITERS,
  warmup: WARMUP,
  output_bytes: outputBytes,
  latency_us: parseFloat(us(meanNs)),
  min_us: parseFloat(us(sortedNs[0])),
  mean_us: parseFloat(us(meanNs)),
  p50_us: parseFloat(us(pct(sortedNs, 50))),
  p95_us: parseFloat(us(pct(sortedNs, 95))),
  p99_us: parseFloat(us(pct(sortedNs, 99))),
  max_us: parseFloat(us(sortedNs[sortedNs.length - 1])),
  renders_per_sec: parseFloat(rps.toFixed(0)),
  timestamp: new Date().toISOString(),
};

writeFileSync(
  join(__dirname, "..", "..", "results", "ebay_srp_real_marko.json"),
  JSON.stringify(result, null, 2)
);
console.log("Results written to results/ebay_srp_real_marko.json");
