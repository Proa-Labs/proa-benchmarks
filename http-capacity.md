# HTTP capacity, cold start and streaming

The [Proa versus SvelteKit report](sveltekit.md) includes the production SvelteKit server below and a separate async comparison with browser completion. Its native promise-data stream has a different HTTP completion boundary from the resolved-HTML streams in this page.

One core of each framework's production server serves the same parity-gated pages over loopback HTTP. This page records [sustained capacity and latency at equal load](#canonical-pages-over-http-one-core-each), [cold start to first response](#cold-start-to-first-response), and [Suspense streaming](#suspense-streaming-over-http-one-core-each).

<!-- page-load:start -->
## Canonical pages over HTTP, one core each

**October 20, 2026 · Apple M4 Max · 5 production servers · every response byte-identical to its parity-gated dump**

This is the capacity question behind the scoreboard: the same three parity-gated pages, served over real loopback HTTP/1.1 by each framework's ordinary production server, with every engine limited to one core of work. Proa runs one Tokio worker thread on Axum, React, Marko, and SvelteKit run one Node process, and Go runs `GOMAXPROCS=1` on `net/http`. On the product grid, one Proa core sustained 17,838 complete responses per second against 1,614 for React, and spent 0.056 ms of CPU per response against React's 0.635 ms.

Each value is the median of 3 fresh server processes. **Capacity** rows use 64 closed-loop connections issuing requests back to back; throughput counts complete responses inside a fixed 5-second window after a 1-second pre-roll. **CPU per response** is the server process's exact CPU-time delta across all of its threads, including garbage-collector helpers, divided by successful responses. The load generator is 8 separate worker processes that hash every response; a phase is rejected if any worker's event loop exceeds 80% busy.

| Workload | Engine | Sustained responses/s | Proa ÷ engine | CPU per response | Cores used | Peak RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Component page | Proa | 87,426 | 1.00× | 0.011 ms | 0.99 | 8.1 MiB |
| Component page | React | 9,426 | 9.28× | 0.112 ms | 1.04 | 240.8 MiB |
| Component page | Marko | 39,348 | 2.22× | 0.027 ms | 1.04 | 227.4 MiB |
| Component page | Go html/template | 7,407 | 11.8× | 0.135 ms | 1.00 | 19.1 MiB |
| Component page | SvelteKit | 9,693 | 9.02× | 0.122 ms | 1.14 | 392.1 MiB |
| Product grid | Proa | 17,838 | 1.00× | 0.056 ms | 1.00 | 9.3 MiB |
| Product grid | React | 1,614 | 11.1× | 0.635 ms | 1.02 | 312.0 MiB |
| Product grid | Marko | 4,507 | 3.96× | 0.244 ms | 1.09 | 375.5 MiB |
| Product grid | Go html/template | 1,055 | 16.9× | 0.949 ms | 1.00 | 18.3 MiB |
| Product grid | SvelteKit | 1,458 | 12.2× | 0.851 ms | 1.21 | 547.0 MiB |
| 1,000-row table | Proa | 2,957 | 1.00× | 0.338 ms | 1.00 | 71.2 MiB |
| 1,000-row table | React | 189 | 15.6× | 5.413 ms | 1.03 | 442.0 MiB |
| 1,000-row table | Marko | 564 | 5.24× | 1.689 ms | 0.94 | 303.0 MiB |
| 1,000-row table | Go html/template | 69 | 42.7× | 12.425 ms | 0.89 | 20.0 MiB |
| 1,000-row table | SvelteKit | 121 | 24.4× | 8.440 ms | 1.03 | 466.4 MiB |

Translating CPU per response into fleet size: the cores needed to serve 10,000 responses per second of each page, from the measured CPU per response. Real deployments add headroom, but the ratios carry over.

| Workload | Proa | React | Marko | Go html/template | SvelteKit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Component page | 0.1 | 1.1 | 0.3 | 1.3 | 1.2 |
| Product grid | 0.6 | 6.4 | 2.4 | 9.5 | 8.5 |
| 1,000-row table | 3.4 | 54.1 | 16.9 | 124.2 | 84.4 |

**Latency at equal load** uses fixed-rate open-loop arrivals below every engine's knee, so the percentiles compare the same request-rate target rather than each server's own saturation point. Latency is measured from scheduled arrival and includes generator lag.

