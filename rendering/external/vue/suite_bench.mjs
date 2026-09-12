#!/usr/bin/env node
// Vue 3 canonical adapter. Templates are compiled ahead of the timed loop with
// Vue's SSR compiler, which is the optimized string-concatenation path a
// production Vue/Nuxi build uses; each timed render calls renderToString on a
// fresh SSR app instance and returns a fresh owned string.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { compile } from "@vue/compiler-ssr";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import * as VueRuntime from "vue";
import * as VueServerRenderer from "vue/server-renderer";

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
  throw new Error("The Vue representative suite requires NODE_ENV=production");
}

const templates = {
  cards:
    `<html lang="en"><head><title>SSR Benchmark Page</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><header class="hero-section"><h1 class="title">SSR Framework Benchmark</h1><p class="subtitle">Comparing Proa, Leptos, Dioxus, and Yew</p></header><main class="main-content"><section v-for="section in sections" class="card-section" :data-section="section.dataSection"><h2 class="section-title">{{ section.title }}</h2><div class="card-grid"><article v-for="card in section.cards" class="card" :data-card-id="card.dataCardId"><div class="card-header"><img src="/images/benchmark.png" alt="Benchmark chart" class="card-image"></div><div class="card-body"><h3 class="card-title">{{ card.title }}</h3><p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><ul class="feature-list"><li v-for="feature in card.features" class="feature-item">{{ feature }}</li></ul><button class="btn-primary" type="button">View Details</button></div></article></div></section></main><footer class="footer"><p>Rendered by the SSR benchmark fixture</p></footer></body></html>`,
  table:
    `<html lang="en"><head><title>Customer Data Table</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-gray-50 text-gray-900"><header class="px-6 py-4 border-b"><h1 class="text-xl font-semibold">Customer Accounts</h1><p class="text-sm text-gray-600">Live revenue and account status across all regions.</p></header><main class="p-6"><table class="min-w-full text-sm border-collapse"><thead class="bg-gray-100"><tr><th class="px-3 py-2 text-left">ID</th><th class="px-3 py-2 text-left">Name</th><th class="px-3 py-2 text-left">Email</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-right">Amount</th><th class="px-3 py-2 text-right">Tax</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-left">Created</th><th class="px-3 py-2 text-left">Updated</th><th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2 text-left">Country</th><th class="px-3 py-2 text-left">Tags</th></tr></thead><tbody><tr v-for="(row, index) in rows" :class="index % 2 === 0 ? 'bg-white' : 'bg-gray-50'" :data-row-id="row.id"><td class="px-3 py-2 font-mono text-gray-500">{{ row.id }}</td><td class="px-3 py-2">{{ row.name }}</td><td class="px-3 py-2 text-blue-700">{{ row.email }}</td><td class="px-3 py-2"><span :class="statusClasses[row.status]">{{ row.status }}</span></td><td class="px-3 py-2 text-right font-mono">{{ formatCurrency(row.amountCents) }}</td><td class="px-3 py-2 text-right font-mono text-gray-500">{{ formatCurrency(row.taxCents) }}</td><td class="px-3 py-2 text-right font-mono font-semibold">{{ formatCurrency(row.amountCents + row.taxCents) }}</td><td class="px-3 py-2 text-gray-600">{{ formatDate(row.createdUnix) }}</td><td class="px-3 py-2 text-gray-600">{{ formatDateTime(row.updatedUnix) }}</td><td class="px-3 py-2 text-right font-mono">{{ formatPercent(row.scoreBps) }}</td><td class="px-3 py-2">{{ row.country }}</td><td class="px-3 py-2"><span v-for="tag in row.tags" class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">{{ tag }}</span></td></tr></tbody></table></main></body></html>`,
  products:
    `<main class="mx-auto w-full max-w-6xl px-4 py-10"><h1 class="text-2xl font-bold tracking-tight">All products</h1><div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"><a v-for="product in products" :href="'/products/' + product.id" class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"><div class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300">{{ product.category }}</div><p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ product.category }}</p><h3 class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600">{{ product.name }}</h3><div class="mt-2 flex items-center gap-1"><div class="flex"><svg v-for="index in starIndexes" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" :class="index < Math.floor((product.ratingTenths + 5) / 10) ? 'h-4 w-4 text-amber-400' : 'h-4 w-4 text-slate-200'"><path :d="starPath"></path></svg></div><span class="text-xs text-slate-500">{{ formatRating(product.ratingTenths) }} ({{ product.reviewCount }})</span></div><p class="mt-3 text-lg font-bold">{{ formatPrice(product.priceCents) }}</p></a></div></main>`,
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
if (!Object.hasOwn(templates, workload)) {
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

// Compile once, ahead of timing, into the same ssrRender function a Vue
// build step would emit; the compiled code is materialized with the runtime
// helpers it requests.
const { code } = compile(templates[workload], { mode: "function", isCustomElement: () => false });
const ssrRender = new Function("require", `${code}\nreturn ssrRender;`)((name) => {
  if (name === "vue") return VueRuntime;
  if (name === "vue/server-renderer") return VueServerRenderer;
  throw new Error(`unexpected helper module ${name}`);
});
const input = inputs[workload];
const component = { ssrRender, setup: () => input };
const render = () => renderToString(createSSRApp(component));

let html = await render();
if (dumpPath) {
  mkdirSync(dirname(dumpPath), { recursive: true });
  writeFileSync(dumpPath, html);
}
if (dumpOnly) {
  console.log(`Vue ${workload}: ${Buffer.byteLength(html)} bytes`);
  process.exit(0);
}

for (let index = 0; index < warmup; index += 1) html = await render();
const samples = [];
for (let index = 0; index < iterations; index += 1) {
  const started = process.hrtime.bigint();
  html = await render();
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
  framework: "Vue 3",
  framework_id: "vue",
  language: "JavaScript",
  language_version: process.version,
  workload,
  workload_cardinality: defaults[workload].cardinality,
  allocation_policy: "SSR-compiled Vue template rendered with renderToString on a fresh app; fresh owned string",
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
