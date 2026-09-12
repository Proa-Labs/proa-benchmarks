//! SSR Benchmark Comparison
//!
//! Benchmarks server-side rendering performance across:
//! - Proa
//! - Sailfish (compile-time template engine)
//! - Leptos
//! - Dioxus
//! - Yew
//!
//! All frameworks render an equivalent page structure with:
//! - 4 sections
//! - 8 cards per section
//! - 5 list items per card
//! - Various HTML elements and attributes

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
#[cfg(feature = "topcoat")]
use proa_bench::topcoat_page;
use proa_bench::{askama_page, dioxus_page, leptos_page, proa_page, sailfish_page, yew_page};
use proa_core::stack::ChainedBumpWriter;

const RENDERS_PER_ITER: u64 = 10;

fn bench_ssr_comparison(c: &mut Criterion) {
    let mut group = c.benchmark_group("ssr_frameworks");
    group.throughput(Throughput::Elements(RENDERS_PER_ITER));

    // Ownership-parity row: component execution and a fresh owned output on
    // every render, matching the public return shape used by the other rows.
    group.bench_function(BenchmarkId::new("proa", "fresh_owned_full"), |b| {
        b.iter(|| {
            for _ in 0..RENDERS_PER_ITER {
                let html = proa_page::render_safetext_owned();
                black_box(html.as_bytes());
            }
        });
    });

    // Production-style reusable-buffer row. Keep it visibly separate from the
    // fresh-owned comparison above; it is an allocation-policy result.
    group.bench_function(BenchmarkId::new("proa", "reused_chained_full"), |b| {
        let mut buffer = ChainedBumpWriter::<{ 32 * 1024 }>::new();
        b.iter(|| {
            for _ in 0..RENDERS_PER_ITER {
                buffer.render_into(proa_page::SafeTextBenchmarkPage);
                for slice in buffer.slices() {
                    black_box(slice);
                }
            }
        });
    });

    // Topcoat's upstream microbenchmark builds a View once and times only
    // View::render. Keep that methodology visible, then also measure the
    // request-relevant path that builds and serializes a fresh View.
    #[cfg(feature = "topcoat")]
    {
        let cx = topcoat::context::Cx::default();
        let view = topcoat_page::build_now(&cx);
        let topcoat_html = view.render(&cx);
        let proa_html = proa_page::render_safetext_owned();
        assert_eq!(
            topcoat_html.as_bytes(),
            proa_html.as_bytes(),
            "Topcoat standard-page output must remain byte-identical to Proa"
        );

        group.bench_function(BenchmarkId::new("topcoat", "cached_view_render"), |b| {
            b.iter(|| {
                for _ in 0..RENDERS_PER_ITER {
                    let html = black_box(&view).render(black_box(&cx));
                    black_box(html.as_bytes());
                }
            });
        });

        group.bench_function(BenchmarkId::new("topcoat", "build_view_and_render"), |b| {
            b.iter(|| {
                for _ in 0..RENDERS_PER_ITER {
                    let html = topcoat_page::render(black_box(&cx));
                    black_box(html.as_bytes());
                }
            });
        });
    }

    // Askama benchmark (compiled Jinja-like templates)
    group.bench_function(BenchmarkId::new("askama", "ssr"), |b| {
        b.iter(|| {
            for _ in 0..RENDERS_PER_ITER {
                let html = askama_page::render();
                black_box(html.as_bytes());
            }
        });
    });

    // Sailfish benchmark (compile-time template engine)
    group.bench_function(BenchmarkId::new("sailfish", "ssr"), |b| {
        b.iter(|| {
            for _ in 0..RENDERS_PER_ITER {
                let html = sailfish_page::render();
                black_box(html.as_bytes());
            }
        });
    });

    // Leptos benchmark
    group.bench_function(BenchmarkId::new("leptos", "ssr"), |b| {
        b.iter(|| {
            for _ in 0..RENDERS_PER_ITER {
                let html = leptos_page::render();
                black_box(html.as_bytes());
            }
        });
    });

    // Dioxus benchmark
    group.bench_function(BenchmarkId::new("dioxus", "ssr"), |b| {
        b.iter(|| {
            for _ in 0..RENDERS_PER_ITER {
                let html = dioxus_page::render();
                black_box(html.as_bytes());
            }
        });
    });

    // Yew benchmark
    group.bench_function(BenchmarkId::new("yew", "ssr"), |b| {
        b.iter(|| {
            for _ in 0..RENDERS_PER_ITER {
                let html = yew_page::render();
                black_box(html.as_bytes());
            }
        });
    });

    group.finish();
}

criterion_group!(benches, bench_ssr_comparison);
criterion_main!(benches);