| Workload | Engine | Request rate (rps) | Complete P50 | Complete P99 | CPU per response | Peak RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Component page | Proa | 2,000 | 0.11 ms | 0.17 ms | 0.027 ms | 5.4 MiB |
| Component page | React | 2,000 | 0.22 ms | 0.29 ms | 0.151 ms | 84.0 MiB |
| Component page | Marko | 2,000 | 0.15 ms | 0.34 ms | 0.078 ms | 194.1 MiB |
| Component page | Go html/template | 2,000 | 0.23 ms | 3.97 ms | 0.187 ms | 18.1 MiB |
| Component page | SvelteKit | 2,000 | 0.27 ms | 0.70 ms | 0.266 ms | 205.7 MiB |
| Product grid | Proa | 500 | 0.23 ms | 0.58 ms | 0.091 ms | 6.5 MiB |
| Product grid | React | 500 | 0.74 ms | 1.04 ms | 0.664 ms | 146.0 MiB |
| Product grid | Marko | 500 | 0.39 ms | 1.02 ms | 0.310 ms | 115.0 MiB |
| Product grid | Go html/template | 500 | 1.05 ms | 1.48 ms | 1.078 ms | 17.6 MiB |
| Product grid | SvelteKit | 500 | 0.96 ms | 1.84 ms | 1.369 ms | 160.6 MiB |
| 1,000-row table | Proa | 50 | 0.69 ms | 1.84 ms | 0.509 ms | 29.4 MiB |
| 1,000-row table | React | 50 | 4.90 ms | 6.24 ms | 4.874 ms | 282.4 MiB |
| 1,000-row table | Marko | 50 | 1.80 ms | 3.89 ms | 1.782 ms | 139.5 MiB |
| 1,000-row table | Go html/template | 50 | 11.2 ms | 12.2 ms | 11.209 ms | 17.7 MiB |
| 1,000-row table | SvelteKit | 50 | 7.53 ms | 8.51 ms | 7.496 ms | 162.8 MiB |

Every measured response was compared byte for byte against the dump the same engine produced through its canonical adapter, which is the dump that passed the scoreboard's browser-DOM parity gate.

| Engine version | Component page bytes | Product grid bytes | 1,000-row table bytes | HTTP responses |
| --- | ---: | ---: | ---: | --- |
| Proa 0.3.0 @ 7ffb8a19 | 25,108 | 284,908 | 988,509 | byte-identical |
| React 19.2.8 | 25,202 | 285,868 | 990,695 | byte-identical |
| Marko 6.0.150 | 24,038 | 282,604 | 983,187 | byte-identical |
| Go html/template go1.25.5 | 25,108 | 285,676 | 990,509 | byte-identical |
| SvelteKit 3.1.0 / Svelte 5.57.2 / adapter-node 6.0.0 | 25,959 | 286,704 | 1,003,437 | byte-identical |

- Capture: [page-load/results/latest.json](page-load/results/latest.json); reproduce with `pnpm run bench:page-load`.
- Proa serves through `RouteResponse::ssr` on an Axum router; React through `renderToString` into `response.end`; Marko through its compiled template's `render().pipe(response)`; Go through `html/template` `Execute` into the `ResponseWriter`; SvelteKit through its production Node adapter with server-side rendering and `csr=false`.
- Node engines run with `NODE_ENV=production`: the driver sets it, each server's health endpoint reports it back, and React reports that it loaded the production `react-dom/server` build. The runner refuses to measure otherwise.
- Compression is disabled for every engine so CPU is not dominated by a shared compression setting. Databases and external network latency are outside this measurement; framework routing (including SvelteKit’s production router), HTTP parsing, response serialization, allocation, and each server's write path are inside it.
- This is a one-host, one-core capacity measurement. Multi-core deployments scale each engine by its own process or thread model; the per-response CPU cost is the portable number.
<!-- page-load:end -->

[![Sustained responses per second, CPU per response, and peak RSS for Proa, React, Marko, and Go html/template serving three canonical pages over HTTP on one core](charts/svg/08-canonical-pages-http.svg)](charts/svg/08-canonical-pages-http.svg)

*Sustained responses per second, CPU per response, and peak RSS from the capacity table above. Bars are medians of three fresh server processes. [Full size](charts/svg/08-canonical-pages-http.svg) · [how the figures are built](charts/)*

