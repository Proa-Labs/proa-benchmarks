//! Yew benchmark page implementation

use yew::prelude::*;
use yew::ServerRenderer;

use crate::{CARDS_PER_SECTION, ITEMS_PER_CARD, NUM_SECTIONS};

/// Render the benchmark page to a String using Yew SSR
pub fn render() -> String {
    futures::executor::block_on(async {
        let renderer = ServerRenderer::<BenchmarkPage>::new();
        renderer.render().await
    })
}

#[function_component(BenchmarkPage)]
fn benchmark_page() -> Html {
    html! {
        <html lang="en">
            <head>
                <title>{"SSR Benchmark Page"}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
            </head>
            <body>
                <Header/>
                <main class="main-content">
                    { for (0..NUM_SECTIONS).map(|idx| html! { <Section section_idx={idx}/> }) }
                </main>
                <Footer/>
            </body>
        </html>
    }
}

#[function_component(Header)]
fn header() -> Html {
    html! {
        <header class="hero-section">
            <h1 class="title">{"SSR Framework Benchmark"}</h1>
            <p class="subtitle">{"Comparing Proa, Leptos, Dioxus, and Yew"}</p>
        </header>
    }
}

#[function_component(Footer)]
fn footer() -> Html {
    html! {
        <footer class="footer">
            <p>{"Rendered by the SSR benchmark fixture"}</p>
        </footer>
    }
}

#[derive(Properties, PartialEq)]
struct SectionProps {
    section_idx: usize,
}

#[function_component(Section)]
fn section(props: &SectionProps) -> Html {
    let section_title = match props.section_idx {
        0 => "Performance Metrics",
        1 => "Rendering Speed",
        2 => "Memory Efficiency",
        _ => "Framework Comparison",
    };
    let data_section = if props.section_idx.is_multiple_of(2) {
        "even"
    } else {
        "odd"
    };

    html! {
        <section class="card-section" data-section={data_section}>
            <h2 class="section-title">{section_title}</h2>
            <div class="card-grid">
                { for (0..CARDS_PER_SECTION).map(|idx| html! { <Card card_idx={idx}/> }) }
            </div>
        </section>
    }
}

#[derive(Properties, PartialEq)]
struct CardProps {
    card_idx: usize,
}

#[function_component(Card)]
fn card(props: &CardProps) -> Html {
    let card_title = match props.card_idx % 4 {
        0 => "Latency Analysis",
        1 => "Throughput Metrics",
        2 => "Memory Usage",
        _ => "CPU Utilization",
    };
    let data_card_id = if props.card_idx.is_multiple_of(2) {
        "even"
    } else {
        "odd"
    };

    html! {
        <article class="card" data-card-id={data_card_id}>
            <div class="card-header">
                <img src="/images/benchmark.png" alt="Benchmark chart" class="card-image"/>
            </div>
            <div class="card-body">
                <h3 class="card-title">{card_title}</h3>
                <p class="card-description">
                    {"Lorem ipsum dolor sit amet, consectetur adipiscing elit. "}
                    {"Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."}
                </p>
                <FeatureList/>
                <button class="btn-primary" type="button">{"View Details"}</button>
            </div>
        </article>
    }
}

#[function_component(FeatureList)]
fn feature_list() -> Html {
    let features = [
        "Sub-millisecond response times",
        "Zero-copy rendering pipeline",
        "SIMD-accelerated escaping",
        "Pre-allocated buffers",
        "Minimal heap allocations",
    ];

    html! {
        <ul class="feature-list">
            { for features.iter().take(ITEMS_PER_CARD).map(|&feature| {
                html! { <li class="feature-item">{feature}</li> }
            }) }
        </ul>
    }
}
