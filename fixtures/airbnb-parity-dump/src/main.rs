// Copyright Proa Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use std::hint::black_box;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use proa_core::{RenderBuffer, WebContext, WebRenderSync};
use serde::Serialize;
use sha2::{Digest, Sha256};

mod memcpy;

const PAGE_NAMES: &[&str] = &[
    "airbnb-parity",
    "airbnb-home",
    "airbnb-search",
    "airbnb-listing",
    "nike-catalog",
    "nike-product",
    "ebay-cards",
    "ebay-chrome",
    "ebay-real-chrome",
    "espn",
    "sentry-otel",
    "settings-console",
];

#[derive(Serialize)]
struct BenchmarkReport {
    schema_version: u32,
    generated_unix_seconds: u64,
    pages: Vec<PageReport>,
}

#[derive(Serialize)]
struct PageReport {
    page: String,
    mode: &'static str,
    operations_per_sample: usize,
    warmup: usize,
    iterations: usize,
    output_bytes: usize,
    output_sha256: String,
    canonical_output_sha256: String,
    mean_us: f64,
    p50_us: f64,
    p95_us: f64,
    p99_us: f64,
    min_us: f64,
    max_us: f64,
    raw_ns: Vec<u64>,
}

fn main() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        None => print!("{}", render_page("airbnb-parity")),
        Some("--page") => {
            let Some(page) = args.next() else {
                usage();
            };
            reject_extra_args(args);
            print!("{}", render_page(&page));
        }
        Some("--list-pages") => {
            reject_extra_args(args);
            for page in PAGE_NAMES {
                println!("{page}");
            }
        }
        Some("--list-assets") => {
            reject_extra_args(args);
            print_asset_ids();
        }
        Some("--bench") => run_benchmark(args.collect()),
        Some("--runtime") => print!("{}", rsjs::runtime_assets::CORE_JS),
        Some("--query-runtime") => print!("{}", rsjs::runtime_assets::QUERY_JS),
        Some("--asset") => {
            let Some(asset_id) = args.next() else {
                usage();
            };
            reject_extra_args(args);
            print_asset(&asset_id);
        }
        Some(_) => usage(),
    }
}

fn render_page(page: &str) -> String {
    match page {
        "airbnb-parity" => proa_showcase::airbnb::parity::render(),
        "airbnb-home" => proa_showcase::airbnb::home::render(),
        "airbnb-search" => proa_showcase::airbnb::search::render(),
        "airbnb-listing" => proa_showcase::airbnb::listing::render(),
        "nike-catalog" => proa_showcase::nike::catalog::render(),
        "nike-product" => proa_showcase::nike::product::render(),
        "ebay-cards" => {
            let listings = proa_showcase::ebay::srp::default_listings(60);
            proa_showcase::ebay::srp::render_listings_to_string(listings)
        }
        "ebay-chrome" => {
            let listings = proa_showcase::ebay::srp::default_listings(60);
            proa_showcase::ebay::srp_chrome::render_document(
                proa_showcase::ebay::srp_chrome::DEFAULT_QUERY,
                listings,
                proa_showcase::ebay::srp::ListingsList { listings },
                (),
            )
        }
        "ebay-real-chrome" => {
            let listings = proa_showcase::ebay::srp::default_listings(60);
            proa_showcase::ebay::srp_chrome_real::render_document(
                proa_showcase::ebay::srp_chrome_real::DEFAULT_QUERY,
                listings,
                proa_showcase::ebay::srp::ListingsList { listings },
                (),
            )
        }
        "espn" => proa_showcase::espn::render(),
        "sentry-otel" => {
            proa_showcase::sentry_otel::render_rows(proa_showcase::sentry_otel::DEFAULT_ROW_COUNT)
        }
        "settings-console" => render_settings_console(),
        _ => {
            eprintln!(
                "unknown showcase page {page:?}; expected one of {}",
                PAGE_NAMES.join(", ")
            );
            std::process::exit(2);
        }
    }
}

fn render_settings_console() -> String {
    let mut out = RenderBuffer::new();
    let (artifacts, nonce) = {
        let mut cx = WebContext::with_buffer(&mut out);
        proa_showcase::settings_console::SettingsConsole {
            audit_events: proa_showcase::settings_console::AUDIT_EVENTS,
        }
        .render(&mut cx)
        .expect("settings console should render");
        (cx.rsjs_artifacts_snapshot(), cx.csp_nonce_cloned())
    };

    let plan = rsjs::manifest()
        .page_runtime_plan(artifacts.rendered_islands())
        .expect("settings console island should exist in the linked RSJS manifest");
    let mut tags = Vec::new();
    plan.write_html(&mut tags, nonce.as_ref())
        .expect("settings console runtime plan should render");

    let mut html = out.into_string();
    let body_end = html
        .rfind("</body>")
        .expect("settings console should render a complete HTML document");
    html.insert_str(
        body_end,
        std::str::from_utf8(&tags).expect("RSJS runtime plan should be valid UTF-8"),
    );
    html
}

