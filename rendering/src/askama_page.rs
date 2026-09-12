//! Askama benchmark page implementation
//!
//! Askama is a type-safe, compiled Jinja-like template engine for Rust.

use askama::Template;

use crate::{CARDS_PER_SECTION, ITEMS_PER_CARD, NUM_SECTIONS};

#[derive(Template)]
#[template(path = "benchmark.html")]
pub struct BenchmarkPage {
    num_sections: usize,
    cards_per_section: usize,
    items_per_card: usize,
}

impl Default for BenchmarkPage {
    fn default() -> Self {
        Self {
            num_sections: NUM_SECTIONS,
            cards_per_section: CARDS_PER_SECTION,
            items_per_card: ITEMS_PER_CARD,
        }
    }
}

/// Render the benchmark page to a String
pub fn render() -> String {
    BenchmarkPage::default()
        .render()
        .expect("template render failed")
}
