//! Synthetic marketplace Search Results Page (SRP) benchmark.
//!
//! The Proa-authored fixture keeps a realistic per-listing workload:
//!   - 60 listings (typical 1-page result count)
//!   - Per-listing: image (with srcset), title (escaped), subtitle, price,
//!     original price (strikethrough), discount %, shipping cost,
//!     "X+ sold" / "X watching", condition badge, seller card
//!     (name, feedback %, total feedback), location, top-rated badge,
//!     free-returns badge, delivery estimate, sponsored tag, bid count
//!   - Faceted sidebar (8 sections × 5-15 options each, with counts)
//!
//! All formatting (currency, dates, percent, comma-separated counts,
//! status badge class merging) happens inside the render path.
//!
//! Mirror Marko template lives in `rendering/external/marko/page_srp.marko`.

use proa_core::{text, WebContext, WebRenderSync, WriteBuf, WriteError};
use proa_macros::html_sync;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Condition {
    BrandNew,
    OpenBox,
    PreOwned,
    Refurbished,
    Parts,
}

impl Condition {
    pub const fn label(self) -> &'static str {
        match self {
            Self::BrandNew => "Brand New",
            Self::OpenBox => "Open Box",
            Self::PreOwned => "Pre-Owned",
            Self::Refurbished => "Refurbished",
            Self::Parts => "For parts or not working",
        }
    }
    pub const fn badge_classes(self) -> &'static str {
        match self {
            Self::BrandNew => {
                "inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300"
            }
            Self::OpenBox => {
                "inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300"
            }
            Self::PreOwned => {
                "inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300"
            }
            Self::Refurbished => {
                "inline-block px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-300"
            }
            Self::Parts => {
                "inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300"
            }
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BuyFormat {
    BuyItNow,
    Auction,
    BestOffer,
}

#[derive(Clone, Copy)]
pub struct Listing {
    pub item_id: u64,
    pub title: &'static str,
    pub subtitle: Option<&'static str>,
    pub image_id: u32,
    pub price_cents: i64,
    pub original_price_cents: Option<i64>,
    pub shipping_cents: i64,
    pub free_shipping: bool,
    pub condition: Condition,
    pub format: BuyFormat,
    pub bid_count: u32,
    pub end_unix: i64,
    pub seller_name: &'static str,
    pub seller_feedback_pct_x10: u16, // 998 = 99.8%
    pub seller_feedback_count: u32,
    pub location: &'static str,
    pub sold_count: u32,
    pub watching_count: u32,
    pub top_rated_seller: bool,
    pub free_returns: bool,
    pub sponsored: bool,
    pub delivery_min_unix: i64,
    pub delivery_max_unix: i64,
}

#[derive(Clone, Copy)]
pub struct FacetOption {
    pub label: &'static str,
    pub count: u32,
    pub selected: bool,
}

#[derive(Clone, Copy)]
pub struct FacetSection {
    pub title: &'static str,
    pub options: &'static [FacetOption],
}

// ---------------------------------------------------------------------------
// Static first-party dataset
// ---------------------------------------------------------------------------

const TITLES: &[&str] = &[
    "Northstar Field Recorder A1 — Slate — <Field-Tested Condition>",
    "Juniper Audio Pocket Recorder \"Nightfall\" — Dual Mic & USB-C",
    "Emberworks Studio Recorder 128GB — Graphite (Factory Sealed)",
    "Atlas Sound Trail Recorder — Dual Input, 32-bit Float [Touring Kit]",
    "Kestrel Monitor Headphones — Black & Mint Carrying Case",
    "Meridian Wrist Recorder — Midnight Aluminum (New <Sealed>)",
    "Harbor Labs Podcast Console — White Faders & 12 Preset Bundle",
    "Pine & Signal Desktop Recorder + Extra Control Dial",
    "Relay Works Mini Field Kit — Recorder, Cage, and Wind Cover",
    "Summit Mobile Studio 14\" — 18GB/512GB Space Black",
    "Northstar Precision Control Surface — Graphite, Performance Edition",
    "Juniper Audio Quietroom Headphones — Black, Spatial Mix (\"NEW\")",
    "Emberworks Action Recorder — Weatherproof + Accessory Bundle",
    "Atlas Sound 24,000mAh Studio Power Bank — 140W USB-C",
    "Kestrel 2TB Portable Session Drive — High-speed <New>",
    "Meridian Self-Leveling Microphone Stand — Wi-Fi Scene Recall",
    "Harbor Labs V15 Boom Microphone — Yellow/Iron, Original Box",
    "Pine & Signal Wireless Ear Monitors — \"Brand New & Sealed\"",
    "Relay Works Script Reader 32GB — Adjustable Warm Light",
    "Summit Z6 Studio Camera Body — Brand New & Factory Sealed",
    "Northstar Session Tablet 13\" — 16GB/256GB with Type Cover",
    "Juniper Audio Mechanical Shortcut Deck — Green Switches",
    "Emberworks Touring Clock 51mm — Black Finish",
    "Atlas Sound Mix Surface 13\" — 256GB, Space Gray, Sealed",
    "Kestrel Modular Cable Case — New & Sealed Studio Set",
    "Meridian Room Speaker — Black, Original Packaging \"Open Box\"",
    "Harbor Labs Pocket Camera Combo — 4K, New & Sealed",
    "Pine & Signal Spatial Monitor 256GB — <Free Express Shipping>",
    "Relay Works Full-Frame Studio Camera — 33MP Body",
    "Summit Production Laptop 16\" — 32GB/1TB Touring Build",
];

const SUBTITLES: &[Option<&str>] = &[
    Some("Brand New"),
    Some("Buy It Now"),
    None,
    Some("Top Rated Plus"),
    Some("Open box - Local pickup"),
    None,
    Some("Brand New & Sealed"),
    Some("Authorized Dealer"),
];

const SELLERS: &[&str] = &[
    "tech_outlet_usa",
    "smart-deals & co",
    "phonefactory_uk",
    "audio.gear.world",
    "best>buy_outlet",
    "the.gadget_shop",
    "pacific_electronics",
    "global-tech\"vendor\"",
    "premium_resale",
    "digital_drop&co",
];

const LOCATIONS: &[&str] = &[
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

const BRAND_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "Northstar",
        count: 12_847,
        selected: true,
    },
    FacetOption {
        label: "Juniper Audio",
        count: 8_921,
        selected: false,
    },
    FacetOption {
        label: "Emberworks",
        count: 5_204,
        selected: false,
    },
    FacetOption {
        label: "Atlas Sound",
        count: 3_117,
        selected: false,
    },
    FacetOption {
        label: "Kestrel",
        count: 2_603,
        selected: false,
    },
    FacetOption {
        label: "Meridian",
        count: 1_847,
        selected: false,
    },
    FacetOption {
        label: "Harbor Labs",
        count: 1_204,
        selected: false,
    },
    FacetOption {
        label: "Pine & Signal",
        count: 987,
        selected: false,
    },
    FacetOption {
        label: "Relay Works",
        count: 743,
        selected: false,
    },
    FacetOption {
        label: "Summit",
        count: 521,
        selected: false,
    },
];

