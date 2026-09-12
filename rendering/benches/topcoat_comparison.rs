//! Proa versus Topcoat on Topcoat's own flagship product-grid workload.
//!
//! Topcoat's upstream Criterion benchmark builds a `View` once, outside the
//! timed loop, and measures only repeated `View::render` serialization. This
//! suite retains that row and adds the full build-plus-render path used by
//! dynamic requests. Proa is measured both with fresh owned output and its
//! production-style reusable chained writer.

use std::time::Duration;

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use proa_bench::topcoat_product_grid::{
    build_topcoat_view, make_products, render_proa, render_topcoat, ProaProductGrid,
};
use proa_core::stack::ChainedBumpWriter;

fn bench_product_grid(c: &mut Criterion) {
    let cx = topcoat::context::Cx::default();
    let mut group = c.benchmark_group("topcoat_upstream_product_grid");
    group.sample_size(30);
    group.measurement_time(Duration::from_secs(5));

    for count in [12usize, 96, 768] {
        let products = make_products(count);
        let topcoat_view = build_topcoat_view(&cx, &products);
        let topcoat_html = topcoat_view.render(&cx);
        let proa_html = render_proa(&products);
        assert_eq!(topcoat_html, proa_html, "output mismatch at {count} cards");

        eprintln!(
            "Topcoat parity workload: {count} cards, {} output bytes",
            proa_html.len()
        );
        group.throughput(Throughput::Bytes(proa_html.len() as u64));

        group.bench_with_input(
            BenchmarkId::new("proa_owned_full", count),
            &products,
            |b, products| {
                b.iter(|| {
                    let html = render_proa(black_box(products));
                    black_box(html.as_bytes());
                });
            },
        );

        group.bench_with_input(
            BenchmarkId::new("proa_reused_chained_full", count),
            &products,
            |b, products| {
                let mut buffer = ChainedBumpWriter::<{ 32 * 1024 }>::new();
                b.iter(|| {
                    buffer.render_into(ProaProductGrid::new(black_box(products)));
                    for slice in buffer.slices() {
                        black_box(slice);
                    }
                });
            },
        );

        group.bench_function(BenchmarkId::new("topcoat_cached_view_render", count), |b| {
            b.iter(|| {
                let html = black_box(&topcoat_view).render(black_box(&cx));
                black_box(html.as_bytes());
            });
        });

        group.bench_with_input(
            BenchmarkId::new("topcoat_build_view_only", count),
            &products,
            |b, products| {
                b.iter(|| black_box(build_topcoat_view(black_box(&cx), black_box(products))));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("topcoat_build_view_and_render", count),
            &products,
            |b, products| {
                b.iter(|| {
                    let html = render_topcoat(black_box(&cx), black_box(products));
                    black_box(html.as_bytes());
                });
            },
        );
    }

    group.finish();
}

criterion_group!(benches, bench_product_grid);
criterion_main!(benches);
