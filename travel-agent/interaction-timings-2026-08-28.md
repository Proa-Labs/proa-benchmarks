# Detailed Maui browser workflow timings

Measured August 28, 2026 on the 8-vCPU AMD EPYC Milan Hetzner host with
Chrome for Testing 149, 100 Mbps emulated throughput, 40 ms request latency,
a fresh browser per trial, and normal caching within each trial. Every run
completed five surfaces, 24 state-changing interactions, and all assertions.
No LLM calls are included.

All table values are independent p50s across three successful trials unless
a row explicitly lists the three samples. Wall time, network-active time,
and browser CPU overlap and **must not be added together**. `Active` is the
union of request intervals; `span` is first request start to last response
end, including discovery gaps; `summed` double-counts parallel requests.
TLS is contained within connect time. A dash usually means connection reuse
or that Chromium did not expose that phase. Renderer CPU counters cover
asynchronous page work occurring during the sampling window, not only code
synchronously caused by the named harness operation.

In proxy mode, original script requests can be observed before interception
aborts them; they have zero response bytes and do not execute. HTML is fetched
and rewritten inside the route handler, so proxy document total time remains
useful but its browser-visible first-byte subphase can be absent.

A follow-up document-only probe and packet capture determined that the long
Airbnb and Google Hotels HTML tails include real on-wire pauses, rather than
only bandwidth, subresource, parser, or CDP observer time. At 100 Mbps, Airbnb
repeatedly pauses after roughly 507 KiB decoded and Google Hotels after roughly
1.39 MiB decoded; matching HTTP/2 and HTTP/3 packet silences place the delay in
origin/CDN delivery. See
[`document-delivery-analysis-2026-08-28.md`](document-delivery-analysis-2026-08-28.md)
for all 30 controlled samples and the exact limitation: the public trace
cannot distinguish application-side deferred work from edge buffering.

## Low-overhead controls

These adjacent runs use the same workflow without request listeners or
CDP performance sampling.

| Mode | Run 1 | Run 2 | Run 3 | p50 |
|---|---:|---:|---:|---:|
| current | 61.32 s | 63.21 s | 57.51 s | 61.32 s |
| proa-proxy | 9.85 s | 10.32 s | 9.08 s | 9.85 s |

Control workflow speedup: **6.23×**. Trace overhead was **2.3%** for current sites and **5.0%** for the proxy.

## Traced comparison

| Surface | Current | Proa proxy | Current / proxy |
|---|---:|---:|---:|
| flights | 2.61 s | 1.43 s | 1.82× |
| airbnb | 6.49 s | 2.64 s | 2.46× |
| hotels | 10.96 s | 2.84 s | 3.86× |
| grand_wailea | 18.15 s | 2.07 s | 8.78× |
| enterprise | 24.60 s | 1.45 s | 16.95× |
| **workflow** | **62.75 s** | **10.35 s** | **6.07×** |

## current

Workflow p50: **62.75 s** across 3 successful traced trials (56.25 s, 74.84 s, 62.75 s).

### Initial page and script path

`Initial navigation` is the harness call through page readiness; HTML
shows the main-frame response(s) inside it. Script active/span covers
the full surface, including later interactions and navigations.

| Surface | Initial navigation | HTML response(s) | HTML body | Script started / completed / bytes | Script active / span | Surface JS CPU | Full surface |
|---|---:|---:|---:|---:|---:|---:|---:|
| flights | 1.26 s | 437.1 ms | 251.7 KiB | 23 / 23 / 850.5 KiB | 817.2 ms / 2.00 s | 626.9 ms | 2.61 s |
| airbnb | 2.57 s | 857.9 ms | 116.6 KiB | 178 / 176 / 4.54 MiB | 2.48 s / 6.06 s | 1.58 s | 6.49 s |
| hotels | 5.39 s | 104.6 ms → 1.52 s | 0.0 KiB → 312.8 KiB | 101 / 92 / 1.60 MiB | 1.78 s / 8.04 s | 788.6 ms | 10.96 s |
| grand_wailea | 8.87 s | 58.0 ms | 27.0 KiB | 543 / 540 / 7.04 MiB | 11.25 s / 17.36 s | 5.53 s | 18.15 s |
| enterprise | 3.51 s | 318.2 ms | 88.4 KiB | 401 / 400 / 4.41 MiB | 7.68 s / 23.85 s | 7.67 s | 24.60 s |

### Surfaces

`Between-step` is traced wall outside named operations, dominated by
CDP metric queries and request-listener bookkeeping. It is observer /
harness overhead, not a page phase to add to the site cost.

| Surface | Wall samples | Wall p50 | Named-step wall | Between-step | Task CPU | JS CPU | Layout / style | Requests | Network active | Script started / completed / bytes | Script active / span / summed | API started / completed / bytes | API active / span / summed |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| flights | 2.61 s, 2.69 s, 2.54 s | 2.61 s | 2.56 s | 38.2 ms | 1.85 s | 626.9 ms | 56.1 ms / 168.4 ms | 55 | 1.72 s | 23 / 23 / 850.5 KiB | 817.2 ms / 2.00 s / 1.35 s | 13 / 13 / 17.1 KiB | 787.1 ms / 1.90 s / 1.08 s |
| airbnb | 5.85 s, 9.14 s, 6.49 s | 6.49 s | 6.35 s | 139.7 ms | 4.36 s | 1.58 s | 210.0 ms / 543.2 ms | 380 | 6.06 s | 178 / 176 / 4.54 MiB | 2.48 s / 6.06 s / 14.17 s | 87 / 86 / 139.9 KiB | 5.25 s / 6.36 s / 18.14 s |
| hotels | 10.06 s, 12.22 s, 10.96 s | 10.96 s | 10.91 s | 97.9 ms | 7.50 s | 788.6 ms | 80.7 ms / 321.9 ms | 364 | 6.97 s | 101 / 92 / 1.60 MiB | 1.78 s / 8.04 s / 4.98 s | 43 / 40 / 281.5 KiB | 4.14 s / 7.73 s / 6.76 s |
| grand_wailea | 16.00 s, 24.50 s, 18.15 s | 18.15 s | 15.18 s | 2.97 s | 11.99 s | 5.53 s | 147.8 ms / 264.6 ms | 1294 | 16.81 s | 543 / 540 / 7.04 MiB | 11.25 s / 17.36 s / 106.99 s | 281 / 275 / 159.0 KiB | 12.77 s / 17.15 s / 74.50 s |
| enterprise | 21.74 s, 26.29 s, 24.60 s | 24.60 s | 24.05 s | 554.8 ms | 15.79 s | 7.67 s | 280.9 ms / 434.5 ms | 877 | 19.41 s | 401 / 400 / 4.41 MiB | 7.68 s / 23.85 s / 18.24 s | 173 / 169 / 738.6 KiB | 13.08 s / 24.34 s / 36.93 s |

### Main-frame documents

This is initial HTML plus every later full-document navigation. A route
change absent from this table was client-side and used scripts/APIs instead.

