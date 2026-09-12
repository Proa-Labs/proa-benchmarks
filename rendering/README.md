# Rendering benchmarks

This directory separates one public comparison from the renderer engineering laboratory.

## Canonical scoreboard

The canonical suite asks one question: how long does each renderer take to turn the same prepared data into the same three server-rendered pages while returning an independently owned response?

The fixed roster is in [`canonical/roster.json`](canonical/roster.json), the workloads are in [`canonical/workloads.json`](canonical/workloads.json), and the contract is in [`protocol.md`](protocol.md). Run the entire gate and measurement pipeline with:

```sh
./rendering/run-all
```

That command builds every adapter, dumps all 51 renderer/workload outputs, refuses to measure if any parity cell fails, benchmarks a complete roster with one sampling policy, writes [`results/latest.json`](results/latest.json), and generates [`results/latest.md`](results/latest.md) plus the root scoreboard.

The current committed result is the September 1, 2026 unified capture: all 17 fixed-roster adapters passed all three parity cells and were measured in the same five-process run. The earlier seven-renderer capture remains archived.

## Engineering laboratory

[`engineering/`](engineering/) contains construction-path experiments, allocation audits, integer-formatting studies, memcpy controls, runtime comparisons, and application-shaped fixtures. These experiments remain useful, but they do not add rows to the public scoreboard.

Compatibility scripts and specialized benches remain available through [`run_all.sh`](run_all.sh). Their results are engineering evidence unless they were produced by `run-all` and appear in the same canonical JSON capture.

## Evidence map

- [`results/latest.md`](results/latest.md): detailed canonical report
- [`results/latest.json`](results/latest.json): sole source for public numbers
- [`RESULT_TABLE_AUDIT.md`](RESULT_TABLE_AUDIT.md): classification of every pre-refactor result table
- [`MIGRATION.md`](MIGRATION.md): where each old result moved
- [`../archive/legacy-cross-language.md`](../archive/legacy-cross-language.md): non-parity-gated adapter loop
- [`../archive/public-report-2026-08-31.md`](../archive/public-report-2026-08-31.md): complete pre-refactor mixed report, with local links rebased
