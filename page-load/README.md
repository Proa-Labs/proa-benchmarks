# Canonical pages over HTTP, one core each

This benchmark answers the capacity question behind the rendering scoreboard:
what does one core of each framework's ordinary production server sustain when
it serves the same three parity-gated pages over real HTTP?

## Engines

| Engine | Server | Concurrency limit |
| --- | --- | --- |
| Proa | `RouteResponse::ssr` on an Axum router (`rendering/src/bin/proa_page_server.rs`) | `PROA_WORKER_THREADS=1` |
| React | `renderToString` into `response.end` on `node:http` (`react_server.mjs`) | one Node process |
| Marko | compiled template `render().pipe(response)` on `node:http` (`rendering/external/marko/page_server.mjs`) | one Node process |
| Go html/template | `Execute` into the `net/http` `ResponseWriter` (`rendering/external/go/suite_bench.go --serve`) | `GOMAXPROCS=1` |

Fixture data is built before each listener opens. Each request renders a fresh,
independently owned response; nothing is cached across requests.

## Contract

- The served bytes for every workload must equal the dump the same engine
  produces through its scoreboard adapter, which is the dump that passed the
  browser-DOM parity gate. The runner renders those dumps at start and every
  worker hashes every measured response against them.
- Two phase kinds per engine and workload, each in a fresh server process:
  - **closed loop**, 64 connections issuing requests back to back for a
    1-second pre-roll plus a 5-second observation window: sustained responses
    per second, CPU per response, cores used, and peak RSS at capacity;
  - **open loop**, fixed-rate arrivals below every engine's knee (2,000 rps for
    the component page, 500 for the product grid, 50 for the table): latency
    percentiles at identical request-rate target.
- Three repeats with rotated engine order; the README reports medians.
- A phase is rejected if any response fails validation, or if the load
  generator was the bottleneck (see [`../load/README.md`](../load/README.md)).

## Run

```sh
pnpm install --frozen-lockfile
npm ci --prefix rendering/external/react
npm ci --prefix rendering/external/marko

pnpm run bench:page-load          # full publication capture (~10 minutes)
pnpm run bench:page-load:smoke    # wiring check, writes results/smoke.json
node page-load/report.mjs         # regenerate the README section
pnpm run charts && pnpm run check:charts
```

`results/latest.json` is the public capture. The report generator refuses to
render a capture whose measured sources have changed since it was taken.
