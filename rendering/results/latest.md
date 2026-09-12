# Canonical rendering result

> Current canonical capture.

- Capture: `canonical-ssr-v1-2026-09-05-9363fc29b790`
- Captured: 2026-09-05T01:50:57.896Z
- Completed: 2026-09-05T01:52:42.432Z
- Host: Apple M4 Max, 16 logical CPUs, 137438953472 bytes RAM
- OS: macOS (Darwin) (25.5.0), arm64
- Harness commit: `6046311a806fdf673f27c5639438ceafcde943a4` (dirty; source digest retained)
- Canonical source SHA-256: `9363fc29b790edaceb63fe0a4031b65b51134aa73e4863dbb961ec0b18f32ccb`

## Public scoreboard

On these workloads, the September 5, 2026 capture on Apple M4 Max measured Proa rendering the component page 35.4× faster than React, the 1,000-row table 13.2× faster than React, and the product grid 15.0× faster than React. These ratios describe this capture, not every application.

> Lower is better. Every listed renderer produced an equivalent page and passed the parity gate.

| Renderer | Component page | 1,000-row table | Product grid |
| --- | ---: | ---: | ---: |
| Proa | 2.00 µs · 1.00× | 0.25 ms · 1.00× | 0.026 ms · 1.00× |
| Marko | 7.08 µs · 3.54× | 0.92 ms · 3.64× | 0.082 ms · 3.16× |
| React | 70.9 µs · 35.4× | 3.34 ms · 13.2× | 0.39 ms · 15.0× |
| Vue | 6.88 µs · 3.44× | 1.11 ms · 4.38× | 0.081 ms · 3.12× |
| Svelte | 10.2 µs · 5.08× | 0.93 ms · 3.70× | 0.083 ms · 3.22× |
| Rails | 58.0 µs · 29.0× | 5.85 ms · 23.2× | 0.40 ms · 15.4× |
| jte | 8.04 µs · 4.02× | 2.03 ms · 8.03× | 0.22 ms · 8.55× |
| Rocker | 14.6 µs · 7.31× | 2.27 ms · 8.99× | 0.35 ms · 13.4× |
| Handlebars | 18.6 µs · 9.29× | 2.22 ms · 8.79× | 0.20 ms · 7.72× |
| Go html/template | 83.1 µs · 41.6× | 8.14 ms · 32.2× | 0.64 ms · 24.6× |
| Jinja2 | 93.1 µs · 46.6× | 14.9 ms · 58.9× | 1.23 ms · 47.5× |
| PHP | 34.2 µs · 17.1× | 1.39 ms · 5.50× | 0.084 ms · 3.25× |
| Askama | 1.42 µs · 0.71× | 0.58 ms · 2.30× | 0.022 ms · 0.87× |
| Sailfish | 2.29 µs · 1.15× | 0.53 ms · 2.11× | 0.024 ms · 0.94× |
| Leptos | 21.8 µs · 10.9× | 1.78 ms · 7.07× | 0.22 ms · 8.33× |
| Dioxus | 106 µs · 52.9× | 2.20 ms · 8.70× | 0.30 ms · 11.6× |
| Topcoat | 12.2 µs · 6.10× | 1.02 ms · 4.05× | 0.15 ms · 5.72× |

## Detailed measurements

