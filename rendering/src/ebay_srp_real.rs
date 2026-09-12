//! Proa-authored synthetic marketplace search-result card workload.
//!
//! The fixture retains deep BEM-style nesting, variable URLs, escaped copy,
//! icon rows, prices, seller metadata, and optional branches so its SSR cost
//! remains representative without redistributing a production page.
//!
//! Per-listing workload:
//!   - href + item-id link assembly
//!   - title (HTML-escaped, often with `&`, `<`, `"`)
//!   - 4-part subtitle joined with "·"
//!   - optional caption signal ("NEW LOW PRICE", "TRENDING", "ENDS SOON")
//!   - star rating (N filled stars + optional half star + review count)
//!   - price (cents → "$1,234.56")
//!   - optional strikethrough original price
//!   - format ("Buy It Now" / "Auction" / "Best Offer")
//!   - delivery cost ("Free delivery" or "+$X.XX delivery")
//!   - location string
//!   - watcher count
//!   - optional coupon percentage
//!   - seller name + feedback percentage + abbreviated feedback count ("37.9K")

use proa_core::{text, WebContext, WebRenderSync, WriteBuf, WriteError};
use proa_macros::html_sync;

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CaptionSignal {
    None,
    NewLowPrice,
    Trending,
    EndsSoon,
    EditorsPick,
}

impl CaptionSignal {
    const fn label(self) -> &'static str {
        match self {
            Self::None => "",
            Self::NewLowPrice => "NEW LOW PRICE",
            Self::Trending => "TRENDING",
            Self::EndsSoon => "ENDS SOON",
            Self::EditorsPick => "EDITOR'S PICK",
        }
    }
    const fn classes(self) -> &'static str {
        match self {
            Self::None => "",
            Self::NewLowPrice => "signal signal--trustworthy",
            Self::Trending => "signal signal--informational",
            Self::EndsSoon => "signal signal--negative",
            Self::EditorsPick => "signal signal--brand",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ListingFormat {
    BuyItNow,
    Auction,
    BestOffer,
}

impl ListingFormat {
    const fn label(self) -> &'static str {
        match self {
            Self::BuyItNow => "Buy It Now",
            Self::Auction => "or Best Offer",
            Self::BestOffer => "Best Offer",
        }
    }
}

#[derive(Clone, Copy)]
pub struct Listing {
    pub item_id: u64,
    pub image_hash: &'static str, // synthetic artwork variant
    pub title: &'static str,
    pub subtitle_parts: &'static [&'static str], // joined with " · "
    pub caption: CaptionSignal,
    pub stars_full: u8, // 0..=5
    pub has_half_star: bool,
    pub review_count: u32,
    pub price_cents: i64,
    pub original_price_cents: Option<i64>,
    pub format: ListingFormat,
    pub delivery_cents: i64,    // 0 = "Free delivery"
    pub location: &'static str, // "United States"
    pub watcher_count: u32,
    pub coupon_pct: Option<u8>,
    pub seller_name: &'static str,
    pub seller_feedback_pct_x10: u16, // 999 = 99.9%
    pub seller_feedback_count: u32,
}

// ---------------------------------------------------------------------------
// Static dataset (synthetic, production-shaped strings)
// ---------------------------------------------------------------------------

const TITLES: &[&str] = &[
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
    "Orchard Mobile Studio - Charcoal - \"Like New\" Condition",
    "Tidepool Recorder 5 - Silver - Excellent Field Kit",
    "Morrow Pocket Capture - Indigo - 7/10 Cosmetic Condition",
    "Redwood Session Recorder - Gold - Mint Condition - Pre-Owned",
    "Drift Audio R4 - Black & Scratched Back - For Parts",
    "Cloudline Field Recorder - Frost - Input Module Included",
];

