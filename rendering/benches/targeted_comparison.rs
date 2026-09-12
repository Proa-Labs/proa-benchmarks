//! Targeted benchmarks: Proa vs Askama in scenarios that stress Askama's weaknesses
//!
//! 1. Heavy escaping — SIMD memchr3 vs byte-by-byte scanning
//! 2. Large pages — 100KB+ output, buffer growth matters
//! 3. Buffer reuse — simulating production server request patterns
//!
//! All Proa "reuse" benchmarks use `RenderBuffer` for consistency.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use proa_bench::targeted_bench;
use proa_core::{RenderBuffer, WebContext, WebRenderSync, WriteBuf};

fn bench_escape_heavy(c: &mut Criterion) {
    let mut group = c.benchmark_group("escape_heavy");

    // Verify output sizes are comparable
    let proa_html = targeted_bench::proa_escape_render();
    let askama_html = targeted_bench::askama_escape_render();
    eprintln!(
        "Escape benchmark output sizes — Proa: {} bytes, Askama: {} bytes",
        proa_html.len(),
        askama_html.len()
    );

    // Proa: RenderBuffer reuse (production path)
    group.bench_function("proa_reuse", |b| {
        let mut buf = RenderBuffer::new();
        b.iter(|| {
            buf.clear();
            {
                let mut cx = WebContext::with_buffer(&mut buf);
                targeted_bench::ProaEscapePage.render(&mut cx).unwrap();
            }
            black_box(buf.page_count())
        });
    });

    // Proa: fresh alloc (fair comparison)
    group.bench_function("proa_fresh", |b| {
        b.iter(|| {
            let html = targeted_bench::proa_escape_render();
            black_box(html.len())
        });
    });

    // Askama: always fresh String
    group.bench_function("askama", |b| {
        b.iter(|| {
            let html = targeted_bench::askama_escape_render();
            black_box(html.len())
        });
    });

    group.finish();
}

fn bench_large_page(c: &mut Criterion) {
    let mut group = c.benchmark_group("large_page");

    // Verify output sizes
    let proa_html = targeted_bench::proa_large_render();
    let askama_html = targeted_bench::askama_large_render();
    eprintln!(
        "Large page output sizes — Proa: {} bytes, Askama: {} bytes",
        proa_html.len(),
        askama_html.len()
    );

    // Proa: RenderBuffer reuse (production path)
    group.bench_function("proa_reuse", |b| {
        let mut buf = RenderBuffer::new();
        b.iter(|| {
            buf.clear();
            {
                let mut cx = WebContext::with_buffer(&mut buf);
                targeted_bench::ProaLargePage.render(&mut cx).unwrap();
            }
            black_box(buf.page_count())
        });
    });

    // Proa: fresh alloc
    group.bench_function("proa_fresh", |b| {
        b.iter(|| {
            let html = targeted_bench::proa_large_render();
            black_box(html.len())
        });
    });

    // Askama: always fresh String
    group.bench_function("askama", |b| {
        b.iter(|| {
            let html = targeted_bench::askama_large_render();
            black_box(html.len())
        });
    });

    group.finish();
}

fn bench_request_burst(c: &mut Criterion) {
    let mut group = c.benchmark_group("request_burst");

    // Simulate 100 sequential requests (production server pattern)
    const REQUESTS: usize = 100;

    // Proa: RenderBuffer reuse across all requests
    group.bench_function("proa_100req", |b| {
        let mut buf = RenderBuffer::new();
        b.iter(|| {
            for _ in 0..REQUESTS {
                buf.render_into(proa_bench::proa_page::SafeTextBenchmarkPage);
                black_box(buf.page_count());
            }
        });
    });

    // Askama: fresh String every request (the only option)
    group.bench_function("askama_100req", |b| {
        b.iter(|| {
            for _ in 0..REQUESTS {
                let html = proa_bench::askama_page::render();
                black_box(html.len());
            }
        });
    });

    // Sailfish: fresh String every request
    group.bench_function("sailfish_100req", |b| {
        b.iter(|| {
            for _ in 0..REQUESTS {
                let html = proa_bench::sailfish_page::render();
                black_box(html.len());
            }
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_escape_heavy,
    bench_large_page,
    bench_request_burst,
);
criterion_main!(benches);