const CONDITION_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "Brand New",
        count: 18_421,
        selected: false,
    },
    FacetOption {
        label: "Open Box",
        count: 2_847,
        selected: false,
    },
    FacetOption {
        label: "Pre-Owned",
        count: 9_103,
        selected: true,
    },
    FacetOption {
        label: "Refurbished",
        count: 1_204,
        selected: false,
    },
    FacetOption {
        label: "For parts or not working",
        count: 487,
        selected: false,
    },
];

const FORMAT_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "All Listings",
        count: 32_062,
        selected: true,
    },
    FacetOption {
        label: "Auction",
        count: 4_127,
        selected: false,
    },
    FacetOption {
        label: "Buy It Now",
        count: 27_935,
        selected: false,
    },
];

const PRICE_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "Under $50",
        count: 5_204,
        selected: false,
    },
    FacetOption {
        label: "$50 to $200",
        count: 8_927,
        selected: false,
    },
    FacetOption {
        label: "$200 to $500",
        count: 9_417,
        selected: false,
    },
    FacetOption {
        label: "$500 to $1,000",
        count: 5_881,
        selected: false,
    },
    FacetOption {
        label: "Over $1,000",
        count: 2_633,
        selected: false,
    },
];

const SHIPPING_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "Free Shipping",
        count: 21_847,
        selected: true,
    },
    FacetOption {
        label: "Free In-Store Pickup",
        count: 1_127,
        selected: false,
    },
    FacetOption {
        label: "Local Pickup",
        count: 3_204,
        selected: false,
    },
];

