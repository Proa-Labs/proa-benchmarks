# Maui Browser Use workflow

This benchmark asks a concrete question: how much faster could a browser agent
research a trip if travel sites returned complete HTML and shipped a small
Proa client graph instead of their current JavaScript applications?

The non-transactional workflow researches an SFO-to-Wailea trip for October
12–19, 2026. It performs 24 task interactions across five surfaces and nine
document navigations:

1. On Google Flights, open Stops, choose nonstop, close the filter, switch to
   Cheapest, and read a fare.
2. On Airbnb, enable free cancellation, open a result, and read its title and
   rating.
3. On Google Hotels, apply a 4+ rating and pool filter, sort by lowest price,
   and read a property and price.
4. On Grand Wailea, open Rooms & Suites, select a category and ocean view,
   open a room, and read its size and occupancy.
5. On Enterprise, choose pickup and return dates and times, select Compact SUV,
   apply the preference, browse vehicles, and read the matching vehicle and
   price.

The workflow never books, submits a reservation, signs in, or enters traveler
or payment data.

## Result

On the 8-vCPU AMD EPYC Milan Hetzner VPS, at 100 Mbps with 40 ms request
latency, three fresh-browser trials completed every live interaction in
**54.04 seconds p50**. The complete-HTML proxy completed the identical action
and assertion sequence in **9.35 seconds p50**. Charging it another 450 ms for
a measured dense Proa client graph on all five surfaces produces a conservative
**9.80 second** estimate: **44.24 seconds / 82% less time**, or **5.51x
faster**.

An independent five-trial run on an Apple M4 Max measured **28.27 seconds**
current versus an adjusted **8.65 seconds**, or **3.27x faster**. The absolute
timing is machine-sensitive; the substantial direction reproduced on both.

| Environment | Current sites | Complete-HTML proxy | Proxy + Proa JS | Saved | Speedup |
|---|---:|---:|---:|---:|---:|
| 8-vCPU EPYC Milan VPS, 3/3 | **54.04 s** | 9.35 s | **9.80 s** | 44.24 s / 82% | **5.51x** |
| 16-core M4 Max, 5/5 | **28.27 s** | 8.20 s | **8.65 s** | 19.62 s / 69% | **3.27x** |

The VPS surface p50s show where the current sites spend the time:

| Surface | Actions | Current | Complete-HTML proxy |
|---|---:|---:|---:|
| Google Flights | 4 | 2.52 s | 1.43 s |
| Airbnb | 2 | 5.74 s | 2.30 s |
| Google Hotels | 4 | 10.29 s | 2.72 s |
| Grand Wailea | 4 | 13.88 s | 1.54 s |
| Enterprise | 10 | 21.84 s | 1.33 s |

The previously reported 8.65-second **current-site** result in this directory
was a navigation and DOM-readiness diagnostic. It did **not** interact with all
five sites and should not be described as an interactive trip-planning
workflow. The 54.04-second VPS and 28.27-second local live results supersede it
for that claim.

## What the counterfactual does

`proa-proxy` is an optimistic experiment, not five completed Proa ports. It:

- requests each real third-party document URL through the same throttled
  browser, so origin latency and the upstream HTML transfer remain in the
  measured path;
- removes site scripts and mounts complete, task-relevant HTML with a 7,308-byte
  raw / 2,221-byte gzip deterministic interaction layer;
- performs the same 24 controls and validates the same structured facts as the
  current-site run; and
- blocks the sites' client JavaScript.

The proxy embeds the task facts. It therefore omits live client API round trips,
does not reproduce each site's complete DOM or visual design, and does not
measure the server work a production port would need to produce those facts.
It is a useful upper bound for the rendering architecture, but it is not an
apples-to-apples launch benchmark. A publishable framework comparison still
requires full HTML parity and real Proa implementations of the five surfaces.

To avoid pretending that the tiny proxy handler is representative of a dense
application, the adjusted estimate charges every surface for the existing
Airbnb parity build's complete Proa graph: 77,225 gzip bytes, two serial 40 ms
dependency rounds, transfer at 100 Mbps, and 3.84 ms of measured script CPU.
That is 90.01 ms per site, or 450.07 ms for the workflow.

Backend latency remains the largest unmeasured variable. On the VPS, the result
remains above 2x even if real ports add ten seconds of aggregate server/API
time:

| Additional server/API time | Estimated workflow | Speedup vs current |
|---:|---:|---:|
| 0 s | 9.80 s | 5.51x |
| 2.5 s | 12.30 s | 4.39x |
| 5 s | 14.80 s | 3.65x |
| 10 s | 19.80 s | 2.73x |

