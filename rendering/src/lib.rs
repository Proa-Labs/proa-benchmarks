//! Reproducible SSR comparisons between Proa and peer renderers.
//!
//! Proa-only regression guards stay in the framework repository. This crate
//! owns cross-framework fixtures, parity gates, and comparison evidence.

pub mod askama_airbnb_search;
pub mod askama_page;
#[cfg(feature = "topcoat")]
pub mod canonical_template_engines;
pub mod data_table_page;
pub mod dioxus_page;
pub mod ebay_srp_page;
pub mod ebay_srp_real;
#[cfg(feature = "http-load")]
pub mod http_load;
pub mod integer_serialization;
pub mod leptos_page;
pub mod proa_airbnb_search;
pub mod proa_page;
#[cfg(feature = "topcoat")]
pub mod representative_suite;
pub mod sailfish_airbnb_home;
pub mod sailfish_airbnb_listing;
pub mod sailfish_airbnb_search;
pub mod sailfish_page;
pub mod targeted_bench;
#[cfg(feature = "topcoat")]
pub mod topcoat_page;
#[cfg(feature = "topcoat")]
pub mod topcoat_product_grid;
pub mod yew_page;

/// Number of cards per section in the benchmark page
pub const CARDS_PER_SECTION: usize = 8;
/// Number of sections in the benchmark page
pub const NUM_SECTIONS: usize = 4;
/// Number of list items per card
pub const ITEMS_PER_CARD: usize = 5;

/// Reuse a `Vec<u8>` for benchmark cases that intentionally measure the
/// lower-level custom-writer path instead of Proa's standard `RenderBuffer`.
pub fn render_into_vec<R>(target: &mut Vec<u8>, root: R)
where
    R: proa_core::WebRenderSync<proa_core::NoLoader, Vec<u8>>,
{
    let mut buffer = std::mem::take(target);
    buffer.clear();
    let mut cx = proa_core::WebContext::with_buffer(buffer);
    root.render(&mut cx).unwrap();
    *target = cx.into_output();
}