const SUBTITLE_VARIANTS: &[&[&str]] = &[
    &["Pre-Owned", "Portable Recorder", "128 GB", "Four Inputs"],
    &["Brand New", "Field Recorder", "256 GB", "32-bit Float"],
    &["Pre-Owned", "Portable Mixer", "512 GB", "Timecode"],
    &["Open Box", "Mobile Studio", "1 TB", "USB-C"],
    &["For parts or not working", "Compact Recorder", "Stereo"],
    &["Refurbished", "Field Recorder", "256 GB", "Six Inputs"],
    &["Pre-Owned", "Pocket Recorder", "128 GB", "Bluetooth"],
    &["Brand New", "Session Recorder", "512 GB", "Eight Inputs"],
];

const SELLERS: &[&str] = &[
    "field_notes_co",
    "northstar_audio",
    "signal_cabin",
    "smart-sound & co",
    "best>field_outlet",
    "the.recorder.shop",
    "global-audio\"vendor\"",
    "premium_session_gear",
    "digital_tape&co",
    "harbor_electronics",
];

const LOCATIONS: &[&str] = &[
    "United States",
    "Hong Kong",
    "China",
    "United Kingdom",
    "Germany",
    "Japan",
    "Australia",
    "Canada",
];

const IMAGE_HASHES: &[&str] = &[
    "northstar-r8",
    "ember-track-mini",
    "juniper-s6",
    "atlas-pocket-studio",
    "beacon-wave",
    "cedar-field-kit",
    "nimbus-capture",
    "harbor-audio-deck",
];

pub fn build_listings(n: usize) -> Vec<Listing> {
    (0..n)
        .map(|i| {
            let base = 14_999 + ((i as i64) * 4_337) % 195_000;
            let on_sale = i % 3 == 0;
            let original = if on_sale { Some(base + base / 5) } else { None };
            let free_delivery = i % 2 == 0;
            Listing {
                item_id: 336_000_000_000 + (i as u64) * 71,
                image_hash: IMAGE_HASHES[i % IMAGE_HASHES.len()],
                title: TITLES[i % TITLES.len()],
                subtitle_parts: SUBTITLE_VARIANTS[i % SUBTITLE_VARIANTS.len()],
                caption: match i % 9 {
                    0 => CaptionSignal::NewLowPrice,
                    3 => CaptionSignal::Trending,
                    5 => CaptionSignal::EndsSoon,
                    7 => CaptionSignal::EditorsPick,
                    _ => CaptionSignal::None,
                },
                stars_full: 3 + (i as u8 % 3),
                has_half_star: i % 2 == 0,
                review_count: 5 + (i as u32 * 17) % 1_240,
                price_cents: base,
                original_price_cents: original,
                format: match i % 5 {
                    0 => ListingFormat::Auction,
                    1 => ListingFormat::BestOffer,
                    _ => ListingFormat::BuyItNow,
                },
                delivery_cents: if free_delivery {
                    0
                } else {
                    599 + (i as i64 * 13) % 1_400
                },
                location: LOCATIONS[i % LOCATIONS.len()],
                watcher_count: 5 + (i as u32 * 7) % 200,
                coupon_pct: if i % 4 == 1 {
                    Some(5 + (i as u8 % 20))
                } else {
                    None
                },
                seller_name: SELLERS[i % SELLERS.len()],
                seller_feedback_pct_x10: 950 + ((i as u16) * 7) % 50,
                seller_feedback_count: 1_000 + (i as u32 * 137) % 99_000,
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
struct Uint(u64);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Uint {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let mut buf = [0u8; 20];
        let s = format_u64(&mut buf, self.0);
        cx.out.extend(s.as_bytes())
    }
}

#[derive(Clone, Copy)]
struct Commas(u64);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Commas {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        write_with_commas(cx, self.0)
    }
}

/// "99.9%" from 999
#[derive(Clone, Copy)]
struct FeedbackPct(u16);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for FeedbackPct {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let v = self.0;
        let whole = (v / 10) as u64;
        let tenth = (v % 10) as u8;
        let mut buf = [0u8; 20];
        let s = format_u64(&mut buf, whole);
        cx.out.extend(s.as_bytes())?;
        cx.out.extend(b".")?;
        cx.out.extend(&[b'0' + tenth])?;
        cx.out.extend(b"%")
    }
}

/// "37.9K" from 37_912
#[derive(Clone, Copy)]
struct AbbrevCount(u32);
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for AbbrevCount {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let n = self.0;
        let mut buf = [0u8; 20];
        if n < 1_000 {
            let s = format_u64(&mut buf, n as u64);
            return cx.out.extend(s.as_bytes());
        }
        if n < 1_000_000 {
            let whole = n / 1_000;
            let tenth = (n % 1_000) / 100;
            let s = format_u64(&mut buf, whole as u64);
            cx.out.extend(s.as_bytes())?;
            if tenth > 0 {
                cx.out.extend(b".")?;
                cx.out.extend(&[b'0' + tenth as u8])?;
            }
            return cx.out.extend(b"K");
        }
        let whole = n / 1_000_000;
        let tenth = (n % 1_000_000) / 100_000;
        let s = format_u64(&mut buf, whole as u64);
        cx.out.extend(s.as_bytes())?;
        if tenth > 0 {
            cx.out.extend(b".")?;
            cx.out.extend(&[b'0' + tenth as u8])?;
        }
        cx.out.extend(b"M")
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

// ---------------------------------------------------------------------------
// Card renderer (stable synthetic marketplace markup)
// ---------------------------------------------------------------------------

pub struct CardList<'a> {
    pub listings: &'a [Listing],
}

impl<'a, B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for CardList<'a> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        for listing in self.listings {
            Card { listing: *listing }.render(cx)?;
        }
        Ok(())
    }
}