| Surface | Role / initiating step | Document | n | Offset | Total | DNS | Connect | TLS | Request → first byte | Download | Body |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| flights | initial HTML | `www.google.com/travel/flights` | 3 | 5.3 ms | 437.1 ms | — | — | — | 216.1 ms | 220.8 ms | 251.7 KiB |
| airbnb | initial HTML | `www.airbnb.com/s/Wailea--Hawaii--United-States/homes` | 3 | 17.3 ms | 857.9 ms | — | — | — | 190.5 ms | 667.2 ms | 116.6 KiB |
| hotels | initial HTML redirect | `www.google.com/travel/hotels` | 3 | 141.0 ms | 104.6 ms | — | — | — | 101.4 ms | 4.7 ms | 0.0 KiB |
| hotels | initial HTML | `www.google.com/travel/search` | 3 | 241.2 ms | 1.52 s | — | — | — | 109.3 ms | 1.42 s | 312.8 KiB |
| grand_wailea | initial HTML | `www.grandwailea.com/` | 3 | 10.9 ms | 58.0 ms | 0.0 ms | 7.1 ms | 7.1 ms | 43.2 ms | 5.3 ms | 27.0 KiB |
| grand_wailea | Grand Wailea room catalog | `www.grandwailea.com/stay/rooms-suites` | 3 | 9.31 s | 48.5 ms | — | — | — | 41.8 ms | 5.4 ms | 23.7 KiB |
| grand_wailea | Grand Wailea room detail | `www.grandwailea.com/stay/ocean-view-king` | 1 | 13.63 s | 49.0 ms | — | — | — | 43.2 ms | 5.5 ms | 30.5 KiB |
| grand_wailea | Grand Wailea room detail | `www.grandwailea.com/stay/deluxe-ocean-view-king` | 2 | 15.38 s | 47.9 ms | — | — | — | 41.8 ms | 5.7 ms | 30.2 KiB |
| enterprise | initial HTML | `www.enterprise.com/en/car-rental-locations/us/hi/kahului-airport-36e4.html` | 3 | 18.7 ms | 318.2 ms | 83.0 ms | 15.0 ms | 10.4 ms | 267.3 ms | 50.4 ms | 88.4 KiB |
| enterprise | later navigation | `www.enterprise.com/en/car-rental-locations/us/hi/kahului-airport-36e4.html` | 3 | 5.87 s | 309.5 ms | — | — | — | 242.0 ms | 30.6 ms | 86.8 KiB |
| enterprise | Enterprise vehicle availability | `www.enterprise.com/en/reserve.html` | 3 | 15.95 s | 4.6 ms | — | — | — | 0.2 ms | 4.2 ms | 0.0 KiB |

### Every workflow step: wall and browser CPU

