# Suspense streaming HTTP benchmark

This benchmark compares production server applications built with Proa, Marko,
and React. It measures the application boundary a platform engineer pays for:
HTTP parsing and transfer, framework streaming, async-boundary scheduling,
fallback and replacement serialization, allocation, and server adapter overhead.

## Workload contract

- The canonical 96-card product grid streamed through 8 boundaries, 12 cards
  each, about 290 kB per response. Boundaries are configurable from 1 to 256
  and cards per panel from 0 to 96; `--cards-per-panel 0` gives the tiny-panel
  scheduling stress variant.
- Delay tiers of 5, 8, 12, 18, 27, 40, 60, and 90 ms, one per boundary and
  repeated when there are more than eight.
- The same static marketplace shell, fallback text, ready-panel text, keys, and
  completion rule in all three applications.
- Delayed values stay typed and in memory; the measured request path performs
  no JSON serialization, deserialization, or external I/O.
- Proa uses native `Suspense`; Marko uses native `<await>` with
  `<@placeholder>`; React uses `<Suspense>`, `use`, and
  `renderToPipeableStream`.
- A response succeeds only when the full body ends and its browser-consumable
  stream payload contains the shell, every fallback, every resolved panel, and
  every product card. Proa’s base64 boundary templates are decoded for this
  check. The cards are the same markup each engine's scoreboard adapter emits,
  which the browser-DOM parity gate accepted.

The wire streams are not byte-identical. Marko, React, and Proa use different
replacement protocols, and protocol cost is intentionally included. Compression
is disabled so CPU is not dominated by a shared compression setting.

## Concurrency model

Every engine is limited to one unit of concurrency so the comparison is per
core: Proa runs one Tokio worker thread (`PROA_WORKER_THREADS=1`, reported in
`/health`), and Marko and React each run one Node process. Proa serves `/`
through `RouteResponse::ssr_stream_send`, the compiler-proved `Send` streaming
path that Axum polls directly; the bounded local-executor path
(`RouteResponse::ssr_stream`) is exposed at `/local` for engineering
comparison only. The table reports cores used, and CPU per request charges
every thread of every engine.

After the per-core matrix, Proa alone reruns the top request-rate target with four
worker threads (`PROA_WORKER_THREADS=4`). The published row shows that the
per-core knee is a thread budget, not a framework ceiling.

## Load and metrics

The shared driver in [`../load/`](../load/) schedules fixed-rate open-loop
arrivals over HTTP/1.1 loopback with keep-alive from several separate worker
processes, each of which validates every response. Each phase uses a one-second
pre-roll to fill the async pipeline, followed by a fixed five-second steady-state
observation window. It records both dispatch latency and scheduled-arrival latency; the
latter includes generator lag and server queueing and is the value shown in the
public table. Each rate/repeat gets a fresh server process.

- Latency: first byte and full response, P50/P95/P99/max.
- Throughput: successful full responses whose completion occurs inside the
  fixed observation window, divided by that window's duration.
- CPU: exact server process CPU-time delta, reported as average cores and CPU
  milliseconds per successful response.
- Memory: baseline, average, and peak RSS sampled every 100 ms with `ps`.
- Capacity signals: maximum observed in-flight requests, generator lag, and
  errors.

The load generator runs on the same host, so it must be shown not to be the
bottleneck before a knee is attributed to the server. A phase is rejected when
P95 generator lag exceeds 25 ms or when any generator worker's event loop is
more than 80% busy. The JSON artifact retains both scheduled and
dispatch-relative percentiles and the generator utilization for that diagnosis.

The runner also takes an exclusive workspace lock so two captures cannot
silently compete for CPU, sockets, or ephemeral ports. In-progress data is
written to an ignored `latest.json.partial` file and is only renamed to
`latest.json` after the complete matrix passes.

## Run

Install the root dependencies and the Marko fixture dependencies first:

```sh
pnpm install --frozen-lockfile
npm ci --prefix rendering/external/marko
```

Then run the full capture or a short wiring check:

```sh
pnpm run bench:suspense-load
pnpm run bench:suspense-load:smoke
```

Useful controls:

```sh
node suspense-load/run.mjs \
  --boundaries 8 \
  --cards-per-panel 12 \
  --rates 250,500,1000,2000,3000,4000,5000,6000 \
  --pre-roll 1 \
  --duration 5 \
  --repeats 3 \
  --warmup-requests 24 \
  --workers 12 \
  --engines proa,marko,react \
  --out suspense-load/results/latest.json
```

The driver compiles the Proa release binary and the optimized Marko template
before starting any measured process. Marko’s compiler therefore does not
inflate the server memory measurement. JavaScript servers run with
`NODE_ENV=production`.

After a full capture, update the root report and charts:

```sh
node suspense-load/report.mjs
pnpm run charts
pnpm run check:charts
```

The committed `results/latest.json` is the public capture. Smoke and exploratory
artifacts should not be treated as results.
