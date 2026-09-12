//! Targeted benchmarks: scenarios where Proa should beat Askama
//!
//! 1. Heavy escaping (SIMD memchr3 vs byte-by-byte scanning)
//! 2. Large pages (100KB+ output, buffer growth strategy)
//! 3. Buffer reuse across requests (production server pattern)
use askama::Template as AskamaTemplate;
use proa_core::{SafeText, WebContext, WebRenderSync, WriteBuf};
use proa_macros::html_sync;
/// Content with dense HTML-special characters that need escaping
pub const ESCAPE_ITEMS: &[EscapeItem] = &[
    EscapeItem {
        title: "Review: <script>alert('xss')</script> & more \"issues\"",
        body: "The product was <okay> but the packaging & delivery were \"terrible\". I'd rate it 3/5 stars. Price was $49.99 < $60 expected. The seller's response was: \"We'll do better\" & promised <free> returns.",
        author: "John <Johnny> O'Brien & Associates",
        meta: "Posted via <iframe> embed — source: \"external\" & 'unverified' <script>document.cookie</script>",
    },
    EscapeItem {
        title: "Why I <love> this & that — a \"comprehensive\" review",
        body: "First: the <quality> is outstanding & the price ($29 < $50 retail) can't be beat. Second: the seller's \"guarantee\" covers <everything> & they're responsive. The only issue? Shipping was 5 > 3 days expected. Would recommend to anyone who's looking for <great> value & \"honest\" service.",
        author: "Sarah's Reviews <Verified> & \"Trusted\"",
        meta: "Rating: 5 > 4 average — \"Editor's Choice\" & <Featured> review",
    },
    EscapeItem {
        title: "<URGENT> Security Alert & \"Critical\" Update Required",
        body: "We've detected <suspicious> activity & \"unauthorized\" access attempts. Your password's hash was <leaked> in the breach & needs changing. Steps: 1) Go to <settings> 2) Click \"Change Password\" & verify. Note: URLs with <script> tags & \"javascript:\" protocols are blocked. Contact support@example.com for help & <more> info.",
        author: "Security Team <noreply@sec.io> & \"Admin\"",
        meta: "Severity: \"HIGH\" & <critical> — affects 1000 > 500 users & 'all' <legacy> systems",
    },
    EscapeItem {
        title: "Q&A: \"How do <tags> work?\" & other <common> questions",
        body: "Q: What's the difference between < and &lt;? A: In HTML, <angle brackets> & \"ampersands\" have special meaning. The < symbol means \"less than\" & > means \"greater than\". When you write <div> the browser treats it as a tag. To display <literal> angle brackets & \"quotes\" in text, use &amp; entities. The parser's behavior with <nested <tags>> & \"escaped \\\"quotes\\\"\" can be confusing.",
        author: "FAQ Bot <auto@help.com> & 'Contributors'",
        meta: "Category: \"HTML & <XML>\" — views: 50000 > 10000 threshold & 'trending'",
    },
];
pub struct EscapeItem {
    pub title: &'static str,
    pub body: &'static str,
    pub author: &'static str,
    pub meta: &'static str,
}
#[derive(AskamaTemplate)]
#[template(path = "escape_heavy.html")]
pub struct AskamaEscapePage {
    pub items: &'static [EscapeItem],
}
pub fn askama_escape_render() -> String {
    AskamaEscapePage {
        items: ESCAPE_ITEMS,
    }
    .render()
    .expect("render failed")
}
pub struct ProaEscapePage;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for ProaEscapePage {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        html_sync! {
            <html lang="en">
                <head>
                    <title>"Escape Benchmark"</title>
                </head>
                <body>{EscapeItems}</body>
            </html>
        }
        .render(cx)
    }
}
struct EscapeItems;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for EscapeItems {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for item in ESCAPE_ITEMS {
            html_sync! {
                <div class="review-card">
                    <h3>{proa_core::text(item.title)}</h3>
                    <p class="body">{proa_core::text(item.body)}</p>
                    <span class="author">{proa_core::text(item.author)}</span>
                    <div class="meta">{proa_core::text(item.meta)}</div>
                </div>
            }
            .render(cx)?;
        }
        Ok(())
    }
}
pub fn proa_escape_render() -> String {
    proa_core::render_to_string(ProaEscapePage)
}
pub fn proa_escape_render_into(buf: &mut Vec<u8>) {
    crate::render_into_vec(buf, ProaEscapePage);
}
const LARGE_SECTIONS: usize = 16;
const LARGE_CARDS: usize = 16;
const LARGE_ITEMS: usize = 8;
#[derive(AskamaTemplate)]
#[template(path = "large_page.html")]
pub struct AskamaLargePage {
    pub num_sections: usize,
    pub cards_per_section: usize,
    pub items_per_card: usize,
}
pub fn askama_large_render() -> String {
    AskamaLargePage {
        num_sections: LARGE_SECTIONS,
        cards_per_section: LARGE_CARDS,
        items_per_card: LARGE_ITEMS,
    }
    .render()
    .expect("render failed")
}
pub struct ProaLargePage;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for ProaLargePage {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        html_sync! {
            <html lang="en">
                <head>
                    <title>"Large Page Benchmark"</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                </head>
                <body>
                    <header class="hero-section">
                        <h1 class="title">"Large Page Benchmark"</h1>
                    </header>
                    <main class="main-content">{LargeSections}</main>
                    <footer class="footer">
                        <p>"Rendered with Proa SSR"</p>
                    </footer>
                </body>
            </html>
        }
        .render(cx)
    }
}
struct LargeSections;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for LargeSections {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for section_idx in 0..LARGE_SECTIONS {
            LargeSection { idx: section_idx }.render(cx)?;
        }
        Ok(())
    }
}
struct LargeSection {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for LargeSection {
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
                <div class="card-grid">{LargeCards}</div>
            </section>
        }
        .render(cx)
    }
}
struct LargeCards;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for LargeCards {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for card_idx in 0..LARGE_CARDS {
            LargeCard { idx: card_idx }.render(cx)?;
        }
        Ok(())
    }
}
struct LargeCard {
    idx: usize,
}
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for LargeCard {
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
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."
                    </p>
                    <ul class="feature-list">{LargeFeatures}</ul>
                    <button class="btn-primary" type="button">"View Details"</button>
                </div>
            </article>
        }
        .render(cx)
    }
}
struct LargeFeatures;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for LargeFeatures {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        for item_idx in 0..LARGE_ITEMS {
            let text = SafeText::from_trusted(match item_idx {
                0 => "Sub-millisecond response times",
                1 => "Zero-copy rendering pipeline",
                2 => "SIMD-accelerated escaping",
                3 => "Pre-allocated buffers",
                4 => "Minimal heap allocations",
                5 => "Compile-time template optimization",
                6 => "Native machine code rendering",
                _ => "Flat tail latency under load",
            });
            html_sync! {
                <li class="feature-item">{text}</li>
            }
            .render(cx)?;
        }
        Ok(())
    }
}
pub fn proa_large_render() -> String {
    proa_core::render_to_string(ProaLargePage)
}
pub fn proa_large_render_into(buf: &mut Vec<u8>) {
    crate::render_into_vec(buf, ProaLargePage);
}
pub struct ProaLargePageRaw;
impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for ProaLargePageRaw {
    #[inline(always)]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), proa_core::WriteError> {
        cx.out
            .extend_static(
                b"<html lang=\"en\"><head><title>Large Page Benchmark</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body><header class=\"hero-section\"><h1 class=\"title\">Large Page Benchmark</h1></header><main class=\"main-content\">",
            )?;
        for section_idx in 0..LARGE_SECTIONS {
            render_large_section_raw(cx, section_idx)?;
        }
        cx.out.extend_static(
            b"</main><footer class=\"footer\"><p>Rendered with Proa SSR</p></footer></body></html>",
        )
    }
}
#[inline(always)]
fn render_large_section_raw<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    section_idx: usize,
) -> Result<(), proa_core::WriteError> {
    cx.out
        .extend_static(b"<section class=\"card-section\" data-section=\"")?;
    if section_idx.is_multiple_of(2) {
        cx.out.extend_static(b"even\">")?;
    } else {
        cx.out.extend_static(b"odd\">")?;
    }
    cx.out.extend_static(b"<h2 class=\"section-title\">")?;
    cx.out.extend_static(match section_idx {
        0 => b"Performance Metrics" as &[u8],
        1 => b"Rendering Speed",
        2 => b"Memory Efficiency",
        _ => b"Framework Comparison",
    })?;
    cx.out.extend_static(b"</h2><div class=\"card-grid\">")?;
    for card_idx in 0..LARGE_CARDS {
        render_large_card_raw(cx, card_idx)?;
    }
    cx.out.extend_static(b"</div></section>")
}
#[inline(always)]
fn render_large_card_raw<B: WriteBuf, L: ::proa_core::DataLoader>(
    cx: &mut WebContext<L, B>,
    card_idx: usize,
) -> Result<(), proa_core::WriteError> {
    cx.out
        .extend_static(b"<article class=\"card\" data-card-id=\"")?;
    if card_idx.is_multiple_of(2) {
        cx.out.extend_static(b"even\">")?;
    } else {
        cx.out.extend_static(b"odd\">")?;
    }
    cx.out
        .extend_static(
            b"<div class=\"card-header\"><img src=\"/images/benchmark.png\" alt=\"Benchmark chart\" class=\"card-image\"></div><div class=\"card-body\"><h3 class=\"card-title\">",
        )?;
    cx.out.extend_static(match card_idx % 4 {
        0 => b"Latency Analysis" as &[u8],
        1 => b"Throughput Metrics",
        2 => b"Memory Usage",
        _ => b"CPU Utilization",
    })?;
    cx.out
        .extend_static(
            b"</h3><p class=\"card-description\">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p><ul class=\"feature-list\">",
        )?;
    for item_idx in 0..LARGE_ITEMS {
        cx.out.extend_static(b"<li class=\"feature-item\">")?;
        cx.out.extend_static(match item_idx {
            0 => b"Sub-millisecond response times" as &[u8],
            1 => b"Zero-copy rendering pipeline",
            2 => b"SIMD-accelerated escaping",
            3 => b"Pre-allocated buffers",
            4 => b"Minimal heap allocations",
            5 => b"Compile-time template optimization",
            6 => b"Native machine code rendering",
            _ => b"Flat tail latency under load",
        })?;
        cx.out.extend_static(b"</li>")?;
    }
    cx.out.extend_static(
        b"</ul><button class=\"btn-primary\" type=\"button\">View Details</button></div></article>",
    )
}
