# Capture comparison

This command diffs two retained JSON captures of the **same** suite. It does
not join renderer-only numbers with HTTP numbers, and it does not rewrite
evidence pages.

Supported artifacts:

| Suite | Typical path | Headline cells |
| --- | --- | --- |
| Canonical scoreboard | `rendering/results/latest.json` or `rendering/results/archive/*.json` | P50 render time, payload bytes |
| Product-grid scaling | `rendering/results/product-scaling.json` | P50 at each card count |
| Canonical pages over HTTP | `page-load/results/latest.json` | Sustained responses/s, CPU per response, equal-load P50 |
| Cold start | `cold-start/results/latest.json` | First-response P50, RSS after first response |

Reductions match the published tables: HTTP capacity cells are medians of the
closed-loop (and equal-load) phases; canonical cells are the stored process
P50s.

## Run

```sh
node compare/run.mjs \
  rendering/results/archive/canonical-ssr-v1-2026-09-05-9363fc29b790.json \
  rendering/results/latest.json

node compare/run.mjs --json --out /tmp/page-load-delta.json \
  page-load/results/latest.json \
  page-load/results/latest.json
```

`--suite canonical` (or `product-scaling`, `page-load`, `cold-start`) fails if
the files are a different suite. `--json` writes the structured comparison.
`--out` writes a file instead of stdout.

A missing cell on one side is listed as added or removed rather than filled
from another capture.

## Tests

```sh
node --test compare/compare.test.mjs
```
