//! Dioxus benchmark page implementation

use dioxus::prelude::*;

use crate::{CARDS_PER_SECTION, ITEMS_PER_CARD, NUM_SECTIONS};

/// Render the benchmark page to a String using Dioxus SSR
pub fn render() -> String {
    let mut vdom = VirtualDom::new(BenchmarkPage);
    vdom.rebuild_in_place();

    // Dioxus 0.6 deliberately omits the document-level `<html>` tag from its
    // RSX element vocabulary. A full-stack integration supplies that static
    // shell around the rendered app. Write it into the same fresh owned
    // String so the benchmark retains one output allocation policy and does
    // not copy an already-rendered intermediate String.
    // Start with the same empty String used by Dioxus Renderer::render. The
    // adapter supplies no fixture-derived capacity hint.
    // proa-perf-ok: the comparable peer baseline intentionally returns one fresh owned String
    let mut output = String::new();
    // proa-perf-ok: Dioxus 0.6 cannot emit the static document-level html shell
    output.push_str("<html lang=\"en\">");
    dioxus_ssr::Renderer::new()
        .render_to(&mut output, &vdom)
        .expect("Dioxus benchmark render should succeed");
    // proa-perf-ok: close the required static shell in the same owned output
    output.push_str("</html>");
    output
}

#[component]
fn BenchmarkPage() -> Element {
    rsx! {
        head {
            title { "SSR Benchmark Page" }
            meta { name: "viewport", content: "width=device-width, initial-scale=1" }
        }
        body {
            Header {}
            main { class: "main-content",
                for section_idx in 0..NUM_SECTIONS {
                    Section { section_idx }
                }
            }
            Footer {}
        }
    }
}

#[component]
fn Header() -> Element {
    rsx! {
        header { class: "hero-section",
            h1 { class: "title", "SSR Framework Benchmark" }
            p { class: "subtitle", "Comparing Proa, Leptos, Dioxus, and Yew" }
        }
    }
}

#[component]
fn Footer() -> Element {
    rsx! {
        footer { class: "footer",
            p { "Rendered by the SSR benchmark fixture" }
        }
    }
}

#[component]
fn Section(section_idx: usize) -> Element {
    let section_title = match section_idx {
        0 => "Performance Metrics",
        1 => "Rendering Speed",
        2 => "Memory Efficiency",
        _ => "Framework Comparison",
    };
    let data_section = if section_idx % 2 == 0 { "even" } else { "odd" };

    rsx! {
        section { class: "card-section", "data-section": data_section,
            h2 { class: "section-title", "{section_title}" }
            div { class: "card-grid",
                for card_idx in 0..CARDS_PER_SECTION {
                    Card { card_idx }
                }
            }
        }
    }
}

#[component]
fn Card(card_idx: usize) -> Element {
    let card_title = match card_idx % 4 {
        0 => "Latency Analysis",
        1 => "Throughput Metrics",
        2 => "Memory Usage",
        _ => "CPU Utilization",
    };
    let data_card_id = if card_idx % 2 == 0 { "even" } else { "odd" };

    rsx! {
        article { class: "card", "data-card-id": data_card_id,
            div { class: "card-header",
                img { src: "/images/benchmark.png", alt: "Benchmark chart", class: "card-image" }
            }
            div { class: "card-body",
                h3 { class: "card-title", "{card_title}" }
                p { class: "card-description",
                    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
                    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
                }
                FeatureList {}
                button { class: "btn-primary", r#type: "button", "View Details" }
            }
        }
    }
}

#[component]
fn FeatureList() -> Element {
    let features = [
        "Sub-millisecond response times",
        "Zero-copy rendering pipeline",
        "SIMD-accelerated escaping",
        "Pre-allocated buffers",
        "Minimal heap allocations",
    ];

    rsx! {
        ul { class: "feature-list",
            for (idx, feature) in features.iter().take(ITEMS_PER_CARD).enumerate() {
                li { key: "{idx}", class: "feature-item", "{feature}" }
            }
        }
    }
}