| Surface | Offset | Kind | Step | n | Wall | Task CPU | JS CPU | Layout | Style | Polls / poll evaluation |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| flights | 1.4 ms | navigation | load Google Flights results | 3 | 1.26 s | 936.9 ms | 263.4 ms | 40.8 ms | 98.5 ms | — / — |
| flights | 1.26 s | wait | Google Flights results | 3 | 5.3 ms | 8.0 ms | 3.9 ms | 0.0 ms | 0.2 ms | 1 / 5.3 ms |
| flights | 1.27 s | action | click "Stops" | 3 | 304.3 ms | 203.6 ms | 21.3 ms | 1.6 ms | 18.6 ms | — / — |
| flights | 1.61 s | wait | Flights stops filter | 3 | 168.1 ms | 156.3 ms | 116.0 ms | 3.8 ms | 13.8 ms | 2 / 117.2 ms |
| flights | 1.77 s | action | click "Nonstop only" | 3 | 211.9 ms | 180.1 ms | 110.7 ms | 1.9 ms | 4.5 ms | — / — |
| flights | 1.98 s | pause | allow Flights nonstop filter to settle | 3 | 201.0 ms | 19.4 ms | 3.1 ms | 0.3 ms | 1.3 ms | — / — |
| flights | 2.19 s | action | close Flights stops dialog | 3 | 77.3 ms | 41.4 ms | 10.2 ms | 0.5 ms | 7.6 ms | — / — |
| flights | 2.27 s | action | click "Cheapest" | 3 | 245.4 ms | 215.5 ms | 10.3 ms | 5.4 ms | 19.9 ms | — / — |
| flights | 2.51 s | wait | filtered Flights fares | 3 | 13.2 ms | 15.4 ms | 2.6 ms | 0.4 ms | 3.7 ms | 1 / 13.1 ms |
| flights | 2.53 s | evaluation | extract filtered flight facts | 3 | 103.3 ms | 103.7 ms | 95.9 ms | 2.1 ms | 2.5 ms | — / — |
| airbnb | 5.1 ms | navigation | load Airbnb Wailea results | 3 | 2.57 s | 2.01 s | 722.3 ms | 80.8 ms | 232.4 ms | — / — |
| airbnb | 2.58 s | wait | Airbnb search results | 3 | 17.9 ms | 21.7 ms | 3.9 ms | 0.8 ms | 4.3 ms | 1 / 17.9 ms |
| airbnb | 2.68 s | evaluation | inspect and dismiss Airbnb consent modal | 3 | 63.2 ms | 69.1 ms | 42.8 ms | 1.2 ms | 6.9 ms | — / — |
| airbnb | 2.76 s | wait | dismissed Airbnb modal | 3 | 739.7 ms | 715.2 ms | 210.3 ms | 85.7 ms | 175.1 ms | 6 / 488.7 ms |
| airbnb | 3.50 s | action | enable Airbnb free cancellation | 3 | 297.3 ms | 240.8 ms | 114.4 ms | 12.6 ms | 35.9 ms | — / — |
| airbnb | 3.84 s | wait | Airbnb cancellation filter | 3 | 11.7 ms | 14.7 ms | 2.2 ms | 0.0 ms | 2.7 ms | 1 / 11.7 ms |
| airbnb | 3.87 s | wait | filtered Airbnb listing cards | 3 | 593.8 ms | 307.3 ms | 60.2 ms | 6.2 ms | 38.9 ms | 9 / 189.6 ms |
| airbnb | 4.50 s | evaluation | inspect first filtered Airbnb listing | 3 | 27.1 ms | 27.9 ms | 17.4 ms | 0.7 ms | 1.5 ms | — / — |
| airbnb | 4.53 s | evaluation | open Airbnb listing detail | 3 | 262.7 ms | 265.2 ms | 212.7 ms | 3.9 ms | 9.4 ms | — / — |
| airbnb | 4.81 s | wait | Airbnb listing detail | 3 | 1.65 s | 700.0 ms | 166.9 ms | 9.9 ms | 38.4 ms | 14 / 681.6 ms |
| airbnb | 6.47 s | evaluation | extract Airbnb listing facts | 3 | 41.9 ms | 29.9 ms | 11.0 ms | 0.4 ms | 1.7 ms | — / — |
| hotels | 4.1 ms | navigation | load Google Hotels Wailea results | 3 | 5.39 s | 3.19 s | 600.7 ms | 55.5 ms | 205.2 ms | — / — |
| hotels | 5.40 s | wait | Google Hotels results | 3 | 2.8 ms | 1.9 ms | 0.1 ms | 0.0 ms | 0.0 ms | 1 / 2.8 ms |
| hotels | 5.41 s | action | click "4+ rating" | 3 | 367.7 ms | 290.0 ms | 15.9 ms | 2.4 ms | 25.1 ms | — / — |
| hotels | 5.70 s | pause | allow Google Hotels rating filter to settle | 3 | 251.0 ms | 168.7 ms | 9.5 ms | 0.9 ms | 12.0 ms | — / — |
| hotels | 5.95 s | action | click "Pool" | 3 | 290.5 ms | 121.9 ms | 7.9 ms | 0.7 ms | 8.8 ms | — / — |
| hotels | 6.15 s | wait | Google Hotels quick filters | 3 | 2.1 ms | 1.1 ms | 0.1 ms | 0.0 ms | 0.0 ms | 1 / 2.1 ms |
| hotels | 6.16 s | action | click "Sort by" | 3 | 273.9 ms | 180.6 ms | 27.3 ms | 1.1 ms | 15.0 ms | — / — |
| hotels | 6.41 s | wait | Google Hotels sort choices | 3 | 55.1 ms | 26.6 ms | 2.8 ms | 0.8 ms | 6.7 ms | 2 / 4.5 ms |
| hotels | 6.47 s | action | click "Lowest price" | 3 | 4.46 s | 3.61 s | 103.9 ms | 20.4 ms | 65.8 ms | — / — |
| hotels | 10.94 s | wait | sorted Google Hotels results | 3 | 2.7 ms | 17.0 ms | 0.1 ms | 0.2 ms | 0.2 ms | 1 / 2.7 ms |
| hotels | 10.96 s | evaluation | extract filtered Google Hotels facts | 3 | 3.4 ms | 16.8 ms | 0.2 ms | 0.0 ms | 0.1 ms | — / — |
| grand_wailea | 1.1 ms | navigation | load Grand Wailea home page | 3 | 8.87 s | 6.66 s | 3.02 s | 113.2 ms | 107.9 ms | — / — |
| grand_wailea | 9.11 s | wait | Grand Wailea home page | 3 | 9.8 ms | 23.0 ms | 0.2 ms | 0.1 ms | 0.1 ms | 1 / 9.8 ms |
| grand_wailea | 9.22 s | evaluation | dismiss Grand Wailea cookie banner | 3 | 3.8 ms | 2.1 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 9.24 s | evaluation | open Grand Wailea room catalog | 3 | 40.7 ms | 39.7 ms | 30.3 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 9.29 s | wait | Grand Wailea room catalog | 3 | 1.55 s | 1.03 s | 458.1 ms | 10.2 ms | 41.4 ms | 2 / 1.50 s |
| grand_wailea | 11.22 s | action | select Grand Wailea room category | 3 | 496.1 ms | 569.8 ms | 401.9 ms | 0.8 ms | 1.1 ms | — / — |
| grand_wailea | 11.88 s | pause | allow Grand Wailea category filter to settle | 3 | 200.7 ms | 212.1 ms | 56.0 ms | 1.5 ms | 1.4 ms | — / — |
| grand_wailea | 12.18 s | action | select Grand Wailea ocean view | 3 | 401.3 ms | 371.0 ms | 67.8 ms | 0.6 ms | 0.5 ms | — / — |
| grand_wailea | 13.02 s | wait | filtered Grand Wailea rooms | 3 | 31.4 ms | 35.5 ms | 15.9 ms | 0.0 ms | 0.2 ms | 1 / 31.4 ms |
| grand_wailea | 13.44 s | evaluation | inspect filtered Grand Wailea room | 3 | 32.0 ms | 33.9 ms | 7.7 ms | 0.1 ms | 0.3 ms | — / — |
| grand_wailea | 13.51 s | evaluation | open Grand Wailea room detail | 3 | 65.0 ms | 64.1 ms | 30.5 ms | 0.4 ms | 1.1 ms | — / — |
| grand_wailea | 13.61 s | wait | Grand Wailea room detail | 3 | 2.57 s | 1.64 s | 893.4 ms | 18.6 ms | 66.4 ms | 2 / 2.52 s |
| grand_wailea | 17.06 s | evaluation | extract Grand Wailea room facts | 3 | 1.09 s | 1.39 s | 385.3 ms | 5.7 ms | 32.4 ms | — / — |
| enterprise | 2.6 ms | navigation | load Enterprise Kahului reservation form | 3 | 3.51 s | 2.21 s | 821.3 ms | 121.2 ms | 114.7 ms | — / — |
| enterprise | 3.56 s | wait | Enterprise reservation form | 3 | 171.1 ms | 143.8 ms | 42.9 ms | 3.9 ms | 27.4 ms | 1 / 171.0 ms |
| enterprise | 5.67 s | evaluation | dismiss Enterprise consent and login overlays | 3 | 70.0 ms | 80.0 ms | 55.6 ms | 0.9 ms | 0.9 ms | — / — |
| enterprise | 5.89 s | pause | allow Enterprise overlays to close | 3 | 250.5 ms | 118.8 ms | 0.0 ms | 0.0 ms | 0.1 ms | — / — |
| enterprise | 6.15 s | wait | Enterprise form after consent dismissal | 3 | 3.74 s | 3.11 s | 1.45 s | 55.2 ms | 96.8 ms | 13 / 3.12 s |
| enterprise | 10.63 s | action | open Enterprise pickup calendar | 3 | 804.5 ms | 691.3 ms | 306.3 ms | 17.5 ms | 39.9 ms | — / — |
| enterprise | 11.54 s | wait | open Enterprise pickup calendar | 3 | 18.2 ms | 38.6 ms | 5.5 ms | 0.8 ms | 0.4 ms | 1 / 18.2 ms |
| enterprise | 11.54 s | evaluation | check whether Enterprise October pickup date is visible | 3 | 9.0 ms | 14.7 ms | 0.1 ms | 0.2 ms | 0.1 ms | — / — |
| enterprise | 11.55 s | action | advance Enterprise pickup calendar | 3 | 104.0 ms | 63.8 ms | 34.1 ms | 2.7 ms | 2.5 ms | — / — |
| enterprise | 11.66 s | wait | Enterprise October pickup date | 3 | 20.3 ms | 20.2 ms | 0.9 ms | 0.3 ms | 0.5 ms | 1 / 20.2 ms |
| enterprise | 11.68 s | action | select Enterprise pickup date | 3 | 205.9 ms | 193.8 ms | 96.3 ms | 3.9 ms | 3.9 ms | — / — |
| enterprise | 12.08 s | wait | Enterprise return date control | 3 | 8.2 ms | 4.3 ms | 0.0 ms | 0.1 ms | 0.1 ms | 1 / 8.2 ms |
| enterprise | 12.10 s | action | open Enterprise return calendar | 3 | 134.2 ms | 96.0 ms | 62.7 ms | 2.6 ms | 2.4 ms | — / — |
| enterprise | 12.26 s | wait | Enterprise October return date | 3 | 5.6 ms | 2.2 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 5.6 ms |
| enterprise | 12.27 s | action | select Enterprise return date | 3 | 160.6 ms | 126.6 ms | 85.6 ms | 2.7 ms | 1.9 ms | — / — |
| enterprise | 12.55 s | action | select Enterprise pickup time | 3 | 54.9 ms | 53.2 ms | 33.2 ms | 1.0 ms | 0.5 ms | — / — |
| enterprise | 12.66 s | action | select Enterprise return time | 3 | 56.3 ms | 53.5 ms | 30.7 ms | 1.4 ms | 0.8 ms | — / — |
| enterprise | 12.75 s | action | open Enterprise vehicle filters | 3 | 230.2 ms | 181.2 ms | 109.7 ms | 5.5 ms | 11.4 ms | — / — |
| enterprise | 13.20 s | wait | Enterprise vehicle filter | 3 | 4.8 ms | 3.3 ms | 0.1 ms | 0.1 ms | 0.1 ms | 1 / 4.8 ms |
| enterprise | 13.21 s | action | select Enterprise compact SUV | 3 | 168.8 ms | 127.8 ms | 98.1 ms | 1.7 ms | 1.1 ms | — / — |
| enterprise | 13.56 s | wait | Enterprise compact SUV selection | 3 | 4.2 ms | 2.8 ms | 0.0 ms | 0.1 ms | 0.1 ms | 1 / 4.2 ms |
| enterprise | 13.57 s | action | apply Enterprise vehicle filter | 3 | 186.0 ms | 142.6 ms | 85.4 ms | 2.9 ms | 6.8 ms | — / — |
| enterprise | 13.88 s | wait | applied Enterprise compact SUV filter | 3 | 4.1 ms | 2.2 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 4.1 ms |
| enterprise | 13.90 s | action | browse Enterprise vehicles | 3 | 248.3 ms | 182.2 ms | 123.8 ms | 1.7 ms | 1.2 ms | — / — |
| enterprise | 14.30 s | wait | Enterprise vehicle availability | 3 | 11.46 s | 7.11 s | 3.16 s | 43.8 ms | 106.0 ms | 46 / 8.93 s |
| enterprise | 24.44 s | evaluation | extract Enterprise vehicle facts | 3 | 121.6 ms | 107.1 ms | 34.3 ms | 2.1 ms | 0.8 ms | — / — |

### Every workflow step: overlapping network work

