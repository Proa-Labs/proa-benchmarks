use std::future::Future;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use axum::{routing::get, Json};
use proa_bench::http_load::{bind_address, process_metrics, worker_threads};
use proa_bench::topcoat_product_grid::{make_products, ProaProductCards, Product};
use proa_core::{
    render_send_child, to_async, to_send, to_send_static, DataLoader, RenderBuffer, RenderOutcome,
    SendWebContext, WebContext, WebRender, WebRenderSend, WebRenderSync, WriteBuf, WriteError,
};
use proa_framework_axum::manifest::IslandManifest;
use proa_framework_axum::{
    router_from_spec, LocalStreamExecutorConfig, Route, RouteContextLayer, RouteResponse,
};
use proa_macros::html_sync;
use proa_stream::Suspense;
use serde_json::json;

const DEFAULT_BOUNDARY_COUNT: usize = 8;
const MAX_BOUNDARY_COUNT: usize = 256;
const DEFAULT_CARDS_PER_PANEL: usize = 12;
const MAX_CARDS_PER_PANEL: usize = 96;
const DELAY_TIERS_MS: &[u64] = &[5, 8, 12, 18, 27, 40, 60, 90];

// The catalogue is built once before the listener opens; every panel renders
// its own slice of it, so no request pays for fixture construction.
static CATALOGUE: OnceLock<Vec<Product>> = OnceLock::new();
static CARDS_PER_PANEL: OnceLock<usize> = OnceLock::new();

fn panel_products(index: usize) -> &'static [Product] {
    let cards = *CARDS_PER_PANEL
        .get()
        .expect("cards per panel is set before serving");
    let catalogue = CATALOGUE.get().expect("catalogue is built before serving");
    &catalogue[index * cards..(index + 1) * cards]
}

/// The twelve-card grid inside a resolved panel; renders nothing for the
/// tiny-panel variant so the two variants share one section template.
struct PanelCards {
    products: &'static [Product],
}

impl<B: WriteBuf, L: DataLoader> WebRenderSync<L, B> for PanelCards {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        if self.products.is_empty() {
            return Ok(());
        }
        WebRenderSync::render(
            html_sync! {
                <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {ProaProductCards { products: self.products }}
                </div>
            },
            cx,
        )
    }
}

#[derive(Clone, Copy)]
struct SuspensePage {
    boundaries: usize,
}

#[derive(Clone, Copy)]
struct StreamingPanels {
    boundaries: usize,
}

#[derive(Clone, Copy)]
struct LoadedPanel {
    index: usize,
}

#[derive(Clone, Copy)]
struct ReadyPanel {
    index: usize,
}

#[derive(Clone, Copy)]
struct FallbackPanel {
    index: usize,
}

#[derive(Clone, Copy)]
struct Hero;

impl<L: DataLoader + 'static> WebRender<L, RenderBuffer> for SuspensePage {
    fn render(
        self,
        cx: &mut WebContext<L, RenderBuffer>,
    ) -> RenderOutcome<impl Future<Output = Result<(), WriteError>>> {
        let boundaries = self.boundaries;
        RenderOutcome::pending(async move {
            WriteBuf::extend_static(
                &mut cx.out,
                b"<main class=\"marketplace-pdp\" data-benchmark-shell=\"suspense-load\">",
            )?;
            proa_core::render_child(cx, to_async(Hero)).await?;
            WriteBuf::extend_static(&mut cx.out, b"<div class=\"content-grid\">")?;
            proa_core::render_child(cx, StreamingPanels { boundaries }).await?;
            WriteBuf::extend_static(&mut cx.out, b"</div></main>")
        })
    }
}

impl<L: DataLoader + 'static> WebRender<L, RenderBuffer> for StreamingPanels {
    fn render(
        self,
        cx: &mut WebContext<L, RenderBuffer>,
    ) -> RenderOutcome<impl Future<Output = Result<(), WriteError>>> {
        RenderOutcome::pending(async move {
            for index in 0..self.boundaries {
                proa_core::render_child(
                    cx,
                    Suspense::new(LoadedPanel { index }, FallbackPanel { index }),
                )
                .await?;
            }
            Ok(())
        })
    }
}

impl<B: WriteBuf, L: DataLoader> WebRender<L, B> for LoadedPanel
where
    ReadyPanel: WebRenderSync<L, B>,
{
    fn render(
        self,
        cx: &mut WebContext<L, B>,
    ) -> RenderOutcome<impl Future<Output = Result<(), WriteError>>> {
        RenderOutcome::pending(async move {
            // The comparison models already-materialized application data.
            // Only the asynchronous wait and Suspense scheduling belong in
            // this measured path; no serialization or loader lookup does.
            tokio::time::sleep(Duration::from_millis(panel_delay_ms(self.index))).await;
            proa_core::render_child(cx, to_async(ReadyPanel { index: self.index })).await
        })
    }
}

