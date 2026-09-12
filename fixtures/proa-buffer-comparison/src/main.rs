use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{hint::black_box, time::Instant};

// Reuse the exact original response owners and JSON canonicalization.
#[allow(dead_code)]
mod baseline {
    include!("../../airbnb-parity-dump/src/main.rs");
    pub fn render(page: &str) -> String {
        render_page(page)
    }
    pub fn hash(html: &str) -> String {
        canonical_document_sha256(html)
    }
}
#[path = "../../airbnb-parity-dump/src/memcpy.rs"]
mod memcpy;
mod preallocated;

// Compile the existing core workload definitions directly; no peer renderer
// runs in this fixture. The product module's Topcoat dependency is compile-only.
#[allow(dead_code)]
#[path = "../../../rendering/src/proa_page.rs"]
mod core_cards;
#[allow(dead_code)]
#[path = "../../../rendering/src/topcoat_product_grid.rs"]
mod core_products;
#[allow(dead_code)]
#[path = "../../../rendering/src/data_table_page.rs"]
mod core_table;
const CARDS_PER_SECTION: usize = 8;
const NUM_SECTIONS: usize = 4;
const ITEMS_PER_CARD: usize = 5;
fn table_rows() -> &'static [core_table::Row] {
    static ROWS: std::sync::OnceLock<Vec<core_table::Row>> = std::sync::OnceLock::new();
    ROWS.get_or_init(|| core_table::build_dataset(1_000))
}
fn products() -> &'static [core_products::Product] {
    static PRODUCTS: std::sync::OnceLock<Vec<core_products::Product>> = std::sync::OnceLock::new();
    PRODUCTS.get_or_init(|| core_products::make_products(96))
}
fn render_into_vec<R: proa_core::WebRenderSync<proa_core::NoLoader, Vec<u8>>>(
    target: &mut Vec<u8>,
    root: R,
) {
    let mut output = std::mem::take(target);
    output.clear();
    let mut cx = proa_core::WebContext::with_buffer(output);
    root.render(&mut cx).unwrap();
    *target = cx.into_output();
}

fn standard(page: &str) -> String {
    match page {
        "core-cards" => core_cards::render_safetext_owned(),
        "core-products" => core_products::render_proa(products()),
        "core-table" => core_table::render_to_string(table_rows()),
        _ => baseline::render(page),
    }
}

#[derive(Serialize)]
struct Report {
    page: String,
    mode: String,
    warmup: usize,
    iterations: usize,
    operations_per_sample: usize,
    output_bytes: usize,
    output_sha256: String,
    canonical_output_sha256: String,
    parity_pass: bool,
    initial_capacity: Option<usize>,
    final_capacity: Option<usize>,
    p50_us: f64,
    raw_ns: Vec<u64>,
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    assert_eq!(
        args.len(),
        4,
        "usage: proa_buffer_comparison PAGE MODE WARMUP ITERATIONS"
    );
    let page = &args[0];
    let mode = &args[1];
    assert!(["render", "preallocated", "memcpy"].contains(&mode.as_str()));
    let warmup: usize = args[2].parse().unwrap();
    let iterations: usize = args[3].parse().unwrap();
    assert!(iterations > 0);
    let reference = standard(page);
    let output_bytes = reference.len();
    let reference_hash = baseline::hash(&reference);
    let sample = if mode == "preallocated" {
        preallocated::render(page, output_bytes)
    } else {
        standard(page)
    };
    assert_eq!(sample.len(), output_bytes, "output size changed");
    assert_eq!(
        baseline::hash(&sample),
        reference_hash,
        "rendered document changed"
    );
    let final_capacity = (mode == "preallocated").then_some(sample.capacity());
    if let Some(capacity) = final_capacity {
        assert_eq!(capacity, output_bytes, "output buffer grew");
    }
    let output_sha256 = format!("{:x}", Sha256::digest(sample.as_bytes()));
    drop(sample);
    let (operations_per_sample, raw_ns) = if mode == "memcpy" {
        memcpy::samples(reference.as_bytes(), warmup, iterations)
    } else {
        drop(reference);
        let render = || {
            if mode == "preallocated" {
                preallocated::render(page, black_box(output_bytes))
            } else {
                standard(page)
            }
        };
        for _ in 0..warmup {
            black_box(render());
        }
        let mut samples = Vec::with_capacity(iterations);
        for _ in 0..iterations {
            let start = Instant::now();
            let html = render();
            samples.push(start.elapsed().as_nanos() as u64);
            // Response destruction and checks are outside both timed paths.
            assert_eq!(html.len(), output_bytes);
            if mode == "preallocated" {
                assert_eq!(html.capacity(), output_bytes);
            }
            black_box(html);
        }
        (1, samples)
    };
    let mut sorted = raw_ns.clone();
    sorted.sort_unstable();
    let p50_us = sorted[iterations.div_ceil(2) - 1] as f64 / 1_000.0 / operations_per_sample as f64;
    let report = Report {
        page: page.clone(),
        mode: mode.clone(),
        warmup,
        iterations,
        operations_per_sample,
        output_bytes,
        output_sha256,
        canonical_output_sha256: reference_hash,
        parity_pass: true,
        initial_capacity: (mode == "preallocated").then_some(output_bytes),
        final_capacity,
        p50_us,
        raw_ns,
    };
    println!("{}", serde_json::to_string(&report).unwrap());
}