| Surface | Step | n | All requests / active | Documents active | Scripts started / completed / bytes | Scripts active / span / summed | APIs started / completed / bytes | APIs active / span / summed | Style/font active | Image/media active |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| flights | load Google Flights results | 3 | 43 / 964.9 ms | 463.0 ms | 19 / 19 / 842.7 KiB | 519.7 ms / 968.8 ms / 994.6 ms | 5 / 5 / 0.7 KiB | 201.0 ms / 527.0 ms / 219.0 ms | 178.6 ms | 117.1 ms |
| flights | Google Flights results | 3 | 0 / 5.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 5.3 ms / 5.3 ms / 5.3 ms | 0 / 0 / 0.0 KiB | 5.3 ms / 5.3 ms / 5.3 ms | 0.0 ms | 5.3 ms |
| flights | click "Stops" | 3 | 5 / 295.8 ms | 0.0 ms | 3 / 3 / 2.8 KiB | 34.3 ms / 304.3 ms / 42.3 ms | 2 / 2 / 8.9 KiB | 295.8 ms / 304.3 ms / 348.4 ms | 0.0 ms | 18.9 ms |
| flights | Flights stops filter | 3 | 1 / 85.2 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 41.5 ms / 41.5 ms / 103.3 ms | 1 / 1 / 0.2 KiB | 53.2 ms / 168.1 ms / 86.2 ms | 0.0 ms | 0.0 ms |
| flights | click "Nonstop only" | 3 | 1 / 45.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 1 / 1 / 0.2 KiB | 45.3 ms / 45.3 ms / 45.3 ms | 0.0 ms | 0.0 ms |
| flights | allow Flights nonstop filter to settle | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| flights | close Flights stops dialog | 3 | 2 / 65.0 ms | 0.0 ms | 1 / 1 / 5.0 KiB | 23.5 ms / 23.5 ms / 23.5 ms | 1 / 1 / 0.2 KiB | 65.0 ms / 65.0 ms / 65.0 ms | 0.0 ms | 0.0 ms |
| flights | click "Cheapest" | 3 | 1 / 91.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 59.2 ms / 59.2 ms / 59.2 ms | 1 / 1 / 0.2 KiB | 36.3 ms / 36.3 ms / 36.3 ms | 0.0 ms | 0.0 ms |
| flights | filtered Flights fares | 3 | 2 / 13.2 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 2 / 2 / 6.9 KiB | 13.2 ms / 13.2 ms / 35.4 ms | 0.0 ms | 0.0 ms |
| flights | extract filtered flight facts | 3 | 0 / 103.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 103.3 ms / 103.3 ms / 185.0 ms | 0.0 ms | 0.0 ms |
| airbnb | load Airbnb Wailea results | 3 | 205 / 2.36 s | 857.9 ms | 122 / 120 / 3.22 MiB | 1.27 s / 2.29 s / 10.67 s | 28 / 27 / 37.4 KiB | 1.63 s / 2.46 s / 3.95 s | 233.0 ms | 775.8 ms |
| airbnb | Airbnb search results | 3 | 0 / 17.9 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 17.9 ms / 17.9 ms / 38.3 ms | 0 / 0 / 0.0 KiB | 17.9 ms / 17.9 ms / 17.9 ms | 0.0 ms | 17.9 ms |
| airbnb | inspect and dismiss Airbnb consent modal | 3 | 1 / 63.2 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 60.5 ms / 60.5 ms / 93.4 ms | 0 / 0 / 0.0 KiB | 63.2 ms / 63.2 ms / 106.2 ms | 0.0 ms | 38.4 ms |
| airbnb | dismissed Airbnb modal | 3 | 34 / 679.9 ms | 138.9 ms | 1 / 1 / 26.0 KiB | 47.0 ms / 47.0 ms / 47.0 ms | 13 / 13 / 6.7 KiB | 676.8 ms / 729.5 ms / 2.13 s | 129.1 ms | 395.6 ms |
| airbnb | enable Airbnb free cancellation | 3 | 15 / 297.3 ms | 137.8 ms | 2 / 2 / 5.9 KiB | 90.3 ms / 123.2 ms / 90.3 ms | 3 / 3 / 32.5 KiB | 291.3 ms / 297.3 ms / 1.72 s | 0.0 ms | 118.9 ms |
| airbnb | Airbnb cancellation filter | 3 | 0 / 11.7 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 11.7 ms / 11.7 ms / 47.8 ms | 0.0 ms | 0.0 ms |
| airbnb | filtered Airbnb listing cards | 3 | 26 / 593.8 ms | 0.0 ms | 15 / 15 / 164.7 KiB | 269.0 ms / 345.5 ms / 860.9 ms | 8 / 8 / 3.0 KiB | 593.8 ms / 593.8 ms / 1.65 s | 0.0 ms | 180.8 ms |
| airbnb | inspect first filtered Airbnb listing | 3 | 0 / 27.1 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 27.1 ms / 27.1 ms / 108.3 ms | 0.0 ms | 0.0 ms |
| airbnb | open Airbnb listing detail | 3 | 15 / 262.7 ms | 0.0 ms | 1 / 1 / 6.8 KiB | 15.7 ms / 15.7 ms / 15.7 ms | 7 / 7 / 0.1 KiB | 262.7 ms / 262.7 ms / 1.36 s | 0.0 ms | 70.2 ms |
| airbnb | Airbnb listing detail | 3 | 71 / 1.63 s | 0.0 ms | 39 / 39 / 1.16 MiB | 549.3 ms / 1.65 s / 2.10 s | 19 / 19 / 51.1 KiB | 1.60 s / 1.65 s / 6.96 s | 0.0 ms | 155.6 ms |
| airbnb | extract Airbnb listing facts | 3 | 7 / 41.9 ms | 0.0 ms | 5 / 5 / 25.5 KiB | 41.3 ms / 41.3 ms / 139.1 ms | 0 / 0 / 0.0 KiB | 41.9 ms / 41.9 ms / 167.5 ms | 0.0 ms | 11.7 ms |
| hotels | load Google Hotels Wailea results | 3 | 202 / 3.84 s | 1.67 s | 48 / 40 / 1.50 MiB | 1.25 s / 5.08 s / 2.48 s | 24 / 23 / 91.6 KiB | 1.21 s / 3.93 s / 2.25 s | 82.9 ms | 1.08 s |
| hotels | Google Hotels results | 3 | 0 / 2.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 2.3 ms / 2.3 ms / 4.7 ms | 0.0 ms | 0.0 ms |
| hotels | click "4+ rating" | 3 | 5 / 367.7 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 2 / 2 / 42.9 KiB | 212.8 ms / 367.7 ms / 312.3 ms | 0.0 ms | 0.0 ms |
| hotels | allow Google Hotels rating filter to settle | 3 | 0 / 251.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 251.0 ms / 251.0 ms / 262.3 ms | 0.0 ms | 0.0 ms |
| hotels | click "Pool" | 3 | 2 / 290.5 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 2 / 2 / 42.8 KiB | 290.5 ms / 290.5 ms / 327.5 ms | 0.0 ms | 0.0 ms |
| hotels | Google Hotels quick filters | 3 | 0 / 2.1 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 2.1 ms / 2.1 ms / 6.4 ms | 0.0 ms | 0.0 ms |
| hotels | click "Sort by" | 3 | 3 / 273.9 ms | 0.0 ms | 2 / 2 / 1.9 KiB | 35.4 ms / 35.4 ms / 44.8 ms | 1 / 1 / 0.2 KiB | 273.9 ms / 273.9 ms / 539.4 ms | 0.0 ms | 0.0 ms |
| hotels | Google Hotels sort choices | 3 | 0 / 55.1 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 32.6 ms / 32.6 ms / 43.6 ms | 0 / 0 / 0.0 KiB | 55.1 ms / 55.1 ms / 87.6 ms | 0.0 ms | 0.0 ms |
| hotels | click "Lowest price" | 3 | 111 / 1.92 s | 0.0 ms | 3 / 3 / 1.8 KiB | 143.9 ms / 1.54 s / 143.9 ms | 11 / 11 / 114.7 KiB | 1.49 s / 2.11 s / 2.21 s | 0.0 ms | 594.8 ms |
| hotels | sorted Google Hotels results | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | extract filtered Google Hotels facts | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | load Grand Wailea home page | 3 | 498 / 8.76 s | 1.49 s | 191 / 191 / 6.67 MiB | 6.71 s / 8.49 s / 99.57 s | 97 / 97 / 118.7 KiB | 6.65 s / 8.29 s / 45.57 s | 855.1 ms | 5.74 s |
| grand_wailea | Grand Wailea home page | 3 | 0 / 9.8 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 9.8 ms | 0.0 ms |
| grand_wailea | dismiss Grand Wailea cookie banner | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | open Grand Wailea room catalog | 3 | 1 / 36.9 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 1 / 1 / 3.3 KiB | 35.7 ms / 35.7 ms / 35.7 ms | 0.0 ms | 0.0 ms |
| grand_wailea | Grand Wailea room catalog | 3 | 209 / 1.31 s | 58.1 ms | 112 / 111 / 129.4 KiB | 897.4 ms / 1.33 s / 1.73 s | 20 / 19 / 3.4 KiB | 752.9 ms / 1.55 s / 1.68 s | 190.9 ms | 321.9 ms |
| grand_wailea | select Grand Wailea room category | 3 | 44 / 496.1 ms | 0.0 ms | 13 / 13 / 23.9 KiB | 402.0 ms / 480.5 ms / 538.9 ms | 30 / 30 / 4.4 KiB | 496.1 ms / 496.1 ms / 3.87 s | 0.0 ms | 45.1 ms |
| grand_wailea | allow Grand Wailea category filter to settle | 3 | 19 / 200.7 ms | 0.0 ms | 2 / 2 / 0.0 KiB | 45.2 ms / 200.4 ms / 45.2 ms | 4 / 4 / 0.5 KiB | 200.4 ms / 200.7 ms / 623.5 ms | 0.0 ms | 126.9 ms |
| grand_wailea | select Grand Wailea ocean view | 3 | 11 / 134.9 ms | 37.3 ms | 6 / 6 / 3.0 KiB | 50.7 ms / 81.4 ms / 56.2 ms | 4 / 3 / 0.4 KiB | 126.8 ms / 126.8 ms / 186.9 ms | 0.0 ms | 34.8 ms |
| grand_wailea | filtered Grand Wailea rooms | 3 | 2 / 31.4 ms | 0.0 ms | 1 / 1 / 0.0 KiB | 22.3 ms / 22.3 ms / 22.3 ms | 0 / 0 / 0.0 KiB | 31.4 ms / 31.4 ms / 31.4 ms | 0.0 ms | 0.0 ms |
| grand_wailea | inspect filtered Grand Wailea room | 3 | 5 / 32.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 2.6 ms / 4.1 ms / 2.6 ms | 0 / 0 / 0.0 KiB | 32.0 ms / 32.0 ms / 96.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | open Grand Wailea room detail | 3 | 3 / 65.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 9.7 ms / 62.8 ms / 9.7 ms | 3 / 2 / 3.4 KiB | 61.9 ms / 65.0 ms / 170.2 ms | 0.0 ms | 0.0 ms |
| grand_wailea | Grand Wailea room detail | 3 | 270 / 2.22 s | 56.4 ms | 129 / 128 / 154.0 KiB | 1.24 s / 2.52 s / 2.25 s | 51 / 50 / 5.4 KiB | 1.37 s / 2.36 s / 4.41 s | 111.6 ms | 648.3 ms |
| grand_wailea | extract Grand Wailea room facts | 3 | 10 / 517.4 ms | 0.0 ms | 1 / 1 / 0.0 KiB | 400.0 ms / 400.0 ms / 404.6 ms | 9 / 9 / 1.2 KiB | 355.0 ms / 517.4 ms / 694.6 ms | 0.0 ms | 26.8 ms |
| enterprise | load Enterprise Kahului reservation form | 3 | 220 / 3.11 s | 460.0 ms | 126 / 124 / 3.21 MiB | 1.76 s / 3.51 s / 8.63 s | 30 / 26 / 104.5 KiB | 1.88 s / 3.51 s / 3.24 s | 678.9 ms | 1.63 s |
| enterprise | Enterprise reservation form | 3 | 3 / 171.1 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 171.1 ms / 171.1 ms / 380.3 ms | 1 / 1 / 0.5 KiB | 163.6 ms / 163.6 ms / 248.7 ms | 0.0 ms | 77.2 ms |
| enterprise | dismiss Enterprise consent and login overlays | 3 | 3 / 69.5 ms | 0.0 ms | 1 / 1 / 1.0 KiB | 6.3 ms / 6.3 ms / 6.3 ms | 1 / 1 / 0.3 KiB | 54.8 ms / 54.8 ms / 54.8 ms | 0.0 ms | 7.9 ms |
| enterprise | allow Enterprise overlays to close | 3 | 7 / 250.1 ms | 250.1 ms | 3 / 3 / 0.0 KiB | 62.8 ms / 190.7 ms / 62.8 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 133.5 ms |
| enterprise | Enterprise form after consent dismissal | 3 | 215 / 3.31 s | 817.4 ms | 112 / 112 / 412.9 KiB | 1.38 s / 3.25 s / 2.03 s | 45 / 45 / 69.7 KiB | 2.66 s / 3.58 s / 6.83 s | 24.7 ms | 928.5 ms |
| enterprise | open Enterprise pickup calendar | 3 | 25 / 569.8 ms | 62.4 ms | 12 / 12 / 21.6 KiB | 77.3 ms / 322.4 ms / 131.2 ms | 5 / 5 / 0.6 KiB | 323.1 ms / 795.9 ms / 326.6 ms | 3.3 ms | 32.6 ms |
| enterprise | open Enterprise pickup calendar | 3 | 0 / 18.2 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 18.2 ms / 18.2 ms / 36.4 ms | 0 / 0 / 0.0 KiB | 18.2 ms / 18.2 ms / 18.2 ms | 0.0 ms | 0.0 ms |
| enterprise | check whether Enterprise October pickup date is visible | 3 | 0 / 4.1 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | advance Enterprise pickup calendar | 3 | 2 / 77.9 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 1 / 1 / 0.0 KiB | 30.2 ms / 38.8 ms / 30.2 ms | 0.0 ms | 0.0 ms |
| enterprise | Enterprise October pickup date | 3 | 0 / 20.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 20.3 ms / 20.3 ms / 20.3 ms | 0.0 ms | 0.0 ms |
| enterprise | select Enterprise pickup date | 3 | 3 / 146.6 ms | 0.0 ms | 1 / 1 / 1.0 KiB | 47.0 ms / 47.0 ms / 47.0 ms | 1 / 1 / 0.0 KiB | 51.9 ms / 172.0 ms / 76.7 ms | 0.0 ms | 121.4 ms |
| enterprise | Enterprise return date control | 3 | 0 / 8.2 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 8.2 ms / 8.2 ms / 8.2 ms | 0.0 ms | 8.2 ms |
| enterprise | open Enterprise return calendar | 3 | 1 / 78.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 1 / 1 / 0.0 KiB | 17.1 ms / 115.5 ms / 17.1 ms | 0.0 ms | 42.5 ms |
| enterprise | Enterprise October return date | 3 | 0 / 5.6 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 5.6 ms / 5.6 ms / 5.6 ms | 0.0 ms | 0.0 ms |
| enterprise | select Enterprise return date | 3 | 3 / 160.6 ms | 0.0 ms | 1 / 1 / 1.0 KiB | 47.0 ms / 47.0 ms / 47.0 ms | 1 / 1 / 0.0 KiB | 160.6 ms / 160.6 ms / 184.4 ms | 0.0 ms | 116.6 ms |
| enterprise | select Enterprise pickup time | 3 | 1 / 54.9 ms | 0.0 ms | 1 / 1 / 1.0 KiB | 2.6 ms / 2.6 ms / 2.6 ms | 0 / 0 / 0.0 KiB | 54.9 ms / 54.9 ms / 69.7 ms | 0.0 ms | 39.7 ms |
| enterprise | select Enterprise return time | 3 | 1 / 56.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 28.0 ms / 28.0 ms / 28.0 ms | 0 / 0 / 0.0 KiB | 43.7 ms / 45.7 ms / 43.7 ms | 0.0 ms | 49.4 ms |
| enterprise | open Enterprise vehicle filters | 3 | 5 / 167.6 ms | 0.0 ms | 2 / 2 / 2.1 KiB | 92.6 ms / 229.1 ms / 92.6 ms | 1 / 1 / 0.0 KiB | 62.4 ms / 224.8 ms / 62.4 ms | 0.0 ms | 140.1 ms |
| enterprise | Enterprise vehicle filter | 3 | 0 / 4.8 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 4.8 ms / 4.8 ms / 4.8 ms | 0.0 ms | 4.8 ms |
| enterprise | select Enterprise compact SUV | 3 | 2 / 148.8 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 1 / 1 / 0.0 KiB | 64.4 ms / 168.8 ms / 64.4 ms | 0.0 ms | 144.7 ms |
| enterprise | Enterprise compact SUV selection | 3 | 0 / 4.2 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 4.2 ms / 4.2 ms / 4.2 ms | 0.0 ms | 4.1 ms |
| enterprise | apply Enterprise vehicle filter | 3 | 3 / 182.1 ms | 0.0 ms | 1 / 1 / 1.0 KiB | 39.6 ms / 39.6 ms / 39.6 ms | 1 / 1 / 0.0 KiB | 182.1 ms / 186.0 ms / 198.9 ms | 0.0 ms | 155.5 ms |
| enterprise | applied Enterprise compact SUV filter | 3 | 0 / 4.1 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 4.1 ms / 4.1 ms / 4.1 ms | 0 / 0 / 0.0 KiB | 4.1 ms / 4.1 ms / 4.1 ms | 0.0 ms | 4.1 ms |
| enterprise | browse Enterprise vehicles | 3 | 7 / 248.3 ms | 0.0 ms | 1 / 1 / 2.7 KiB | 52.2 ms / 109.5 ms / 52.2 ms | 4 / 3 / 0.0 KiB | 209.0 ms / 248.3 ms / 364.0 ms | 0.0 ms | 164.1 ms |
| enterprise | Enterprise vehicle availability | 3 | 309 / 7.50 s | 266.3 ms | 126 / 126 / 242.9 KiB | 2.18 s / 8.65 s / 4.11 s | 51 / 51 / 531.3 KiB | 4.86 s / 11.46 s / 17.53 s | 270.8 ms | 3.06 s |
| enterprise | extract Enterprise vehicle facts | 3 | 6 / 17.3 ms | 0.0 ms | 3 / 0 / 0.0 KiB | 13.0 ms / 17.3 ms / 14.2 ms | 2 / 0 / 0.0 KiB | 9.2 ms / 9.2 ms / 9.2 ms | 0.0 ms | 16.0 ms |

