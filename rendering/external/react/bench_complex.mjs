/**
 * React 19 Complex Control Flow SSR Benchmark
 *
 * Product listing with:
 * - Pattern matching (switch on category/stock status → different DOM)
 * - Deeply nested conditionals (stock thresholds, pricing, badges)
 * - Computed dynamic classes
 * - Inline filter/map/sort chains
 * - Format/transform function calls
 * - Conditional rendering with fallbacks
 */

import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Same data model as Proa benchmark
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

const fmtPrice = (p) => `$${p.toFixed(2)}`;
const fmtRating = (r) => r.toFixed(1);
const fmtCount = (c) => c >= 1000 ? `${(c / 1000).toFixed(1)}K` : `${c}`;

function BadgeRow({ badges }) {
  if (!badges.length) return null;
  return h("div", { className: "mb-3 flex gap-2" },
    badges.map((b, i) =>
      h("span", { key: i, className: `inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_CLASS[b.type]}` },
        BADGE_LABEL[b.type],
        b.type === "sale" ? ` -${b.percent}%` : null
      )
    )
  );
}

function CategoryHeader({ product: p }) {
  const cat = p.category;
  switch (cat) {
    case "electronics":
      return h("div", { className: "mb-2" },
        h("div", { className: "flex items-center gap-2" },
          h("span", { className: "text-lg" }, CAT_ICONS[cat]),
          h("h2", { className: "text-lg font-semibold" }, p.name)
        ),
        h("span", { className: `inline-block rounded px-2 py-0.5 text-xs ${CAT_BADGE[cat]}` }, cat)
      );
    case "books":
      return h("div", { className: "mb-2 border-l-4 border-amber-300 pl-3" },
        h("h2", { className: "text-lg font-semibold italic" }, p.name),
        h("span", { className: "text-xs text-gray-500" }, `${CAT_ICONS[cat]} ${cat}`)
      );
    default:
      return h("div", { className: "mb-2" },
        h("h2", { className: "text-lg font-semibold" }, p.name),
        h("span", { className: `inline-block rounded px-2 py-0.5 text-xs ${CAT_BADGE[cat]}` },
          `${CAT_ICONS[cat]} ${cat}`)
      );
  }
}

function PriceDisplay({ product: p }) {
  const sale = p.badges.find(b => b.type === "sale");
  if (sale) {
    const discounted = p.price * (1 - sale.percent / 100);
    return h("div", { className: "mb-2 flex items-baseline gap-2" },
      h("span", { className: "text-xl font-bold text-red-600" }, fmtPrice(discounted)),
      h("span", { className: "text-sm text-gray-400 line-through" }, fmtPrice(p.price)),
      h("span", { className: "text-xs font-medium text-red-500" }, `${sale.percent}% off`)
    );
  }
  return h("div", { className: "mb-2" },
    h("span", { className: "text-xl font-bold" }, fmtPrice(p.price))
  );
}

function StockIndicator({ stock }) {
  switch (stock.type) {
    case "in_stock": {
      const [dotCls, txtCls, label] = stock.qty > 100
        ? ["bg-green-500", "text-green-700", "In Stock"]
        : stock.qty > 20
          ? ["bg-green-400", "text-green-600", "In Stock"]
          : ["bg-yellow-400", "text-yellow-600", "Limited Stock"];
      return h("div", { className: "mb-2 flex items-center gap-1.5" },
        h("span", { className: `inline-block h-2 w-2 rounded-full ${dotCls}` }),
        h("span", { className: `text-xs font-medium ${txtCls}` },
          label, stock.qty <= 50 ? ` (${stock.qty} left)` : null)
      );
    }
    case "low_stock":
      return h("div", { className: "mb-2 flex items-center gap-1.5" },
        h("span", { className: "inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" }),
        h("span", { className: "text-xs font-medium text-amber-600" },
          `Only ${stock.qty} left — order soon`)
      );
    case "out_of_stock":
      return h("div", { className: "mb-2 flex items-center gap-1.5" },
        h("span", { className: "inline-block h-2 w-2 rounded-full bg-red-500" }),
        h("span", { className: "text-xs font-medium text-red-600" }, "Out of Stock")
      );
    case "pre_order":
      return h("div", { className: "mb-2 flex items-center gap-1.5" },
        h("span", { className: "inline-block h-2 w-2 rounded-full bg-blue-500" }),
        h("span", { className: `text-xs ${stock.daysUntil <= 7 ? "text-blue-700 font-semibold" : "text-blue-500"}` },
          `Pre-order — ships in ${stock.daysUntil} days`)
      );
  }
}

function RatingDisplay({ rating, count }) {
  const full = Math.floor(rating);
  const partial = Math.round((rating - full) * 100);
  return h("div", { className: "mb-2 flex items-center gap-1" },
    ...Array.from({ length: 5 }, (_, i) => {
      const fill = i < full ? "100" : i === full && partial > 0
        ? (partial <= 25 ? "25" : partial <= 50 ? "50" : partial <= 75 ? "75" : "100") : "0";
      return h("span", { key: i, className: fill === "0" ? "text-gray-300" : "text-yellow-400", "data-fill": fill }, "★");
    }),
    h("span", { className: "ml-1 text-xs text-gray-500" }, `${fmtRating(rating)} (${fmtCount(count)})`)
  );
}

