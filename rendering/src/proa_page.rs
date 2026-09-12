//! Proa benchmark page implementation
use crate::{CARDS_PER_SECTION, ITEMS_PER_CARD, NUM_SECTIONS};
use proa_core::shared::write_buf::WriteCursor;
use proa_core::{SafeText, WebContext, WebRenderSync, WriteBuf};
use proa_macros::html_sync;
/// A benchmark page rendered with Proa using html_sync! macro
pub struct BenchmarkPage;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for BenchmarkPage {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        html_sync! {
            <html lang="en">
                <head>
                    <title>"SSR Benchmark Page"</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                </head>
                <body>
                    <header class="hero-section">
                        <h1 class="title">"SSR Framework Benchmark"</h1>
                        <p class="subtitle">"Comparing Proa, Leptos, Dioxus, and Yew"</p>
                    </header>
                    <main class="main-content">{SectionList}</main>
                    <footer class="footer">
                        <p>"Rendered by the SSR benchmark fixture"</p>
                    </footer>
                </body>
            </html>
        }
        .render(cx)
    }
}
/// Helper component that renders all sections
struct SectionList;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SectionList {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for section_idx in 0..NUM_SECTIONS {
            Section { idx: section_idx }.render(cx)?;
        }
        Ok(())
    }
}
/// A single section with cards
struct Section {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Section {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        let section_class = if self.idx.is_multiple_of(2) {
            "even"
        } else {
            "odd"
        };
        let title = match self.idx {
            0 => "Performance Metrics",
            1 => "Rendering Speed",
            2 => "Memory Efficiency",
            _ => "Framework Comparison",
        };
        html_sync! {
            <section class="card-section" data-section={section_class}>
                <h2 class="section-title">{proa_core::text(title)}</h2>
                <div class="card-grid">{CardList}</div>
            </section>
        }
        .render(cx)
    }
}
/// Helper component that renders all cards in a section
struct CardList;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for CardList {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for card_idx in 0..CARDS_PER_SECTION {
            Card { idx: card_idx }.render(cx)?;
        }
        Ok(())
    }
}
/// A single card
struct Card {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Card {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        let card_class = if self.idx.is_multiple_of(2) {
            "even"
        } else {
            "odd"
        };
        let card_title = match self.idx % 4 {
            0 => "Latency Analysis",
            1 => "Throughput Metrics",
            2 => "Memory Usage",
            _ => "CPU Utilization",
        };
        html_sync! {
            <article class="card" data-card-id={card_class}>
                <div class="card-header">
                    <img
                        src="/images/benchmark.png"
                        alt="Benchmark chart"
                        class="card-image"
                    />
                </div>
                <div class="card-body">
                    <h3 class="card-title">{proa_core::text(card_title)}</h3>
                    <p class="card-description">
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
                    </p>
                    <ul class="feature-list">{FeatureList}</ul>
                    <button
                        class="btn-primary"
                        type="button"
                    >
                        "View Details"
                    </button>
                </div>
            </article>
        }
            .render(cx)
    }
}
/// Helper component that renders all feature items
struct FeatureList;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for FeatureList {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for item_idx in 0..ITEMS_PER_CARD {
            FeatureItem { idx: item_idx }.render(cx)?;
        }
        Ok(())
    }
}
/// A single feature item
struct FeatureItem {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for FeatureItem {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        let text = match self.idx {
            0 => "Sub-millisecond response times",
            1 => "Zero-copy rendering pipeline",
            2 => "SIMD-accelerated escaping",
            3 => "Pre-allocated buffers",
            _ => "Minimal heap allocations",
        };
        html_sync! {
            <li class="feature-item">{proa_core::text(text)}</li>
        }
        .render(cx)
    }
}
/// Render the benchmark page to a String
pub fn render() -> String {
    // proa-perf-ok: benchmark convenience API intentionally returns an owned String
    proa_core::render_to_string(BenchmarkPage)
}
/// Render the benchmark page into an existing buffer
pub fn render_into(buffer: &mut Vec<u8>) {
    crate::render_into_vec(buffer, BenchmarkPage);
}
/// A benchmark page using html_sync! macro with SafeText optimization.
/// Generic over buffer type for maximum performance.
#[derive(Clone, Copy)]
pub struct SafeTextBenchmarkPage;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SafeTextBenchmarkPage {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        html_sync! {
            <html lang="en">
                <head>
                    <title>"SSR Benchmark Page"</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                </head>
                <body>
                    <header class="hero-section">
                        <h1 class="title">"SSR Framework Benchmark"</h1>
                        <p class="subtitle">"Comparing Proa, Leptos, Dioxus, and Yew"</p>
                    </header>
                    <main class="main-content">{SafeTextSectionList}</main>
                    <footer class="footer">
                        <p>"Rendered by the SSR benchmark fixture"</p>
                    </footer>
                </body>
            </html>
        }
        .render(cx)
    }
}
/// Helper component that renders all sections (uses SafeText)
struct SafeTextSectionList;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SafeTextSectionList {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for section_idx in 0..NUM_SECTIONS {
            SafeTextSection { idx: section_idx }.render(cx)?;
        }
        Ok(())
    }
}
/// A single section with cards (uses SafeText)
struct SafeTextSection {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SafeTextSection {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        let section_class = if self.idx.is_multiple_of(2) {
            "even"
        } else {
            "odd"
        };
        let title = SafeText::from_trusted(match self.idx {
            0 => "Performance Metrics",
            1 => "Rendering Speed",
            2 => "Memory Efficiency",
            _ => "Framework Comparison",
        });
        html_sync! {
            <section class="card-section" data-section={section_class}>
                <h2 class="section-title">{title}</h2>
                <div class="card-grid">{SafeTextCardGrid { count : CARDS_PER_SECTION }}</div>
            </section>
        }
        .render(cx)
    }
}
/// Renders multiple cards
struct SafeTextCardGrid {
    count: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SafeTextCardGrid {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for card_idx in 0..self.count {
            SafeTextCard { idx: card_idx }.render(cx)?;
        }
        Ok(())
    }
}
/// A single card component (uses SafeText)
struct SafeTextCard {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SafeTextCard {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        let card_class = if self.idx.is_multiple_of(2) {
            "even"
        } else {
            "odd"
        };
        let title = SafeText::from_trusted(match self.idx % 4 {
            0 => "Latency Analysis",
            1 => "Throughput Metrics",
            2 => "Memory Usage",
            _ => "CPU Utilization",
        });
        html_sync! {
            <article class="card" data-card-id={card_class}>
                <div class="card-header">
                    <img src="/images/benchmark.png" alt="Benchmark chart" class="card-image" />
                </div>
                <div class="card-body">
                    <h3 class="card-title">{title}</h3>
                    <p class="card-description">
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
                    </p>
                    <ul class="feature-list">{SafeTextFeatureList}</ul>
                    <button class="btn-primary" type="button">"View Details"</button>
                </div>
            </article>
        }
        .render(cx)
    }
}
/// Renders feature list items
struct SafeTextFeatureList;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SafeTextFeatureList {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for item_idx in 0..ITEMS_PER_CARD {
            SafeTextFeatureItem { idx: item_idx }.render(cx)?;
        }
        Ok(())
    }
}
/// A single feature list item
struct SafeTextFeatureItem {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for SafeTextFeatureItem {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        let text = SafeText::from_trusted(match self.idx {
            0 => "Sub-millisecond response times",
            1 => "Zero-copy rendering pipeline",
            2 => "SIMD-accelerated escaping",
            3 => "Pre-allocated buffers",
            _ => "Minimal heap allocations",
        });
        html_sync! {
            <li class="feature-item">{text}</li>
        }
        .render(cx)
    }
}
/// Render using html_sync! with SafeText into an existing buffer
pub fn render_safetext_into(buffer: &mut Vec<u8>) {
    crate::render_into_vec(buffer, SafeTextBenchmarkPage);
}
/// Render the SafeText benchmark page to a fresh owned String.
///
/// The cross-framework baseline uses this alongside
/// [`render_safetext_into`] so its renderer work is identical to the reusable
/// Proa row; only the output ownership and buffer policy differ.
pub fn render_safetext_owned() -> String {
    proa_core::render_to_string(SafeTextBenchmarkPage)
}
/// Render using html_sync! with SafeText to a stack buffer via WriteCursor.
pub fn render_safetext_to_cursor(buffer: &mut [u8]) -> Option<usize> {
    let mut cursor = WriteCursor::new(buffer);
    {
        let mut cx = WebContext::with_buffer(&mut cursor);
        SafeTextBenchmarkPage.render(&mut cx).ok()?;
    }
    Some(cursor.len())
}
/// A benchmark page using raw buffer writes (no macros).
/// This represents the theoretical maximum performance.
pub struct RawBenchmarkPage;
// proa-perf-ok(scope): this benchmark-only control intentionally emits trusted
// static fixture HTML directly to measure the raw WriteBuf lower bound.
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for RawBenchmarkPage {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        cx.out.extend(b"<html lang=\"en\">")?;
        cx.out.extend(b"<head>")?;
        cx.out.extend(b"<title>SSR Benchmark Page</title>")?;
        cx.out
            .extend(b"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")?;
        cx.out.extend(b"</head>")?;
        cx.out.extend(b"<body>")?;
        cx.out.extend(b"<header class=\"hero-section\">")?;
        cx.out
            .extend(b"<h1 class=\"title\">SSR Framework Benchmark</h1>")?;
        cx.out
            .extend(b"<p class=\"subtitle\">Comparing Proa, Leptos, Dioxus, and Yew</p>")?;
        cx.out.extend(b"</header>")?;
        cx.out.extend(b"<main class=\"main-content\">")?;
        for section_idx in 0..NUM_SECTIONS {
            render_section_raw(cx, section_idx)?;
        }
        cx.out.extend(b"</main>")?;
        cx.out.extend(
            b"<footer class=\"footer\"><p>Rendered by the SSR benchmark fixture</p></footer>",
        )?;
        cx.out.extend(b"</body></html>")
    }
}
// proa-perf-ok(scope): raw benchmark control; every emitted HTML fragment is a
// trusted fixture constant selected by a bounded benchmark index.
#[inline(always)]
fn render_section_raw<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    section_idx: usize,
) -> Result<(), proa_core::WriteError> {
    cx.out
        .extend(b"<section class=\"card-section\" data-section=\"")?;
    if section_idx.is_multiple_of(2) {
        cx.out.extend(b"even\">")?;
    } else {
        cx.out.extend(b"odd\">")?;
    }
    match section_idx {
        0 => {
            cx.out
                .extend(b"<h2 class=\"section-title\">Performance Metrics</h2>")?;
        }
        1 => {
            cx.out
                .extend(b"<h2 class=\"section-title\">Rendering Speed</h2>")?;
        }
        2 => {
            cx.out
                .extend(b"<h2 class=\"section-title\">Memory Efficiency</h2>")?;
        }
        _ => {
            cx.out
                .extend(b"<h2 class=\"section-title\">Framework Comparison</h2>")?;
        }
    }
    cx.out.extend(b"<div class=\"card-grid\">")?;
    for card_idx in 0..CARDS_PER_SECTION {
        render_card_raw(cx, card_idx)?;
    }
    cx.out.extend(b"</div></section>")
}
// proa-perf-ok(scope): raw benchmark control; every emitted HTML fragment is a
// trusted fixture constant selected by a bounded benchmark index.
#[inline(always)]
fn render_card_raw<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    card_idx: usize,
) -> Result<(), proa_core::WriteError> {
    cx.out.extend(b"<article class=\"card\" data-card-id=\"")?;
    if card_idx.is_multiple_of(2) {
        cx.out.extend(b"even\">")?;
    } else {
        cx.out.extend(b"odd\">")?;
    }
    cx.out
        .extend(
            b"<div class=\"card-header\"><img src=\"/images/benchmark.png\" alt=\"Benchmark chart\" class=\"card-image\"></div>",
        )?;
    cx.out.extend(b"<div class=\"card-body\">")?;
    match card_idx % 4 {
        0 => {
            cx.out
                .extend(b"<h3 class=\"card-title\">Latency Analysis</h3>")?;
        }
        1 => {
            cx.out
                .extend(b"<h3 class=\"card-title\">Throughput Metrics</h3>")?;
        }
        2 => {
            cx.out
                .extend(b"<h3 class=\"card-title\">Memory Usage</h3>")?;
        }
        _ => {
            cx.out
                .extend(b"<h3 class=\"card-title\">CPU Utilization</h3>")?;
        }
    }
    cx.out
        .extend(
            b"<p class=\"card-description\">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>",
        )?;
    cx.out.extend(b"<ul class=\"feature-list\">")?;
    for item_idx in 0..ITEMS_PER_CARD {
        render_feature_raw(cx, item_idx)?;
    }
    cx.out.extend(b"</ul>")?;
    cx.out
        .extend(b"<button class=\"btn-primary\" type=\"button\">View Details</button>")?;
    cx.out.extend(b"</div></article>")
}
// proa-perf-ok(scope): raw benchmark control; every emitted HTML fragment is a
// trusted fixture constant selected by a bounded benchmark index.
#[inline(always)]
fn render_feature_raw<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    item_idx: usize,
) -> Result<(), proa_core::WriteError> {
    match item_idx {
        0 => {
            cx.out
                .extend(b"<li class=\"feature-item\">Sub-millisecond response times</li>")?;
        }
        1 => {
            cx.out
                .extend(b"<li class=\"feature-item\">Zero-copy rendering pipeline</li>")?;
        }
        2 => {
            cx.out
                .extend(b"<li class=\"feature-item\">SIMD-accelerated escaping</li>")?;
        }
        3 => {
            cx.out
                .extend(b"<li class=\"feature-item\">Pre-allocated buffers</li>")?;
        }
        _ => {
            cx.out
                .extend(b"<li class=\"feature-item\">Minimal heap allocations</li>")?;
        }
    }
    Ok(())
}
/// Render raw to a stack buffer via WriteCursor (baseline).
pub fn render_raw_to_cursor(buffer: &mut [u8]) -> Option<usize> {
    let mut cursor = WriteCursor::new(buffer);
    {
        let mut cx = WebContext::with_buffer(&mut cursor);
        RawBenchmarkPage.render(&mut cx).ok()?;
    }
    Some(cursor.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_and_reused_primary_paths_are_byte_identical() {
        let owned = render_safetext_owned();
        let mut reused = Vec::new();
        render_safetext_into(&mut reused);

        assert_eq!(owned.as_bytes(), reused);
    }

    #[test]
    fn raw_upper_bound_renders_the_primary_fixture() {
        let owned = render_safetext_owned();
        let mut backing = [0u8; 32 * 1024];
        let len = render_raw_to_cursor(&mut backing).expect("fixture fits in the benchmark buffer");

        assert_eq!(owned.as_bytes(), &backing[..len]);
    }
}
