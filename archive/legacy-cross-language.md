# Legacy cross-language adapter loop

> **Historical adapter experiment. These rows used a different fixture and were not parity-gated. Do not compare these values with the canonical benchmark.**

Captured August 30–31, 2026. Each adapter used 10,000 iterations. These values remain here as dated porting and runtime evidence only; none is imported into `rendering/results/latest.json`.

| Adapter | Output bytes | Mean µs/render | Run note |
| --- | ---: | ---: | --- |
| jte | 25,074 | 9.08 | OpenJDK 25, binary static content + `Utf8ByteOutput` |
| Rocker | 25,077 | 9.09 | OpenJDK 25, `ArrayOfByteArraysOutput` |
| Handlebars | 38,596 | 20.62 | Node 23.2.0, Handlebars 4.7.8 |
| ERB / Erubi | 38,590 | 30.88 | Ruby 2.6.10 |
| Marko | 24,005 | 33.50 | Node 23.2.0, Marko 6.0.150 render path |
| PHP | 25,073 | 38.23 | PHP 8.5.9 |
| React 19 on Bun | 25,179 | 71.74 | Bun 1.3.10, production mode |
| Go `html/template` | 44,827 | 85.17 | Go 1.25.5 |
| React 19 on Node | 25,172 | 95.97 | React 19.2.4, production mode |
| React 19 on Deno | 25,180 | 96.61 | Deno 2.2.3; result was written, then the process failed to exit |
| Jinja2 | 44,817 | 105.01 | Python 3.14.2 |

HHVM was unavailable on the arm64 macOS capture host, so the Hack adapter produced no value. Rails/ERB in this table is not the Rails Action View adapter in the canonical suite.

The maintained jte, Rocker, Handlebars, Go, Jinja2, and PHP implementations were subsequently ported to all three canonical fixtures and admitted only after the September 1 unified run passed the complete parity gate. The legacy values above were never carried forward.
