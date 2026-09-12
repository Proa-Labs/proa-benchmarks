//! Compare the existing eBay response owner with RenderBuffer::into_string.
//! Both paths render every card and allocate a fresh response on every call.
use proa_core::{RenderBuffer, WebContext, WebRenderSync};
#[cfg(not(experiment_srp))]
use proa_showcase::ebay::srp;
#[cfg(experiment_srp)]
include!(env!("EXPERIMENT_SRP_MODULE"));
use sha2::{Digest, Sha256};
use srp::{Listing, ListingsList};
use std::{hint::black_box, time::Instant};

#[path = "../../fixtures/airbnb-parity-dump/src/memcpy.rs"]
mod memcpy;

fn render(listings: &[Listing], mode: &str, capacity: usize) -> String {
    match mode {
        "default" => srp::render_listings_to_string(listings),
        "owned" => {
            let mut output = RenderBuffer::new();
            srp::render_listings_into_chained(listings, &mut output);
            output.into_string()
        }
        "full-default" | "full-owned" => {
            let mut output = Vec::with_capacity(capacity);
            ListingsList { listings }
                .render(&mut WebContext::with_buffer(&mut output))
                .unwrap();
            if mode == "full-default" {
                String::from_utf8(output).unwrap()
            } else {
                debug_assert!(std::str::from_utf8(&output).is_ok());
                // SAFETY: ListingsList writes typed HTML, UTF-8 strings and
                // ASCII number/attribute formatters. This is the same output
                // invariant used by RenderBuffer::into_string above.
                unsafe { String::from_utf8_unchecked(output) }
            }
        }
        _ => panic!("unknown render mode {mode}"),
    }
}

fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 3, "MODE WARMUP ITERATIONS");
    let mode = &args[0];
    let warmup: usize = args[1].parse().unwrap();
    let iterations: usize = args[2].parse().unwrap();
    let listings = srp::default_listings(60);
    let reference = srp::render_listings_to_string(listings);
    let output_bytes = reference.len();
    let output_sha256 = format!("{:x}", Sha256::digest(reference.as_bytes()));
    let (operations_per_sample, raw_ns) = if mode == "memcpy" {
        memcpy::samples(reference.as_bytes(), warmup, iterations)
    } else {
        let probe = render(listings, mode, output_bytes);
        assert_eq!(probe, reference, "response changed");
        if mode.starts_with("full-") {
            assert_eq!(probe.capacity(), output_bytes, "full-size buffer grew");
        }
        drop(probe);
        for _ in 0..warmup {
            black_box(render(
                black_box(listings),
                black_box(mode),
                black_box(output_bytes),
            ));
        }
        let mut samples = Vec::with_capacity(iterations);
        for _ in 0..iterations {
            let start = Instant::now();
            let html = render(
                black_box(listings),
                black_box(mode),
                black_box(output_bytes),
            );
            black_box(&html);
            let elapsed = start.elapsed().as_nanos() as u64;
            assert_eq!(html.len(), output_bytes);
            if mode.starts_with("full-") {
                assert_eq!(html.capacity(), output_bytes, "full-size buffer grew");
            }
            samples.push(elapsed);
            // Response destruction is outside timing, matching figure 05.
            drop(html);
        }
        assert_eq!(render(listings, mode, output_bytes), reference);
        (1, samples)
    };
    let mut sorted = raw_ns.clone();
    sorted.sort_unstable();
    let p50_us = sorted[iterations.div_ceil(2) - 1] as f64 / 1_000.0 / operations_per_sample as f64;
    println!(
        "{}",
        serde_json::json!({
            "mode": mode, "warmup": warmup, "iterations": iterations,
            "output_bytes": output_bytes, "output_sha256": output_sha256,
            "parity_pass": true, "operations_per_sample": operations_per_sample,
            "exact_capacity_pass": mode.starts_with("full-").then_some(true),
            "p50_us": p50_us, "raw_ns": raw_ns,
        })
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;

    #[test]
    fn owned_paths_match_checked_output_for_unicode_and_escaping() {
        for count in [0, 1, 2, 60] {
            let mut listings = srp::build_listings(count);
            for listing in &mut listings {
                listing.title = Cow::Borrowed("<script> & \"quotes\" ' 💙 café 中文\0\u{a0}");
                listing.seller_name = Cow::Borrowed("seller <>&\"' 💙");
                listing.location = Cow::Borrowed("東京 & Montréal");
                listing.item_id = u64::MAX;
                listing.review_count = u32::MAX;
            }
            let mut checked_bytes = Vec::new();
            srp::render_listings_into(&listings, &mut checked_bytes);
            let checked = String::from_utf8(checked_bytes).unwrap();
            for mode in ["owned", "full-default", "full-owned"] {
                assert_eq!(
                    render(&listings, mode, checked.len()),
                    checked,
                    "{count}/{mode}"
                );
            }
        }
    }
}