fn page_defaults(page: &str) -> (usize, usize) {
    if page == "sentry-otel" {
        (100, 300)
    } else {
        (1_000, 10_000)
    }
}

fn run_benchmark(args: Vec<String>) {
    let mut page = "all".to_owned();
    let mut mode = "render";
    let mut warmup_override = None;
    let mut iterations_override = None;
    let mut output = None;

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--page" => page = take_value(&args, &mut index, "--page"),
            "--mode" => {
                mode = match take_value(&args, &mut index, "--mode").as_str() {
                    "render" => "render",
                    "memcpy" => "memcpy",
                    _ => {
                        eprintln!("--mode requires render or memcpy");
                        usage();
                    }
                };
            }
            "--warmup" => {
                warmup_override = Some(parse_usize(
                    &take_value(&args, &mut index, "--warmup"),
                    "--warmup",
                ));
            }
            "--iterations" => {
                iterations_override = Some(parse_usize(
                    &take_value(&args, &mut index, "--iterations"),
                    "--iterations",
                ));
            }
            "--out" => output = Some(PathBuf::from(take_value(&args, &mut index, "--out"))),
            other => {
                eprintln!("unknown benchmark argument: {other}");
                usage();
            }
        }
        index += 1;
    }

    let selected: Vec<&str> = if page == "all" {
        PAGE_NAMES.to_vec()
    } else if PAGE_NAMES.contains(&page.as_str()) {
        vec![page.as_str()]
    } else {
        eprintln!("unknown showcase page: {page}");
        usage();
    };

    let mut reports = Vec::with_capacity(selected.len());
    for page in selected {
        let (default_warmup, default_iterations) = page_defaults(page);
        let warmup = warmup_override.unwrap_or(default_warmup);
        let iterations = iterations_override.unwrap_or(default_iterations);
        if iterations == 0 {
            eprintln!("--iterations must be greater than zero");
            std::process::exit(2);
        }
        eprintln!("SHOWCASE_BENCH_START page={page} warmup={warmup} iterations={iterations}");
        let report = benchmark_page(page, warmup, iterations, mode);
        eprintln!(
            "SHOWCASE_BENCH_DONE page={} bytes={} mean_us={:.3} p50_us={:.3} p99_us={:.3}",
            report.page, report.output_bytes, report.mean_us, report.p50_us, report.p99_us
        );
        reports.push(report);
    }

    let report = BenchmarkReport {
        schema_version: 2,
        generated_unix_seconds: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        pages: reports,
    };
    let json = serde_json::to_string_pretty(&report).expect("benchmark report should serialize");
    if let Some(path) = output {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create benchmark report directory");
        }
        std::fs::write(&path, format!("{json}\n")).expect("write benchmark report");
        println!("{}", path.display());
    } else {
        println!("{json}");
    }
}

fn benchmark_page(page: &str, warmup: usize, iterations: usize, mode: &'static str) -> PageReport {
    let sample = render_page(page);
    let output_bytes = sample.len();
    let output_sha256 = format!("{:x}", Sha256::digest(sample.as_bytes()));
    let canonical_output_sha256 = canonical_document_sha256(&sample);
    let (operations_per_sample, raw_ns) = if mode == "memcpy" {
        memcpy::samples(sample.as_bytes(), warmup, iterations)
    } else {
        drop(sample);
        for _ in 0..warmup {
            black_box(render_page(page));
        }
        let mut raw_ns = Vec::with_capacity(iterations);
        for _ in 0..iterations {
            let start = Instant::now();
            let html = render_page(page);
            raw_ns.push(start.elapsed().as_nanos() as u64);
            black_box(html);
        }
        (1, raw_ns)
    };

    let mut sorted = raw_ns.clone();
    sorted.sort_unstable();
    let mean_ns = raw_ns.iter().map(|&value| value as f64).sum::<f64>() / raw_ns.len() as f64;
    let to_us = |value: f64| value / 1_000.0 / operations_per_sample as f64;

    PageReport {
        page: page.to_owned(),
        mode,
        operations_per_sample,
        warmup,
        iterations,
        output_bytes,
        output_sha256,
        canonical_output_sha256,
        mean_us: to_us(mean_ns),
        p50_us: to_us(percentile(&sorted, 0.50) as f64),
        p95_us: to_us(percentile(&sorted, 0.95) as f64),
        p99_us: to_us(percentile(&sorted, 0.99) as f64),
        min_us: to_us(sorted[0] as f64),
        max_us: to_us(sorted[sorted.len() - 1] as f64),
        raw_ns,
    }
}

