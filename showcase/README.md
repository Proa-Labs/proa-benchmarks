# Proa showcase benchmarks

This suite measures the locked `proa_showcase` pages in two deliberately
separate layers:

- server rendering records every render duration, output byte count, raw
  output SHA-256, and narrowly canonicalized document SHA-256 for all 12
  pages;
- browser JavaScript records the bytes actually requested by each interactive
  page, V8 precise block coverage, CPU work, forced-GC heap, navigation timing,
  and a verified interaction trace.

The fixture is locked by `fixtures/airbnb-parity-dump/Cargo.lock`. The report
also records the linked Proa revision and SHA-256 of the final deployable
binary, so a run is attributable even when the benchmark worktree is dirty.
The page implementations come from the locked Git `proa_showcase` dependency;
this repository adds the measurement boundary and retained evidence. For the
retained run, its source tree was identical to the local checkout at
`/Users/andrewhariri/Desktop/proa/proa_showcase` even though the checkout's
framework branch had one later commit.

## Coverage

| Page | SSR | Browser JS | Interaction trace |
| --- | --- | --- | --- |
| Airbnb parity | yes | yes | destination, calendar, guests, menu, wishlist |
| ESPN game page | yes | yes | three structurally different tabs |
| Sentry OTel logs | yes | yes | auto-refresh and virtual log reveal |
| Settings console | yes | yes | nav, tabs, rows, boolean state |
| Airbnb home/search/listing | yes | no linked RSJS island | n/a |
| Nike catalog/product | yes | no linked RSJS island | n/a |
| eBay cards/chrome/real chrome | yes | no linked RSJS island | n/a |

“No linked RSJS island” is not reported as a zero-byte browser win. Those
documents are SSR-only cells in this fixture; any JavaScript supplied by a
complete application shell must be measured at that application boundary.

## Build the deployable fixture

A normal Cargo link is intentionally rejected by RSJS's deployable-build
guard. Build through the Proa CLI:

```sh
cargo build --locked --release \
  --manifest-path ../proa/Cargo.toml \
  -p proa-cli --bin cargo-proa

../proa/target/release/cargo-proa proa build \
  --root fixtures/airbnb-parity-dump \
  --no-check --no-assets \
  -p proa_bench_airbnb_parity_dump \
  --artifact-out target/showcase-dump
```

The resulting artifact is
`fixtures/airbnb-parity-dump/target/showcase-dump`.

## Server-rendering samples

The process orchestrator retains raw nanoseconds for every iteration and uses
five independent process repeats in seeded randomized complete blocks:

```sh
pnpm run bench:showcase:ssr
```

Each process defaults to 1,000 warmups and 10,000 recorded renders, except the
400-row Sentry document (100 warmups and 300 recorded renders). Confidence
intervals use the five process medians as independent units; pooled inner
renders are descriptive only. Use `pnpm run bench:showcase:ssr:smoke` for a
three-iteration integrity pass. Use direct `--warmup N` and `--iterations N`
overrides only for smoke tests or an explicitly different protocol.

The full ordered samples are written locally to the ignored
`showcase/results/ssr_raw.json`. A page must have one byte count and one
canonical hash across processes. Raw byte hashes are retained separately.
This currently exposes object-key-order variation in Airbnb listing's embedded
`application/json` payload instead of treating it as semantic drift or
claiming byte determinism.

## Memcpy floor

The matched floor capture measures every linked page in both render and memcpy
mode, using the same release binary and five randomized process blocks. It
includes Airbnb, Nike, eBay, ESPN, Sentry and Settings; this suite has no GitHub
PR fixture or equivalent React implementations for these pages.

Build a separate artifact using the Proa CLI, then capture and regenerate:

```sh
../proa/target/release/proa build \
  --root fixtures/airbnb-parity-dump --locked --no-check --no-assets \
  -p proa_bench_airbnb_parity_dump --artifact-out target/showcase-floor-dump
node showcase/capture_memcpy.mjs --smoke
node showcase/capture_memcpy.mjs
node charts/build.mjs
node charts/verify.mjs
```

The CLI path can point to another Proa checkout. `--dump PATH` selects a different
linked fixture. The capture rejects a changed page roster, mismatched output
bytes or canonical hashes, and P50s that do not reproduce from raw timings.

Render mode retains the existing full-page boundary, including fixture
construction and fresh output allocation. It uses 1,000 warmups and 10,000
renders per process (Sentry: 100 and 300). Memcpy mode copies the exact
pre-rendered page into a warmed, preallocated destination with
`ptr::copy_nonoverlapping`; each of 2,000 samples copies at least 16 MiB after
200 warmup batches. Allocation and byte verification are outside copy timing.
`operations_per_sample` is the divisor for the raw batch durations in `raw_ns`.

