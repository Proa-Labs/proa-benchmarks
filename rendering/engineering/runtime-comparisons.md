# Runtime and framework-local experiments

These retained August 2026 values use specialized fixtures. They must not be joined to the canonical framework table.

## React runtime loop

The only retained Node/Bun/Deno values came from the non-parity-gated legacy fixture:

| Runtime | Output bytes | Mean µs/render | Note |
| --- | ---: | ---: | --- |
| Bun 1.3.10 | 25,179 | 71.74 | React 19 production mode |
| Node 23.2.0 | 25,172 | 95.97 | React 19.2.4 production mode |
| Deno 2.2.3 | 25,180 | 96.61 | Result written; process later failed to exit |

These rows compare runtimes only within that legacy loop. The public React row uses the pinned Node LTS runtime and all three canonical workloads. See the [complete legacy table](../../archive/legacy-cross-language.md).

## Auxiliary construction paths

| Workload | Output bytes | Raw value |
| --- | ---: | ---: |
| React complex control flow | 16,711 | 65.80 µs/render mean, 10,000 iterations |
| Handlebars complex control flow | 16,663 | 69.36 µs/render mean including precomputation; 60.03 µs template-only, 10,000 iterations |
| React interactive SSR | 27,520 | 101.54 µs/render mean, 10,000 iterations |

## React streaming trace

The 20-iteration framework-local trace used async panels and a different completion boundary:

| Event | Average ms | P50 ms | P95 ms | Min ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Response ready | 0.41 | 0.32 | 0.88 | 0.10 | 0.91 |
| First chunk | 0.48 | 0.38 | 0.97 | 0.12 | 1.04 |
| Shell visible | 0.48 | 0.38 | 0.97 | 0.12 | 1.04 |
| All ready | 90.96 | 91.02 | 91.34 | 90.31 | 91.39 |
| Complete | 91.25 | 91.40 | 91.85 | 90.42 | 91.97 |
| Shipping panel ready | 9.05 | 9.17 | 9.52 | 8.30 | 10.00 |
| Seller panel ready | 16.99 | 17.11 | 17.65 | 15.79 | 17.68 |
| Returns panel ready | 24.98 | 24.94 | 25.75 | 24.29 | 26.05 |
| Similar-items panel ready | 43.16 | 43.28 | 43.63 | 41.75 | 43.72 |
| Reviews panel ready | 66.27 | 66.25 | 66.97 | 65.09 | 67.85 |
| Q&A panel ready | 91.03 | 91.19 | 91.44 | 90.34 | 91.47 |

No peer implementation shares this streaming fixture, so it remains construction-path evidence.
