//! Proa production server for the canonical page workloads over HTTP.
//!
//! Each route renders the same parity-gated fixture the canonical scoreboard
//! times, through the ordinary synchronous `RouteResponse::ssr` path on an
//! Axum router. Fixture data is built once before the listener opens; every
//! request renders a fresh, independently owned response.

use std::sync::Arc;

use axum::{routing::get, Json};
use proa_bench::data_table_page::DataTablePage;
use proa_bench::http_load::{bind_address, process_metrics, worker_threads};
use proa_bench::proa_page::SafeTextBenchmarkPage;
use proa_bench::representative_suite::{product_count, products, table_rows, TABLE_ROW_COUNT};
use proa_bench::topcoat_product_grid::ProaProductGrid;
use proa_framework_axum::manifest::IslandManifest;
use proa_framework_axum::{router_from_spec, Route, RouteContextLayer, RouteResponse};
use serde_json::json;

fn empty_manifest() -> Arc<IslandManifest> {
    Arc::new(IslandManifest {
        islands: Default::default(),
        assets: Default::default(),
        import_map: Default::default(),
        ssr_bundle: Default::default(),
    })
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let threads = worker_threads()?;
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(threads)
        .enable_all()
        .build()?
        .block_on(serve(threads))
}

async fn serve(worker_threads: usize) -> Result<(), Box<dyn std::error::Error>> {
    let (host, port) = bind_address(5720)?;
    // Materialize the fixtures before the listener opens so no request pays
    // for data construction; the canonical adapters do the same.
    let rows = table_rows();
    let grid = products();
    let product_cardinality = product_count();

    let routes = vec![
        Route::endpoint(
            "/cards",
            get(|| async { RouteResponse::ssr(SafeTextBenchmarkPage) }),
        ),
        Route::endpoint(
            "/table",
            get(move || async move { RouteResponse::ssr(DataTablePage { rows }) }),
        ),
        Route::endpoint(
            "/products",
            get(move || async move { RouteResponse::ssr(ProaProductGrid::new(grid)) }),
        ),
        Route::endpoint(
            "/health",
            get(move || async move {
                Json(json!({
                    "status": "ok",
                    "engine": "proa",
                    "framework": "Proa (Cargo.lock revision)",
                    "workerThreads": worker_threads,
                    "id": "canonical_pages_v1",
                    "workloads": {
                        "cards": { "path": "/cards", "cardinality": 32 },
                        "table": { "path": "/table", "cardinality": TABLE_ROW_COUNT },
                        "products": { "path": "/products", "cardinality": product_cardinality },
                    },
                    "renderPath": "RouteResponse::ssr on an Axum router; fresh owned response per request",
                }))
            }),
        ),
        Route::endpoint("/metrics", get(|| async { Json(process_metrics()) })),
    ];

    let (router, computed_metadata) = router_from_spec(routes);
    let app = router.layer(RouteContextLayer::new(empty_manifest(), computed_metadata));
    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await?;
    println!("Proa page server listening on http://{host}:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