const LOCATION_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "United States Only",
        count: 22_103,
        selected: false,
    },
    FacetOption {
        label: "North America",
        count: 24_876,
        selected: false,
    },
    FacetOption {
        label: "Europe",
        count: 5_421,
        selected: false,
    },
    FacetOption {
        label: "Asia",
        count: 8_103,
        selected: false,
    },
    FacetOption {
        label: "Worldwide",
        count: 32_062,
        selected: false,
    },
];

const SELLER_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "Top Rated Sellers",
        count: 18_421,
        selected: true,
    },
    FacetOption {
        label: "Returns Accepted",
        count: 27_902,
        selected: false,
    },
    FacetOption {
        label: "Authorized Sellers",
        count: 4_127,
        selected: false,
    },
    FacetOption {
        label: "Completed Listings",
        count: 9_204,
        selected: false,
    },
    FacetOption {
        label: "Sold Listings",
        count: 6_817,
        selected: false,
    },
];

const DELIVERY_FACETS: &[FacetOption] = &[
    FacetOption {
        label: "Same-Day Shipping",
        count: 2_103,
        selected: false,
    },
    FacetOption {
        label: "1-2 Day Shipping",
        count: 8_421,
        selected: false,
    },
    FacetOption {
        label: "3-5 Day Shipping",
        count: 18_847,
        selected: false,
    },
];

pub fn default_facets() -> &'static [FacetSection] {
    static SECTIONS: &[FacetSection] = &[
        FacetSection {
            title: "Brand",
            options: BRAND_FACETS,
        },
        FacetSection {
            title: "Condition",
            options: CONDITION_FACETS,
        },
        FacetSection {
            title: "Buying Format",
            options: FORMAT_FACETS,
        },
        FacetSection {
            title: "Price",
            options: PRICE_FACETS,
        },
        FacetSection {
            title: "Shipping Options",
            options: SHIPPING_FACETS,
        },
        FacetSection {
            title: "Item Location",
            options: LOCATION_FACETS,
        },
        FacetSection {
            title: "Show Only",
            options: SELLER_FACETS,
        },
        FacetSection {
            title: "Delivery Options",
            options: DELIVERY_FACETS,
        },
    ];
    SECTIONS
}