/// Hash a document after sorting keys in embedded application/json payloads.
///
/// HTML bytes remain untouched. This normalization is deliberately narrow:
/// it recognizes only JSON script bodies, where object member order has no
/// semantic meaning. It lets the process orchestrator distinguish harmless
/// `HashMap` serialization order from actual HTML or state drift while still
/// retaining the raw byte hash.
fn canonical_document_sha256(html: &str) -> String {
    const JSON_SCRIPT: &str = "<script type=\"application/json\"";
    const SCRIPT_END: &str = "</script>";

    let mut canonical = String::with_capacity(html.len());
    let mut remaining = html;
    while let Some(script_start) = remaining.find(JSON_SCRIPT) {
        canonical.push_str(&remaining[..script_start]);
        let script = &remaining[script_start..];
        let Some(open_end) = script.find('>') else {
            canonical.push_str(script);
            remaining = "";
            break;
        };
        let content_start = open_end + 1;
        let Some(content_end_relative) = script[content_start..].find(SCRIPT_END) else {
            canonical.push_str(script);
            remaining = "";
            break;
        };
        let content_end = content_start + content_end_relative;
        canonical.push_str(&script[..content_start]);
        match serde_json::from_str::<serde_json::Value>(&script[content_start..content_end]) {
            Ok(value) => write_canonical_json(&value, &mut canonical),
            Err(_) => canonical.push_str(&script[content_start..content_end]),
        }
        canonical.push_str(SCRIPT_END);
        remaining = &script[content_end + SCRIPT_END.len()..];
    }
    canonical.push_str(remaining);
    format!("{:x}", Sha256::digest(canonical.as_bytes()))
}

fn write_canonical_json(value: &serde_json::Value, out: &mut String) {
    match value {
        serde_json::Value::Null => out.push_str("null"),
        serde_json::Value::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
        serde_json::Value::Number(value) => out.push_str(&value.to_string()),
        serde_json::Value::String(value) => {
            out.push_str(&serde_json::to_string(value).expect("JSON string should serialize"));
        }
        serde_json::Value::Array(values) => {
            out.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_canonical_json(value, out);
            }
            out.push(']');
        }
        serde_json::Value::Object(values) => {
            out.push('{');
            let mut keys: Vec<_> = values.keys().collect();
            keys.sort_unstable();
            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).expect("JSON key should serialize"));
                out.push(':');
                write_canonical_json(&values[key], out);
            }
            out.push('}');
        }
    }
}

fn percentile(sorted: &[u64], percentile: f64) -> u64 {
    let index = ((sorted.len() as f64 * percentile).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1);
    sorted[index]
}

fn take_value(args: &[String], index: &mut usize, name: &str) -> String {
    *index += 1;
    args.get(*index).cloned().unwrap_or_else(|| {
        eprintln!("{name} requires a value");
        usage();
    })
}

fn parse_usize(value: &str, name: &str) -> usize {
    value.parse().unwrap_or_else(|_| {
        eprintln!("{name} requires a non-negative integer, got {value:?}");
        std::process::exit(2);
    })
}

fn print_asset(asset_id: &str) {
    let manifest = rsjs::manifest();
    if let Some(island) = manifest
        .islands
        .iter()
        .find(|entry| entry.asset_id == asset_id)
    {
        print!("{}", island.js_source);
        return;
    }
    if let Some(fragment_id) = asset_id.strip_prefix("component_") {
        if let Some(fragment) = manifest
            .component_fragments
            .iter()
            .find(|entry| entry.asset_id == fragment_id)
        {
            print!("{}", fragment.js_source);
            return;
        }
    }
    if let Some(module) = manifest
        .client_modules
        .iter()
        .find(|entry| rsjs::client_module_filename(entry.module_path) == format!("{asset_id}.js"))
    {
        print!("{}", rsjs::client_module_js_source(module));
        return;
    }

    eprintln!("unknown linked RSJS asset: {asset_id}");
    std::process::exit(1);
}

fn print_asset_ids() {
    let manifest = rsjs::manifest();
    for island in manifest.islands.iter() {
        println!("{}", island.asset_id);
    }
    for fragment in manifest.component_fragments.iter() {
        println!("component_{}", fragment.asset_id);
    }
    for module in manifest.client_modules.iter() {
        let filename = rsjs::client_module_filename(module.module_path);
        println!("{}", filename.trim_end_matches(".js"));
    }
}

fn reject_extra_args(mut args: impl Iterator<Item = String>) {
    if let Some(extra) = args.next() {
        eprintln!("unexpected argument: {extra}");
        usage();
    }
}

fn usage() -> ! {
    eprintln!(
        "usage: proa_bench_airbnb_parity_dump \
         [--page <name> | --list-pages | --list-assets | --runtime | --query-runtime | \
         --asset <asset-id> | --bench [--page <name|all>] \
         [--mode <render|memcpy>] [--warmup N] [--iterations N] [--out PATH]]"
    );
    std::process::exit(2);
}
