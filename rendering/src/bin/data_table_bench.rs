//! Heavy data-table benchmark for Proa.
//!
//! Renders the same 1000-row × 12-column dashboard as the Marko bench,
//! collects per-render timings, and writes a JSON report next to the
//! Marko results so they can be compared apples-to-apples.
//!
//! Run:
//!   cargo run --release -p proa_bench --bin data_table_bench
//!   cargo run --release -p proa_bench --bin data_table_bench -- --rows 500 --iters 200

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use proa_bench::data_table_page::{build_dataset, render_into};

const DEFAULT_ROWS: usize = 1_000;
const DEFAULT_ITERS: usize = 500;
const DEFAULT_WARMUP: usize = 50;

struct Args {
    rows: usize,
    iters: usize,
    warmup: usize,
    out_path: PathBuf,
}

fn parse_args() -> Args {
    let mut rows = DEFAULT_ROWS;
    let mut iters = DEFAULT_ITERS;
    let mut warmup = DEFAULT_WARMUP;
    let mut out_path: Option<PathBuf> = None;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--rows" => rows = args.next().expect("--rows requires value").parse().unwrap(),
            "--iters" => {
                iters = args
                    .next()
                    .expect("--iters requires value")
                    .parse()
                    .unwrap()
            }
            "--warmup" => {
                warmup = args
                    .next()
                    .expect("--warmup requires value")
                    .parse()
                    .unwrap()
            }
            "--out" => out_path = Some(PathBuf::from(args.next().expect("--out requires value"))),
            other => panic!("unknown arg: {other}"),
        }
    }

    let out_path = out_path.unwrap_or_else(|| {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("results");
        p.push("data_table_proa.json");
        p
    });

    Args {
        rows,
        iters,
        warmup,
        out_path,
    }
}

fn percentile(sorted: &[u64], pct: f64) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let rank = (pct / 100.0) * (sorted.len() - 1) as f64;
    let lo = rank.floor() as usize;
    let hi = rank.ceil() as usize;
    if lo == hi {
        sorted[lo]
    } else {
        let frac = rank - lo as f64;
        let lo_v = sorted[lo] as f64;
        let hi_v = sorted[hi] as f64;
        (lo_v + (hi_v - lo_v) * frac) as u64
    }
}

fn main() {
    let args = parse_args();

    println!("=== Proa Data Table Bench ===");
    println!("  rows:   {}", args.rows);
    println!("  warmup: {}", args.warmup);
    println!("  iters:  {}", args.iters);

    let rows = build_dataset(args.rows);

    // Verify output once.
    let mut buffer: Vec<u8> = Vec::with_capacity(1_024 * 1_024);
    render_into(&rows, &mut buffer);
    let output_bytes = buffer.len();
    println!("  output: {} bytes", output_bytes);
    println!(
        "  first 240 chars: {}",
        String::from_utf8_lossy(&buffer[..output_bytes.min(240)])
    );
    println!();

    // Warmup.
    for _ in 0..args.warmup {
        render_into(&rows, &mut buffer);
        std::hint::black_box(buffer.len());
    }

    // Measured run: per-render nanoseconds.
    let mut samples: Vec<u64> = Vec::with_capacity(args.iters);
    let total_start = Instant::now();
    for _ in 0..args.iters {
        let start = Instant::now();
        render_into(&rows, &mut buffer);
        let ns = start.elapsed().as_nanos() as u64;
        std::hint::black_box(buffer.len());
        samples.push(ns);
    }
    let total_elapsed = total_start.elapsed();

    samples.sort_unstable();
    let mean_ns: u64 = (samples.iter().sum::<u64>() as f64 / samples.len() as f64) as u64;
    let p50 = percentile(&samples, 50.0);
    let p95 = percentile(&samples, 95.0);
    let p99 = percentile(&samples, 99.0);
    let max = *samples.last().unwrap();
    let min = *samples.first().unwrap();
    let throughput_per_sec = (args.iters as f64) / total_elapsed.as_secs_f64();

    let to_us = |ns: u64| ns as f64 / 1_000.0;

    println!("=== Latency (per render) ===");
    println!("  min:  {:>9.2} µs", to_us(min));
    println!("  mean: {:>9.2} µs", to_us(mean_ns));
    println!("  p50:  {:>9.2} µs", to_us(p50));
    println!("  p95:  {:>9.2} µs", to_us(p95));
    println!("  p99:  {:>9.2} µs", to_us(p99));
    println!("  max:  {:>9.2} µs", to_us(max));
    println!();
    println!("=== Throughput ===");
    println!(
        "  total:    {:>9.2} ms",
        total_elapsed.as_secs_f64() * 1_000.0
    );
    println!("  per-sec:  {:>9.0} renders/sec", throughput_per_sec);
    println!();

    // Write JSON.
    if let Some(parent) = args.out_path.parent() {
        fs::create_dir_all(parent).expect("create results dir");
    }

    let json = format!(
        r#"{{
  "framework": "Proa",
  "language": "Rust",
  "benchmark": "data_table",
  "rows": {rows},
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
  "renders_per_sec": {rps:.0},
  "timestamp": "{ts}"
}}
"#,
        rows = args.rows,
        iters = args.iters,
        warmup = args.warmup,
        output_bytes = output_bytes,
        mean_us = to_us(mean_ns),
        min_us = to_us(min),
        p50_us = to_us(p50),
        p95_us = to_us(p95),
        p99_us = to_us(p99),
        max_us = to_us(max),
        rps = throughput_per_sec,
        ts = iso_now(),
    );

    fs::write(&args.out_path, json).expect("write results json");
    println!("Results written to {}", args.out_path.display());
}

fn iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Quick civil-from-days inline (mirror data_table_page::civil_from_days).
    let days = (secs / 86_400) as i64;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };
    let h = (secs % 86_400) / 3_600;
    let mi = (secs % 3_600) / 60;
    let s = secs % 60;
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}
