//! Sailfish benchmark page implementation
//!
//! Sailfish is a compile-time template engine that generates Rust code
//! from template files at compile time.

use sailfish::TemplateOnce;

use crate::{CARDS_PER_SECTION, ITEMS_PER_CARD, NUM_SECTIONS};

#[derive(TemplateOnce)]
#[template(path = "benchmark.stpl")]
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
        .render_once()
        .expect("template render failed")
}