| Renderer | Workload | P50 | P95 | P99 | Mean | Process P50 range | Processes | Samples/process | Warmups/process | Payload bytes | Payload Δ vs Proa | Parity |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Proa | Component page | 2.000 µs | 2.083 µs | 2.500 µs | 1.994 µs | 1.916 µs–2.000 µs | 5 | 2000 | 200 | 25,108 | +0 | semantic DOM pass |
| Proa | 1,000-row table | 252.437 µs | 268.543 µs | 275.008 µs | 252.339 µs | 248.854 µs–253.458 µs | 5 | 200 | 20 | 988,509 | +0 | semantic DOM pass |
| Proa | Product grid | 25.875 µs | 27.292 µs | 32.708 µs | 25.847 µs | 25.708 µs–26.125 µs | 5 | 500 | 50 | 284,908 | +0 | semantic DOM pass |
| Marko | Component page | 7.084 µs | 18.179 µs | 38.177 µs | 13.201 µs | 7.000 µs–8.166 µs | 5 | 2000 | 200 | 24,038 | -1,070 | semantic DOM pass |
| Marko | 1,000-row table | 919.604 µs | 15.282 ms | 19.815 ms | 2.079 ms | 918.146 µs–929.271 µs | 5 | 200 | 20 | 983,187 | -5,322 | semantic DOM pass |
| Marko | Product grid | 81.875 µs | 155.140 µs | 194.310 µs | 137.845 µs | 80.645 µs–83.833 µs | 5 | 500 | 50 | 282,604 | -2,304 | semantic DOM pass |
| React | Component page | 70.875 µs | 90.712 µs | 164.751 µs | 75.645 µs | 70.000 µs–71.917 µs | 5 | 2000 | 200 | 25,202 | +94 | semantic DOM pass |
| React | 1,000-row table | 3.337 ms | 5.248 ms | 5.672 ms | 3.721 ms | 3.309 ms–3.461 ms | 5 | 200 | 20 | 990,695 | +2,186 | semantic DOM pass |
| React | Product grid | 389.083 µs | 738.603 µs | 805.795 µs | 417.757 µs | 386.688 µs–392.875 µs | 5 | 500 | 50 | 285,868 | +960 | semantic DOM pass |
| Vue | Component page | 6.875 µs | 11.544 µs | 20.506 µs | 9.366 µs | 6.792 µs–6.959 µs | 5 | 2000 | 200 | 25,700 | +592 | semantic DOM pass |
| Vue | 1,000-row table | 1.106 ms | 2.103 ms | 2.243 ms | 1.219 ms | 1.091 ms–1.114 ms | 5 | 200 | 20 | 1,006,523 | +18,014 | semantic DOM pass |
| Vue | Product grid | 80.708 µs | 106.300 µs | 251.152 µs | 88.306 µs | 79.750 µs–83.709 µs | 5 | 500 | 50 | 287,420 | +2,512 | semantic DOM pass |
| Svelte | Component page | 10.166 µs | 13.586 µs | 18.418 µs | 14.373 µs | 10.000 µs–10.209 µs | 5 | 2000 | 200 | 25,748 | +640 | semantic DOM pass |
| Svelte | 1,000-row table | 934.855 µs | 11.843 ms | 18.897 ms | 1.919 ms | 931.333 µs–941.833 µs | 5 | 200 | 20 | 1,003,227 | +14,718 | semantic DOM pass |
| Svelte | Product grid | 83.375 µs | 141.433 µs | 1.307 ms | 145.790 µs | 82.896 µs–83.980 µs | 5 | 500 | 50 | 286,476 | +1,568 | semantic DOM pass |
| Rails | Component page | 58.000 µs | 68.000 µs | 304.060 µs | 64.811 µs | 58.000 µs–58.000 µs | 5 | 2000 | 200 | 35,839 | +10,731 | semantic DOM pass |
| Rails | 1,000-row table | 5.848 ms | 6.146 ms | 6.249 ms | 5.773 ms | 5.814 ms–5.876 ms | 5 | 200 | 20 | 1,228,793 | +240,284 | semantic DOM pass |
| Rails | Product grid | 398.000 µs | 709.000 µs | 1.780 ms | 445.450 µs | 395.000 µs–402.000 µs | 5 | 500 | 50 | 296,823 | +11,915 | semantic DOM pass |
| jte | Component page | 8.042 µs | 11.460 µs | 18.086 µs | 8.538 µs | 8.041 µs–8.084 µs | 5 | 2000 | 200 | 25,109 | +1 | semantic DOM pass |
| jte | 1,000-row table | 2.028 ms | 2.294 ms | 2.693 ms | 1.971 ms | 1.992 ms–2.061 ms | 5 | 200 | 20 | 988,510 | +1 | semantic DOM pass |
| jte | Product grid | 221.208 µs | 363.216 µs | 414.182 µs | 237.791 µs | 219.438 µs–224.958 µs | 5 | 500 | 50 | 284,909 | +1 | semantic DOM pass |
| Rocker | Component page | 14.625 µs | 19.875 µs | 27.209 µs | 15.362 µs | 14.416 µs–15.000 µs | 5 | 2000 | 200 | 25,109 | +1 | semantic DOM pass |
| Rocker | 1,000-row table | 2.270 ms | 2.745 ms | 3.230 ms | 2.232 ms | 2.251 ms–2.480 ms | 5 | 200 | 20 | 990,508 | +1,999 | semantic DOM pass |
| Rocker | Product grid | 345.542 µs | 492.262 µs | 556.259 µs | 357.420 µs | 340.313 µs–379.479 µs | 5 | 500 | 50 | 285,869 | +961 | semantic DOM pass |
| Handlebars | Component page | 18.583 µs | 26.044 µs | 60.844 µs | 20.352 µs | 18.250 µs–18.667 µs | 5 | 2000 | 200 | 25,108 | +0 | semantic DOM pass |
| Handlebars | 1,000-row table | 2.219 ms | 3.056 ms | 3.473 ms | 2.359 ms | 2.192 ms–2.254 ms | 5 | 200 | 20 | 990,694 | +2,185 | semantic DOM pass |
| Handlebars | Product grid | 199.833 µs | 282.471 µs | 305.054 µs | 211.195 µs | 199.563 µs–201.167 µs | 5 | 500 | 50 | 285,868 | +960 | semantic DOM pass |
| Go html/template | Component page | 83.125 µs | 142.550 µs | 204.638 µs | 87.342 µs | 82.625 µs–83.938 µs | 5 | 2000 | 200 | 25,108 | +0 | semantic DOM pass |
| Go html/template | 1,000-row table | 8.137 ms | 8.385 ms | 8.584 ms | 8.141 ms | 8.097 ms–8.156 ms | 5 | 200 | 20 | 990,509 | +2,000 | semantic DOM pass |
| Go html/template | Product grid | 636.417 µs | 774.719 µs | 804.454 µs | 663.436 µs | 630.209 µs–638.229 µs | 5 | 500 | 50 | 285,676 | +768 | semantic DOM pass |
| Jinja2 | Component page | 93.125 µs | 100.169 µs | 106.001 µs | 93.644 µs | 92.375 µs–93.708 µs | 5 | 2000 | 200 | 25,108 | +0 | semantic DOM pass |
| Jinja2 | 1,000-row table | 14.866 ms | 15.754 ms | 16.021 ms | 14.997 ms | 14.803 ms–15.018 ms | 5 | 200 | 20 | 990,257 | +1,748 | semantic DOM pass |
| Jinja2 | Product grid | 1.230 ms | 1.268 ms | 1.290 ms | 1.228 ms | 1.215 ms–1.239 ms | 5 | 500 | 50 | 285,676 | +768 | semantic DOM pass |
| PHP | Component page | 34.209 µs | 37.083 µs | 42.375 µs | 33.902 µs | 33.458 µs–34.708 µs | 5 | 2000 | 200 | 25,108 | +0 | semantic DOM pass |
| PHP | 1,000-row table | 1.389 ms | 1.417 ms | 1.439 ms | 1.388 ms | 1.350 ms–1.397 ms | 5 | 200 | 20 | 990,694 | +2,185 | semantic DOM pass |
| PHP | Product grid | 84.188 µs | 91.166 µs | 98.502 µs | 85.242 µs | 83.417 µs–84.958 µs | 5 | 500 | 50 | 285,868 | +960 | semantic DOM pass |
| Askama | Component page | 1.417 µs | 1.583 µs | 1.917 µs | 1.458 µs | 1.375 µs–1.500 µs | 5 | 2000 | 200 | 44,849 | +19,741 | semantic DOM pass |
| Askama | 1,000-row table | 581.250 µs | 601.185 µs | 620.242 µs | 583.556 µs | 573.187 µs–595.625 µs | 5 | 200 | 20 | 991,007 | +2,498 | semantic DOM pass |
| Askama | Product grid | 22.459 µs | 24.667 µs | 28.044 µs | 23.000 µs | 22.250 µs–23.000 µs | 5 | 500 | 50 | 285,676 | +768 | semantic DOM pass |
| Sailfish | Component page | 2.291 µs | 2.375 µs | 2.917 µs | 2.272 µs | 2.291 µs–2.417 µs | 5 | 2000 | 200 | 44,849 | +19,741 | semantic DOM pass |
| Sailfish | 1,000-row table | 531.770 µs | 550.646 µs | 569.501 µs | 531.106 µs | 528.375 µs–533.604 µs | 5 | 200 | 20 | 990,694 | +2,185 | semantic DOM pass |
| Sailfish | Product grid | 24.208 µs | 26.419 µs | 30.932 µs | 24.447 µs | 23.541 µs–24.563 µs | 5 | 500 | 50 | 285,868 | +960 | semantic DOM pass |
| Leptos | Component page | 21.833 µs | 22.543 µs | 27.168 µs | 21.693 µs | 20.209 µs–21.958 µs | 5 | 2000 | 200 | 25,219 | +111 | semantic DOM pass |
| Leptos | 1,000-row table | 1.784 ms | 1.832 ms | 1.859 ms | 1.779 ms | 1.770 ms–1.790 ms | 5 | 200 | 20 | 991,512 | +3,003 | semantic DOM pass |
| Leptos | Product grid | 215.667 µs | 237.802 µs | 243.968 µs | 217.680 µs | 208.020 µs–226.375 µs | 5 | 500 | 50 | 286,063 | +1,155 | semantic DOM pass |
| Dioxus | Component page | 105.709 µs | 117.666 µs | 127.588 µs | 107.006 µs | 103.084 µs–106.020 µs | 5 | 2000 | 200 | 25,141 | +33 | semantic DOM pass |
| Dioxus | 1,000-row table | 2.196 ms | 2.257 ms | 2.363 ms | 2.197 ms | 2.176 ms–2.241 ms | 5 | 200 | 20 | 990,695 | +2,186 | semantic DOM pass |
| Dioxus | Product grid | 301.167 µs | 317.197 µs | 332.999 µs | 302.851 µs | 297.813 µs–303.708 µs | 5 | 500 | 50 | 285,868 | +960 | semantic DOM pass |
| Topcoat | Component page | 12.209 µs | 13.291 µs | 15.958 µs | 12.151 µs | 11.750 µs–12.834 µs | 5 | 2000 | 200 | 25,108 | +0 | semantic DOM pass |
| Topcoat | 1,000-row table | 1.023 ms | 1.051 ms | 1.068 ms | 1.024 ms | 1.011 ms–1.046 ms | 5 | 200 | 20 | 988,509 | +0 | semantic DOM pass |
| Topcoat | Product grid | 148.041 µs | 158.252 µs | 165.666 µs | 148.321 µs | 147.292 µs–148.875 µs | 5 | 500 | 50 | 284,908 | +0 | semantic DOM pass |

