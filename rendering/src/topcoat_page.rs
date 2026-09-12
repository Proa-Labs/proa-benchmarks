//! Topcoat implementation of Proa's standard SSR benchmark page.
//!
//! The markup and data are intentionally kept byte-for-byte equivalent to
//! [`crate::proa_page::SafeTextBenchmarkPage`]. Topcoat has two distinct costs:
//! building its intermediate [`View`] and serializing that view to a `String`.
//! Benchmark both instead of reporting only the cached-view serialization pass.

use topcoat::{
    context::Cx,
    view::{view, View},
    Result,
};

use crate::{CARDS_PER_SECTION, ITEMS_PER_CARD, NUM_SECTIONS};

/// Build Topcoat's intermediate view for the standard benchmark page.
pub async fn build(cx: &Cx) -> Result {
    view! {
        cx =>
        <html lang="en">
            <head>
                <title>"SSR Benchmark Page"</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
            </head>
            <body>
                <header class="hero-section">
                    <h1 class="title">"SSR Framework Benchmark"</h1>
                    <p class="subtitle">"Comparing Proa, Leptos, Dioxus, and Yew"</p>
                </header>
                <main class="main-content">
                    for section_idx in 0..NUM_SECTIONS {
                        <section
                            class="card-section"
                            data-section=(if section_idx.is_multiple_of(2) { "even" } else { "odd" })
                        >
                            <h2 class="section-title">
                                (match section_idx {
                                    0 => "Performance Metrics",
                                    1 => "Rendering Speed",
                                    2 => "Memory Efficiency",
                                    _ => "Framework Comparison",
                                })
                            </h2>
                            <div class="card-grid">
                                for card_idx in 0..CARDS_PER_SECTION {
                                    <article
                                        class="card"
                                        data-card-id=(if card_idx.is_multiple_of(2) { "even" } else { "odd" })
                                    >
                                        <div class="card-header">
                                            <img
                                                src="/images/benchmark.png"
                                                alt="Benchmark chart"
                                                class="card-image"
                                            >
                                        </div>
                                        <div class="card-body">
                                            <h3 class="card-title">
                                                (match card_idx % 4 {
                                                    0 => "Latency Analysis",
                                                    1 => "Throughput Metrics",
                                                    2 => "Memory Usage",
                                                    _ => "CPU Utilization",
                                                })
                                            </h3>
                                            <p class="card-description">
                                                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
                                            </p>
                                            <ul class="feature-list">
                                                for item_idx in 0..ITEMS_PER_CARD {
                                                    <li class="feature-item">
                                                        (match item_idx {
                                                            0 => "Sub-millisecond response times",
                                                            1 => "Zero-copy rendering pipeline",
                                                            2 => "SIMD-accelerated escaping",
                                                            3 => "Pre-allocated buffers",
                                                            _ => "Minimal heap allocations",
                                                        })
                                                    </li>
                                                }
                                            </ul>
                                            <button class="btn-primary" type="button">
                                                "View Details"
                                            </button>
                                        </div>
                                    </article>
                                }
                            </div>
                        </section>
                    }
                </main>
                <footer class="footer"><p>"Rendered by the SSR benchmark fixture"</p></footer>
            </body>
        </html>
    }
}

/// Build a view and drive its immediately-ready future to completion.
#[inline]
pub fn build_now(cx: &Cx) -> View {
    futures::executor::block_on(build(cx)).expect("Topcoat benchmark view should build")
}

/// Build and serialize one complete Topcoat page.
#[inline]
pub fn render(cx: &Cx) -> String {
    build_now(cx).render(cx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_matches_proa_byte_for_byte() {
        let cx = Cx::default();
        let topcoat = render(&cx);
        let mut proa = Vec::new();
        crate::proa_page::render_safetext_into(&mut proa);

        assert_eq!(topcoat.as_bytes(), proa);
    }
}
