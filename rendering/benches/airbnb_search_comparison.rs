use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_airbnb_search(c: &mut Criterion) {
    let mut group = c.benchmark_group("airbnb_search");

    // Print output sizes
    let sailfish_html = proa_bench::sailfish_airbnb_search::render();
    eprintln!(
        "Sailfish: {} bytes ({:.1} KB)",
        sailfish_html.len(),
        sailfish_html.len() as f64 / 1024.0
    );

    let askama_html = proa_bench::askama_airbnb_search::render();
    eprintln!(
        "Askama:   {} bytes ({:.1} KB)",
        askama_html.len(),
        askama_html.len() as f64 / 1024.0
    );

    let mut proa_buf = Vec::with_capacity(64 * 1024);
    proa_bench::proa_airbnb_search::render_into(&mut proa_buf);
    eprintln!(
        "Proa:     {} bytes ({:.1} KB)",
        proa_buf.len(),
        proa_buf.len() as f64 / 1024.0
    );

    group.bench_function("sailfish", |b| {
        b.iter(|| {
            let html = proa_bench::sailfish_airbnb_search::render();
            black_box(html.len())
        });
    });

    group.bench_function("askama", |b| {
        b.iter(|| {
            let html = proa_bench::askama_airbnb_search::render();
            black_box(html.len())
        });
    });

    // Proa with buffer reuse
    group.bench_function("proa_reuse", |b| {
        let mut buf = Vec::with_capacity(64 * 1024);
        b.iter(|| {
            proa_bench::proa_airbnb_search::render_into(&mut buf);
            black_box(buf.len())
        });
    });

    // Proa fresh alloc (apples-to-apples with sailfish/askama)
    group.bench_function("proa_fresh", |b| {
        b.iter(|| {
            let mut buf = Vec::with_capacity(64 * 1024);
            proa_bench::proa_airbnb_search::render_into(&mut buf);
            black_box(buf.len())
        });
    });

    // Proa with RenderBuffer
    group.bench_function("proa_chained", |b| {
        let mut buf = proa_core::RenderBuffer::new();
        b.iter(|| {
            proa_bench::proa_airbnb_search::render_into_chained(&mut buf);
            black_box(buf.page_count())
        });
    });

    group.finish();
}

criterion_group!(benches, bench_airbnb_search);
criterion_main!(benches);
