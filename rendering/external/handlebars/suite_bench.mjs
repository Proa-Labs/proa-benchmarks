#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import Handlebars from "handlebars";

import {
  buildCardSections,
  buildProducts,
  buildTableRows,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatRating,
  PRODUCT_COUNT,
  STAR_PATH,
  STATUS_CLASSES,
  TABLE_ROW_COUNT,
} from "../shared/suite_data.mjs";

const templates = {
  cards:
    `<html lang="en"><head><title>SSR Benchmark Page</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><header class="hero-section"><h1 class="title">SSR Framework Benchmark</h1><p class="subtitle">Comparing Proa, Leptos, Dioxus, and Yew</p></header><main class="main-content">{{#each sections}}<section class="card-section" data-section="{{dataSection}}"><h2 class="section-title">{{title}}</h2><div class="card-grid">{{#each cards}}<article class="card" data-card-id="{{dataCardId}}"><div class="card-header"><img src="/images/benchmark.png" alt="Benchmark chart" class="card-image"></div><div class="card-body"><h3 class="card-title">{{title}}</h3><p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><ul class="feature-list">{{#each features}}<li class="feature-item">{{this}}</li>{{/each}}</ul><button class="btn-primary" type="button">View Details</button></div></article>{{/each}}</div></section>{{/each}}</main><footer class="footer"><p>Rendered by the SSR benchmark fixture</p></footer></body></html>`,
  table:
    `<html lang="en"><head><title>Customer Data Table</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-gray-50 text-gray-900"><header class="px-6 py-4 border-b"><h1 class="text-xl font-semibold">Customer Accounts</h1><p class="text-sm text-gray-600">Live revenue and account status across all regions.</p></header><main class="p-6"><table class="min-w-full text-sm border-collapse"><thead class="bg-gray-100"><tr><th class="px-3 py-2 text-left">ID</th><th class="px-3 py-2 text-left">Name</th><th class="px-3 py-2 text-left">Email</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-right">Amount</th><th class="px-3 py-2 text-right">Tax</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-left">Created</th><th class="px-3 py-2 text-left">Updated</th><th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2 text-left">Country</th><th class="px-3 py-2 text-left">Tags</th></tr></thead><tbody>{{#each rows}}<tr class="{{zebra @index}}" data-row-id="{{id}}"><td class="px-3 py-2 font-mono text-gray-500">{{id}}</td><td class="px-3 py-2">{{name}}</td><td class="px-3 py-2 text-blue-700">{{email}}</td><td class="px-3 py-2"><span class="{{statusClass status}}">{{status}}</span></td><td class="px-3 py-2 text-right font-mono">{{currency amountCents}}</td><td class="px-3 py-2 text-right font-mono text-gray-500">{{currency taxCents}}</td><td class="px-3 py-2 text-right font-mono font-semibold">{{currencySum amountCents taxCents}}</td><td class="px-3 py-2 text-gray-600">{{date createdUnix}}</td><td class="px-3 py-2 text-gray-600">{{dateTime updatedUnix}}</td><td class="px-3 py-2 text-right font-mono">{{percent scoreBps}}</td><td class="px-3 py-2">{{country}}</td><td class="px-3 py-2">{{#each tags}}<span class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">{{this}}</span>{{/each}}</td></tr>{{/each}}</tbody></table></main></body></html>`,
  products:
    `<main class="mx-auto w-full max-w-6xl px-4 py-10"><h1 class="text-2xl font-bold tracking-tight">All products</h1><div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{{#each products}}<a href="/products/{{id}}" class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"><div class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300">{{category}}</div><p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{category}}</p><h3 class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600">{{name}}</h3><div class="mt-2 flex items-center gap-1"><div class="flex">{{#each ../starIndexes}}<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="{{starClass this ../ratingTenths}}"><path d="${STAR_PATH}"></path></svg>{{/each}}</div><span class="text-xs text-slate-500">{{rating ratingTenths}} ({{reviewCount}})</span></div><p class="mt-3 text-lg font-bold">{{price priceCents}}</p></a>{{/each}}</div></main>`,
};

Handlebars.registerHelper(
  "zebra",
  (index) => (index % 2 === 0 ? "bg-white" : "bg-gray-50"),
);
Handlebars.registerHelper("statusClass", (status) => STATUS_CLASSES[status]);
Handlebars.registerHelper("currency", formatCurrency);
Handlebars.registerHelper(
  "currencySum",
  (left, right) => formatCurrency(left + right),
);
Handlebars.registerHelper("date", formatDate);
Handlebars.registerHelper("dateTime", formatDateTime);
Handlebars.registerHelper("percent", formatPercent);
Handlebars.registerHelper("price", formatPrice);
Handlebars.registerHelper("rating", formatRating);
Handlebars.registerHelper(
  "starClass",
  (index, ratingTenths) =>
    index < Math.floor((ratingTenths + 5) / 10)
      ? "h-4 w-4 text-amber-400"
      : "h-4 w-4 text-slate-200",
);

const inputs = {
  cards: { sections: buildCardSections() },
  table: { rows: buildTableRows() },
  products: { products: buildProducts(), starIndexes: [0, 1, 2, 3, 4] },
};

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const workload = argument("--workload");
if (!Object.hasOwn(templates, workload)) {
  throw new Error("--workload must be cards, table, or products");
}
const defaults = {
  cards: { iterations: 2_000, warmup: 200, cardinality: 32 },
  table: { iterations: 200, warmup: 20, cardinality: TABLE_ROW_COUNT },
  products: { iterations: 500, warmup: 50, cardinality: PRODUCT_COUNT },
};
const iterations = Number(
  argument("--iterations", defaults[workload].iterations),
);
const warmup = Number(argument("--warmup", defaults[workload].warmup));
const outputPath = argument("--out");
const dumpPath = argument("--dump");
const dumpOnly = process.argv.includes("--dump-only");
if (
  !Number.isInteger(iterations) || iterations < 1 ||
  !Number.isInteger(warmup) || warmup < 0
) {
  throw new Error(
    "iterations must be positive and warmup must be non-negative",
  );
}

const compiled = Handlebars.compile(templates[workload]);
const render = () => compiled(inputs[workload]);
let html = render();
if (dumpPath) {
  mkdirSync(dirname(dumpPath), { recursive: true });
  writeFileSync(dumpPath, html);
}
if (dumpOnly) {
  console.log(`Handlebars ${workload}: ${Buffer.byteLength(html)} bytes`);
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
  return lower === upper
    ? samples[lower]
    : samples[lower] + (samples[upper] - samples[lower]) * (rank - lower);
};
const summary = {
  schema_version: 1,
  framework: "Handlebars",
  framework_id: "handlebars",
  language: "JavaScript",
  language_version: process.version,
  workload,
  workload_cardinality: defaults[workload].cardinality,
  allocation_policy: "compiled Handlebars template; fresh owned string",
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
  `${summary.framework} ${workload.padEnd(8)} ${
    summary.p50_us.toFixed(2).padStart(9)
  } µs p50  ${summary.p95_us.toFixed(2).padStart(9)} µs p95  ${
    String(summary.output_bytes).padStart(8)
  } bytes`,
);
if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
} else {
  console.log(JSON.stringify(summary, null, 2));
}