## Tail observations

The report flags every cell whose process-median P95 is at least 3× its P50:

- Marko's 1,000-row table P95 was 16.6× its P50 (15.282 ms versus 919.604 µs).
- Svelte's 1,000-row table P95 was 12.7× its P50 (11.843 ms versus 934.855 µs).

## Parity

Chromium parses every untimed dump. The gate requires identical elements, non-class attributes, class membership, visible text, and body order. It ignores renderer-internal comments, resource-preload hints, non-semantic `<head>` order, class-token order, and adjacent hydration-split text nodes. The timed response is never normalized.

| Workload | Canonical DOM SHA-256 | Exact-byte matches |
| --- | --- | ---: |
| Component page | `43c50a97024231d49639400a5bfb18df7dbe5e94068cd42a732cea26ed0188b4` | 6/17 |
| 1,000-row table | `ba9bb6481cefab9898ff8c7d6c31405f3379c3ddaede2690e5c70ef46473356b` | 2/17 |
| Product grid | `5c89ccf8708043183838767b4bf61a68d9afc8bbf78830dc8886a851be162cfe` | 2/17 |

## Renderer and runtime versions

| Renderer/runtime | Version |
| --- | --- |
| Proa | 0.3.0 @ 7ffb8a19ecfa601fb496d825e0677dce29ea3af4 / rustc 1.95.0 (59807616e 2026-04-14) |
| Marko | 6.0.150 / Node v24.20.0 |
| React | 19.2.4 / Node v24.20.0 |
| Vue | 3.5.42 / Node v24.20.0 |
| Svelte | 5.57.0 / Node v24.20.0 |
| Rails | Rails 8.1.3.1 / ruby 4.0.6 (2026-07-14 revision 03b6d3f889) +PRISM [arm64-darwin25] |
| jte | 3.2.4 / openjdk 25.0.1 2025-10-21 |
| Rocker | 2.4.0 / openjdk 25.0.1 2025-10-21 |
| Handlebars | 4.7.8 / Node v24.20.0 |
| Go html/template | go version go1.25.5 darwin/arm64 |
| Jinja2 | 3.1.6 / Python 3.14.2 |
| PHP | PHP 8.5.9 (cli) (built: Jul 28 2026 13:06:52) (NTS) |
| Askama | 0.15.6 / rustc 1.95.0 (59807616e 2026-04-14) |
| Sailfish | 0.10.2 / rustc 1.95.0 (59807616e 2026-04-14) |
| Leptos | 0.7.8 / rustc 1.95.0 (59807616e 2026-04-14) |
| Dioxus | 0.6.3 + dioxus-ssr 0.6.2 / rustc 1.95.0 (59807616e 2026-04-14) |
| Topcoat | 0.3.1 / rustc 1.95.0 (59807616e 2026-04-14) |
| Playwright | 1.61.1 |
| Chromium | 149.0.7827.55 |