struct Card {
    listing: Listing,
}

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Card {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let l = self.listing;
        // Open <li>...
        cx.out.extend(b"<li id=\"item")?;
        Uint(l.item_id).render(cx)?;
        cx.out.extend(b"\" data-listingid=\"")?;
        Uint(l.item_id).render(cx)?;
        cx.out.extend(b"\" class=\"s-card s-card--horizontal\">")?;

        cx.out
            .extend(b"<div class=\"su-card-container su-card-container--horizontal\">")?;

        // ---- media
        cx.out.extend(b"<div class=\"su-card-container__media\"><div class=\"su-media-container s-card__media-wrapper\"><div class=\"su-media-multi-image\"><div class=\"su-media-multi-image__primary\"><div class=\"su-media-container\"><div class=\"su-image\">")?;
        cx.out
            .extend(b"<a class=\"s-card__link image-treatment\" href=\"")?;
        item_url(cx, l.item_id)?;
        cx.out
            .extend(b"\" target=\"_blank\" style=\"--aspect-ratio: 1;\">")?;
        cx.out.extend(b"<img class=\"s-card__image\" fetchpriority=\"high\" loading=\"eager\" src=\"/images/synthetic/field-recorder.svg#")?;
        cx.out.extend(l.image_hash.as_bytes())?;
        cx.out.extend(b"\" alt=\"")?;
        text(l.title).render(cx)?;
        cx.out.extend(b"\" style=\"width:auto\">")?;
        cx.out.extend(b"</a></div></div></div></div>")?;

        // watch heart action
        cx.out.extend(b"<div class=\"su-media__action su-media__action--top-right\"><span class=\"s-card__watchheart on-image s-card__watchheart--watch\"><a aria-label=\"watch ")?;
        text(l.title).render(cx)?;
        cx.out.extend(b"\" class=\"s-card__watchheart-click\" href=\"#\"><span class=\"s-card__watchheart-icon\">")?;
        cx.out.extend(b"<svg class=\"icon icon--16\" focusable=\"false\" aria-hidden=\"true\"><use href=\"#icon-heart-16\"></use></svg>")?;
        cx.out.extend(b"<svg class=\"icon icon--16\" focusable=\"false\" aria-hidden=\"true\"><use href=\"#icon-heart-filled-16\"></use></svg>")?;
        cx.out.extend(b"</span></a></span></div>")?;
        cx.out.extend(b"</div></div>")?; // /media

        // ---- content
        cx.out
            .extend(b"<div class=\"su-card-container__content\">")?;
        cx.out
            .extend(b"<div class=\"su-card-container__header\">")?;

        // caption
        cx.out.extend(b"<div class=\"s-card__caption\">")?;
        if l.caption != CaptionSignal::None {
            cx.out.extend(b"<span class=\"")?;
            cx.out.extend(l.caption.classes().as_bytes())?;
            cx.out.extend(b"\" aria-label=\"")?;
            cx.out.extend(l.caption.label().as_bytes())?;
            cx.out.extend(b"\">")?;
            cx.out.extend(l.caption.label().as_bytes())?;
            cx.out.extend(b"</span>")?;
        }
        cx.out.extend(b"</div>")?;

        // title link
        cx.out
            .extend(b"<a class=\"s-card__link\" target=\"_blank\" tabindex=\"-1\" href=\"")?;
        item_url(cx, l.item_id)?;
        cx.out.extend(
            b"\"><div role=\"heading\" aria-level=\"3\" class=\"s-card__title\"><span class=\"su-styled-text primary default\">",
        )?;
        text(l.title).render(cx)?;
        cx.out.extend(b"</span></div></a>")?;

        // subtitle
        cx.out
            .extend(b"<div class=\"s-card__subtitle-row\"><div class=\"s-card__subtitle\">")?;
        let last = l.subtitle_parts.len().saturating_sub(1);
        for (idx, part) in l.subtitle_parts.iter().enumerate() {
            cx.out
                .extend(b"<span class=\"su-styled-text secondary default\">")?;
            text(part).render(cx)?;
            if idx != last {
                cx.out.extend(b" \xc2\xb7 ")?; // " · "
            }
            cx.out.extend(b"</span>")?;
        }
        cx.out.extend(b"</div></div>")?;

        // reviews / stars
        cx.out.extend(b"<div class=\"s-card__product-reviews\"><div class=\"s-card__reviews\"><a href=\"#UserReviews\"><div class=\"x-star-rating\">")?;
        for _ in 0..l.stars_full {
            cx.out.extend(b"<svg class=\"icon icon--16\" focusable=\"false\" aria-hidden=\"true\"><use href=\"#icon-star-filled-16\"></use></svg>")?;
        }
        if l.has_half_star {
            cx.out.extend(b"<svg class=\"icon icon--16-colored\" focusable=\"false\" aria-hidden=\"true\"><use href=\"#icon-star-half-16-colored\"></use></svg>")?;
        }
        let empty = 5u8.saturating_sub(l.stars_full + l.has_half_star as u8);
        for _ in 0..empty {
            cx.out.extend(b"<svg class=\"icon icon--16\" focusable=\"false\" aria-hidden=\"true\"><use href=\"#icon-star-empty-16\"></use></svg>")?;
        }
        cx.out
            .extend(b"</div><span class=\"s-card__reviews-count\"><span aria-hidden=\"false\">")?;
        Commas(l.review_count as u64).render(cx)?;
        cx.out
            .extend(b" product ratings</span></span></a></div></div>")?;

        cx.out.extend(b"</div>")?; // /header

        // attributes
        cx.out.extend(b"<div class=\"su-card-container__attributes su-card-container__attributes--has-secondary\"><div class=\"su-card-container__attributes__primary\">")?;

        // price row
        cx.out.extend(b"<div class=\"s-card__attribute-row\"><span class=\"su-styled-text primary bold large-1 s-card__price\">")?;
        Currency(l.price_cents).render(cx)?;
        cx.out.extend(b"</span>")?;
        if let Some(orig) = l.original_price_cents {
            cx.out.extend(b"<span class=\"su-spacer --spacing-100\"></span><span class=\"su-styled-text secondary strikethrough large\">")?;
            Currency(orig).render(cx)?;
            cx.out.extend(b"</span>")?;
        }
        cx.out.extend(b"</div>")?;

        // format row
        cx.out.extend(
            b"<div class=\"s-card__attribute-row\"><span class=\"su-styled-text secondary large\">",
        )?;
        cx.out.extend(l.format.label().as_bytes())?;
        cx.out.extend(b"</span></div>")?;

        // delivery row
        cx.out.extend(
            b"<div class=\"s-card__attribute-row\"><span class=\"su-styled-text secondary large\">",
        )?;
        if l.delivery_cents == 0 {
            cx.out.extend(b"Free delivery")?;
        } else {
            cx.out.extend(b"+")?;
            Currency(l.delivery_cents).render(cx)?;
            cx.out.extend(b" delivery")?;
        }
        cx.out.extend(b"</span></div>")?;

        // location row
        cx.out.extend(b"<div class=\"s-card__attribute-row\"><span class=\"su-styled-text secondary large\">Located in ")?;
        text(l.location).render(cx)?;
        cx.out.extend(b"</span></div>")?;

        // watchers row
        cx.out.extend(b"<div class=\"s-card__attribute-row\"><span class=\"su-styled-text primary bold large\">")?;
        Commas(l.watcher_count as u64).render(cx)?;
        cx.out.extend(b" watchers</span></div>")?;

        // coupon row (optional)
        if let Some(pct) = l.coupon_pct {
            cx.out.extend(b"<div class=\"s-card__attribute-row\"><span class=\"su-styled-text negative bold large\">Extra ")?;
            Uint(pct as u64).render(cx)?;
            cx.out.extend(b"% off with coupon</span></div>")?;
        }

        cx.out.extend(b"</div>")?; // /attributes_primary

        // secondary (seller)
        cx.out.extend(b"<div class=\"su-card-container__attributes__secondary\"><div class=\"s-card__attribute-row\"><span class=\"su-styled-text primary large\">")?;
        text(l.seller_name).render(cx)?;
        cx.out
            .extend(b" </span><span class=\"su-styled-text primary large\">")?;
        FeedbackPct(l.seller_feedback_pct_x10).render(cx)?;
        cx.out.extend(b" positive (")?;
        AbbrevCount(l.seller_feedback_count).render(cx)?;
        cx.out.extend(b")</span></div></div>")?;

        cx.out.extend(b"</div>")?; // /attributes
        cx.out.extend(b"</div>")?; // /content

        cx.out.extend(b"</div>")?; // /su-card-container
        cx.out.extend(b"</li>")?;
        Ok(())
    }
}

