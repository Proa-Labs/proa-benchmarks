# Benchmark report migration

This note maps the former mixed landing page to the scoreboard/laboratory structure introduced for `canonical-ssr-v1`.

## Public evidence

| Before | After |
| --- | --- |
| Manually maintained seven-renderer, three-workload table mixed with memcpy rows | Renderer-only table generated from `rendering/results/latest.json` |
| Renderer labels containing versions and construction notes | One stable technology label per row; versions and caveats in `latest.md` |
| P50, range, P95, bytes, and host details in the first table | P50 plus same-capture ratio only; full statistics retained in the detailed report |
| Several runtime rows for React elsewhere on the same page | One React row on pinned Node LTS; alternative runtimes remain an engineering experiment |
| Adapters silently absent from the representative table | Fixed 15-renderer coverage table with `included`, `in progress`, or `excluded` status |

During migration, a generated historical sample imported only the valid August 31 representative capture and explicitly refused the old cross-language values. The completed September 1 unified run then replaced that transitional sample; all current public cells now share the expanded roster's capture ID.

## Engineering evidence

| Former material | Destination |
| --- | --- |
| Proa owned/reused/chained rows and targeted Criterion fixtures | `engineering/proa-buffer-strategies.md` |
| Topcoat cached/build/render construction paths | `engineering/proa-buffer-strategies.md` |
| Integer-to-ASCII latency sweep | `engineering/integer-formatting.md` |
| Allocation counts | `engineering/allocation-analysis.md` |
| Hot-buffer copy controls | `engineering/memcpy-floor.md` |
| React Node/Bun/Deno and framework-local construction/streaming traces | `engineering/runtime-comparisons.md` |
| Showcase and heavy application-shaped render loops | `engineering/application-coverage.md` and `showcase/` |

## Historical and other benchmark classes

| Former material | Destination |
| --- | --- |
| Non-parity-gated jte/Rocker/Handlebars/ERB/Marko/PHP/React/Go/Jinja2 loop | `archive/legacy-cross-language.md` |
| Complete pre-refactor page and provenance | `archive/public-report-2026-08-31.md` |
| Showcase browser-JavaScript results | `showcase/` |
| Agent-chain results | `agent-chain/` |
| Travel workflow and browser diagnostics | `travel-agent/` |

No historical evidence was deleted. The root README keeps the canonical scoreboard first, then compiles the detailed canonical report and the complete dated research record below it. The destinations above remain the maintained source and audit locations for those embedded sections.

## Harness migration

- `./rendering/run-all` is the sole canonical build, parity, timing, JSON, and report command.
- `rendering/canonical/roster.json` is the expected roster; disappearing adapters fail validation.
- `rendering/canonical/workloads.json` is the shared sampling and workload manifest.
- `rendering/generate-report.mjs --check` verifies that public Markdown exactly matches JSON.
- `rendering/run_all.sh` remains a compatibility entry point for specialized laboratory benches.
- The older seven-renderer orchestrator is retired as a public result producer.

The adapter source directories were retained. jte, Rocker, Handlebars, Go `html/template`, Jinja2, PHP, Askama, and Sailfish now implement all three canonical fixtures and entered the public result only after the unified runner passed all 45 parity cells and completed the fresh capture.
