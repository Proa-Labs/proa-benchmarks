# Proa output construction strategies

This report retains implementation experiments from August 30–31, 2026. They compare output ownership, buffer reuse, chaining, and view construction. They do not rank technologies for the public benchmark question.

The old standard-page Criterion cell measured ten renders per iteration. Values are raw 95% regression-slope intervals for that ten-render batch.

| Standard-page path | Output bytes/render | Raw time, µs/10 renders |
| --- | ---: | ---: |
| Proa fresh owned | 25,108 | 21.000 / 21.046 / 21.092 |
| Proa reused chained | 25,108 | 8.2046 / 8.2400 / 8.2792 |
| Askama | 44,849 | 15.934 / 16.000 / 16.070 |
| Sailfish | 44,849 | 24.641 / 24.787 / 24.914 |
| Leptos | 25,219 | 212.79 / 214.07 / 215.36 |
| Dioxus | 25,141 | 1,053.9 / 1,058.4 / 1,062.7 |
| Yew | 26,741 | 1,573.5 / 1,622.8 / 1,675.9 |
| Topcoat cached-view render | 25,108 | 50.407 / 50.691 / 51.003 |
| Topcoat build-view and render | 25,108 | 119.17 / 119.64 / 120.10 |

The Proa rows deliberately answer different questions. The owned path is the canonical renderer boundary; the reused path is a server-internal optimization experiment. Askama and Sailfish serialize different byte counts in this older fixture, and Topcoat's two rows include different amounts of view construction.

The byte-parity Topcoat product-grid scaling experiment made those boundaries explicit:

| Cards | Output bytes | Construction path | Raw time, µs |
| ---: | ---: | --- | ---: |
| 12 | 35,762 | Proa owned full | 3.3272 / 3.3467 / 3.3667 |
| 12 | 35,762 | Proa reused chained full | 1.2245 / 1.2331 / 1.2416 |
| 12 | 35,762 | Topcoat cached-view render | 7.8481 / 7.8987 / 7.9460 |
| 12 | 35,762 | Topcoat build-view only | 13.786 / 13.866 / 13.946 |
| 12 | 35,762 | Topcoat build-view and render | 18.565 / 18.641 / 18.748 |
| 96 | 284,908 | Proa owned full | 26.558 / 26.840 / 27.201 |
| 96 | 284,908 | Proa reused chained full | 9.2234 / 9.2954 / 9.3964 |
| 96 | 284,908 | Topcoat cached-view render | 54.562 / 55.042 / 55.611 |
| 96 | 284,908 | Topcoat build-view only | 97.847 / 98.476 / 99.053 |
| 96 | 284,908 | Topcoat build-view and render | 156.69 / 157.25 / 157.71 |
| 768 | 2,278,716 | Proa owned full | 204.60 / 206.86 / 209.99 |
| 768 | 2,278,716 | Proa reused chained full | 76.386 / 76.541 / 76.713 |
| 768 | 2,278,716 | Topcoat cached-view render | 442.39 / 444.35 / 446.17 |
| 768 | 2,278,716 | Topcoat build-view only | 826.76 / 829.63 / 832.14 |
| 768 | 2,278,716 | Topcoat build-view and render | 1,234.5 / 1,243.0 / 1,255.3 |

The original report also retains escape-heavy, large-page, request-burst, Airbnb, Nike, eBay, and Sentry construction-path cells in [the dated archive](../../archive/public-report-2026-08-31.md#rendering). Their fixture-specific differences are why they remain laboratory evidence.

If reused output is later presented as production performance, it belongs in an end-to-end HTTP suite where every framework uses its normal server, pooling, concurrency, and response-management strategy.