## proa-proxy

Workflow p50: **10.35 s** across 3 successful traced trials (10.35 s, 10.48 s, 9.79 s).

### Initial page and script path

`Initial navigation` is the harness call through page readiness; HTML
shows the main-frame response(s) inside it. Script active/span covers
the full surface, including later interactions and navigations.

| Surface | Initial navigation | HTML response(s) | HTML body | Script started / completed / bytes | Script active / span | Surface JS CPU | Full surface |
|---|---:|---:|---:|---:|---:|---:|---:|
| flights | 1.02 s | 729.3 ms | 2.07 MiB | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms | 5.3 ms | 1.43 s |
| airbnb | 1.31 s | 1.09 s | 333.6 KiB | 82 / 82 / 0.0 KiB | 147.4 ms / 1.42 s | 1.8 ms | 2.64 s |
| hotels | 2.36 s | 1.99 s | 2.10 MiB | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms | 5.0 ms | 2.84 s |
| grand_wailea | 720.6 ms | 47.0 ms | 125.2 KiB | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms | 1.5 ms | 2.07 s |
| enterprise | 466.7 ms | 247.2 ms | 623.2 KiB | 6 / 6 / 0.0 KiB | 190.1 ms / 1.11 s | 3.2 ms | 1.45 s |

