/**
 * Handlebars SSR Benchmark
 *
 * Renders the same page structure as the Rust benchmarks:
 * 4 sections × 8 cards × 5 list items ≈ 25KB HTML
 *
 * Run with: node bench.mjs
 */

import Handlebars from "handlebars";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const NUM_SECTIONS = 4;
const CARDS_PER_SECTION = 8;
const ITEMS_PER_CARD = 5;

const TEMPLATE_SOURCE = `<html lang="en">
<head>
    <title>SSR Benchmark Page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <header class="hero-section">
        <h1 class="title">SSR Framework Benchmark</h1>
        <p class="subtitle">Comparing SSR frameworks</p>
    </header>
    <main class="main-content">
        {{#each sections}}
        <section class="card-section" data-section="{{this.dataSection}}">
            <h2 class="section-title">{{this.title}}</h2>
            <div class="card-grid">
                {{#each this.cards}}
                <article class="card" data-card-id="{{this.dataCardId}}">
                    <div class="card-header">
                        <img src="/images/benchmark.png" alt="Benchmark chart" class="card-image">
                    </div>
                    <div class="card-body">
                        <h3 class="card-title">{{this.title}}</h3>
                        <p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                        <ul class="feature-list">
                            {{#each this.features}}
                            <li class="feature-item">{{this}}</li>
                            {{/each}}
                        </ul>
                        <button class="btn-primary" type="button">View Details</button>
                    </div>
                </article>
                {{/each}}
            </div>
        </section>
        {{/each}}
    </main>
    <footer class="footer">
        <p>Rendered with Handlebars</p>
    </footer>
</body>
</html>`;

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

// Build context data
const context = {
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

// Compile template once (like production usage)
const template = Handlebars.compile(TEMPLATE_SOURCE);

// Warmup and verify
let html = template(context);
console.log(`Output size: ${Buffer.byteLength(html)} bytes`);
console.log(`First 200 chars: ${html.slice(0, 200)}`);
console.log();

// --- Precise latency measurement ---
const iterations = 10_000;

// Warmup
for (let i = 0; i < 100; i++) {
  template(context);
}

const start = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
  template(context);
}
const elapsed = Number(process.hrtime.bigint() - start);
const avgUs = elapsed / iterations / 1000;

console.log("=== Handlebars Latency ===");
console.log(`  Iterations: ${iterations}`);
console.log(`  Total: ${(elapsed / 1_000_000).toFixed(2)} ms`);
console.log(`  Average: ${avgUs.toFixed(2)} µs/render`);
console.log();

// --- JSON output ---
const __dirname = dirname(fileURLToPath(import.meta.url));
const result = {
  framework: "Handlebars",
  language: "JavaScript",
  latency_us: parseFloat(avgUs.toFixed(2)),
  output_bytes: Buffer.byteLength(html),
  iterations,
  timestamp: new Date().toISOString(),
};

writeFileSync(
  join(__dirname, "..", "..", "results", "handlebars.json"),
  JSON.stringify(result, null, 2)
);
console.log("Results written to results/handlebars.json");
