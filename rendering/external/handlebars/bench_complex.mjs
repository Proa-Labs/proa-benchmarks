/**
 * Handlebars Complex Control Flow SSR Benchmark
 *
 * This benchmark highlights Handlebars' fundamental limitations:
 * - All logic must be pre-computed in JavaScript before template rendering
 * - No inline expressions, ternaries, or function calls
 * - Complex conditionals require registered helpers
 * - No filter/map/sort inside templates
 * - No pattern matching — just if/else
 *
 * To make this benchmark fair, we pre-compute everything Handlebars can't
 * do inline (which is what you'd actually do in production). This means
 * the benchmark measures BOTH the JS computation AND the template rendering.
 */

import Handlebars from "handlebars";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Same products as Proa/React benchmarks
const PRODUCTS = [
  {
    name: "Wireless Noise-Canceling Headphones", price: 299.99,
    category: "electronics", stock: { type: "in_stock", qty: 142 },
    rating: 4.7, reviewCount: 2847,
    badges: [{ type: "best_seller" }],
    tags: ["wireless", "bluetooth", "noise-canceling", "premium"],
    variants: [
      { name: "Black", available: true, priceMod: 0 },
      { name: "White", available: true, priceMod: 0 },
      { name: "Navy", available: false, priceMod: 10 },
    ],
    description: "Premium wireless headphones with industry-leading noise cancellation.",
    featured: true,
  },
  {
    name: "Organic Cotton T-Shirt", price: 34.99,
    category: "clothing", stock: { type: "low_stock", qty: 3 },
    rating: 4.2, reviewCount: 523,
    badges: [{ type: "sale", percent: 20 }, { type: "limited" }],
    tags: ["organic", "cotton", "sustainable"],
    variants: [
      { name: "S", available: true, priceMod: 0 },
      { name: "M", available: true, priceMod: 0 },
      { name: "L", available: false, priceMod: 0 },
      { name: "XL", available: true, priceMod: 5 },
    ],
    description: "Ethically sourced, 100% organic cotton t-shirt.",
    featured: false,
  },
  {
    name: "Artisan Sourdough Bread Mix", price: 12.99,
    category: "food", stock: { type: "in_stock", qty: 500 },
    rating: 4.9, reviewCount: 1205,
    badges: [{ type: "new" }, { type: "best_seller" }],
    tags: ["artisan", "sourdough", "organic", "baking", "vegan"],
    variants: [
      { name: "500g", available: true, priceMod: 0 },
      { name: "1kg", available: true, priceMod: 8 },
    ],
    description: "Professional-grade sourdough starter and flour blend.",
    featured: true,
  },
  {
    name: "The Rust Programming Language", price: 49.99,
    category: "books", stock: { type: "out_of_stock" },
    rating: 4.8, reviewCount: 3421,
    badges: [{ type: "best_seller" }],
    tags: ["programming", "rust", "systems"],
    variants: [
      { name: "Paperback", available: false, priceMod: 0 },
      { name: "Hardcover", available: false, priceMod: 15 },
      { name: "eBook", available: true, priceMod: -20 },
    ],
    description: "The official book on the Rust programming language.",
    featured: false,
  },
  {
    name: "Carbon Fiber Tennis Racket", price: 189.99,
    category: "sports", stock: { type: "pre_order", daysUntil: 14 },
    rating: 3.9, reviewCount: 87,
    badges: [{ type: "new" }],
    tags: ["tennis", "carbon-fiber", "professional"],
    variants: [
      { name: "Grip 4", available: true, priceMod: 0 },
      { name: "Grip 4 1/4", available: true, priceMod: 0 },
      { name: "Grip 4 3/8", available: true, priceMod: 0 },
    ],
    description: "Tournament-grade carbon fiber racket with vibration dampening.",
    featured: false,
  },
  {
    name: "Smart Home Hub Pro", price: 149.99,
    category: "electronics", stock: { type: "low_stock", qty: 7 },
    rating: 4.1, reviewCount: 1893,
    badges: [{ type: "sale", percent: 30 }, { type: "clearance" }],
    tags: ["smart-home", "iot", "voice-control", "wifi", "zigbee", "matter"],
    variants: [
      { name: "Standard", available: true, priceMod: 0 },
      { name: "Pro", available: true, priceMod: 50 },
    ],
    description: "Central hub for all your smart home devices.",
    featured: true,
  },
  {
    name: "Merino Wool Running Socks", price: 24.99,
    category: "clothing", stock: { type: "in_stock", qty: 892 },
    rating: 4.6, reviewCount: 445,
    badges: [],
    tags: ["merino", "wool", "running", "moisture-wicking"],
    variants: [
      { name: "S (6-8)", available: true, priceMod: 0 },
      { name: "M (8-10)", available: true, priceMod: 0 },
      { name: "L (10-12)", available: true, priceMod: 0 },
      { name: "XL (12-14)", available: true, priceMod: 2 },
    ],
    description: "Temperature-regulating merino wool socks for long runs.",
    featured: false,
  },
  {
    name: "Japanese Matcha Powder", price: 32.99,
    category: "food", stock: { type: "in_stock", qty: 234 },
    rating: 4.4, reviewCount: 678,
    badges: [{ type: "limited" }],
    tags: ["matcha", "japanese", "ceremonial-grade", "organic"],
    variants: [
      { name: "30g Tin", available: true, priceMod: 0 },
      { name: "100g Bag", available: true, priceMod: 28 },
    ],
    description: "Ceremonial-grade matcha from Uji, Kyoto.",
    featured: false,
  },
];