// ---------------------------------------------------------------------------
// Direct Send streaming path (the recommended path on this Proa revision).
//
// The same page and panels, proved `Send` end to end so Axum polls the
// response stream directly instead of crossing a local-worker bridge. The
// synchronous leaf components are output-only, so they are lifted with the
// documented `to_send_static` adapter rather than duplicated.

#[derive(Clone, Copy)]
struct SendSuspensePage {
    boundaries: usize,
}

#[derive(Clone, Copy)]
struct SendLoadedPanel {
    index: usize,
}

impl<L: DataLoader + 'static> WebRenderSend<L, RenderBuffer> for SendSuspensePage {
    fn render_send(
        self,
        cx: &mut SendWebContext<L, RenderBuffer>,
    ) -> RenderOutcome<impl Future<Output = Result<(), WriteError>> + Send> {
        let boundaries = self.boundaries;
        RenderOutcome::pending(async move {
            WriteBuf::extend_static(
                &mut cx.out,
                b"<main class=\"marketplace-pdp\" data-benchmark-shell=\"suspense-load\">",
            )?;
            render_send_child(cx, to_send(to_send_static(Hero))).await?;
            WriteBuf::extend_static(&mut cx.out, b"<div class=\"content-grid\">")?;
            for index in 0..boundaries {
                render_send_child(
                    cx,
                    Suspense::new(
                        SendLoadedPanel { index },
                        to_send(to_send_static(FallbackPanel { index })),
                    ),
                )
                .await?;
            }
            WriteBuf::extend_static(&mut cx.out, b"</div></main>")
        })
    }
}

impl<B: WriteBuf + Send, L: DataLoader> WebRenderSend<L, B> for SendLoadedPanel {
    fn render_send(
        self,
        cx: &mut SendWebContext<L, B>,
    ) -> RenderOutcome<impl Future<Output = Result<(), WriteError>> + Send> {
        RenderOutcome::pending(async move {
            // Same contract as the local path: only the asynchronous wait and
            // Suspense scheduling are in the measured path.
            tokio::time::sleep(Duration::from_millis(panel_delay_ms(self.index))).await;
            render_send_child(
                cx,
                to_send(to_send_static(ReadyPanel { index: self.index })),
            )
            .await
        })
    }
}

impl<B: WriteBuf, L: DataLoader> WebRenderSync<L, B> for Hero {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        WebRenderSync::render(
            html_sync! {
                <section class="hero-shell">
                    <p class="eyebrow">"Suspense-heavy marketplace"</p>
                    <h1>"Canon FD 50mm f/1.4 S.S.C. Vintage Prime Lens"</h1>
                    <p class="price">"Bid US $129.50"</p>
                    <p class="meta">"Condition: Used · Watchers: 214 · 12 bids"</p>
                </section>
            },
            cx,
        )
    }
}

impl<B: WriteBuf, L: DataLoader> WebRenderSync<L, B> for ReadyPanel {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let key = panel_key(self.index);
        let ordinal = panel_ordinal(self.index);
        let title = format!("Panel {ordinal}");
        let eyebrow = format!("Priority tier {}", (self.index % DELAY_TIERS_MS.len()) + 1);
        let body = format!(
            "Resolved panel {ordinal} after {} ms of simulated upstream work.",
            panel_delay_ms(self.index)
        );
        let cards = PanelCards {
            products: panel_products(self.index),
        };
        WebRenderSync::render(
            html_sync! {
                <section class="marketplace-panel ready" data-panel={key.as_str()} data-panel-ready={key.as_str()}>
                    <p class="panel-eyebrow">{eyebrow.as_str()}</p>
                    <h2>{title.as_str()}</h2>
                    <p>{body.as_str()}</p>
                    {cards}
                </section>
            },
            cx,
        )
    }
}

impl<B: WriteBuf, L: DataLoader> WebRenderSync<L, B> for FallbackPanel {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let key = panel_key(self.index);
        let label = format!("Loading panel {}", panel_ordinal(self.index));
        WebRenderSync::render(
            html_sync! {
                <section
                    class="marketplace-panel fallback"
                    data-panel={key.as_str()}
                    data-panel-fallback={key.as_str()}
                    aria-busy="true"
                    aria-label={label.as_str()}
                >
                    <p class="panel-eyebrow">"Fallback"</p>
                    <h2>{label.as_str()}</h2>
                    <p>"Waiting on upstream service."</p>
                </section>
            },
            cx,
        )
    }
}

fn panel_key(index: usize) -> String {
    format!("panel-{index:02}")
}

fn panel_ordinal(index: usize) -> String {
    format!("{:02}", index + 1)
}