The replay deliberately makes no model calls; it isolates the part page
architecture can change. Adding equal planning/model overhead to both paths
dampens the full-agent ratio:

| Aggregate agent overhead | Current total | Proa estimate | Speedup |
|---:|---:|---:|---:|
| 0 s | 54.04 s | 9.80 s | 5.51x |
| 6 s | 60.04 s | 15.80 s | 3.80x |
| 12 s | 66.04 s | 21.80 s | 3.03x |
| 24 s | 78.04 s | 33.80 s | 2.31x |

Six, 12, and 24 seconds correspond to 250, 500, and 1,000 ms across 24
separate decisions. An autonomous run may batch controls or take extra recovery
turns, so this is a sensitivity analysis rather than a measured LLM result.

## Current JavaScript cost

A separate M4 Max real-site capture uses fresh browser contexts and waits two
seconds after the task predicate becomes actionable so late scripts are
counted. Its per-page p50s were:

| Surface | Actionable | JS transfer | Script requests | Script CPU |
|---|---:|---:|---:|---:|
| Google Flights | 335 ms | 0.92 MiB | 13 | 89 ms |
| Airbnb Wailea | 1,107 ms | 3.36 MiB | 132 | 507 ms |
| Google Hotels Wailea | 1,448 ms | 1.66 MiB | 84 | 254 ms |
| Grand Wailea | 1,229 ms | 1.71 MiB | 76 | 465 ms |
| Enterprise OGG | 687 ms | 3.30 MiB | 115 | 528 ms |
| **Total** | — | **10.94 MiB** | **420** | **1,843 ms** |

Script CPU comes from Chrome's `Performance.ScriptDuration`; it is not inferred
from transfer size. Network delivery, request fan-out, and CPU overlap, so the
1.84 seconds must not be added directly to transfer time. The end-to-end action
workflow is the headline measurement.

## Why the payloads are large

A follow-up run on the same Hetzner VPS enabled V8 precise function coverage
for the complete interaction sequence and classified every completed script
response by owner. It found three different causes rather than one universal
framework problem:

| Surface | Script transfer | Product + maps | Other systems | V8 source entered |
|---|---:|---:|---:|---:|
| Google Flights | 0.83 MiB | 100.0% | 0.0% | 47.6% |
| Airbnb | 6.36 MiB | 86.4% | 13.6% | 49.8% |
| Google Hotels | 1.59 MiB | 89.6% | 10.4% | 50.3% |
| Grand Wailea | 5.62 MiB | 4.1% | 95.9% | 28.9% |
| Enterprise | 4.38 MiB | 35.0% | 65.0% | 46.4% |

- Grand Wailea requested 22 query variants of `gtag/js` across 18 destination
  IDs, plus one GTM container; the query variants transferred 3.08 MiB. Its own
  site/UI code was only 234 KiB.
- Enterprise's largest product chunk is 96% an embedded IANA time-zone JSON
  database by uncompressed source. It also transferred the identical 344 KiB
  reCAPTCHA runtime in both the site document and the challenge frame.
- Airbnb loaded six explicitly checkout/payment-named chunks totaling 307 KiB,
  plus a 334 KiB mixed chunk dominated by payment-provider code, during a
  browse-only search and listing workflow.
- Flights and Hotels were primarily their actual product and map runtimes. They
  have trimming opportunities, but not the same third-party dependency
  explosion.

The direct bundle inspection, category methodology, limitations, and proposed
fixes are in
[`javascript-bundle-investigation-2026-08-28.md`](javascript-bundle-investigation-2026-08-28.md).
The complete generated inventory is
[`javascript-payload-analysis-2026-08-28.md`](javascript-payload-analysis-2026-08-28.md).
Coverage instrumentation intentionally is not used for headline wall-time
claims: it changes execution cost, and “source entered” does not mean “source
required.”

## Agent reachability failures

Two requested brand surfaces could not be included in the completed chain:

- United failed 3/3 local navigations with `ERR_HTTP2_PROTOCOL_ERROR`.
- Hilton returned HTTP 200 but was actionable in 0/3 local trials. Its partial
  page still loaded 3.36 MiB across 100 script requests and used 733 ms of
  script CPU at p50 before the eight-second deadline.

Those are availability, anti-automation, or site-behavior observations. They
are not Proa performance wins. The completed workflow compares flights through
Google Flights and uses Grand Wailea's accessible property site for the
Hilton-owned resort.

## Method

- Browser Use 0.13.8 owns the Chrome lifecycle, navigation, and DOM execution.
  Playwright 1.58 attaches over CDP for deterministic pointer and form controls.
  No model calls are timed, so LLM latency and trajectory variance cannot hide
  the browser/runtime cost.