pub fn build_listings(n: usize) -> Vec<Listing> {
    (0..n)
        .map(|i| {
            let base_price = 4_999 + ((i as i64) * 1_237) % 199_999;
            let on_sale = i % 3 == 0;
            let original = if on_sale {
                Some(base_price + base_price / 4)
            } else {
                None
            };
            let free_ship = i % 2 == 0;
            Listing {
                item_id: 256_000_000 + i as u64,
                title: TITLES[i % TITLES.len()],
                subtitle: SUBTITLES[i % SUBTITLES.len()],
                image_id: 1_000 + (i as u32 % 500),
                price_cents: base_price,
                original_price_cents: original,
                shipping_cents: if free_ship {
                    0
                } else {
                    599 + (i as i64 * 13) % 1500
                },
                free_shipping: free_ship,
                condition: match i % 5 {
                    0 => Condition::BrandNew,
                    1 => Condition::OpenBox,
                    2 => Condition::PreOwned,
                    3 => Condition::Refurbished,
                    _ => Condition::Parts,
                },
                format: match i % 4 {
                    0 => BuyFormat::Auction,
                    1 => BuyFormat::BestOffer,
                    _ => BuyFormat::BuyItNow,
                },
                bid_count: if i % 4 == 0 { (i as u32 % 47) + 1 } else { 0 },
                end_unix: 1_730_000_000 + (i as i64) * 3_600,
                seller_name: SELLERS[i % SELLERS.len()],
                seller_feedback_pct_x10: 950 + ((i as u16) * 7) % 50,
                seller_feedback_count: 1_000 + (i as u32 * 137) % 99_000,
                location: LOCATIONS[i % LOCATIONS.len()],
                sold_count: 50 + (i as u32 * 31) % 4_950,
                watching_count: 5 + (i as u32 * 11) % 240,
                top_rated_seller: i % 3 != 0,
                free_returns: i % 2 == 1,
                sponsored: i % 7 == 0,
                delivery_min_unix: 1_730_500_000 + (i as i64) * 3_600,
                delivery_max_unix: 1_730_900_000 + (i as i64) * 3_600,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Zero-allocation formatters
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Currency(i64);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Currency {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let cents = self.0;
        if cents < 0 {
            cx.out.extend(b"-")?;
        }
        let abs = cents.unsigned_abs();
        cx.out.extend(b"$")?;
        write_with_commas(cx, abs / 100)?;
        cx.out.extend(b".")?;
        write_two_digits(cx, (abs % 100) as u32)
    }
}

#[derive(Clone, Copy)]
struct CountWithCommas(u64);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for CountWithCommas {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        write_with_commas(cx, self.0)
    }
}

#[derive(Clone, Copy)]
struct Uint(u64);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Uint {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let mut buf = [0u8; 20];
        let s = format_u64(&mut buf, self.0);
        cx.out.extend(s.as_bytes())
    }
}

/// Feedback percent: 998 → "99.8%"
#[derive(Clone, Copy)]
struct FeedbackPct(u16);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for FeedbackPct {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let v = self.0;
        let whole = v / 10;
        let tenth = v % 10;
        let mut buf = [0u8; 20];
        let s = format_u64(&mut buf, whole as u64);
        cx.out.extend(s.as_bytes())?;
        cx.out.extend(b".")?;
        cx.out.extend(&[b'0' + tenth as u8])?;
        cx.out.extend(b"%")
    }
}

/// Discount percent: original_cents, sale_cents → "20% off"
#[derive(Clone, Copy)]
struct DiscountPct {
    original_cents: i64,
    sale_cents: i64,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for DiscountPct {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        if self.original_cents <= 0 {
            return Ok(());
        }
        let pct = (((self.original_cents - self.sale_cents) * 100) / self.original_cents) as u64;
        let mut buf = [0u8; 20];
        let s = format_u64(&mut buf, pct);
        cx.out.extend(s.as_bytes())?;
        cx.out.extend(b"% off")
    }
}

/// Compact delivery window rendered from fixture timestamps.
#[derive(Clone, Copy)]
struct DateRange {
    min_unix: i64,
    max_unix: i64,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for DateRange {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        write_short_date(cx, self.min_unix)?;
        cx.out.extend(b" - ")?;
        write_short_date(cx, self.max_unix)
    }
}

/// Time-left: "2d 14h" or "3h 12m" or "Ended"
#[derive(Clone, Copy)]
struct TimeLeft {
    end_unix: i64,
    now_unix: i64,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for TimeLeft {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let remaining = self.end_unix - self.now_unix;
        if remaining <= 0 {
            return cx.out.extend(b"Ended");
        }
        let days = remaining / 86_400;
        let hours = (remaining % 86_400) / 3_600;
        let mins = (remaining % 3_600) / 60;
        let mut buf = [0u8; 20];
        if days > 0 {
            let s = format_u64(&mut buf, days as u64);
            cx.out.extend(s.as_bytes())?;
            cx.out.extend(b"d ")?;
            let s = format_u64(&mut buf, hours as u64);
            cx.out.extend(s.as_bytes())?;
            cx.out.extend(b"h")
        } else if hours > 0 {
            let s = format_u64(&mut buf, hours as u64);
            cx.out.extend(s.as_bytes())?;
            cx.out.extend(b"h ")?;
            let s = format_u64(&mut buf, mins as u64);
            cx.out.extend(s.as_bytes())?;
            cx.out.extend(b"m")
        } else {
            let s = format_u64(&mut buf, mins as u64);
            cx.out.extend(s.as_bytes())?;
            cx.out.extend(b"m")
        }
    }
}

