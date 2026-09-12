//! Native integer-to-ASCII scaling matrix with byte-identical output.

use std::time::Duration;

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use proa_bench::integer_serialization::{
    assert_parity, build_rows, render_askama_fresh, render_askama_reused, render_proa_fresh,
    render_proa_reused, render_sailfish_fresh, render_sailfish_reused,
};
use proa_core::WebContext;

const ROW_COUNTS: &[usize] = &[1, 10, 100, 1_000, 10_000];

fn bench_integer_serialization(c: &mut Criterion) {
    let datasets: Vec<_> = ROW_COUNTS
        .iter()
        .map(|&count| {
            let rows = build_rows(count);
            let output_bytes = assert_parity(&rows);
            eprintln!(
                "INTEGER_SERIALIZATION_PREFLIGHT rows={count} bytes={output_bytes} parity=byte-identical"
            );
            (count, rows, output_bytes)
        })
        .collect();

    let mut fresh = c.benchmark_group("integer_serialization_fresh_owned");
    fresh.sample_size(60);
    fresh.warm_up_time(Duration::from_secs(1));
    fresh.measurement_time(Duration::from_secs(3));
    for (count, rows, output_bytes) in &datasets {
        fresh.throughput(Throughput::Bytes(*output_bytes as u64));
        fresh.bench_with_input(BenchmarkId::new("proa", count), rows, |b, rows| {
            b.iter(|| black_box(render_proa_fresh(black_box(rows))));
        });
        fresh.bench_with_input(BenchmarkId::new("askama", count), rows, |b, rows| {
            b.iter(|| black_box(render_askama_fresh(black_box(rows))));
        });
        fresh.bench_with_input(BenchmarkId::new("sailfish", count), rows, |b, rows| {
            b.iter(|| black_box(render_sailfish_fresh(black_box(rows))));
        });
    }
    fresh.finish();

    let mut reused = c.benchmark_group("integer_serialization_reused_contiguous");
    reused.sample_size(60);
    reused.warm_up_time(Duration::from_secs(1));
    reused.measurement_time(Duration::from_secs(3));
    for (count, rows, output_bytes) in &datasets {
        reused.throughput(Throughput::Bytes(*output_bytes as u64));

        let mut proa_context = WebContext::with_buffer(Vec::with_capacity(*output_bytes));
        reused.bench_with_input(BenchmarkId::new("proa", count), rows, |b, rows| {
            b.iter(|| {
                render_proa_reused(black_box(rows), &mut proa_context);
                black_box(proa_context.out.as_slice());
            });
        });

        let mut askama_output = String::with_capacity(*output_bytes);
        reused.bench_with_input(BenchmarkId::new("askama", count), rows, |b, rows| {
            b.iter(|| {
                render_askama_reused(black_box(rows), &mut askama_output);
                black_box(askama_output.as_bytes());
            });
        });

        let mut sailfish_output = sailfish::runtime::Buffer::with_capacity(*output_bytes);
        reused.bench_with_input(BenchmarkId::new("sailfish", count), rows, |b, rows| {
            b.iter(|| {
                render_sailfish_reused(black_box(rows), &mut sailfish_output);
                black_box(sailfish_output.as_str().as_bytes());
            });
        });
    }
    reused.finish();
}

criterion_group!(benches, bench_integer_serialization);
criterion_main!(benches);
