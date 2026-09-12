//! Benchmark the page-shaped fixtures owned by `proa_showcase`.
//!
//! Airbnb retains byte-oriented Sailfish peers. Nike, eBay, and Sentry rows
//! capture the real Proa showcase paths and are reported as Proa workload
//! coverage until equivalent peer fixtures pass a parity gate.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use proa_core::{RenderBuffer, WebContext, WriteBuf};

fn bench_showcase(c: &mut Criterion) {
    let mut group = c.benchmark_group("showcase");

    // Print output sizes
    let proa_home = proa_showcase::airbnb::home::render();
    let proa_search = proa_showcase::airbnb::search::render();
    let proa_listing = proa_showcase::airbnb::listing::render();
    let nike_catalog = proa_showcase::nike::catalog::render();
    let nike_product = proa_showcase::nike::product::render();
    let ebay_listings = proa_showcase::ebay::srp::default_listings(60);
    let ebay_cards = proa_showcase::ebay::srp::render_listings_to_string(ebay_listings);
    let ebay_chrome = proa_showcase::ebay::srp_chrome::render_document(
        proa_showcase::ebay::srp_chrome::DEFAULT_QUERY,
        ebay_listings,
        proa_showcase::ebay::srp::ListingsList {
            listings: ebay_listings,
        },
        (),
    );
    let ebay_real_chrome = proa_showcase::ebay::srp_chrome_real::render_document(
        proa_showcase::ebay::srp_chrome_real::DEFAULT_QUERY,
        ebay_listings,
        proa_showcase::ebay::srp::ListingsList {
            listings: ebay_listings,
        },
        (),
    );
    let sentry = proa_showcase::sentry_otel::render_benchmark_rows(
        proa_showcase::sentry_otel::DEFAULT_ROW_COUNT,
    );
    let sf_home = proa_bench::sailfish_airbnb_home::render();
    let sf_search = proa_bench::sailfish_airbnb_search::render();
    let sf_listing = proa_bench::sailfish_airbnb_listing::render();
    eprintln!(
        "Home:    Proa {} bytes, Sailfish {} bytes",
        proa_home.len(),
        sf_home.len()
    );
    eprintln!(
        "Search:  Proa {} bytes, Sailfish {} bytes",
        proa_search.len(),
        sf_search.len()
    );
    eprintln!(
        "Listing: Proa {} bytes, Sailfish {} bytes",
        proa_listing.len(),
        sf_listing.len()
    );
    eprintln!("Nike catalog: Proa {} bytes", nike_catalog.len());
    eprintln!("Nike product: Proa {} bytes", nike_product.len());
    eprintln!("eBay cards (60): Proa {} bytes", ebay_cards.len());
    eprintln!("eBay chrome (60): Proa {} bytes", ebay_chrome.len());
    eprintln!(
        "eBay real chrome (60): Proa {} bytes",
        ebay_real_chrome.len()
    );
    eprintln!(
        "Sentry OpenTelemetry ({} rows): Proa {} bytes",
        proa_showcase::sentry_otel::DEFAULT_ROW_COUNT,
        sentry.len()
    );

    // ── Home page ──

    group.bench_function("home_proa_chained", |b| {
        let mut buf = RenderBuffer::new();
        let data = proa_showcase::airbnb::home::HomeData::default_la();
        b.iter(|| {
            buf.clear();
            let mut cx = WebContext::with_buffer(&mut buf);
            proa_showcase::airbnb::home::render_into(&mut cx, &data);
            black_box(buf.page_count())
        });
    });

    group.bench_function("home_sailfish", |b| {
        b.iter(|| {
            let html = proa_bench::sailfish_airbnb_home::render();
            black_box(html.len())
        });
    });

    // ── Search page ──

    group.bench_function("search_proa_chained", |b| {
        let mut buf = RenderBuffer::new();
        let data = proa_showcase::airbnb::search::SearchData::default_malibu();
        b.iter(|| {
            buf.clear();
            let mut cx = WebContext::with_buffer(&mut buf);
            proa_showcase::airbnb::search::render_into(&mut cx, &data);
            black_box(buf.page_count())
        });
    });

    group.bench_function("search_sailfish", |b| {
        b.iter(|| {
            let html = proa_bench::sailfish_airbnb_search::render();
            black_box(html.len())
        });
    });

    // ── Listing page ──
    group.bench_function("listing_proa_chained", |b| {
        let mut buf = RenderBuffer::new();
        let data = proa_showcase::airbnb::listing::ListingData::malibu();
        b.iter(|| {
            buf.clear();
            let mut cx = WebContext::with_buffer(&mut buf);
            proa_showcase::airbnb::listing::render_into(&mut cx, &data, None).unwrap();
            black_box(buf.page_count())
        });
    });

    group.bench_function("listing_sailfish", |b| {
        b.iter(|| {
            let html = proa_bench::sailfish_airbnb_listing::render();
            black_box(html.len())
        });
    });

    // ── Nike pages ──

    group.bench_function("nike_catalog_proa_fresh", |b| {
        b.iter(|| black_box(proa_showcase::nike::catalog::render()));
    });

    group.bench_function("nike_catalog_proa_reused", |b| {
        let data = proa_showcase::nike::catalog::default_data();
        let mut buf = RenderBuffer::new();
        b.iter(|| {
            buf.clear();
            let mut cx = WebContext::with_buffer(&mut buf);
            proa_showcase::nike::catalog::render_into(&mut cx, &data);
            black_box(buf.page_count())
        });
    });

    group.bench_function("nike_product_proa_fresh", |b| {
        b.iter(|| black_box(proa_showcase::nike::product::render()));
    });

    group.bench_function("nike_product_proa_reused", |b| {
        let data = proa_showcase::nike::product::default_data();
        let mut buf = RenderBuffer::new();
        b.iter(|| {
            buf.clear();
            let mut cx = WebContext::with_buffer(&mut buf);
            proa_showcase::nike::product::render_into(&mut cx, &data);
            black_box(buf.page_count())
        });
    });

    // ── eBay pages ──

    group.bench_function("ebay_cards_60_proa_fresh", |b| {
        b.iter(|| {
            black_box(proa_showcase::ebay::srp::render_listings_to_string(
                ebay_listings,
            ))
        });
    });

    group.bench_function("ebay_cards_60_proa_reused", |b| {
        let mut buf = RenderBuffer::new();
        b.iter(|| {
            proa_showcase::ebay::srp::render_listings_into_chained(ebay_listings, &mut buf);
            black_box(buf.page_count())
        });
    });

    group.bench_function("ebay_chrome_60_proa_fresh", |b| {
        b.iter(|| {
            black_box(proa_showcase::ebay::srp_chrome::render_document(
                proa_showcase::ebay::srp_chrome::DEFAULT_QUERY,
                ebay_listings,
                proa_showcase::ebay::srp::ListingsList {
                    listings: ebay_listings,
                },
                (),
            ))
        });
    });

    group.bench_function("ebay_real_chrome_60_proa_fresh", |b| {
        b.iter(|| {
            black_box(proa_showcase::ebay::srp_chrome_real::render_document(
                proa_showcase::ebay::srp_chrome_real::DEFAULT_QUERY,
                ebay_listings,
                proa_showcase::ebay::srp::ListingsList {
                    listings: ebay_listings,
                },
                (),
            ))
        });
    });

    // ── Sentry/OpenTelemetry ──

    group.bench_function("sentry_otel_400_proa_fresh", |b| {
        b.iter(|| {
            black_box(proa_showcase::sentry_otel::render_benchmark_rows(
                proa_showcase::sentry_otel::DEFAULT_ROW_COUNT,
            ))
        });
    });

    group.finish();
}

criterion_group!(benches, bench_showcase);
criterion_main!(benches);