The same servers pay a start-up cost on every fresh process, measured next in [Cold start to first response](#cold-start-to-first-response).

<!-- cold-start:start -->
## Cold start to first response

**October 20, 2026 · Apple M4 Max · 15 fresh processes per engine**

Every autoscaling event, cold serverless instance, per-tenant process, and developer restart pays this cost. Each row spawns the same production server used in the HTTP capacity section, polls its port every millisecond, and stops the clock when the first complete product-grid response ends; that response must be byte-identical to the engine's canonical dump. Proa's first response arrived in 3.99 ms at the median against 50.7 ms for React, whose figure includes Node start-up and loading React and the page module. Engines rotate every start, 2 untimed starts warm the disk cache, and the RSS column is sampled immediately after the first response.

| Engine | First response P50 | P95 | Max | First byte P50 | RSS after first response |
| --- | ---: | ---: | ---: | ---: | ---: |
| Proa 0.3.0 @ 7ffb8a19 | 3.99 ms | 5.79 ms | 6.11 ms | 3.90 ms | 4.5 MiB |
| React | 50.7 ms | 60.8 ms | 66.0 ms | 50.6 ms | 76.1 MiB |
| Marko | 43.1 ms | 47.9 ms | 48.6 ms | 43.0 ms | 63.3 MiB |
| Go html/template | 6.27 ms | 8.47 ms | 10.7 ms | 5.33 ms | 12.5 MiB |
| SvelteKit | 55.0 ms | 57.1 ms | 57.3 ms | 54.9 ms | 72.0 MiB |

- Capture: [cold-start/results/latest.json](cold-start/results/latest.json); reproduce with `pnpm run bench:cold-start`.
- Servers, ports, and per-core limits are the same as the [HTTP capacity section](#canonical-pages-over-http-one-core-each). Wall time includes process creation, runtime start-up, module or binary loading, fixture construction, and the first render.
- Host one-minute load average when the capture started: 19.62 on 16 logical CPUs. Cold start is a few milliseconds of wall time, so it is the measurement most sensitive to other work on the machine; rerun it on an idle host before quoting absolute values.
<!-- cold-start:end -->

[![Median, P95 and slowest time from process spawn to first complete product-grid response for Proa, React, Marko and Go html/template, with RSS after the first response](charts/svg/09-cold-start.svg)](charts/svg/09-cold-start.svg)

*Fifteen fresh processes per engine. The bar is the median, the tick P95, and the hollow endpoint the slowest start. [Full size](charts/svg/09-cold-start.svg) · [how the figures are built](charts/)*

The product grid also streams, which is the subject of [Suspense streaming over HTTP](#suspense-streaming-over-http-one-core-each).

<!-- suspense-load:start -->
## Suspense streaming over HTTP, one core each

**September 4, 2026 · Apple M4 Max · 8 async boundaries × 12 product cards · one worker thread or process per engine**

This is the product grid from the capacity section, streamed. Equivalent production-mode Proa, Marko, and React applications run over real loopback HTTP/1.1. Every request streams a shell with 8 fallback panels, starts 8 independent data operations across the 5, 8, 12, 18, 27, 40, 60, 90 ms delay tiers, and completes only after every panel has resolved to its 12 product cards on the wire, 96 cards in all. Delayed values stay typed and in memory; there is no JSON serialization, deserialization, or external I/O in the measured request path. Rendering, boundary scheduling, replacement framing, and one flush per boundary are all inside the measurement.

Every engine is limited to one unit of concurrency: Proa runs 1 Tokio worker thread, and Marko and React each run one Node process. Proa serves this page through `RouteResponse::ssr_stream_send`, the compiler-proved `Send` streaming path introduced by [Proa PR #82](https://github.com/Proa-Labs/proa/pull/82): Axum polls the response stream directly, with no per-response bridge thread. The cores column shows what each process actually used, and CPU/request charges every thread of every engine the same way.

Each row is the median of 3 fresh-process phases under fixed-rate open-loop arrivals from 12 separate load-generator processes, so saturation remains visible as in-flight work and scheduled-arrival latency instead of being suppressed by a client waiting for each prior response. A 1-second pre-roll fills the async pipeline, then successful full responses completed inside a fixed 5-second observation window determine steady-state throughput. Complete-response percentiles and shell P50 cover requests arriving during that observation window and include load-generator scheduling lag and server queueing. CPU/request is the server process's exact CPU-time delta divided by successful responses across the full phase. Errors are summed across the 3 repeats. Publication aborts if scheduler-lag P95 exceeds 25 ms or any generator worker exceeds 80% busy in any phase, and each phase waits for the previous phase's client sockets to leave TIME_WAIT before it starts.

| Engine | Request rate (rps) | Steady completion rps | Shell P50 | Complete P50 | Complete P95 | Complete P99 | CPU/request | Cores | Peak RSS | Max in-flight | Generator lag P95 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Proa | 250 | 250 | 0.35 ms | 91.2 ms | 92.5 ms | 93.0 ms | 0.494 ms | 0.12 | 8.0 MiB | 25 | 0.02 ms | 0 |
| Proa | 500 | 500 | 0.18 ms | 91.4 ms | 91.5 ms | 91.6 ms | 0.281 ms | 0.14 | 8.7 MiB | 47 | 0.02 ms | 0 |
| Proa | 1,000 | 1000 | 0.17 ms | 91.2 ms | 91.2 ms | 91.5 ms | 0.218 ms | 0.21 | 11.4 MiB | 93 | 0.01 ms | 0 |
| Proa | 2,000 | 2000 | 0.15 ms | 91.1 ms | 91.2 ms | 91.4 ms | 0.217 ms | 0.43 | 17.2 MiB | 188 | 0.02 ms | 0 |
| Proa | 3,000 | 3000 | 0.15 ms | 90.9 ms | 91.2 ms | 91.8 ms | 0.206 ms | 0.61 | 23.2 MiB | 289 | 0.02 ms | 0 |
| Proa | 4,000 | 4000 | 0.24 ms | 90.9 ms | 91.8 ms | 92.5 ms | 0.200 ms | 0.79 | 30.3 MiB | 410 | 0.03 ms | 0 |
| Proa | 5,000 | 4999 | 4.25 ms | 99.2 ms | 100.6 ms | 101.9 ms | 0.196 ms | 0.96 | 39.2 MiB | 533 | 0.37 ms | 0 |
| Proa | 6,000 | 4613 | 642.1 ms | 1089.5 ms | 1813.1 ms | 2019.8 ms | 0.185 ms | 0.88 | 221.8 MiB | 8,553 | 0.59 ms | 0 |
| Marko | 250 | 250 | 0.42 ms | 90.0 ms | 91.3 ms | 91.6 ms | 1.017 ms | 0.25 | 201.0 MiB | 24 | 0.31 ms | 0 |
| Marko | 500 | 500 | 0.18 ms | 90.3 ms | 90.3 ms | 90.7 ms | 0.510 ms | 0.25 | 207.5 MiB | 49 | 0.01 ms | 0 |
| Marko | 1,000 | 1000 | 0.18 ms | 90.2 ms | 90.4 ms | 91.2 ms | 0.453 ms | 0.45 | 253.1 MiB | 100 | 0.02 ms | 0 |
| Marko | 2,000 | 2000 | 0.24 ms | 90.3 ms | 92.2 ms | 93.2 ms | 0.492 ms | 0.97 | 298.3 MiB | 209 | 0.21 ms | 0 |
| Marko | 3,000 | 2619 | 43.2 ms | 147.1 ms | 4026.6 ms | 5948.0 ms | 0.613 ms | 1.36 | 811.6 MiB | 2,498 | 0.06 ms | 0 |
| Marko | 4,000 | 2534 | 1000.1 ms | 1116.8 ms | 2376.8 ms | 2674.1 ms | 0.639 ms | 1.39 | 875.3 MiB | 9,018 | 0.12 ms | 4,167 |
| Marko | 5,000 | 2497 | 2366.5 ms | 2506.3 ms | 5367.1 ms | 6871.6 ms | 0.627 ms | 1.42 | 948.0 MiB | 15,184 | 0.16 ms | 789 |
| Marko | 6,000 | 2506 | 3694.9 ms | 3814.4 ms | 8446.5 ms | 10222.6 ms | 0.625 ms | 1.43 | 836.4 MiB | 21,259 | 0.19 ms | 26 |
| React | 250 | 250 | 0.31 ms | 90.8 ms | 91.9 ms | 92.3 ms | 2.028 ms | 0.50 | 206.4 MiB | 24 | 0.02 ms | 0 |
| React | 500 | 500 | 0.23 ms | 90.7 ms | 91.4 ms | 92.0 ms | 1.646 ms | 0.81 | 226.2 MiB | 50 | 0.01 ms | 0 |
| React | 1,000 | 679 | 53.5 ms | 239.0 ms | 6055.5 ms | 6128.1 ms | 1.666 ms | 1.01 | 459.9 MiB | 2,057 | 0.02 ms | 220 |
| React | 2,000 | 638 | 3598.3 ms | 3814.1 ms | 8827.5 ms | 9797.1 ms | 1.641 ms | 1.02 | 472.5 MiB | 8,275 | 0.02 ms | 4,652 |
| React | 3,000 | 630 | 8081.0 ms | 8336.4 ms | 16205.0 ms | 18175.4 ms | 1.614 ms | 1.02 | 469.9 MiB | 14,313 | 0.02 ms | 4,736 |
| React | 4,000 | 646 | 9156.3 ms | 9504.8 ms | 17093.6 ms | 18060.8 ms | 1.625 ms | 1.07 | 454.0 MiB | 20,190 | 0.02 ms | 15,820 |
| React | 5,000 | 647 | 12617.1 ms | 12926.9 ms | 22390.4 ms | 24916.9 ms | 1.619 ms | 1.02 | 441.2 MiB | 26,190 | 0.02 ms | 19,901 |
| React | 6,000 | 639 | 17437.2 ms | 17843.6 ms | 30280.9 ms | 31950.6 ms | 1.621 ms | 1.07 | 453.6 MiB | 32,265 | 0.02 ms | 24,856 |

**Every row above is one core.** Proa runs one Tokio worker thread and Marko and React each run one Node process, so the table compares what a single core delivers. Proa's knee near 4,600 responses per second is that one thread filling up at 0.185 ms of CPU per response; it is not a Proa limit, because a production server runs one worker thread per core.

**Reference point, outside the comparison.** To show the knee moves with the thread budget, Proa alone was rerun at the top rate with 4 worker threads. Marko and React were not rerun with more processes, so this row is not comparable to theirs. With 4 threads Proa completed 6,000 responses per second at a request-rate target of 6,000 rps and a P99 of 93.4 ms, using 1.64 cores.

| Proa worker threads | Request rate (rps) | Steady completion rps | Complete P50 | Complete P99 | CPU/request | Cores | Peak RSS | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | 6,000 | 6000 | 90.9 ms | 93.4 ms | 0.278 ms | 1.64 | 43.1 MiB | 0 |

The parity gate checks the browser-consumable stream payload before load begins and validates every measured response: the shell, every fallback and resolved panel, and every product card. The cards are the same markup the scoreboard's product-grid parity gate accepted from each engine. Wire bytes legitimately differ because each framework carries its own boundary-replacement protocol.

| Engine version | Fallback panels | Resolved panels | Product cards | Stream bytes |
| --- | ---: | ---: | ---: | ---: |
| Proa 0.3.0 @ 7ffb8a19 | 8 | 8 | 96 | 387,511 |
| Marko 6.0.150 | 8 | 8 | 96 | 289,888 |
| React 19.2.8 | 8 | 8 | 96 | 292,213 |

- Capture: [suspense-load/results/latest.json](suspense-load/results/latest.json); reproduce with `pnpm run bench:suspense-load`.
- The retained source hash predates three wording-only changes in the runner. The report verifier records both exact source hashes; measurements and the original capture hash are unchanged.
- Proa source: Cargo.lock revision 7ffb8a19; Rust release build with native Proa Suspense and the direct `ssr_stream_send` Axum route. The same binary also serves the bounded local-executor path (`ssr_stream`) at `/local` for engineering comparison; it is not part of the published rows.
- Marko source: optimized ahead-of-time Marko template using native &lt;await&gt; plus &lt;@placeholder&gt;; its compiler is not resident in the measured server.
- React source: production React server build using renderToPipeableStream, Suspense, and use.
- Node engines run with `NODE_ENV=production`: the driver sets it, each server's health endpoint reports it back, and React reports that it loaded the production `react-dom/server` build. The runner refuses to measure otherwise.
- Stream bytes differ by protocol, not content: Proa base64-encodes each resolved boundary inside an inert template, so its stream is roughly a third larger on the wire than React's for the same 96 cards. Compression is off in every engine here; enabling it would remove most of that gap, at a CPU cost this benchmark deliberately leaves out.
- This is a single-host capacity curve, not a universal ranking. Loopback transfer, each framework’s HTTP adapter, boundary protocol, allocation, scheduling, and render work are all intentionally inside the application boundary.
<!-- suspense-load:end -->

[![Responses completed per second, latency distribution and peak memory for Proa, Marko and React streaming the product grid through Suspense over HTTP on one core](charts/svg/07-suspense-load.svg)](charts/svg/07-suspense-load.svg)

*Every line is one core: completions at each request-rate target, the P50, P95, and P99 of the full response, and peak memory. Once a line drops below the target rate the engine has saturated and its latency is queueing. Each latency panel marks its highest P99 with a leader from the axis. [Full size](charts/svg/07-suspense-load.svg) · [how the figures are built](charts/)*

## Next steps

- [Front page](README.md)
  - The four figures and the reasons to trust them.
- [Canonical scoreboard evidence](scoreboard.md)
  - The render-only timings these servers wrap, for seventeen renderers.
- [Shared HTTP load driver](load/)
  - Why a benchmark never reports a client knee as a server knee.
- [Page-load suite](page-load/), [cold-start suite](cold-start/), and [Suspense suite](suspense-load/)
  - Each suite's contract, engines, and reproduction commands.