## Reproduction

```sh
./rendering/run-all
```

The runner builds every fixed-roster adapter, runs the complete parity matrix, stops before timing if any cell fails, rotates renderer process order, records per-process summaries, writes `latest.json`, and generates this report and the README tables.

Full commands recorded by the capture:

- `npm ci (React, Marko, and Handlebars adapter directories)`
- `bundle check || bundle install (Rails adapter directory)`
- `cargo build --locked --release -p proa_bench --features topcoat --bin representative_suite_bench`
- `go build -trimpath -o rendering/external/go/build/canonical_suite rendering/external/go/suite_bench.go`
- `python3 -m venv rendering/external/jinja/.venv && pip install -r rendering/external/jinja/requirements.txt`
- `gradle --no-daemon --quiet installDist copyJteBinaryStaticContent (jte adapter directory)`
- `gradle --no-daemon --quiet installDist (Rocker adapter directory)`
- `./rendering/run-all`

## Known limitations

- Renderer-only latency excludes routing, middleware, databases, HTTP transfer, hydration, and network latency.
- Semantic DOM parity permits documented serializer metadata and whitespace differences; payload deltas remain visible.
- This capture describes one machine and these three workloads; it is not a universal application ranking.

## Raw and related evidence

- [Per-process summaries](raw/canonical-ssr-v1-2026-09-05-9363fc29b790/process-summaries.json)
- [Result-table migration map](../MIGRATION.md)

Allocation measurements and construction-path controls remain separate from this renderer scoreboard. They are embedded below the scoreboard in the root README and retained in the [engineering reports](../engineering/README.md).