### Surfaces

`Between-step` is traced wall outside named operations, dominated by
CDP metric queries and request-listener bookkeeping. It is observer /
harness overhead, not a page phase to add to the site cost.

| Surface | Wall samples | Wall p50 | Named-step wall | Between-step | Task CPU | JS CPU | Layout / style | Requests | Network active | Script started / completed / bytes | Script active / span / summed | API started / completed / bytes | API active / span / summed |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| flights | 1.51 s, 1.43 s, 1.42 s | 1.43 s | 1.40 s | 36.9 ms | 202.1 ms | 5.3 ms | 22.3 ms / 20.4 ms | 16 | 1.00 s | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms |
| airbnb | 2.30 s, 2.64 s, 2.72 s | 2.64 s | 2.45 s | 129.4 ms | 155.3 ms | 1.8 ms | 6.2 ms / 2.3 ms | 119 | 2.58 s | 82 / 82 / 0.0 KiB | 147.4 ms / 1.42 s / 3.36 s | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms |
| hotels | 2.92 s, 2.84 s, 2.56 s | 2.84 s | 2.79 s | 42.9 ms | 317.1 ms | 5.0 ms | 15.0 ms / 22.3 ms | 12 | 2.23 s | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms |
| grand_wailea | 2.17 s, 2.07 s, 1.73 s | 2.07 s | 1.73 s | 335.1 ms | 530.9 ms | 1.5 ms | 13.2 ms / 12.6 ms | 138 | 1.32 s | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms |
| enterprise | 1.45 s, 1.51 s, 1.35 s | 1.45 s | 1.29 s | 125.2 ms | 335.7 ms | 3.2 ms | 7.6 ms / 12.3 ms | 42 | 725.8 ms | 6 / 6 / 0.0 KiB | 190.1 ms / 1.11 s / 516.2 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms |

### Main-frame documents

This is initial HTML plus every later full-document navigation. A route
change absent from this table was client-side and used scripts/APIs instead.

| Surface | Role / initiating step | Document | n | Offset | Total | DNS | Connect | TLS | Request → first byte | Download | Body |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| flights | initial HTML | `www.google.com/travel/flights` | 3 | 5.4 ms | 729.3 ms | — | — | — | — | 0.7 ms | 2.07 MiB |
| airbnb | initial HTML | `www.airbnb.com/s/Wailea--Hawaii--United-States/homes` | 3 | 5.4 ms | 1.09 s | — | — | — | — | 0.8 ms | 333.6 KiB |
| airbnb | later navigation | `www.airbnb.com/rooms/47514058` | 3 | 1.40 s | 1.03 s | — | — | — | — | 1.0 ms | 140.0 KiB |
| hotels | initial HTML | `www.google.com/travel/hotels` | 3 | 28.0 ms | 1.99 s | — | — | — | — | 1.9 ms | 2.10 MiB |
| grand_wailea | initial HTML | `www.grandwailea.com/` | 3 | 5.2 ms | 47.0 ms | — | — | — | — | 0.9 ms | 125.2 KiB |
| grand_wailea | later navigation | `www.grandwailea.com/stay/rooms-suites` | 3 | 1.07 s | 34.9 ms | — | — | — | — | 1.1 ms | 117.2 KiB |
| grand_wailea | later navigation | `www.grandwailea.com/stay/deluxe-ocean-view-king` | 3 | 1.65 s | 33.7 ms | — | — | — | — | 1.3 ms | 116.8 KiB |
| enterprise | initial HTML | `www.enterprise.com/en/car-rental-locations/us/hi/kahului-airport-36e4.html` | 3 | 21.9 ms | 247.2 ms | — | — | — | — | 1.0 ms | 623.2 KiB |
| enterprise | browse Enterprise vehicles | `www.enterprise.com/en/reserve.html` | 3 | 1.11 s | 212.4 ms | — | — | — | — | 1.4 ms | 400.3 KiB |

