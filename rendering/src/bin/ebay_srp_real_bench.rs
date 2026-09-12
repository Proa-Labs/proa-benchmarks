//! Bench for the synthetic marketplace listings template (Proa).
//! Renders only the `<li class="s-card">` blocks (the variable workload);
//! the surrounding authored shell is constant for both Proa and Marko.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use proa_bench::ebay_srp_real::{build_listings, render_listings_into};

fn main() {
    let mut listings_n = 60usize;
    let mut iters = 500usize;
    let mut warmup = 50usize;
    let mut out_path: Option<PathBuf> = None;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--listings" => listings_n = args.next().unwrap().parse().unwrap(),
            "--iters" => iters = args.next().unwrap().parse().unwrap(),
            "--warmup" => warmup = args.next().unwrap().parse().unwrap(),
            "--out" => out_path = Some(PathBuf::from(args.next().unwrap())),
            other => panic!("unknown arg: {other}"),
        }
    }

    let out_path = out_path.unwrap_or_else(|| {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("results");
        p.push("ebay_srp_real_proa.json");
        p
    });

    println!("=== Proa Synthetic Marketplace SRP Bench ===");
    println!("  listings: {}", listings_n);
    println!("  warmup:   {}", warmup);
    println!("  iters:    {}", iters);

    let listings = build_listings(listings_n);
    let mut buffer: Vec<u8> = Vec::with_capacity(2 * 1024 * 1024);
    render_listings_into(&listings, &mut buffer);
    let output_bytes = buffer.len();
    println!("  output:   {} bytes", output_bytes);
    println!();

    for _ in 0..warmup {
        render_listings_into(&listings, &mut buffer);
        std::hint::black_box(buffer.len());
    }

    let mut samples = Vec::with_capacity(iters);
    let total_start = Instant::now();
    for _ in 0..iters {
        let start = Instant::now();
        render_listings_into(&listings, &mut buffer);
        samples.push(start.elapsed().as_nanos() as u64);
        std::hint::black_box(buffer.len());
    }
    let total = total_start.elapsed();

    samples.sort_unstable();
    let mean = (samples.iter().sum::<u64>() as f64 / samples.len() as f64) as u64;
    let p = |pct: f64| -> u64 {
        let r = (pct / 100.0) * (samples.len() - 1) as f64;
        let lo = r.floor() as usize;
        let hi = r.ceil() as usize;
        if lo == hi {
            samples[lo]
        } else {
            (samples[lo] as f64 + (samples[hi] - samples[lo]) as f64 * (r - lo as f64)) as u64
        }
    };
    let p50 = p(50.0);
    let p95 = p(95.0);
    let p99 = p(99.0);
    let min = samples[0];
    let max = *samples.last().unwrap();
    let rps = iters as f64 / total.as_secs_f64();
    let to_us = |ns: u64| ns as f64 / 1_000.0;

    println!("=== Latency (per render) ===");
    println!("  min:  {:>9.2} µs", to_us(min));
    println!("  mean: {:>9.2} µs", to_us(mean));
    println!("  p50:  {:>9.2} µs", to_us(p50));
    println!("  p95:  {:>9.2} µs", to_us(p95));
    println!("  p99:  {:>9.2} µs", to_us(p99));
    println!("  max:  {:>9.2} µs", to_us(max));
    println!();
    println!("Throughput: {:.0} renders/sec", rps);

    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let json = format!(
        r#"{{
  "framework": "Proa",
  "language": "Rust",
  "benchmark": "ebay_srp_real",
  "listings": {listings_n},
  "iterations": {iters},
  "warmup": {warmup},
  "output_bytes": {output_bytes},
  "latency_us": {mean_us:.2},
  "min_us": {min_us:.2},
  "mean_us": {mean_us:.2},
  "p50_us": {p50_us:.2},
  "p95_us": {p95_us:.2},
  "p99_us": {p99_us:.2},
  "max_us": {max_us:.2},
  "renders_per_sec": {rps:.0}
}}
"#,
        listings_n = listings_n,
        iters = iters,
        warmup = warmup,
        output_bytes = output_bytes,
        mean_us = to_us(mean),
        min_us = to_us(min),
        p50_us = to_us(p50),
        p95_us = to_us(p95),
        p99_us = to_us(p99),
        max_us = to_us(max),
        rps = rps,
    );
    fs::write(&out_path, json).expect("write json");
    println!("Results written to {}", out_path.display());
}