- Chrome runs headless with a fresh browser session per trial, normal caching
  within a trial, 100 Mbps throughput, and 40 ms request latency through CDP
  network emulation.
- Every action is followed by a state or data assertion. A run enters the p50
  only after all five surfaces, 24 interactions, and their structured outputs
  complete.
- The primary run used the 8-vCPU AMD EPYC Milan Hetzner host with 30 GiB RAM
  and Chrome for Testing 149. Three current and three proxy trials completed.
  The host requires `--no-chromium-sandbox` because Chrome's own sandbox cannot
  initialize inside its container.
- The portability run used an Apple M4 Max with 16 cores, 128 GiB RAM, and
  Chrome 152. Five current and five proxy trials completed.
- Both environments completed on August 28, 2026. Third-party experiments, bot
  policies, prices, and payloads can change; rerun before publishing a fresh
  claim.

This is Browser Use with local Chrome processes, not Browserbase. Browserbase
should be measured and reported as a separate environment when credentials are
available.

Raw summarized results are committed in
`interaction-results-2026-08-28.json`. The harness also writes full per-run
facts to a requested `--output` path.

The trace-enabled follow-up is preserved at three levels:

- [`interaction-timings-2026-08-28.md`](interaction-timings-2026-08-28.md)
  contains the readable p50 report: every main-frame document phase, every
  surface, and every navigation, action, wait, pause, evaluation, and
  assertion.
- [`interaction-timing-results-2026-08-28.json`](interaction-timing-results-2026-08-28.json)
  contains the same summaries and all three per-run wall-time samples in
  machine-readable form. The accompanying
  [`interaction-timing-gantt-2026-08-28.svg`](interaction-timing-gantt-2026-08-28.svg)
  plots the sequential workflow on one time axis, and
  [`interaction-timing-environment-2026-08-28.json`](interaction-timing-environment-2026-08-28.json)
  pins the host, browser, package, and network-emulation versions.
- `interaction-timing-raw-{current,proa-proxy}-2026-08-28.json.gz` contains
  every request and raw Playwright timing object from all six traced trials.
  The adjacent listener-free controls are
  `interaction-control-{current,proa-proxy}-2026-08-28.json`.
- [`javascript-bundle-investigation-2026-08-28.md`](javascript-bundle-investigation-2026-08-28.md)
  explains why each site's script graph is large. The generated URL/category
  inventory is `javascript-payload-analysis-2026-08-28.{md,json}`, and
  `javascript-coverage-raw-current-2026-08-28.json.gz` preserves the single-run
  request and V8 coverage source.
- [`document-delivery-analysis-2026-08-28.md`](document-delivery-analysis-2026-08-28.md)
  isolates the unexpectedly long HTML response tails. It contains all 30
  fresh-browser, document-only samples at 40 ms / 100 Mbps, 0 ms / 100 Mbps,
  and 0 ms / 1 Gbps. The machine-readable result is
  [`document-delivery-analysis-2026-08-28.json`](document-delivery-analysis-2026-08-28.json),
  and
  [`document-delivery-packet-evidence-2026-08-28.json`](document-delivery-packet-evidence-2026-08-28.json)
  records the CDP-to-packet correlation. Raw packet captures were not
  committed because they retain unrelated encrypted-flow metadata.

The detailed recorder keeps three overlapping clocks instead of inventing an
additive breakdown. Step wall time comes from the harness monotonic clock.
Chrome's `Performance.getMetrics` supplies renderer task, script, layout, and
style counter deltas. Playwright supplies request start/end times, response
sizes, and document DNS/connect/TLS/request-to-first-byte/download phases.
For main-frame documents, CDP additionally supplies response headers,
protocol, encoded completion, and every decoded `Network.dataReceived`
delivery timestamp. This exposes long gaps hidden inside a single `download`
number without recording response bodies.
Network `active` is the union of concurrent request intervals, `span` includes
discovery gaps from the first request to the last response, and `summed`
intentionally double-counts parallel requests. None of those network measures
should be added to browser CPU or wall time.

In proxy mode, the browser still discovers some original script URLs before
the route interceptor aborts them. They appear as started requests with zero
response bytes; they are not executed. The proxy also fetches and rewrites HTML
inside the route handler, so its document `total` remains meaningful while the
browser's internal request-to-first-byte subphase can be unavailable. Use the
current-site document rows—not intercepted proxy subphases—to study origin DNS,
connection, TLS, and first-byte behavior.

## Reproduce

Create an environment with Browser Use and Playwright, then run both modes:

```sh
python3 -m venv /tmp/proa-browser-use
/tmp/proa-browser-use/bin/pip install \
  browser-use==0.13.8 playwright==1.58.0

/tmp/proa-browser-use/bin/python \
  travel-agent/run_browser_use_interactions.py \
  --runs 5 --mode current --output /tmp/travel-current.json

/tmp/proa-browser-use/bin/python \
  travel-agent/run_browser_use_interactions.py \
  --runs 5 --mode proa-proxy --output /tmp/travel-proxy.json
```

For the request-level and per-interaction trace, add `--detailed-timings` to
both runs. Detailed mode requires `--output` because the raw payload is large:

```sh
/tmp/proa-browser-use/bin/python \
  travel-agent/run_browser_use_interactions.py \
  --runs 3 --mode current --detailed-timings \
  --output /tmp/travel-current-detailed.json

/tmp/proa-browser-use/bin/python \
  travel-agent/run_browser_use_interactions.py \
  --runs 3 --mode proa-proxy --detailed-timings \
  --output /tmp/travel-proxy-detailed.json

python3 travel-agent/summarize_browser_timings.py \
  --current /tmp/travel-current-detailed.json \
  --proa-proxy /tmp/travel-proxy-detailed.json \
  --metadata travel-agent/interaction-timing-environment-2026-08-28.json \
  --output /tmp/travel-timing-summary.json \
  --markdown /tmp/travel-timing-summary.md

python3 travel-agent/render_browser_timing_gantt.py \
  --summary /tmp/travel-timing-summary.json \
  --output /tmp/travel-timing-gantt.svg
```

To capture and classify JavaScript execution coverage, use a single diagnostic
run. Do not use its profiler-instrumented wall time as a performance result:

```sh
/tmp/proa-browser-use/bin/python \
  travel-agent/run_browser_use_interactions.py \
  --runs 1 --mode current --detailed-timings --javascript-coverage \
  --output /tmp/travel-current-coverage.json

python3 travel-agent/analyze_javascript_payloads.py \
  --input /tmp/travel-current-coverage.json \
  --output /tmp/javascript-payload-analysis.json \
  --markdown /tmp/javascript-payload-analysis.md
```

To isolate document delivery from scripts, APIs, styles, images, and fonts,
run the fresh-browser document probe. `--capture-gap-context` is optional and
stores only bounded snippets around long decoded-body gaps; it never stores the
complete response body.

```sh
/tmp/proa-browser-use/bin/python \
  travel-agent/probe_document_delivery.py \
  --runs 5 --surfaces airbnb,hotels \
  --latency-ms 40 --download-mbps 100 --document-only \
  --output /tmp/document-only-40ms-100mbps.json

python3 travel-agent/summarize_document_delivery.py \
  --probe '40ms / 100Mbps=/tmp/document-only-40ms-100mbps.json' \
  --probe '0ms / 100Mbps=/tmp/document-only-0ms-100mbps.json' \
  --probe '0ms / 1Gbps=/tmp/document-only-0ms-1000mbps.json' \
  --packet-evidence \
    travel-agent/document-delivery-packet-evidence-2026-08-28.json \
  --output /tmp/document-delivery-analysis.json \
  --markdown /tmp/document-delivery-analysis.md
```

The default Chrome path targets macOS. Set `AGENT_TRAVEL_CHROME` to a Chrome or
Chromium executable on other systems. Useful controls are `--latency-ms`,
`--download-mbps`, `--navigation-timeout-seconds`, `--action-timeout-seconds`,
and `--surfaces`. `--no-chromium-sandbox` exists for sandboxed Linux hosts where
Chrome cannot start its own sandbox; do not use it when the normal Chrome
sandbox is available.

The VPS invocation used:

```sh
AGENT_TRAVEL_CHROME=/path/to/chrome \
/tmp/proa-browser-use/bin/python \
  travel-agent/run_browser_use_interactions.py \
  --runs 3 --mode current --no-chromium-sandbox
```

Capture current real-site bytes and CPU separately:

```sh
AGENT_TRAVEL_RUNS=3 \
AGENT_TRAVEL_SURFACES=flight_compare,airbnb,hotel_compare,grand_wailea,rental_car \
node travel-agent/capture.mjs
```

Build the linked Airbnb parity dump and measure its real Proa asset graph:

```sh
scripts/refresh-proa.sh
cargo proa build --root fixtures/airbnb-parity-dump --no-check --no-assets \
  -p proa_bench_airbnb_parity_dump \
  --artifact-out target/airbnb-parity-dump
AGENT_TRAVEL_RUNS=10 node travel-agent/measure_proa_js.mjs
```

The fixture follows Proa's `main` branch through direct Git dependencies. Its
Cargo lockfile records the exact resolved revision and the refresh script
advances every Proa package together before a new measurement. The linked
binary emits the matching core, query, island, and component assets.