const CAT_ICONS = { electronics: "⚡", clothing: "👕", food: "🍎", books: "📚", sports: "⚽" };
const CAT_BADGE = {
  electronics: "bg-blue-100 text-blue-800",
  clothing: "bg-purple-100 text-purple-800",
  food: "bg-green-100 text-green-800",
  books: "bg-amber-100 text-amber-800",
  sports: "bg-red-100 text-red-800",
};
const BADGE_CLASS = {
  sale: "bg-red-500 text-white", new: "bg-emerald-500 text-white",
  limited: "bg-amber-500 text-white", best_seller: "bg-indigo-500 text-white",
  clearance: "bg-gray-500 text-white",
};
const BADGE_LABEL = {
  sale: "SALE", new: "NEW", limited: "LIMITED",
  best_seller: "BEST SELLER", clearance: "CLEARANCE",
};

// ============================================================================
// PRE-COMPUTATION: Everything Handlebars can't do inline
// This is the cost of using a logicless template engine.
// ============================================================================
function prepareContext() {
  const sorted = [...PRODUCTS].sort((a, b) =>
    (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating
  );

  const inStock = PRODUCTS.filter(p =>
    p.stock.type === "in_stock" || p.stock.type === "low_stock"
  ).length;

  return {
    stockSummary: inStock === PRODUCTS.length
      ? { allInStock: true, text: `All ${PRODUCTS.length} products in stock` }
      : inStock === 0
        ? { allOut: true, text: "All products out of stock" }
        : { partial: true, text: `${inStock} of ${PRODUCTS.length} in stock` },
    products: sorted.map(p => {
      // Pre-compute EVERYTHING because Handlebars can't
      const sale = p.badges.find(b => b.type === "sale");
      const orderable = p.stock.type !== "out_of_stock";
      const sortedTags = [...p.tags].filter(t => t.length > 3).sort();

      let truncDesc = p.description;
      let descTruncated = false;
      if (!p.featured && p.description.length > 80) {
        const cut = p.description.lastIndexOf(" ", 80);
        truncDesc = p.description.slice(0, cut > 0 ? cut : 80);
        descTruncated = true;
      }

      const full = Math.floor(p.rating);
      const partial = Math.round((p.rating - full) * 100);

      return {
        name: p.name,
        cardClass: `rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md ${(() => {
          switch (p.stock.type) {
            case "out_of_stock": return "border-red-200 opacity-75";
            case "low_stock": return "border-amber-200";
            case "pre_order": return "border-blue-200";
            case "in_stock": return p.featured ? "border-emerald-300 ring-1 ring-emerald-100" : "border-gray-200";
          }
        })()}`,
        hasBadges: p.badges.length > 0,
        badges: p.badges.map(b => ({
          label: BADGE_LABEL[b.type] + (b.type === "sale" ? ` -${b.percent}%` : ""),
          class: `inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_CLASS[b.type]}`,
        })),
        isElectronics: p.category === "electronics",
        isBooks: p.category === "books",
        isOtherCategory: p.category !== "electronics" && p.category !== "books",
        catIcon: CAT_ICONS[p.category],
        catName: p.category,
        catBadgeClass: `inline-block rounded px-2 py-0.5 text-xs ${CAT_BADGE[p.category]}`,
        hasSale: !!sale,
        discountedPrice: sale ? `$${(p.price * (1 - sale.percent / 100)).toFixed(2)}` : null,
        originalPrice: `$${p.price.toFixed(2)}`,
        salePercent: sale ? `${sale.percent}% off` : null,
        isInStock: p.stock.type === "in_stock",
        isLowStock: p.stock.type === "low_stock",
        isOutOfStock: p.stock.type === "out_of_stock",
        isPreOrder: p.stock.type === "pre_order",
        stockDotClass: (() => {
          if (p.stock.type === "in_stock") {
            return p.stock.qty > 100 ? "inline-block h-2 w-2 rounded-full bg-green-500"
              : p.stock.qty > 20 ? "inline-block h-2 w-2 rounded-full bg-green-400"
              : "inline-block h-2 w-2 rounded-full bg-yellow-400";
          }
          return "";
        })(),
        stockTextClass: (() => {
          if (p.stock.type === "in_stock") {
            return p.stock.qty > 100 ? "text-xs font-medium text-green-700"
              : p.stock.qty > 20 ? "text-xs font-medium text-green-600"
              : "text-xs font-medium text-yellow-600";
          }
          return "";
        })(),
        stockLabel: (() => {
          if (p.stock.type === "in_stock") {
            return p.stock.qty > 20 ? "In Stock" : "Limited Stock";
          }
          return "";
        })(),
        showStockQty: p.stock.type === "in_stock" && p.stock.qty <= 50,
        stockQty: p.stock.qty,
        preOrderDays: p.stock.daysUntil,
        preOrderUrgent: p.stock.type === "pre_order" && p.stock.daysUntil <= 7,
        stars: Array.from({ length: 5 }, (_, i) => ({
          class: (i < full || (i === full && partial > 0)) ? "text-yellow-400" : "text-gray-300",
          fill: i < full ? "100" : i === full && partial > 0
            ? (partial <= 25 ? "25" : partial <= 50 ? "50" : partial <= 75 ? "75" : "100") : "0",
        })),
        ratingText: `${p.rating.toFixed(1)} (${p.reviewCount >= 1000 ? `${(p.reviewCount / 1000).toFixed(1)}K` : p.reviewCount})`,
        hasTags: sortedTags.length > 0,
        displayTags: sortedTags.slice(0, 4),
        hasMoreTags: sortedTags.length > 4,
        moreTagsCount: sortedTags.length - 4,
        variants: p.variants.map(v => {
          const enabled = orderable && v.available && v.priceMod < 100;
          return {
            name: v.name,
            class: enabled
              ? "rounded border px-2 py-1 text-xs hover:bg-gray-50"
              : "rounded border px-2 py-1 text-xs opacity-40 line-through cursor-not-allowed",
            disabled: !enabled,
            hasPriceMod: v.priceMod > 0,
            priceMod: `+$${v.priceMod}`,
          };
        }),
        description: truncDesc,
        descTruncated,
      };
    }),
  };
}

// The template itself — notice how ALL logic is gone, replaced by pre-computed flags
const TEMPLATE = `<html lang="en">
<head><title>Product Listing</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<header class="border-b px-6 py-4">
<h1 class="text-2xl font-bold">Products</h1>
<p class="text-gray-500">
{{#if stockSummary.allInStock}}<span class="text-green-600">{{stockSummary.text}}</span>{{/if}}
{{#if stockSummary.allOut}}<span class="text-red-600">{{stockSummary.text}}</span>{{/if}}
{{#if stockSummary.partial}}<span>{{stockSummary.text}}</span>{{/if}}
</p>
</header>
<main class="grid gap-6 p-6 md:grid-cols-2 lg:grid-cols-3">
{{#each products}}
<article class="{{cardClass}}">
{{#if hasBadges}}<div class="mb-3 flex gap-2">{{#each badges}}<span class="{{class}}">{{label}}</span>{{/each}}</div>{{/if}}
{{#if isElectronics}}<div class="mb-2"><div class="flex items-center gap-2"><span class="text-lg">{{catIcon}}</span><h2 class="text-lg font-semibold">{{name}}</h2></div><span class="{{catBadgeClass}}">{{catName}}</span></div>{{/if}}
{{#if isBooks}}<div class="mb-2 border-l-4 border-amber-300 pl-3"><h2 class="text-lg font-semibold italic">{{name}}</h2><span class="text-xs text-gray-500">{{catIcon}} {{catName}}</span></div>{{/if}}
{{#if isOtherCategory}}<div class="mb-2"><h2 class="text-lg font-semibold">{{name}}</h2><span class="{{catBadgeClass}}">{{catIcon}} {{catName}}</span></div>{{/if}}
{{#if hasSale}}<div class="mb-2 flex items-baseline gap-2"><span class="text-xl font-bold text-red-600">{{discountedPrice}}</span><span class="text-sm text-gray-400 line-through">{{originalPrice}}</span><span class="text-xs font-medium text-red-500">{{salePercent}}</span></div>{{else}}<div class="mb-2"><span class="text-xl font-bold">{{originalPrice}}</span></div>{{/if}}
{{#if isInStock}}<div class="mb-2 flex items-center gap-1.5"><span class="{{stockDotClass}}"></span><span class="{{stockTextClass}}">{{stockLabel}}{{#if showStockQty}} ({{stockQty}} left){{/if}}</span></div>{{/if}}
{{#if isLowStock}}<div class="mb-2 flex items-center gap-1.5"><span class="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500"></span><span class="text-xs font-medium text-amber-600">Only {{stockQty}} left — order soon</span></div>{{/if}}
{{#if isOutOfStock}}<div class="mb-2 flex items-center gap-1.5"><span class="inline-block h-2 w-2 rounded-full bg-red-500"></span><span class="text-xs font-medium text-red-600">Out of Stock</span></div>{{/if}}
{{#if isPreOrder}}<div class="mb-2 flex items-center gap-1.5"><span class="inline-block h-2 w-2 rounded-full bg-blue-500"></span><span class="text-xs {{#if preOrderUrgent}}text-blue-700 font-semibold{{else}}text-blue-500{{/if}}">Pre-order — ships in {{preOrderDays}} days</span></div>{{/if}}
<div class="mb-2 flex items-center gap-1">{{#each stars}}<span class="{{class}}" data-fill="{{fill}}">★</span>{{/each}}<span class="ml-1 text-xs text-gray-500">{{ratingText}}</span></div>
{{#if hasTags}}<div class="mb-2 flex flex-wrap gap-1">{{#each displayTags}}<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{{this}}</span>{{/each}}{{#if ../hasMoreTags}}<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">+{{../moreTagsCount}} more</span>{{/if}}</div>{{/if}}
<div class="mb-2"><div class="flex flex-wrap gap-1">{{#each variants}}<button class="{{class}}" type="button" {{#if disabled}}disabled{{/if}}>{{name}}{{#if hasPriceMod}} <span class="text-gray-400">{{priceMod}}</span>{{/if}}</button>{{/each}}</div></div>
<p class="text-sm text-gray-600">{{description}}{{#if descTruncated}}<span class="text-gray-400">...</span>{{/if}}</p>
</article>
{{/each}}
</main>
</body>
</html>`;

const template = Handlebars.compile(TEMPLATE);

// Warmup — NOTE: prepareContext() is called every time (it's part of the cost)
let context = prepareContext();
let html = template(context);
console.log(`Output size: ${Buffer.byteLength(html)} bytes`);
console.log();

const iterations = 10_000;
for (let i = 0; i < 100; i++) { template(prepareContext()); }

const start = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
  // Must include prepareContext — that's the work Handlebars pushes to JS
  const ctx = prepareContext();
  template(ctx);
}
const elapsed = Number(process.hrtime.bigint() - start);
const avgUs = elapsed / iterations / 1000;