#[inline]
fn format_u64(buf: &mut [u8; 20], mut v: u64) -> &str {
    if v == 0 {
        buf[0] = b'0';
        return std::str::from_utf8(&buf[..1]).unwrap();
    }
    let mut i = buf.len();
    while v > 0 {
        i -= 1;
        buf[i] = b'0' + (v % 10) as u8;
        v /= 10;
    }
    std::str::from_utf8(&buf[i..]).unwrap()
}

#[inline]
fn write_two_digits<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    v: u32,
) -> Result<(), WriteError> {
    let bytes = [b'0' + ((v / 10) % 10) as u8, b'0' + (v % 10) as u8];
    cx.out.extend(&bytes)
}

#[inline]
fn write_with_commas<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    v: u64,
) -> Result<(), WriteError> {
    if v == 0 {
        return cx.out.extend(b"0");
    }
    let mut digits = [0u8; 20];
    let s = format_u64(&mut digits, v);
    let bytes = s.as_bytes();
    let len = bytes.len();
    let first = ((len - 1) % 3) + 1;
    cx.out.extend(&bytes[..first])?;
    let mut i = first;
    while i < len {
        cx.out.extend(b",")?;
        cx.out.extend(&bytes[i..i + 3])?;
        i += 3;
    }
    Ok(())
}

const MONTH_ABBR: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW_ABBR: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

fn write_short_date<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    unix: i64,
) -> Result<(), WriteError> {
    let days = unix.div_euclid(86_400);
    let (_, m, d) = civil_from_days(days);
    // Offset Unix-epoch days to Sunday-based weekday indexing.
    let dow = ((days % 7 + 7 + 4) % 7) as usize;
    cx.out.extend(DOW_ABBR[dow].as_bytes())?;
    cx.out.extend(b", ")?;
    cx.out.extend(MONTH_ABBR[(m - 1) as usize].as_bytes())?;
    cx.out.extend(b" ")?;
    let mut buf = [0u8; 20];
    let s = format_u64(&mut buf, d as u64);
    cx.out.extend(s.as_bytes())
}

#[inline]
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------

pub struct SrpPage<'a> {
    pub query: &'static str,
    pub total_results: u64,
    pub listings: &'a [Listing],
    pub facets: &'static [FacetSection],
    pub now_unix: i64,
}

impl<'a, B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SrpPage<'a> {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        html_sync! {
            <html lang="en">
                <head>
                    <title>"Search results | Northstar Market"</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                </head>
                <body class="bg-white text-gray-900">
                    <header class="border-b">
                        <div class="px-6 py-3 flex items-center gap-4">
                            <a href="/" class="text-2xl font-bold text-blue-700">"shop"</a>
                            <form class="flex-1 flex">
                                <input
                                    type="search"
                                    class="flex-1 px-3 py-2 border rounded-l"
                                    value={self.query}
                                />
                                <button
                                    type="submit"
                                    class="px-4 py-2 bg-blue-600 text-white rounded-r"
                                >
                                    "Search"
                                </button>
                            </form>
                        </div>
                        <nav class="px-6 py-2 text-sm text-gray-600 flex gap-2">
                            <a href="/">"Home"</a>
                            <span>"›"</span>
                            <a href="/electronics">"Electronics"</a>
                            <span>"›"</span>
                            <span>{text(self.query)}</span>
                        </nav>
                    </header>
                    <div class="px-6 py-3 flex items-center justify-between border-b">
                        <p class="text-lg">
                            <strong>{CountWithCommas(self.total_results)}</strong>
                            " results for "
                            <strong>"\""{text(self.query)}"\""</strong>
                        </p>
                        <div class="flex items-center gap-3 text-sm">
                            <label>
                                "Sort: "
                                <select class="border rounded px-2 py-1">
                                    <option>"Best Match"</option>
                                    <option>"Price + Shipping: lowest first"</option>
                                    <option>"Price + Shipping: highest first"</option>
                                    <option>"Time: newly listed"</option>
                                    <option>"Time: ending soonest"</option>
                                </select>
                            </label>
                        </div>
                    </div>
                    <main class="flex gap-6 px-6 py-4">
                        <aside class="w-64 shrink-0">
                            {FacetSidebar { sections: self.facets }}
                        </aside>
                        <section class="flex-1">
                            {ListingGrid { listings: self.listings, now_unix: self.now_unix }}
                            <nav class="mt-6 flex justify-center gap-2 text-sm">
                                <button class="px-3 py-1 border rounded">"‹ Previous"</button>
                                <button class="px-3 py-1 border rounded bg-blue-600 text-white">
                                    "1"
                                </button>
                                <button class="px-3 py-1 border rounded">"2"</button>
                                <button class="px-3 py-1 border rounded">"3"</button>
                                <button class="px-3 py-1 border rounded">"4"</button>
                                <button class="px-3 py-1 border rounded">"5"</button>
                                <button class="px-3 py-1 border rounded">"Next ›"</button>
                            </nav>
                        </section>
                    </main>
                    <footer class="border-t mt-8 px-6 py-4 text-xs text-gray-500">
                        <p>"© Demo Marketplace · This is a benchmark page only."</p>
                    </footer>
                </body>
            </html>
        }
        .render(cx)
    }
}