### Every workflow step: wall and browser CPU

| Surface | Offset | Kind | Step | n | Wall | Task CPU | JS CPU | Layout | Style | Polls / poll evaluation |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| flights | 1.3 ms | navigation | load Google Flights results | 3 | 1.02 s | 163.2 ms | 4.5 ms | 21.9 ms | 19.9 ms | — / — |
| flights | 1.02 s | wait | Google Flights results | 3 | 1.9 ms | 0.8 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.9 ms |
| flights | 1.02 s | action | click "Stops" | 3 | 75.5 ms | 16.6 ms | 0.3 ms | 0.3 ms | 0.2 ms | — / — |
| flights | 1.11 s | wait | Flights stops filter | 3 | 1.6 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.6 ms |
| flights | 1.11 s | action | click "Nonstop only" | 3 | 40.6 ms | 11.4 ms | 0.2 ms | 0.0 ms | 0.1 ms | — / — |
| flights | 1.16 s | pause | allow Flights nonstop filter to settle | 3 | 201.0 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| flights | 1.36 s | action | close Flights stops dialog | 3 | 25.6 ms | 3.5 ms | 0.2 ms | 0.1 ms | 0.1 ms | — / — |
| flights | 1.39 s | action | click "Cheapest" | 3 | 30.9 ms | 3.3 ms | 0.1 ms | 0.0 ms | 0.1 ms | — / — |
| flights | 1.42 s | wait | filtered Flights fares | 3 | 1.8 ms | 0.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.8 ms |
| flights | 1.43 s | evaluation | extract filtered flight facts | 3 | 1.5 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| airbnb | 1.2 ms | navigation | load Airbnb Wailea results | 3 | 1.31 s | 91.1 ms | 0.7 ms | 3.6 ms | 1.2 ms | — / — |
| airbnb | 1.31 s | wait | Airbnb search results | 3 | 1.7 ms | 0.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.6 ms |
| airbnb | 1.31 s | evaluation | inspect and dismiss Airbnb consent modal | 3 | 1.4 ms | 0.4 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| airbnb | 1.32 s | action | enable Airbnb free cancellation | 3 | 62.9 ms | 10.7 ms | 0.6 ms | 0.0 ms | 0.1 ms | — / — |
| airbnb | 1.38 s | wait | Airbnb cancellation filter | 3 | 1.7 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.7 ms |
| airbnb | 1.38 s | wait | filtered Airbnb listing cards | 3 | 1.5 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.5 ms |
| airbnb | 1.39 s | evaluation | inspect first filtered Airbnb listing | 3 | 2.3 ms | 0.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| airbnb | 1.40 s | evaluation | open Airbnb listing detail | 3 | 2.0 ms | 2.1 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| airbnb | 1.41 s | wait | Airbnb listing detail | 3 | 1.07 s | 36.9 ms | 0.5 ms | 2.7 ms | 1.0 ms | 1 / 1.07 s |
| airbnb | 2.61 s | evaluation | extract Airbnb listing facts | 3 | 15.2 ms | 11.0 ms | 0.0 ms | 0.9 ms | 0.1 ms | — / — |
| hotels | 18.6 ms | navigation | load Google Hotels Wailea results | 3 | 2.36 s | 292.8 ms | 4.3 ms | 14.5 ms | 21.4 ms | — / — |
| hotels | 2.39 s | wait | Google Hotels results | 3 | 1.8 ms | 0.7 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.8 ms |
| hotels | 2.39 s | action | click "4+ rating" | 3 | 43.2 ms | 7.8 ms | 0.3 ms | 0.2 ms | 0.3 ms | — / — |
| hotels | 2.45 s | pause | allow Google Hotels rating filter to settle | 3 | 250.2 ms | 0.7 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| hotels | 2.71 s | action | click "Pool" | 3 | 26.8 ms | 3.6 ms | 0.2 ms | 0.1 ms | 0.3 ms | — / — |
| hotels | 2.74 s | wait | Google Hotels quick filters | 3 | 1.6 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.6 ms |
| hotels | 2.74 s | action | click "Sort by" | 3 | 44.3 ms | 4.4 ms | 0.2 ms | 0.2 ms | 0.2 ms | — / — |
| hotels | 2.79 s | wait | Google Hotels sort choices | 3 | 1.7 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.7 ms |
| hotels | 2.79 s | action | click "Lowest price" | 3 | 43.4 ms | 3.9 ms | 0.1 ms | 0.0 ms | 0.1 ms | — / — |
| hotels | 2.84 s | wait | sorted Google Hotels results | 3 | 1.6 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.6 ms |
| hotels | 2.84 s | evaluation | extract filtered Google Hotels facts | 3 | 1.5 ms | 0.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 1.0 ms | navigation | load Grand Wailea home page | 3 | 720.6 ms | 211.5 ms | 0.5 ms | 4.2 ms | 4.3 ms | — / — |
| grand_wailea | 807.5 ms | wait | Grand Wailea home page | 3 | 189.3 ms | 61.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 189.3 ms |
| grand_wailea | 1.06 s | evaluation | dismiss Grand Wailea cookie banner | 3 | 1.7 ms | 0.7 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 1.07 s | evaluation | open Grand Wailea room catalog | 3 | 2.5 ms | 2.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 1.08 s | wait | Grand Wailea room catalog | 3 | 94.0 ms | 40.2 ms | 0.6 ms | 3.4 ms | 0.6 ms | 1 / 94.0 ms |
| grand_wailea | 1.19 s | action | select Grand Wailea room category | 3 | 227.7 ms | 81.2 ms | 0.0 ms | 3.2 ms | 4.3 ms | — / — |
| grand_wailea | 1.42 s | pause | allow Grand Wailea category filter to settle | 3 | 200.8 ms | 0.2 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 1.63 s | action | select Grand Wailea ocean view | 3 | 6.6 ms | 2.2 ms | 0.0 ms | 0.2 ms | 0.1 ms | — / — |
| grand_wailea | 1.64 s | wait | filtered Grand Wailea rooms | 3 | 1.9 ms | 0.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.9 ms |
| grand_wailea | 1.64 s | evaluation | inspect filtered Grand Wailea room | 3 | 1.5 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 1.64 s | evaluation | open Grand Wailea room detail | 3 | 2.5 ms | 2.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| grand_wailea | 1.65 s | wait | Grand Wailea room detail | 3 | 87.5 ms | 37.4 ms | 0.4 ms | 0.9 ms | 0.3 ms | 1 / 87.5 ms |
| grand_wailea | 1.86 s | evaluation | extract Grand Wailea room facts | 3 | 139.8 ms | 67.2 ms | 0.0 ms | 1.7 ms | 3.0 ms | — / — |
| enterprise | 17.5 ms | navigation | load Enterprise Kahului reservation form | 3 | 466.7 ms | 182.6 ms | 2.0 ms | 6.0 ms | 8.9 ms | — / — |
| enterprise | 471.0 ms | wait | Enterprise reservation form | 3 | 2.0 ms | 0.8 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 2.0 ms |
| enterprise | 475.2 ms | evaluation | dismiss Enterprise consent and login overlays | 3 | 1.5 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| enterprise | 503.8 ms | pause | allow Enterprise overlays to close | 3 | 251.1 ms | 0.7 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| enterprise | 757.8 ms | wait | Enterprise form after consent dismissal | 3 | 2.0 ms | 0.8 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 2.0 ms |
| enterprise | 761.8 ms | action | open Enterprise pickup calendar | 3 | 41.8 ms | 6.4 ms | 0.2 ms | 0.0 ms | 0.2 ms | — / — |
| enterprise | 809.5 ms | wait | open Enterprise pickup calendar | 3 | 1.6 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.6 ms |
| enterprise | 813.1 ms | evaluation | check whether Enterprise October pickup date is visible | 3 | 1.2 ms | 0.4 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| enterprise | 816.3 ms | wait | Enterprise October pickup date | 3 | 1.2 ms | 0.4 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.2 ms |
| enterprise | 819.5 ms | action | select Enterprise pickup date | 3 | 37.7 ms | 4.0 ms | 0.3 ms | 0.2 ms | 0.2 ms | — / — |
| enterprise | 859.6 ms | wait | Enterprise return date control | 3 | 1.5 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.5 ms |
| enterprise | 863.4 ms | action | open Enterprise return calendar | 3 | 26.6 ms | 3.3 ms | 0.1 ms | 0.0 ms | 0.1 ms | — / — |
| enterprise | 891.8 ms | wait | Enterprise October return date | 3 | 1.5 ms | 0.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.5 ms |
| enterprise | 895.1 ms | action | select Enterprise return date | 3 | 27.7 ms | 2.6 ms | 0.1 ms | 0.0 ms | 0.1 ms | — / — |
| enterprise | 925.5 ms | action | select Enterprise pickup time | 3 | 5.8 ms | 2.0 ms | 0.0 ms | 0.2 ms | 0.1 ms | — / — |
| enterprise | 933.8 ms | action | select Enterprise return time | 3 | 5.6 ms | 2.2 ms | 0.0 ms | 0.1 ms | 0.1 ms | — / — |
| enterprise | 941.3 ms | action | open Enterprise vehicle filters | 3 | 32.5 ms | 2.9 ms | 0.1 ms | 0.0 ms | 0.1 ms | — / — |
| enterprise | 975.4 ms | wait | Enterprise vehicle filter | 3 | 1.9 ms | 0.7 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.9 ms |
| enterprise | 980.2 ms | action | select Enterprise compact SUV | 3 | 44.2 ms | 4.4 ms | 0.1 ms | 0.0 ms | 0.2 ms | — / — |
| enterprise | 1.03 s | wait | Enterprise compact SUV selection | 3 | 1.6 ms | 0.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.6 ms |
| enterprise | 1.03 s | action | apply Enterprise vehicle filter | 3 | 42.9 ms | 4.4 ms | 0.2 ms | 0.2 ms | 0.1 ms | — / — |
| enterprise | 1.08 s | wait | applied Enterprise compact SUV filter | 3 | 1.8 ms | 0.6 ms | 0.0 ms | 0.0 ms | 0.0 ms | 1 / 1.8 ms |
| enterprise | 1.08 s | action | browse Enterprise vehicles | 3 | 292.1 ms | 63.8 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |
| enterprise | 1.37 s | wait | Enterprise vehicle availability | 3 | 9.1 ms | 46.6 ms | 0.0 ms | 0.7 ms | 2.3 ms | 1 / 9.1 ms |
| enterprise | 1.45 s | evaluation | extract Enterprise vehicle facts | 3 | 2.8 ms | 1.5 ms | 0.0 ms | 0.0 ms | 0.0 ms | — / — |