console.log("=== Handlebars Complex Latency (includes pre-computation) ===");
console.log(`  Iterations: ${iterations}`);
console.log(`  Total: ${(elapsed / 1_000_000).toFixed(2)} ms`);
console.log(`  Average: ${avgUs.toFixed(2)} µs/render`);

// Also measure template-only time (cheating — pre-compute once)
const precomputed = prepareContext();
const start2 = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) { template(precomputed); }
const elapsed2 = Number(process.hrtime.bigint() - start2);
const avgUs2 = elapsed2 / iterations / 1000;

console.log();
console.log("=== Handlebars Template-Only (pre-computed context, unfair) ===");
console.log(`  Average: ${avgUs2.toFixed(2)} µs/render`);

const __dirname = dirname(fileURLToPath(import.meta.url));
const result = {
  framework: "Handlebars (Complex)",
  language: "JavaScript",
  latency_us: parseFloat(avgUs.toFixed(2)),
  latency_template_only_us: parseFloat(avgUs2.toFixed(2)),
  output_bytes: Buffer.byteLength(html),
  iterations,
  benchmark: "complex",
  timestamp: new Date().toISOString(),
};
writeFileSync(join(__dirname, "..", "..", "results", "handlebars-complex.json"), JSON.stringify(result, null, 2));
console.log("\nResults written to results/handlebars-complex.json");
