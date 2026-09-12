#!/usr/bin/env node

import { compileFile } from "@marko/compiler";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PRODUCT_COUNT,
  TABLE_ROW_COUNT,
  buildCardSections,
  buildProducts,
  buildTableRows,
} from "../shared/suite_data.mjs";

const localDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

const templateNames = {
  cards: "suite_cards.marko",
  table: "page_table.marko",
  products: "suite_products.marko",
};
const inputs = {
  cards: { sections: buildCardSections() },
  table: { rows: buildTableRows() },
  products: { products: buildProducts(), starIndexes: [0, 1, 2, 3, 4] },
};

const sourcePath = join(localDirectory, templateNames[workload]);
const compiledPath = join(localDirectory, `suite_${workload}.compiled.mjs`);
const compiled = await compileFile(sourcePath, {
  output: "html",
  optimize: true,
  modules: "esm",
  writeVersionComment: false,
  translator: require.resolve("marko/translator"),
  resolveVirtualDependency(_filename, dependency) {
    return dependency.virtualPath;
  },
});
writeFileSync(compiledPath, compiled.code);
const Template = (await import(pathToFileURL(compiledPath).href)).default;
const input = inputs[workload];
const render = async () => {
  if (typeof Template.render === "function") return await Template.render(input);
  return await Template.renderToString(input);
};

let html = await render();
if (dumpPath) {
  mkdirSync(dirname(dumpPath), { recursive: true });
  writeFileSync(dumpPath, html);
}
if (dumpOnly) {
  console.log(`Marko ${workload}: ${Buffer.byteLength(html)} bytes`);
  process.exit(0);
}

for (let index = 0; index < warmup; index += 1) html = await render();
const samples = new Float64Array(iterations);
for (let index = 0; index < iterations; index += 1) {
  const started = process.hrtime.bigint();
  html = await render();
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
  framework: "Marko 6",
  framework_id: "marko",
  language: "JavaScript",
  workload,
  workload_cardinality: defaults[workload].cardinality,
  allocation_policy: "compiled Marko HTML render; fresh owned string",
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