### Every workflow step: overlapping network work

| Surface | Step | n | All requests / active | Documents active | Scripts started / completed / bytes | Scripts active / span / summed | APIs started / completed / bytes | APIs active / span / summed | Style/font active | Image/media active |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| flights | load Google Flights results | 3 | 15 / 937.6 ms | 729.3 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 142.5 ms | 126.5 ms |
| flights | Google Flights results | 3 | 0 / 1.9 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 1.9 ms | 1.9 ms |
| flights | click "Stops" | 3 | 0 / 47.7 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 12.2 ms | 1.0 ms |
| flights | Flights stops filter | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| flights | click "Nonstop only" | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| flights | allow Flights nonstop filter to settle | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| flights | close Flights stops dialog | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| flights | click "Cheapest" | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| flights | filtered Flights fares | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| flights | extract filtered flight facts | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| airbnb | load Airbnb Wailea results | 3 | 60 / 1.28 s | 1.09 s | 40 / 40 / 0.0 KiB | 66.6 ms / 66.6 ms / 1.63 s | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 184.2 ms | 132.0 ms |
| airbnb | Airbnb search results | 3 | 0 / 1.7 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 1.6 ms | 0.0 ms |
| airbnb | inspect and dismiss Airbnb consent modal | 3 | 0 / 1.4 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| airbnb | enable Airbnb free cancellation | 3 | 1 / 62.9 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| airbnb | Airbnb cancellation filter | 3 | 0 / 1.7 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| airbnb | filtered Airbnb listing cards | 3 | 0 / 1.5 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| airbnb | inspect first filtered Airbnb listing | 3 | 0 / 2.3 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| airbnb | open Airbnb listing detail | 3 | 0 / 2.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| airbnb | Airbnb listing detail | 3 | 14 / 1.04 s | 1.02 s | 12 / 12 / 0.0 KiB | 16.6 ms / 16.6 ms / 77.6 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 14.5 ms | 0.0 ms |
| airbnb | extract Airbnb listing facts | 3 | 0 / 15.2 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 15.2 ms | 15.2 ms |
| hotels | load Google Hotels Wailea results | 3 | 12 / 2.19 s | 1.99 s | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 121.3 ms | 86.5 ms |
| hotels | Google Hotels results | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | click "4+ rating" | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | allow Google Hotels rating filter to settle | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | click "Pool" | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | Google Hotels quick filters | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | click "Sort by" | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | Google Hotels sort choices | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | click "Lowest price" | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | sorted Google Hotels results | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| hotels | extract filtered Google Hotels facts | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | load Grand Wailea home page | 3 | 53 / 611.0 ms | 47.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 330.9 ms | 420.2 ms |
| grand_wailea | Grand Wailea home page | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | dismiss Grand Wailea cookie banner | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | open Grand Wailea room catalog | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | Grand Wailea room catalog | 3 | 12 / 47.9 ms | 31.6 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 19.5 ms | 0.0 ms |
| grand_wailea | select Grand Wailea room category | 3 | 2 / 227.7 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 155.5 ms | 227.7 ms |
| grand_wailea | allow Grand Wailea category filter to settle | 3 | 0 / 8.7 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 8.7 ms | 0.0 ms |
| grand_wailea | select Grand Wailea ocean view | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | filtered Grand Wailea rooms | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | inspect filtered Grand Wailea room | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | open Grand Wailea room detail | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| grand_wailea | Grand Wailea room detail | 3 | 5 / 44.7 ms | 32.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 12.7 ms | 0.0 ms |
| grand_wailea | extract Grand Wailea room facts | 3 | 2 / 139.8 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 101.9 ms | 139.8 ms |
| enterprise | load Enterprise Kahului reservation form | 3 | 22 / 421.5 ms | 247.2 ms | 3 / 3 / 0.0 KiB | 144.5 ms / 144.5 ms / 404.1 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 148.4 ms | 149.1 ms |
| enterprise | Enterprise reservation form | 3 | 0 / 0.9 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | dismiss Enterprise consent and login overlays | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | allow Enterprise overlays to close | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | Enterprise form after consent dismissal | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | open Enterprise pickup calendar | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | open Enterprise pickup calendar | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | check whether Enterprise October pickup date is visible | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | Enterprise October pickup date | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | select Enterprise pickup date | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | Enterprise return date control | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | open Enterprise return calendar | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | Enterprise October return date | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | select Enterprise return date | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | select Enterprise pickup time | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | select Enterprise return time | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | open Enterprise vehicle filters | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | Enterprise vehicle filter | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | select Enterprise compact SUV | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | Enterprise compact SUV selection | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | apply Enterprise vehicle filter | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | applied Enterprise compact SUV filter | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
| enterprise | browse Enterprise vehicles | 3 | 10 / 221.6 ms | 212.4 ms | 3 / 3 / 0.0 KiB | 9.3 ms / 9.3 ms / 23.8 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 4.6 ms | 0.2 ms |
| enterprise | Enterprise vehicle availability | 3 | 0 / 9.1 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 9.1 ms | 9.1 ms |
| enterprise | extract Enterprise vehicle facts | 3 | 0 / 0.0 ms | 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0 / 0 / 0.0 KiB | 0.0 ms / 0.0 ms / 0.0 ms | 0.0 ms | 0.0 ms |