function TagList({ tags }) {
  if (!tags.length) return null;
  const sorted = [...tags].filter(t => t.length > 3).sort();
  const display = sorted.slice(0, 4);
  const remaining = sorted.length - 4;
  return h("div", { className: "mb-2 flex flex-wrap gap-1" },
    ...display.map(t => h("span", { key: t, className: "rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600" }, t)),
    remaining > 0 ? h("span", { className: "rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500" }, `+${remaining} more`) : null
  );
}

function VariantSelector({ variants, stock }) {
  const orderable = stock.type !== "out_of_stock";
  return h("div", { className: "mb-2" },
    h("div", { className: "flex flex-wrap gap-1" },
      ...variants.map((v, i) => {
        const enabled = orderable && v.available && v.priceMod < 100;
        return h("button", {
          key: i, type: "button",
          className: enabled
            ? "rounded border px-2 py-1 text-xs hover:bg-gray-50"
            : "rounded border px-2 py-1 text-xs opacity-40 line-through cursor-not-allowed",
          disabled: !enabled || undefined,
        }, v.name, v.priceMod > 0 ? h("span", { className: "text-gray-400" }, ` +$${v.priceMod}`) : null);
      })
    )
  );
}

function Description({ text, featured }) {
  let display = text;
  let truncated = false;
  if (!featured && text.length > 80) {
    const cut = text.lastIndexOf(" ", 80);
    display = text.slice(0, cut > 0 ? cut : 80);
    truncated = true;
  }
  return h("p", { className: "text-sm text-gray-600" },
    display,
    truncated ? h("span", { className: "text-gray-400" }, "...") : null
  );
}

function ProductCard({ product: p }) {
  const cardBorder = (() => {
    switch (p.stock.type) {
      case "out_of_stock": return "border-red-200 opacity-75";
      case "low_stock": return "border-amber-200";
      case "pre_order": return "border-blue-200";
      case "in_stock": return p.featured ? "border-emerald-300 ring-1 ring-emerald-100" : "border-gray-200";
    }
  })();

  return h("article", { className: `rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md ${cardBorder}` },
    h(BadgeRow, { badges: p.badges }),
    h(CategoryHeader, { product: p }),
    h(PriceDisplay, { product: p }),
    h(StockIndicator, { stock: p.stock }),
    h(RatingDisplay, { rating: p.rating, count: p.reviewCount }),
    h(TagList, { tags: p.tags }),
    h(VariantSelector, { variants: p.variants, stock: p.stock }),
    h(Description, { text: p.description, featured: p.featured })
  );
}

function ComplexPage() {
  const sorted = [...PRODUCTS].sort((a, b) =>
    (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating
  );
  const inStock = PRODUCTS.filter(p => p.stock.type === "in_stock" || p.stock.type === "low_stock").length;

  return h("html", { lang: "en" },
    h("head", null,
      h("title", null, "Product Listing"),
      h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" })
    ),
    h("body", null,
      h("header", { className: "border-b px-6 py-4" },
        h("h1", { className: "text-2xl font-bold" }, "Products"),
        h("p", { className: "text-gray-500" },
          inStock === PRODUCTS.length
            ? h("span", { className: "text-green-600" }, `All ${PRODUCTS.length} products in stock`)
            : inStock === 0
              ? h("span", { className: "text-red-600" }, "All products out of stock")
              : h("span", null, `${inStock} of ${PRODUCTS.length} in stock`)
        )
      ),
      h("main", { className: "grid gap-6 p-6 md:grid-cols-2 lg:grid-cols-3" },
        sorted.map((p, i) => h(ProductCard, { key: i, product: p }))
      )
    )
  );
}

// Warmup
let html = renderToString(h(ComplexPage, null));
console.log(`Output size: ${Buffer.byteLength(html)} bytes`);
console.log();

const iterations = 10_000;
for (let i = 0; i < 100; i++) renderToString(h(ComplexPage, null));

const start = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) renderToString(h(ComplexPage, null));
const elapsed = Number(process.hrtime.bigint() - start);
const avgUs = elapsed / iterations / 1000;

console.log("=== React 19 Complex Latency ===");
console.log(`  Iterations: ${iterations}`);
console.log(`  Total: ${(elapsed / 1_000_000).toFixed(2)} ms`);
console.log(`  Average: ${avgUs.toFixed(2)} µs/render`);

const __dirname = dirname(fileURLToPath(import.meta.url));
const result = {
  framework: "React 19 (Complex)",
  language: "JavaScript",
  latency_us: parseFloat(avgUs.toFixed(2)),
  output_bytes: Buffer.byteLength(html),
  iterations,
  benchmark: "complex",
  timestamp: new Date().toISOString(),
};
writeFileSync(join(__dirname, "..", "..", "results", "react-complex.json"), JSON.stringify(result, null, 2));
console.log("\nResults written to results/react-complex.json");