struct FacetSidebar {
    sections: &'static [FacetSection],
}

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for FacetSidebar {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        for section in self.sections {
            FacetSectionView { section: *section }.render(cx)?;
        }
        Ok(())
    }
}

struct FacetSectionView {
    section: FacetSection,
}

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for FacetSectionView {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let title = self.section.title;
        let opts = self.section.options;
        html_sync! {
            <div class="mb-5">
                <h3 class="font-semibold text-sm mb-2 uppercase tracking-wide text-gray-700">
                    {text(title)}
                </h3>
                <ul class="space-y-1">{FacetOptions { options: opts }}</ul>
            </div>
        }
        .render(cx)
    }
}

struct FacetOptions {
    options: &'static [FacetOption],
}

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for FacetOptions {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        for opt in self.options {
            let row_class = if opt.selected {
                "flex justify-between items-center text-sm py-0.5 font-semibold text-blue-700"
            } else {
                "flex justify-between items-center text-sm py-0.5 text-gray-700 hover:text-blue-700"
            };
            let label = opt.label;
            let count = opt.count;
            let checked = opt.selected;
            html_sync! {
                <li class={row_class}>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={checked} />
                        <span>{text(label)}</span>
                    </label>
                    <span class="text-gray-500">"("{CountWithCommas(count as u64)}")"</span>
                </li>
            }
            .render(cx)?;
        }
        Ok(())
    }
}

struct ListingGrid<'a> {
    listings: &'a [Listing],
    now_unix: i64,
}

impl<'a, B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for ListingGrid<'a> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        // proa-perf-ok: benchmark intentionally measures direct WriteBuf grid framing
        cx.out
            .extend(b"<ul class=\"grid grid-cols-1 md:grid-cols-3 gap-4\">")?;
        for listing in self.listings {
            ListingCard {
                listing: *listing,
                now_unix: self.now_unix,
            }
            .render(cx)?;
        }
        // proa-perf-ok: benchmark intentionally measures direct WriteBuf grid framing
        cx.out.extend(b"</ul>")
    }
}

