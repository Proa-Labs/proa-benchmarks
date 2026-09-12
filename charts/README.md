# Figures

Nine figures covering the benchmark report: the [front page](../README.md) and its three evidence pages, [`scoreboard.md`](../scoreboard.md), [`http-capacity.md`](../http-capacity.md), and [`engineering.md`](../engineering.md).

Each one is **generated from the evidence pages' own tables** — no measurement is
retyped here. Re-run the capture, let it regenerate its page, then run the build and
the figures follow.

```sh
node charts/build.mjs     # regenerate every figure from the evidence pages
node charts/verify.mjs    # check them against the source, and against each other
```

## What is in here

| File | Draws | From the table under |
| --- | --- | --- |
| [`build.mjs`](build.mjs) | every figure | — |
| [`verify.mjs`](verify.mjs) | nothing; checks the output | — |
| [`lib/tables.mjs`](lib/tables.mjs) | the Markdown table parser and unit readers | — |
| [`lib/svg.mjs`](lib/svg.mjs) | scales, marks, axes, document chrome | — |
| [`lib/theme.mjs`](lib/theme.mjs) | palette, type scale, number formatting | — |

## The figures

### Current canonical capture

| | Figure | Source |
| ---: | --- | --- |
| 01 | [Server-render latency relative to Proa](svg/01-canonical-scoreboard.svg) | [Current result](../scoreboard.md#current-result) |
| 02 | [Median against tail: P50 → P95](svg/02-canonical-tail-dispersion.svg) | [Detailed measurements](../scoreboard.md#detailed-measurements) |

### Engineering evidence

| | Figure | Source |
| ---: | --- | --- |
| 03 | [Render time vs memcpy, including full-size Proa allocation](svg/03-representative-matrix.svg) | [Dated core matrix](../engineering.md#representative-core-matrix-seven-renderers-plus-a-memcpy-floor) and [Proa output-buffer allocation](../engineering.md#proa-output-buffer-allocation) |
| 04 | [Criterion micro-benchmarks](svg/04-criterion-microbenchmarks.svg) | [Representative core matrix](../engineering.md#representative-core-matrix-seven-renderers-plus-a-memcpy-floor) |
| 05 | [Full-response product-card scaling across seventeen renderers](svg/05-product-card-scaling.svg) | [Product-grid scaling capture](../engineering.md#product-grid-scaling-capture) |

### Application and browser

| | Figure | Source |
| ---: | --- | --- |
| 06 | [The linked showcase corpus](svg/06-showcase-corpus.svg) | [Linked proa_showcase corpus](../engineering.md#linked-proa_showcase-corpus) |
| 07 | [Suspense-heavy HTTP capacity, latency, CPU, and RSS](svg/07-suspense-load.svg) | [Suspense streaming over HTTP](../http-capacity.md#suspense-streaming-over-http-one-core-each) |
| 08 | [Canonical pages over real HTTP on one core](svg/08-canonical-pages-http.svg) | [Canonical pages over HTTP](../http-capacity.md#canonical-pages-over-http-one-core-each) |
| 09 | [Cold start to first response](svg/09-cold-start.svg) | [Cold start to first response](../http-capacity.md#cold-start-to-first-response) |

## How they are built

`build.mjs` reads the front page and the three evidence pages, parses every Markdown
table in them, and hands the
parsed rows to one function per figure. A figure asks for its table by the exact
signature of its header row and fails the build if that signature matches anything
other than exactly one table — so a renamed column stops the build instead of
silently drawing the wrong data.

Numbers are read with unit-aware helpers rather than by string slicing. Durations
normalise to microseconds, bracketed ranges and confidence intervals are parsed
with a pattern that tolerates thousands separators, and slash triples keep their
`lower / point / upper` order.

`verify.mjs` then checks the result. Some checks confirm the figures match their
source; others check the evidence pages against themselves. Scoreboard ratios and times are
recomputed from the detailed P50 table, and zero payload deltas must reproduce
the recorded exact-byte match counts. The memcpy ratios reproduce from retained
process measurements and the figure must match its source tables exactly.

## Conventions

Every figure is a static SVG, so there is no hover layer and no tooltip. Values
are therefore direct-labelled or readable from the axis, and the table beside the
figure on its evidence page is the table view.

- **Keep visible text short.** Use a brief title, one subtitle, and labels or
  legends for units, scales, and marks. Keep at most one short footer for context
  needed to interpret a comparison. Methodology and commentary belong on the
  evidence page; the SVG's accessible description retains the measured values.
- **Proa is the accent; every other engine is neutral grey.** A figure with no
  Proa row would accent nothing, because highlighting a row there would imply a
  comparison the data cannot support.
- **Logarithmic axes are labelled as such**, and are used wherever a panel spans
  more than about one order of magnitude.
- **Two measures never share one axis.** Where a figure shows both time and
  response size, they are two aligned panels.
- **Superseded captures say so in the deck**, in the same words the evidence page uses.
- **Contrary cells are kept.** Askama and Sailfish beating Proa, Askama's faster
  large-page estimate, and Sailfish's lower reused times are all plotted rather
  than omitted.

The palette is checked against the light chart surface for lightness band, chroma,
colour-vision separation and contrast; the pairings in use are recorded at the top
of [`lib/theme.mjs`](lib/theme.mjs).

Figures are written as XML, not HTML: GitHub serves `.svg` as `image/svg+xml` and
parses it strictly, so `build.mjs` validates each document before writing it. A
figure that a browser would tolerate but an XML parser would reject fails the build.
