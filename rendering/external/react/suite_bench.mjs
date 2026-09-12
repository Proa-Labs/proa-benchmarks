#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";

import { PRODUCT_COUNT, TABLE_ROW_COUNT } from "../shared/suite_data.mjs";
import { ROOTS } from "./suite_components.mjs";

if (process.env.NODE_ENV !== "production") {
  throw new Error("The React representative suite requires NODE_ENV=production");
}

function readArgument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const workload = readArgument("--workload");
if (!new Set(["cards", "table", "products"]).has(workload)) {
  throw new Error("--workload must be cards, table, or products");
}
const defaults = {
  cards: { iterations: 2_000, warmup: 200, cardinality: 32 },
  table: { iterations: 200, warmup: 20, cardinality: TABLE_ROW_COUNT },
  products: { iterations: 500, warmup: 50, cardinality: PRODUCT_COUNT },
};
const iterations = Number(readArgument("--iterations", defaults[workload].iterations));
const warmup = Number(readArgument("--warmup", defaults[workload].warmup));
const outputPath = readArgument("--out");
const dumpPath = readArgument("--dump");
const dumpOnly = process.argv.includes("--dump-only");
const root = ROOTS[workload];
const render = () => renderToString(h(root));

let html = render();
if (dumpPath) {
  mkdirSync(dirname(dumpPath), { recursive: true });
  writeFileSync(dumpPath, html);
}
if (dumpOnly) {
  console.log(`React ${workload}: ${Buffer.byteLength(html)} bytes`);
  process.exit(0);
}

for (let index = 0; index < warmup; index += 1) html = render();
const samples = new Float64Array(iterations);
for (let index = 0; index < iterations; index += 1) {
  const started = process.hrtime.bigint();
  html = render();
  samples[index] = Number(process.hrtime.bigint() - started) / 1_000;
}
const sorted = Array.from(samples).sort((left, right) => left - right);
const percentile = (percent) => {
  const rank = (percent / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
};
const summary = {
  schema_version: 1,
  framework: "React 19",
  framework_id: "react",
  language: "JavaScript",
  workload,
  workload_cardinality: defaults[workload].cardinality,
  allocation_policy: "React renderToString; fresh owned string",
  iterations,
  warmup,
  output_bytes: Buffer.byteLength(html),
  min_us: sorted[0],
  mean_us: sorted.reduce((sum, sample) => sum + sample, 0) / sorted.length,
  p50_us: percentile(50),
  p95_us: percentile(95),
  p99_us: percentile(99),
  max_us: sorted.at(-1),
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