The recorded ratio is median render P50 / median copy P50. Every page is retained,
including results above 10×. This is a cache-hot mechanism comparison; it does
not measure HTTP delivery or DRAM bandwidth. Separate dated core workloads in
figure 05 retain their original capture and framework roster.

The checked-in [`results/memcpy-floor.json`](results/memcpy-floor.json) retains
all 120 process summaries, source and binary hashes, and host metadata. Ordered
inner samples remain local in `results/memcpy-floor-raw.json`, whose hash is
recorded in the summary. The capture writes its table to the root README.
`node showcase/capture_memcpy.mjs --report` regenerates only that table;
`node showcase/capture_memcpy.mjs --check` checks its data and source provenance.

## Browser-JavaScript samples

Run a one-sample integrity check first:

```sh
pnpm run bench:showcase:client-js:smoke
```

Then run the retained protocol:

```sh
pnpm run bench:showcase:client-js
```

Defaults are 30 recorded samples per page/profile cell, three fresh Chromium
processes, two discarded warmups per cell and process, and complete randomized
blocks. Every recorded sample uses a new browser context with service workers
blocked and the network cache disabled. The two declared profiles are:

- `desktop`: native CPU, 5 ms latency, 100 Mbps down/up, 1440×1000;
- `mobile4x`: 4× CPU slowdown, 40 ms latency, 10/5 Mbps, 390×844 at 2× DPR.

JavaScript is served over loopback HTTP with gzip level 9. Raw, gzip-9, and
Brotli-11 bytes are computed from the exact linked sources; CDP's encoded
network bytes are retained separately. External fonts and images are fulfilled
with local `204` responses so their variability cannot contaminate the JS
measurement.

The harness fails a cell if a page lacks its runtime or owner module, emits a
browser error, uses a cache, requests an unmapped module, or fails an expected
state transition. This prevents a broken/non-hydrating page from appearing
artificially fast or small.

Raw records and deterministic percentile-bootstrap median confidence intervals
are written locally to the ignored `showcase/results/client_js_raw.json`.
Commit summarized result tables, not the run artifact. Useful overrides include:

```sh
node showcase/capture_client_js.mjs \
  --pages espn,settings-console \
  --profiles desktop \
  --runs 30 \
  --browser-restarts 3 \
  --seed 8402026 \
  --out showcase/results/client_js_raw.json
```

Do not compare initial-load CPU with interaction CPU as if they were the same
operation. Do not compare an SSR-only page with an interactive page as if they
provided the same capability.

## Output-buffer comparison

Figure 05 includes standard Proa and a fresh contiguous output buffer whose
capacity equals the full response size. It covers Cards, the 96-product grid,
the 1,000-row table and all 11 showcase pages shown in figure 05.

```sh
node showcase/build_buffer_bench.mjs /path/to/proa
node showcase/capture_buffers.mjs --smoke
node showcase/capture_buffers.mjs
node charts/build.mjs
node charts/verify.mjs
```

The build uses the separate locked `fixtures/proa-buffer-comparison` package.
It reuses the existing core components and showcase response owners. One
generated eBay component hardcodes `RenderBuffer`; the build helper copies it
from the locked dependency and generalizes only its writer type to `WriteBuf`.
Its markup and render body stay identical. The dependency checkout is untouched.

Both Proa variants include allocation, construction and runtime tags in the
timed region. Output size is measured before timing and supplied as a capacity
hint; it is not computed by an extra render inside each sample. Full-size output
must retain that capacity through every measured render. Both paths return
owned strings and exclude response destruction. The UTF-8 validation policy
matches each original response owner.

Five seeded randomized repeats use a fresh process for each workload and mode.
Rendering uses 1,000 warmups and 10,000 samples, except the core table and Sentry
(100 warmups and 1,000 samples). Memcpy uses 200 warmup batches and 2,000 measured
batches, each copying at least 16 MiB. Every mode verifies byte counts and
canonical HTML against the standard renderer before measurement.

`results/buffer-comparison.json` retains all 210 process summaries, capacity and
parity checks, input hashes, core source fingerprint, locked Proa revision,
binary hash and host details. Ordered inner samples remain local in
`results/buffer-comparison-raw.json`; its hash is retained in the summary.
`node showcase/capture_buffers.mjs --check` checks provenance and the README
table; `--report` regenerates only that table. This is a writer/allocation
experiment, and its exact-size hint is not assumed available in production.

The [eBay optimization experiment](experiments/README.md) retains a tested
source patch and an identical-output comparison against this pinned version.
