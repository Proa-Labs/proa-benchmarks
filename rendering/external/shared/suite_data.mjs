export const TABLE_ROW_COUNT = 1_000;
export const PRODUCT_COUNT = (() => {
  const raw = process.env.PROA_BENCH_PRODUCT_COUNT;
  if (raw === undefined) return 96;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("PROA_BENCH_PRODUCT_COUNT must be a positive integer");
  }
  return count;
})();

export const SECTION_TITLES = [
  "Performance Metrics",
  "Rendering Speed",
  "Memory Efficiency",
  "Framework Comparison",
];

export const CARD_TITLES = [
  "Latency Analysis",
  "Throughput Metrics",
  "Memory Usage",
  "CPU Utilization",
];

export const FEATURES = [
  "Sub-millisecond response times",
  "Zero-copy rendering pipeline",
  "SIMD-accelerated escaping",
  "Pre-allocated buffers",
  "Minimal heap allocations",
];

export function buildCardSections() {
  return Array.from({ length: 4 }, (_, sectionIndex) => ({
    dataSection: sectionIndex % 2 === 0 ? "even" : "odd",
    title: SECTION_TITLES[sectionIndex],
    cards: Array.from({ length: 8 }, (_, cardIndex) => ({
      dataCardId: cardIndex % 2 === 0 ? "even" : "odd",
      title: CARD_TITLES[cardIndex % CARD_TITLES.length],
      features: FEATURES,
    })),
  }));
}

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

const STATUS_BADGE =
  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border";
export const STATUS_CLASSES = {
  Active: `${STATUS_BADGE} bg-green-100 text-green-800 border-green-300`,
  Pending: `${STATUS_BADGE} bg-yellow-100 text-yellow-800 border-yellow-300`,
  Disabled: `${STATUS_BADGE} bg-gray-100 text-gray-700 border-gray-300`,
  Cancelled: `${STATUS_BADGE} bg-red-100 text-red-800 border-red-300`,
  Refunded: `${STATUS_BADGE} bg-purple-100 text-purple-800 border-purple-300`,
};

export function buildTableRows(count = TABLE_ROW_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const amountCents = 12_345 + ((index * 137) % 99_999);
    return {
      id: 100_000 + index,
      name: NAMES[index % NAMES.length],
      email: EMAILS[index % EMAILS.length],
      status: STATUSES[index % STATUSES.length],
      amountCents,
      taxCents: Math.trunc((amountCents * 8) / 100),
      createdUnix: 1_700_000_000 + index * 86_400,
      updatedUnix: 1_710_000_000 + index * 3_600,
      scoreBps: 5_000 + ((index * 31) % 5_000),
      country: COUNTRIES[index % COUNTRIES.length],
      tags: TAG_SETS[index % TAG_SETS.length],
    };
  });
}

export function formatCount(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatCurrency(cents) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}$${formatCount(Math.floor(absolute / 100))}.${String(absolute % 100).padStart(2, "0")}`;
}

export function formatPercent(basisPoints) {
  return `${Math.floor(basisPoints / 100)}.${Math.floor((basisPoints % 100) / 10)}%`;
}

export function formatDate(unix) {
  const date = new Date(unix * 1_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatDateTime(unix) {
  const date = new Date(unix * 1_000);
  return `${formatDate(unix)} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

const PRODUCT_CATEGORIES = ["Audio", "Displays", "Wearables"];

export function buildProducts(count = PRODUCT_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    id: 1_000 + index,
    name: `Meridian "Model ${index}" & Co.`,
    category: PRODUCT_CATEGORIES[index % PRODUCT_CATEGORIES.length],
    priceCents: 1_999 + (index % 40) * 500,
    ratingTenths: 30 + (index % 20),
    reviewCount: 3 + ((index * 7) % 400),
  }));
}

export function formatPrice(cents) {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function formatRating(tenths) {
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.784-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";
