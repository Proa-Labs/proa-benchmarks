#!/usr/bin/env node
// Svelte 5 canonical adapter. Each .svelte component is compiled ahead of the
// timed loop with the Svelte compiler in server mode, exactly as a SvelteKit
// build would emit it; each timed render calls render() from svelte/server and
// returns a fresh owned string. Svelte components cannot emit <html> or <head>
// themselves, so the two full-document workloads place the rendered body
// inside the same static document shell a SvelteKit app.html would provide.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compile } from "svelte/compiler";
import { render as svelteRender } from "svelte/server";

import {
  PRODUCT_COUNT,
  STAR_PATH,
  STATUS_CLASSES,
  TABLE_ROW_COUNT,
  buildCardSections,
  buildProducts,
  buildTableRows,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatRating,
} from "../shared/suite_data.mjs";

if (process.env.NODE_ENV !== "production") {
  throw new Error("The Svelte representative suite requires NODE_ENV=production");
}

const here = dirname(fileURLToPath(import.meta.url));

const shells = {
  cards: {
    open: `<html lang="en"><head><title>SSR Benchmark Page</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>`,
    close: `</body></html>`,
  },
  table: {
    open: `<html lang="en"><head><title>Customer Data Table</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-gray-50 text-gray-900">`,
    close: `</body></html>`,
  },
  products: { open: "", close: "" },
};

const inputs = {
  cards: { sections: buildCardSections() },
  table: {
    rows: buildTableRows(),
    statusClasses: STATUS_CLASSES,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatPercent,
  },
  products: {
    products: buildProducts(),
    starIndexes: [0, 1, 2, 3, 4],
    starPath: STAR_PATH,
    formatPrice,
    formatRating,
  },
};

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const workload = argument("--workload");
if (!Object.hasOwn(inputs, workload)) {
  throw new Error("--workload must be cards, table, or products");
}
const defaults = {
  cards: { iterations: 2_000, warmup: 200, cardinality: 32 },
  table: { iterations: 200, warmup: 20, cardinality: TABLE_ROW_COUNT },
  products: { iterations: 500, warmup: 50, cardinality: PRODUCT_COUNT },
};
const iterations = Number(argument("--iterations", defaults[workload].iterations));
const warmup = Number(argument("--warmup", defaults[workload].warmup));
const outputPath = argument("--out");
const dumpPath = argument("--dump");
const dumpOnly = process.argv.includes("--dump-only");
if (!Number.isInteger(iterations) || iterations < 1 || !Number.isInteger(warmup) || warmup < 0) {
  throw new Error("iterations must be positive and warmup must be non-negative");
}

const sourcePath = join(here, `suite_${workload}.svelte`);
const compiledPath = join(here, `suite_${workload}.compiled.mjs`);
const compiled = compile(readFileSync(sourcePath, "utf8"), {
  generate: "server",
  runes: true,
  filename: sourcePath,
  css: "external",
});
writeFileSync(compiledPath, compiled.js.code);
const Component = (await import(pathToFileURL(compiledPath).href)).default;
const input = inputs[workload];
const shell = shells[workload];
const render = () => `${shell.open}${svelteRender(Component, { props: input }).body}${shell.close}`;

let html = render();
if (dumpPath) {
  mkdirSync(dirname(dumpPath), { recursive: true });
  writeFileSync(dumpPath, html);
}
if (dumpOnly) {
  console.log(`Svelte ${workload}: ${Buffer.byteLength(html)} bytes`);
  process.exit(0);
}

for (let index = 0; index < warmup; index += 1) html = render();
const samples = [];
for (let index = 0; index < iterations; index += 1) {
  const started = process.hrtime.bigint();
  html = render();
  samples.push(Number(process.hrtime.bigint() - started) / 1_000);
}
samples.sort((left, right) => left - right);
const percentile = (percent) => {
  const rank = (percent / 100) * (samples.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return lower === upper ? samples[lower] : samples[lower] + (samples[upper] - samples[lower]) * (rank - lower);
};
const summary = {
  schema_version: 1,
  framework: "Svelte 5",
  framework_id: "svelte",
  language: "JavaScript",
  language_version: process.version,
  workload,
  workload_cardinality: defaults[workload].cardinality,
  allocation_policy: "server-compiled Svelte 5 component rendered with svelte/server render() inside a static document shell; fresh owned string",
  iterations,
  warmup,
  output_bytes: Buffer.byteLength(html),
  min_us: samples[0],
  mean_us: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
  p50_us: percentile(50),
  p95_us: percentile(95),
  p99_us: percentile(99),
  max_us: samples.at(-1),
  timestamp: new Date().toISOString(),
};

console.log(
  `${summary.framework} ${workload.padEnd(8)} ${summary.p50_us.toFixed(2).padStart(9)} µs p50  ${summary.p95_us.toFixed(2).padStart(9)} µs p95  ${String(summary.output_bytes).padStart(8)} bytes`,
);
if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Result written to ${outputPath}`);
} else {
  console.log(JSON.stringify(summary, null, 2));
}