struct ListingCard {
    listing: Listing,
    now_unix: i64,
}

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for ListingCard {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let l = self.listing;
        let item_id = l.item_id;
        let image_id = l.image_id;
        let title = l.title;
        let cond_classes = l.condition.badge_classes();
        let cond_label = l.condition.label();
        let seller = l.seller_name;
        let location = l.location;
        let now = self.now_unix;
        html_sync! {
            <li class="border rounded-lg p-3 hover:shadow-md flex flex-col" data-item-id={item_id}>
                <a
                    href={item_id}
                    class="block aspect-square bg-gray-100 mb-3 overflow-hidden rounded"
                >
                    <img
                        src={image_id}
                        srcset={image_id}
                        alt={title}
                        loading="lazy"
                        class="w-full h-full object-cover"
                    />
                </a>
                {if l.sponsored {
                        Some(html_sync! { <span class="text-xs uppercase text-gray-400 tracking-wider mb-1">"Sponsored"</span> })
                    } else { None }}
                <h3 class="text-sm font-medium leading-snug mb-1 line-clamp-2">
                    <a href={item_id} class="hover:underline">{text(title)}</a>
                </h3>
                {if let Some(sub) = l.subtitle {
                        Some(html_sync! { <p class="text-xs text-gray-500 mb-1">{ text(sub) }</p> })
                    } else { None }}
                <div class="mb-2">
                    <span class={cond_classes}>{text(cond_label)}</span>
                </div>
                <div class="flex items-baseline gap-2 mb-1">
                    <span class="text-lg font-bold text-gray-900">{Currency(l.price_cents)}</span>
                    {if let Some(orig) = l.original_price_cents {
                            Some(html_sync! {
                                <>
                                    <span class="text-sm line-through text-gray-400">{ Currency(orig) }</span>
                                    <span class="text-xs font-semibold text-red-600">
                                        { DiscountPct { original_cents: orig, sale_cents: l.price_cents } }
                                    </span>
                                </>
                            })
                        } else { None }}
                </div>
                <p class="text-xs text-gray-600 mb-1">
                    {if l.free_shipping {
                            html_sync! { <span class="text-green-700 font-medium">"Free shipping"</span> }
                        } else {
                            html_sync! { <><span>"+ "</span>{ Currency(l.shipping_cents) }<span>" shipping"</span></> }
                        }}
                </p>
                <p class="text-xs text-gray-600 mb-1">
                    "Get it by "
                    {DateRange { min_unix: l.delivery_min_unix, max_unix: l.delivery_max_unix }}
                </p>
                {if l.bid_count > 0 {
                        Some(html_sync! {
                            <p class="text-xs text-orange-600 mb-1">
                                { Uint(l.bid_count as u64) }" bids · "
                                { TimeLeft { end_unix: l.end_unix, now_unix: now } }" left"
                            </p>
                        })
                    } else { None }}
                <p class="text-xs text-gray-600 mb-1">
                    {CountWithCommas(l.sold_count as u64)}
                    "+ sold · "
                    {CountWithCommas(l.watching_count as u64)}
                    " watching"
                </p>
                <div class="mt-auto pt-2 border-t text-xs text-gray-600">
                    <p>
                        <strong>{text(seller)}</strong>
                        " · "
                        <span>{FeedbackPct(l.seller_feedback_pct_x10)}</span>
                        " ("
                        {CountWithCommas(l.seller_feedback_count as u64)}
                        ")"
                    </p>
                    <p class="text-gray-500">{text(location)}</p>
                    <div class="flex gap-2 mt-1">
                        {if l.top_rated_seller {
                                Some(html_sync! { <span class="text-purple-700 font-semibold">"Top Rated Plus"</span> })
                            } else { None }}
                        {if l.free_returns {
                                Some(html_sync! { <span class="text-green-700">"Free returns"</span> })
                            } else { None }}
                    </div>
                </div>
            </li>
        }
        .render(cx)
    }
}

// ---------------------------------------------------------------------------
// Public render entry points
// ---------------------------------------------------------------------------

pub fn render_into(
    query: &'static str,
    total: u64,
    listings: &[Listing],
    now_unix: i64,
    buffer: &mut Vec<u8>,
) {
    crate::render_into_vec(
        buffer,
        SrpPage {
            query,
            total_results: total,
            listings,
            facets: default_facets(),
            now_unix,
        },
    );
}

// proa-perf-ok: benchmark convenience API intentionally returns an owned String
pub fn render_to_string(
    query: &'static str,
    total: u64,
    listings: &[Listing],
    now_unix: i64,
) -> String {
    // proa-perf-ok: benchmark convenience API intentionally returns an owned String
    proa_core::render_to_string(SrpPage {
        query,
        total_results: total,
        listings,
        facets: default_facets(),
        now_unix,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_listings() {
        let listings = build_listings(3);
        let html = render_to_string("field recorder", 32_062, &listings, 1_730_100_000);
        assert!(html.contains("field recorder"));
        // currency
        assert!(html.contains("$"));
        // facet count formatting
        assert!(html.contains("12,847"));
        // escaped title chars
        assert!(html.contains("&lt;Excellent Condition&gt;") || html.contains("&amp;"));
    }
}
