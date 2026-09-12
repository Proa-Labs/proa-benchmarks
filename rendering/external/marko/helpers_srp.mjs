// Proa-authored synthetic marketplace data for page_srp.marko (Marko 6).

export const TITLES = [
  "Northstar Field Recorder A1 — Slate — <Field-Tested Condition>",
  'Juniper Audio Pocket Recorder "Nightfall" — Dual Mic & USB-C',
  "Emberworks Studio Recorder 128GB — Graphite (Factory Sealed)",
  "Atlas Sound Trail Recorder — Dual Input, 32-bit Float [Touring Kit]",
  "Kestrel Monitor Headphones — Black & Mint Carrying Case",
  "Meridian Wrist Recorder — Midnight Aluminum (New <Sealed>)",
  "Harbor Labs Podcast Console — White Faders & 12 Preset Bundle",
  "Pine & Signal Desktop Recorder + Extra Control Dial",
  "Relay Works Mini Field Kit — Recorder, Cage, and Wind Cover",
  'Summit Mobile Studio 14" — 18GB/512GB Space Black',
  "Northstar Precision Control Surface — Graphite, Performance Edition",
  'Juniper Audio Quietroom Headphones — Black, Spatial Mix ("NEW")',
  "Emberworks Action Recorder — Weatherproof + Accessory Bundle",
  "Atlas Sound 24,000mAh Studio Power Bank — 140W USB-C",
  "Kestrel 2TB Portable Session Drive — High-speed <New>",
  "Meridian Self-Leveling Microphone Stand — Wi-Fi Scene Recall",
  "Harbor Labs V15 Boom Microphone — Yellow/Iron, Original Box",
  'Pine & Signal Wireless Ear Monitors — "Brand New & Sealed"',
  "Relay Works Script Reader 32GB — Adjustable Warm Light",
  "Summit Z6 Studio Camera Body — Brand New & Factory Sealed",
  'Northstar Session Tablet 13" — 16GB/256GB with Type Cover',
  "Juniper Audio Mechanical Shortcut Deck — Green Switches",
  "Emberworks Touring Clock 51mm — Black Finish",
  'Atlas Sound Mix Surface 13" — 256GB, Space Gray, Sealed',
  "Kestrel Modular Cable Case — New & Sealed Studio Set",
  'Meridian Room Speaker — Black, Original Packaging "Open Box"',
  "Harbor Labs Pocket Camera Combo — 4K, New & Sealed",
  "Pine & Signal Spatial Monitor 256GB — <Free Express Shipping>",
  "Relay Works Full-Frame Studio Camera — 33MP Body",
  'Summit Production Laptop 16" — 32GB/1TB Touring Build',
];

export const SUBTITLES = [
  "Brand New",
  "Buy It Now",
  null,
  "Top Rated Plus",
  "Open box - Local pickup",
  null,
  "Brand New & Sealed",
  "Authorized Dealer",
];

export const SELLERS = [
  "tech_outlet_usa",
  "smart-deals & co",
  "phonefactory_uk",
  "audio.gear.world",
  "best>buy_outlet",
  "the.gadget_shop",
  "pacific_electronics",
  'global-tech"vendor"',
  "premium_resale",
  "digital_drop&co",
];

export const LOCATIONS = [
  "from United States",
  "from Hong Kong",
  "from China",
  "from United Kingdom",
  "from Germany",
  "from Japan",
  "from Australia",
  "from Canada",
  "from South Korea",
  "from Singapore",
];

const COND_BADGE =
  "inline-block px-2 py-0.5 rounded text-xs font-medium border";
export const CONDITION_CLASSES = {
  BrandNew: COND_BADGE + " bg-green-100 text-green-800 border-green-300",
  OpenBox: COND_BADGE + " bg-blue-100 text-blue-800 border-blue-300",
  PreOwned: COND_BADGE + " bg-gray-100 text-gray-700 border-gray-300",
  Refurbished: COND_BADGE + " bg-purple-100 text-purple-800 border-purple-300",
  Parts: COND_BADGE + " bg-yellow-100 text-yellow-800 border-yellow-300",
};
export const CONDITION_LABELS = {
  BrandNew: "Brand New",
  OpenBox: "Open Box",
  PreOwned: "Pre-Owned",
  Refurbished: "Refurbished",
  Parts: "For parts or not working",
};

const CONDITIONS = ["BrandNew", "OpenBox", "PreOwned", "Refurbished", "Parts"];
const FORMATS = ["Auction", "BestOffer", "BuyItNow", "BuyItNow"];

