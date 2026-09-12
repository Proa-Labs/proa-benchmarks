# Canonical adapters

[`roster.json`](../roster.json) is the complete public renderer roster. Adapter
sources remain in their native build trees under `rendering/src/` and
`rendering/external/`; this directory documents the shared contract without
duplicating package managers or lockfiles.

Every adapter accepts:

```text
--workload cards|table|products
--iterations N
--warmup N
--out RESULT.json
--dump OUTPUT.html
--dump-only
```

Fixture/application compilation and canonical input construction happen before
the timed loop. Each timed call creates a complete independently owned response.
The runner consumes the result, checks its renderer/workload identity, and will
not time any adapter until all roster parity cells pass.

The public scoreboard fixes the product workload at 96 cards. The dedicated
scaling capture runs the same adapter contract at 12, 96, and 768 cards:

```text
./rendering/run-all --product-scaling
```

The runner supplies `PROA_BENCH_PRODUCT_COUNT` to each fresh adapter process;
the override is internal to this capture mode and does not change the default
workload.

## Implementation coverage

| Renderer | Canonical entry point |
| --- | --- |
| Proa, Askama, Sailfish, Leptos, Dioxus, Topcoat | `rendering/src/bin/representative_suite_bench.rs` |
| React | `rendering/external/react/suite_bench.mjs` |
| Marko | `rendering/external/marko/suite_bench.mjs` |
| Vue | `rendering/external/vue/suite_bench.mjs` |
| Svelte | `rendering/external/svelte/suite_bench.mjs` |
| Rails | `rendering/external/rails/suite_bench.rb` |
| jte | `rendering/external/jte/src/main/java/proa/bench/jte/Bench.java` |
| Rocker | `rendering/external/rocker/src/main/java/proa/bench/rocker/Bench.java` |
| Handlebars | `rendering/external/handlebars/suite_bench.mjs` |
| Go `html/template` | `rendering/external/go/suite_bench.go` |
| Jinja2 | `rendering/external/jinja/suite_bench.py` |
| PHP | `rendering/external/php/suite_bench.php` |

The fixed-roster implementation queue is currently empty: all 17 adapters
implement all three workloads. Generated coverage in the root README remains
authoritative because a source port is not considered included until its
capture passes parity and measurement completeness.
