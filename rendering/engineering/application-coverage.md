# Application-shaped rendering coverage

These pages broaden Proa's regression and application coverage, but most lack a complete equivalent peer roster. They are not eligible for the canonical scoreboard.

## Linked showcase corpus

The release fixture links all 12 locked `proa_showcase` pages. Five independent processes were used per page; most recorded 10,000 renders per process after 1,000 warmups, while the 400-row Sentry page recorded 300 after 100 warmups.

The full server-rendering method and coverage matrix live in [`showcase/README.md`](../../showcase/README.md). Browser-JavaScript measurements for the four interactive pages remain a separate browser study there. The complete dated output and latency table is preserved in the [archived report](../../archive/public-report-2026-08-31.md#linked-proa_showcase-corpus).

## Older heavy render loops

These used 50 warmups and 500 measured renders. They do not share the canonical process policy and the SRP fixtures are specialized.

| Workload | Engine | Output bytes | Min µs | Mean µs | P50 µs | P95 µs | P99 µs | Max µs | Renders/s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000-row data table | Proa | 988,509 | 207.71 | 236.61 | 234.92 | 248.78 | 267.01 | 308.42 | 4,226 |
| 1,000-row data table | Marko | 983,187 | 941.29 | 2,248.10 | 997.81 | 6,062.36 | 7,366.86 | 10,988.17 | 445 |
| 60-listing synthetic SRP | Proa | 97,823 | 20.75 | 23.98 | 23.71 | 27.84 | 30.71 | 46.62 | 41,674 |
| 60-listing synthetic SRP | Marko | 95,543 | 82.83 | 232.91 | 95.56 | 188.12 | 5,487.34 | 6,332.83 | 4,287 |
| 60-listing mirror SRP | Proa | 230,741 | 24.21 | 26.57 | 25.92 | 28.50 | 30.22 | 82.92 | 37,611 |
| 60-listing mirror SRP | Marko | 222,725 | 84.88 | 269.53 | 98.73 | 234.51 | 5,758.29 | 7,372.92 | 3,706 |

Nike, eBay, Sentry, and other Proa-only Criterion fixtures remain coverage rows until equivalent peer implementations pass the canonical contract. Airbnb Sailfish rows serialize different payloads and likewise remain engineering evidence.
