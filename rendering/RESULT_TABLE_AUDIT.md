# Pre-refactor result-table audit

This inventory was completed against the repository before the public README was rewritten. It classifies evidence by benchmark question; it does not judge whether an experiment is useful.

The root README now embeds the complete human-readable result record after the canonical scoreboard. The locations below remain the source and audit homes; embedding them does not change their classification or make differently shaped fixtures comparable.

## Former top-level report

The complete original document, including its environment and all 22 tables, is preserved at [`archive/public-report-2026-08-31.md`](../archive/public-report-2026-08-31.md). Its prose and tables are unchanged; local links were rebased for the archive location.

| Former section or table | Classification | Comparability decision | New home |
| --- | --- | --- | --- |
| Suite index | Metadata, not a result | No performance values | New root README links |
| Capture provenance | Metadata, not a result | Applies to several distinct captures and cannot define one scoreboard | Verbatim archive; canonical metadata now comes from JSON |
| Representative core matrix: renderer rows | Canonical cross-renderer evidence | Same three fixtures, ownership boundary, run, and 21-cell parity gate; valid for its seven-renderer capture | Generated root table and `rendering/results/latest.*` |
| Representative core matrix: memcpy rows | Engineering evidence | Pre-rendered, reusable buffers and a different operation | `engineering/memcpy-floor.md` |
| Standard-page construction paths | Engineering evidence | Mixes owned/reused output and cached/built views | `engineering/proa-buffer-strategies.md` |
| Criterion targeted rows | Engineering evidence | Multiple fixtures, ownership modes, payloads, and application-only cells | `engineering/proa-buffer-strategies.md`; full archive |
| Topcoat card-count scaling | Engineering evidence | Byte parity, but compares several construction boundaries | `engineering/proa-buffer-strategies.md` |
| Integer scaling, independently owned | Engineering evidence | Dedicated three-renderer microbenchmark | `engineering/integer-formatting.md` |
| Integer scaling, reusable contiguous | Engineering evidence | Reuse changes the public ownership boundary | `engineering/integer-formatting.md` |
| Integer allocation counts | Engineering evidence | Separately instrumented allocation question | `engineering/allocation-analysis.md` |
| Linked showcase SSR pages | Application coverage | Mostly Proa-only application fixtures; no full peer roster | `engineering/application-coverage.md` and `showcase/` |
| Linked showcase JavaScript payload | Browser/agent evidence | Browser payload, not renderer latency | `showcase/` and dated archive |
| Linked showcase browser timings and heap | Browser/agent evidence | Browser startup/interaction boundary | `showcase/` and dated archive |
| Heavy table and SRP loops | Application coverage | Older process policy and specialized partial peer fixtures | `engineering/application-coverage.md` |
| Legacy cross-language loop | Historical/non-comparable evidence | Different fixture and no parity gate | `archive/legacy-cross-language.md` |
| Auxiliary React/Handlebars rows | Engineering evidence | Framework-specific fixtures and precomputation boundaries | `engineering/runtime-comparisons.md` |
| React streaming events | Engineering evidence | Framework-local async trace with no equivalent peers | `engineering/runtime-comparisons.md` |
| Agent-chain deterministic replay | Browser/agent evidence | Complete browser workflow, not SSR renderer latency | `agent-chain/README.md` |
| Agent-chain Browser Use replay | Browser/agent evidence | Browser-agent workflow | `agent-chain/README.md` |
| Travel workflow total | Browser/agent evidence | Live-site/counterfactual workflow | `travel-agent/README.md` |
| Travel per-surface timing | Browser/agent evidence | Browser-agent surface timing | `travel-agent/README.md` |
| Travel current-site delivery/JavaScript | Browser/agent evidence | Network and browser execution | `travel-agent/README.md` and its evidence reports |
| Proa client metric | Browser/agent evidence | Browser-ready and script CPU values, not rendering | `travel-agent/README.md` and dated archive |

## Tables already outside the former landing page

| Location | Tables audited | Classification | Disposition |
| --- | ---: | --- | --- |
| `rendering/BENCHMARKS.md` | 2 | Workload taxonomy and architecture narrative, not retained result tables | Replaced by the canonical/laboratory index; old text remains in Git history and the dated mixed-report archive where applicable |
| `BENCHMARK_PROTOCOL.md` | 2 | Protocol taxonomy and gap register, not result evidence | Superseded for the public suite by `rendering/protocol.md` |
| `showcase/README.md` | 1 | Application-coverage matrix, not a latency result table | Remains with its suite |
| `agent-chain/README.md` | 3 | Browser/agent evidence | Remains with its suite; removed from the public renderer landing page |
| `travel-agent/README.md` | 6 | Browser/agent evidence, including measured and explicitly estimated sensitivity tables | Remains with its suite |
| `travel-agent/document-delivery-analysis-2026-08-28.md` | 4 | Browser/network diagnostic evidence | Remains with its suite |
| `travel-agent/interaction-timings-2026-08-28.md` | 12 | Browser/agent evidence | Remains with its suite |
| `travel-agent/javascript-bundle-investigation-2026-08-28.md` | 1 | Browser payload evidence | Remains with its suite |
| `travel-agent/javascript-payload-analysis-2026-08-28.md` | 20 | Browser payload evidence | Remains with its suite |

## Admission conclusion

Only the seven renderer rows from the representative core matrix qualified as canonical evidence at audit time. They came from one capture and passed all 21 parity cells. The control rows did not qualify as renderers. No value in the legacy cross-language loop qualified, regardless of adapter maintenance status.

The canonical ports expanded the expected roster to 15, but a port alone was not treated as a result. The September 1 rerun subsequently passed all 45 parity cells and measured all 15 adapters; no transplanted value was used during that transition.