#[inline]
fn item_url<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    id: u64,
) -> Result<(), WriteError> {
    cx.out.extend(b"#listing-")?;
    let mut buf = [0u8; 20];
    let s = format_u64(&mut buf, id);
    cx.out.extend(s.as_bytes())
}

// ---------------------------------------------------------------------------
// Whole-page entry: just the listings list (the variable workload).
// ---------------------------------------------------------------------------

pub struct ListingsList<'a> {
    pub listings: &'a [Listing],
}

impl<'a, B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for ListingsList<'a> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        html_sync! {
            <ul class="srp-results srp-list clearfix">{CardList { listings: self.listings }}</ul>
        }
        .render(cx)
    }
}

pub fn render_listings_into(listings: &[Listing], buffer: &mut Vec<u8>) {
    crate::render_into_vec(buffer, ListingsList { listings });
}

pub fn render_listings_to_string(listings: &[Listing]) -> String {
    proa_core::render_to_string(ListingsList { listings })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_synthetic_card_markup() {
        let listings = build_listings(2);
        let html = render_listings_to_string(&listings);
        // Stable workload class names must appear.
        assert!(html.contains("s-card s-card--horizontal"));
        assert!(html.contains("su-card-container__media"));
        assert!(html.contains("s-card__price"));
        assert!(html.contains("su-styled-text"));
        // SVG sprite refs
        assert!(html.contains("#icon-star-filled-16"));
        assert!(html.contains("#icon-heart-16"));
        // currency rendered
        assert!(html.contains("$"));
        // escaped title chars
        assert!(html.contains("&amp;"));
    }
}