export function buildListings(n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    const basePrice = 4999 + ((i * 1237) % 199999);
    const onSale = i % 3 === 0;
    const free = i % 2 === 0;
    arr[i] = {
      itemId: 256000000 + i,
      title: TITLES[i % TITLES.length],
      subtitle: SUBTITLES[i % SUBTITLES.length],
      imageId: 1000 + (i % 500),
      priceCents: basePrice,
      originalPriceCents: onSale ? basePrice + Math.trunc(basePrice / 4) : null,
      shippingCents: free ? 0 : 599 + ((i * 13) % 1500),
      freeShipping: free,
      condition: CONDITIONS[i % 5],
      format: FORMATS[i % 4],
      bidCount: i % 4 === 0 ? (i % 47) + 1 : 0,
      endUnix: 1730000000 + i * 3600,
      sellerName: SELLERS[i % SELLERS.length],
      sellerFeedbackPctX10: 950 + ((i * 7) % 50),
      sellerFeedbackCount: 1000 + ((i * 137) % 99000),
      location: LOCATIONS[i % LOCATIONS.length],
      soldCount: 50 + ((i * 31) % 4950),
      watchingCount: 5 + ((i * 11) % 240),
      topRatedSeller: i % 3 !== 0,
      freeReturns: i % 2 === 1,
      sponsored: i % 7 === 0,
      deliveryMinUnix: 1730500000 + i * 3600,
      deliveryMaxUnix: 1730900000 + i * 3600,
    };
  }
  return arr;
}

export function fmtCurrency(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const pennies = abs % 100;
  const dStr = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const pStr = pennies < 10 ? "0" + pennies : "" + pennies;
  return (neg ? "-$" : "$") + dStr + "." + pStr;
}

export function fmtCount(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtFeedbackPct(x10) {
  const whole = Math.floor(x10 / 10);
  const tenth = x10 % 10;
  return whole + "." + tenth + "%";
}

export function fmtDiscount(originalCents, saleCents) {
  if (originalCents <= 0) return "";
  return Math.floor(((originalCents - saleCents) * 100) / originalCents) + "% off";
}

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function fmtShortDate(unix) {
  const d = new Date(unix * 1000);
  return DOW_ABBR[d.getUTCDay()] + ", " + MONTH_ABBR[d.getUTCMonth()] + " " + d.getUTCDate();
}

export function fmtDateRange(min, max) {
  return fmtShortDate(min) + " - " + fmtShortDate(max);
}

export function fmtTimeLeft(endUnix, nowUnix) {
  const r = endUnix - nowUnix;
  if (r <= 0) return "Ended";
  const days = Math.floor(r / 86400);
  const hours = Math.floor((r % 86400) / 3600);
  const mins = Math.floor((r % 3600) / 60);
  if (days > 0) return days + "d " + hours + "h";
  if (hours > 0) return hours + "h " + mins + "m";
  return mins + "m";
}

export const FACETS = [
  {
    title: "Brand",
    options: [
      { label: "Northstar", count: 12847, selected: true },
      { label: "Juniper Audio", count: 8921, selected: false },
      { label: "Emberworks", count: 5204, selected: false },
      { label: "Atlas Sound", count: 3117, selected: false },
      { label: "Kestrel", count: 2603, selected: false },
      { label: "Meridian", count: 1847, selected: false },
      { label: "Harbor Labs", count: 1204, selected: false },
      { label: "Pine & Signal", count: 987, selected: false },
      { label: "Relay Works", count: 743, selected: false },
      { label: "Summit", count: 521, selected: false },
    ],
  },
  {
    title: "Condition",
    options: [
      { label: "Brand New", count: 18421, selected: false },
      { label: "Open Box", count: 2847, selected: false },
      { label: "Pre-Owned", count: 9103, selected: true },
      { label: "Refurbished", count: 1204, selected: false },
      { label: "For parts or not working", count: 487, selected: false },
    ],
  },
  {
    title: "Buying Format",
    options: [
      { label: "All Listings", count: 32062, selected: true },
      { label: "Auction", count: 4127, selected: false },
      { label: "Buy It Now", count: 27935, selected: false },
    ],
  },
  {
    title: "Price",
    options: [
      { label: "Under $50", count: 5204, selected: false },
      { label: "$50 to $200", count: 8927, selected: false },
      { label: "$200 to $500", count: 9417, selected: false },
      { label: "$500 to $1,000", count: 5881, selected: false },
      { label: "Over $1,000", count: 2633, selected: false },
    ],
  },
  {
    title: "Shipping Options",
    options: [
      { label: "Free Shipping", count: 21847, selected: true },
      { label: "Free In-Store Pickup", count: 1127, selected: false },
      { label: "Local Pickup", count: 3204, selected: false },
    ],
  },
  {
    title: "Item Location",
    options: [
      { label: "United States Only", count: 22103, selected: false },
      { label: "North America", count: 24876, selected: false },
      { label: "Europe", count: 5421, selected: false },
      { label: "Asia", count: 8103, selected: false },
      { label: "Worldwide", count: 32062, selected: false },
    ],
  },
  {
    title: "Show Only",
    options: [
      { label: "Top Rated Sellers", count: 18421, selected: true },
      { label: "Returns Accepted", count: 27902, selected: false },
      { label: "Authorized Sellers", count: 4127, selected: false },
      { label: "Completed Listings", count: 9204, selected: false },
      { label: "Sold Listings", count: 6817, selected: false },
    ],
  },
  {
    title: "Delivery Options",
    options: [
      { label: "Same-Day Shipping", count: 2103, selected: false },
      { label: "1-2 Day Shipping", count: 8421, selected: false },
      { label: "3-5 Day Shipping", count: 18847, selected: false },
    ],
  },
];