fn panel_delay_ms(index: usize) -> u64 {
    DELAY_TIERS_MS[index % DELAY_TIERS_MS.len()]
}

fn longest_delay_ms(boundaries: usize) -> u64 {
    (0..boundaries).map(panel_delay_ms).max().unwrap_or(0)
}

fn empty_manifest() -> Arc<IslandManifest> {
    Arc::new(IslandManifest {
        islands: Default::default(),
        assets: Default::default(),
        import_map: Default::default(),
        ssr_bundle: Default::default(),
    })
}

fn cards_per_panel() -> Result<usize, String> {
    let value = std::env::var("SUSPENSE_CARDS_PER_PANEL")
        .ok()
        .map(|value| value.parse::<usize>())
        .transpose()
        .map_err(|error| format!("invalid SUSPENSE_CARDS_PER_PANEL: {error}"))?
        .unwrap_or(DEFAULT_CARDS_PER_PANEL);
    if value > MAX_CARDS_PER_PANEL {
        return Err(format!(
            "SUSPENSE_CARDS_PER_PANEL must be at most {MAX_CARDS_PER_PANEL}"
        ));
    }
    Ok(value)
}

fn boundary_count() -> Result<usize, String> {
    let value = std::env::var("SUSPENSE_BOUNDARIES")
        .ok()
        .map(|value| value.parse::<usize>())
        .transpose()
        .map_err(|error| format!("invalid SUSPENSE_BOUNDARIES: {error}"))?
        .unwrap_or(DEFAULT_BOUNDARY_COUNT);
    if !(1..=MAX_BOUNDARY_COUNT).contains(&value) {
        return Err(format!(
            "SUSPENSE_BOUNDARIES must be from 1 to {MAX_BOUNDARY_COUNT}"
        ));
    }
    Ok(value)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // The benchmark compares engines per core, so the default is one Tokio
    // worker thread; the runner records the value it selects.
    let threads = worker_threads()?;
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(threads)
        .enable_all()
        .build()?
        .block_on(serve(threads))
}

async fn serve(worker_threads: usize) -> Result<(), Box<dyn std::error::Error>> {
    let (host, port) = bind_address(5710)?;
    let boundaries = boundary_count()?;
    let cards = cards_per_panel()?;
    CARDS_PER_PANEL
        .set(cards)
        .map_err(|_| "cards per panel was already set")?;
    CATALOGUE
        .set(make_products(boundaries * cards))
        .map_err(|_| "catalogue was already built")?;

    let routes = vec![
        // Direct Send streaming: Axum polls the response stream itself.
        Route::endpoint(
            "/",
            get(
                move || async move { RouteResponse::ssr_stream_send(SendSuspensePage { boundaries }) },
            ),
        ),
        // Bounded local-executor path retained for engineering comparison.
        Route::endpoint(
            "/local",
            get(move || async move { RouteResponse::ssr_stream(SuspensePage { boundaries }) }),
        ),
        Route::endpoint(
            "/health",
            get(move || async move {
                Json(json!({
                    "status": "ok",
                    "engine": "proa",
                    "framework": "Proa (Cargo.lock revision)",
                    "workerThreads": worker_threads,
                    "renderPath": "RouteResponse::ssr_stream_send (direct Send stream); /local uses ssr_stream through the bounded local executor",
                    "localStreamWorkerThreads": worker_threads,
                    "id": "suspense_marketplace_v2",
                    "boundaries": boundaries,
                    "cardsPerPanel": cards,
                    "productCards": boundaries * cards,
                    "delayTiersMs": DELAY_TIERS_MS,
                    "longestDelayMs": longest_delay_ms(boundaries),
                    "asyncValueModel": "typed in-memory delayed values; no serialization or external I/O",
                    "completionBoundary": "HTTP response body end after every async boundary resolves",
                    "shellBoundary": "first response body byte containing the static shell and fallbacks",
                }))
            }),
        ),
        Route::endpoint("/metrics", get(|| async { Json(process_metrics()) })),
    ];

    let (router, computed_metadata) = router_from_spec(routes);
    let app = router.layer(
        RouteContextLayer::new(empty_manifest(), computed_metadata)
            .with_local_stream_executor_config(LocalStreamExecutorConfig {
                worker_threads,
                ..LocalStreamExecutorConfig::default()
            }),
    );
    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await?;
    println!("Proa Suspense server listening on http://{host}:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::longest_delay_ms;

    #[test]
    fn longest_delay_reflects_the_selected_boundaries() {
        assert_eq!(longest_delay_ms(1), 5);
        assert_eq!(longest_delay_ms(3), 12);
        assert_eq!(longest_delay_ms(8), 90);
        assert_eq!(longest_delay_ms(9), 90);
    }
}
