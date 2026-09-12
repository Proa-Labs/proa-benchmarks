//! Leptos benchmark page implementation

use leptos::prelude::*;

use crate::{CARDS_PER_SECTION, ITEMS_PER_CARD, NUM_SECTIONS};

/// Render the benchmark page to a String using Leptos SSR
pub fn render() -> String {
    // Leptos 0.7 SSR rendering
    let owner = Owner::new();
    owner.with(|| {
        let view = view! { <BenchmarkPage/> };
        view.to_html()
    })
}

#[component]
fn BenchmarkPage() -> impl IntoView {
    view! {
        <html lang="en">
            <head>
                <title>"SSR Benchmark Page"</title>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
            </head>
            <body>
                <Header/>
                <main class="main-content">
                    {(0..NUM_SECTIONS).map(|idx| view! { <Section section_idx=idx/> }).collect_view()}
                </main>
                <Footer/>
            </body>
        </html>
    }
}

#[component]
fn Header() -> impl IntoView {
    view! {
        <header class="hero-section">
            <h1 class="title">"SSR Framework Benchmark"</h1>
            <p class="subtitle">"Comparing Proa, Leptos, Dioxus, and Yew"</p>
        </header>
    }
}

#[component]
fn Footer() -> impl IntoView {
    view! {
        <footer class="footer">
            <p>"Rendered by the SSR benchmark fixture"</p>
        </footer>
    }
}

#[component]
fn Section(section_idx: usize) -> impl IntoView {
    let section_title = match section_idx {
        0 => "Performance Metrics",
        1 => "Rendering Speed",
        2 => "Memory Efficiency",
        _ => "Framework Comparison",
    };
    let data_section = if section_idx.is_multiple_of(2) {
        "even"
    } else {
        "odd"
    };

    view! {
        <section class="card-section" data-section=data_section>
            <h2 class="section-title">{section_title}</h2>
            <div class="card-grid">
                {(0..CARDS_PER_SECTION).map(|idx| view! { <Card card_idx=idx/> }).collect_view()}
            </div>
        </section>
    }
}

#[component]
fn Card(card_idx: usize) -> impl IntoView {
    let card_title = match card_idx % 4 {
        0 => "Latency Analysis",
        1 => "Throughput Metrics",
        2 => "Memory Usage",
        _ => "CPU Utilization",
    };
    let data_card_id = if card_idx.is_multiple_of(2) {
        "even"
    } else {
        "odd"
    };

    view! {
        <article class="card" data-card-id=data_card_id>
            <div class="card-header">
                <img src="/images/benchmark.png" alt="Benchmark chart" class="card-image"/>
            </div>
            <div class="card-body">
                <h3 class="card-title">{card_title}</h3>
                <p class="card-description">
                    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
                    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
                </p>
                <FeatureList/>
                <button class="btn-primary" type="button">"View Details"</button>
            </div>
        </article>
    }
}

#[component]
fn FeatureList() -> impl IntoView {
    let features = [
        "Sub-millisecond response times",
        "Zero-copy rendering pipeline",
        "SIMD-accelerated escaping",
        "Pre-allocated buffers",
        "Minimal heap allocations",
    ];

    view! {
        <ul class="feature-list">
            {features.iter().take(ITEMS_PER_CARD).map(|&feature| {
                view! { <li class="feature-item">{feature}</li> }
            }).collect_view()}
        </ul>
    }
}
