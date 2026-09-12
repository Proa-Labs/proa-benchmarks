// Proa-authored synthetic dataset + helpers for page_srp_real.marko.

export const TITLES = [
  "Northstar R8 Portable Field Recorder - Graphite - Open Box & Tested",
  "Ember Track Mini Stereo Recorder - Slate - <Excellent Condition>",
  "Juniper Sound S6 Recorder - Six Inputs - USB-C - Refurbished",
  "Atlas Pocket Studio 4 - Sandstone - Timecode Ready - Battery 92%",
  "Beacon Wave 32-bit Float Recorder - Midnight - Pristine",
  "Cedar Field Kit Pro - Recorder, Windshield & Carry Case - Used",
  "Nimbus Capture 8 - Dual Media - Factory Unlocked Workflow",
  "Harbor Audio Deck 2 - Silver - Pre-Owned - Fully Tested",
  "Lumen Track 4 Recorder - Violet - <Brand New & Sealed>",
  "Summit Sound R6 - Brass - 89% Battery Health",
  'Orchard Mobile Studio - Charcoal - "Like New" Condition',
  "Tidepool Recorder 5 - Silver - Excellent Field Kit",
  "Morrow Pocket Capture - Indigo - 7/10 Cosmetic Condition",
  "Redwood Session Recorder - Gold - Mint Condition - Pre-Owned",
  "Drift Audio R4 - Black & Scratched Back - For Parts",
  "Cloudline Field Recorder - Frost - Input Module Included",
];

const SUBTITLE_VARIANTS = [
  ["Pre-Owned", "Portable Recorder", "128 GB", "Four Inputs"],
  ["Brand New", "Field Recorder", "256 GB", "32-bit Float"],
  ["Pre-Owned", "Portable Mixer", "512 GB", "Timecode"],
  ["Open Box", "Mobile Studio", "1 TB", "USB-C"],
  ["For parts or not working", "Compact Recorder", "Stereo"],
  ["Refurbished", "Field Recorder", "256 GB", "Six Inputs"],
  ["Pre-Owned", "Pocket Recorder", "128 GB", "Bluetooth"],
  ["Brand New", "Session Recorder", "512 GB", "Eight Inputs"],
];

const SELLERS = [
  "field_notes_co",
  "northstar_audio",
  "signal_cabin",
  "smart-sound & co",
  "best>field_outlet",
  "the.recorder.shop",
  'global-audio"vendor"',
  "premium_session_gear",
  "digital_tape&co",
  "harbor_electronics",
];

const LOCATIONS = [
  "United States",
  "Hong Kong",
  "China",
  "United Kingdom",
  "Germany",
  "Japan",
  "Australia",
  "Canada",
];

const IMAGE_HASHES = [
  "northstar-r8",
  "ember-track-mini",
  "juniper-s6",
  "atlas-pocket-studio",
  "beacon-wave",
  "cedar-field-kit",
  "nimbus-capture",
  "harbor-audio-deck",
];

const FORMATS = ["Buy It Now", "Buy It Now", "Buy It Now", "or Best Offer", "Best Offer"];

export const CAPTION_LABELS = {
  NewLowPrice: "NEW LOW PRICE",
  Trending: "TRENDING",
  EndsSoon: "ENDS SOON",
  EditorsPick: "EDITOR'S PICK",
};
export const CAPTION_CLASSES = {
  NewLowPrice: "signal signal--trustworthy",
  Trending: "signal signal--informational",
  EndsSoon: "signal signal--negative",
  EditorsPick: "signal signal--brand",
};

export function buildListings(n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    const base = 14999 + ((i * 4337) % 195000);
    const onSale = i % 3 === 0;
    const free = i % 2 === 0;
    let caption = null;
    switch (i % 9) {
      case 0: caption = "NewLowPrice"; break;
      case 3: caption = "Trending"; break;
      case 5: caption = "EndsSoon"; break;
      case 7: caption = "EditorsPick"; break;
    }
    arr[i] = {
      itemId: 336000000000 + i * 71,
      imageHash: IMAGE_HASHES[i % IMAGE_HASHES.length],
      title: TITLES[i % TITLES.length],
      subtitleParts: SUBTITLE_VARIANTS[i % SUBTITLE_VARIANTS.length],
      caption,
      starsFull: 3 + (i % 3),
      hasHalfStar: i % 2 === 0,
      reviewCount: 5 + ((i * 17) % 1240),
      priceCents: base,
      originalPriceCents: onSale ? base + Math.floor(base / 5) : null,
      format: FORMATS[i % 4 === 0 ? 3 : (i % 4 === 1 ? 4 : 0)],
      deliveryCents: free ? 0 : 599 + ((i * 13) % 1400),
      location: LOCATIONS[i % LOCATIONS.length],
      watcherCount: 5 + ((i * 7) % 200),
      couponPct: i % 4 === 1 ? 5 + (i % 20) : null,
      sellerName: SELLERS[i % SELLERS.length],
      sellerFeedbackPctX10: 950 + ((i * 7) % 50),
      sellerFeedbackCount: 1000 + ((i * 137) % 99000),
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

export function fmtAbbrev(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const whole = Math.floor(n / 1000);
    const tenth = Math.floor((n % 1000) / 100);
    return tenth > 0 ? whole + "." + tenth + "K" : whole + "K";
  }
  const whole = Math.floor(n / 1_000_000);
  const tenth = Math.floor((n % 1_000_000) / 100_000);
  return tenth > 0 ? whole + "." + tenth + "M" : whole + "M";
}

export function itemUrl(id) {
  return "#listing-" + id;
}

export function emptyStarCount(starsFull, hasHalfStar) {
  return Math.max(0, 5 - starsFull - (hasHalfStar ? 1 : 0));
}

export function repeatArray(n) {
  // Marko 6 doesn't have a repeat-N tag; emit an array we can iterate.
  return new Array(Math.max(0, n));
}
