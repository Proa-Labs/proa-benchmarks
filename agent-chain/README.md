# Agent cold-start chain benchmark

This benchmark measures whether uncached JavaScript materially slows a chained
browser-agent task. It intentionally separates deterministic browser cost from
LLM planning variance.

The task is a five-site vendor compliance review:

1. Open a coordinator page.
2. Visit all five linked vendor dossiers.
3. Remember verification codes only for vendors marked `Action required`.
4. Return to the coordinator form, fill the matching fields, and submit.
5. Stop only after the server confirms `Submission accepted: 3/3`.

Two servers expose the same task and byte-identical `#root` HTML:

- `minimal` serves the complete HTML with no JavaScript.
- `hydrated` serves the same HTML and a production React 19 hydration bundle.

The five vendor pages use distinct immutable bundle URLs to model unrelated
sites in a cross-site workflow. The coordinator reuses one URL across its three
pages, so normal browser caching still works and is measured. Cache is never
disabled; each trial merely starts in a fresh browser context, like an
ephemeral browser session.

The server can add latency and bandwidth shaping to JavaScript responses only.
This isolates the asset tax without making the HTML variant artificially
slower. The default bundle is 64 KiB compressed, with 40 ms response latency
and 10 Mbps delivery.

## Deterministic benchmark

Install the repository dependencies:

```sh
pnpm install --frozen-lockfile
```

Start both fixture servers:

```sh
node agent-chain/server.mjs
```

In another terminal, run the paired browser replay:

```sh
AGENT_CHAIN_RUNS=20 node agent-chain/run.mjs
```

Useful server controls:

```sh
AGENT_CHAIN_JS_GZIP_KIB=3072 \
AGENT_CHAIN_ASSET_LATENCY_MS=40 \
AGENT_CHAIN_ASSET_KBPS=10000 \
node agent-chain/server.mjs
```

`AGENT_CHAIN_JS_GZIP_KIB` is the compressed transfer size of each bundle,
not its decoded source size. The measured size curve uses 64, 256, 1024,
3072, and 8192 KiB.

Set `AGENT_CHAIN_ASSET_KBPS=0` and
`AGENT_CHAIN_ASSET_LATENCY_MS=0` for an unshaped local control.

## Browser Use validation

The Browser Use action replay runs the same successful sequence through Browser
Use's own `Browser.navigate_to` lifecycle and load-readiness behavior, but
without LLM calls. This is the useful Browser Use timing comparison:

```sh
/tmp/proa-browser-use/bin/python \
  agent-chain/run_browser_use_replay.py --runs 10
```

By default, that command measures when Browser Use considers the complete SSR
page actionable. To model a page that cannot be used until its
JavaScript finishes, require the fixture's React completion marker:

```sh
/tmp/proa-browser-use/bin/python \
  agent-chain/run_browser_use_replay.py \
  --runs 10 --wait-for-hydration
```

The natural-language agent run is deliberately secondary. Model calls and
trajectory choices are much noisier than browser execution, so it validates
that the task is genuinely agent-completable rather than serving as the primary
causal measurement.

With the fixture server already running:

```sh
python3.13 -m venv /tmp/proa-browser-use
/tmp/proa-browser-use/bin/pip install 'browser-use[core]==0.13.8'
OPENAI_API_KEY=... /tmp/proa-browser-use/bin/python \
  agent-chain/run_browser_use.py --runs 3
```

Every success is checked against server state, not the model's final answer.

## Results (August 27, 2026)

All cells used exact `#root` HTML parity and fresh browser contexts with
caching enabled. A normal run has six genuinely cold bundle URLs and two
coordinator cache-reuse opportunities. Values are workflow p50s. Bundle sizes
below are gzip transfer bytes; a site reported as 3 MiB of decoded JavaScript
is not equivalent to the 3 MiB gzip row.

### Deterministic Chromium replay

| Bundle/site | JS delivery | Minimal HTML | React hydration | Added time | Ratio |
|---:|---:|---:|---:|---:|---:|
| 64 KiB gzip | unshaped loopback | 122.2 ms | 219.8 ms | 97.6 ms | 1.80x |
| 64 KiB gzip | 40 ms + 10 Mbps | 128.9 ms | 766.3 ms | 637.4 ms | 5.95x |
| 256 KiB gzip | 40 ms + 10 Mbps | 124.9 ms | 1,716.0 ms | 1,591.1 ms | 13.74x |
| 1 MiB gzip | 40 ms + 10 Mbps | 126.1 ms | 5,505.1 ms | 5,379.0 ms | 43.64x |
| 3 MiB gzip | 40 ms + 10 Mbps | 124.8 ms | 15,599.8 ms | 15,474.9 ms | 124.98x |
| 8 MiB gzip | 40 ms + 10 Mbps | 124.6 ms | 40,867.8 ms | 40,743.2 ms | 327.92x |

These cells used 20 paired, order-alternated trials on an Apple M4 Max with
Chrome for Testing 149. The shaped network applies only to the JavaScript
response, so the delta isolates asset delivery plus parse, execution, and
hydration.

### Browser Use action replay

| Bundle/site | Completion gate | Minimal HTML | React hydration | Added time | Ratio |
|---:|:---|---:|---:|---:|---:|
| 64 KiB gzip | Browser Use default | 461 ms | 1,015 ms | 554 ms | 2.20x |
| 256 KiB gzip | Browser Use default | 465 ms | 1,991 ms | 1,526 ms | 4.28x |
| 1 MiB gzip | Browser Use default | 460 ms | 5,662 ms | 5,203 ms | 12.31x |
| 3 MiB gzip | Browser Use default | 465 ms | 15,754 ms | 15,289 ms | 33.88x |
| 8 MiB gzip | Browser Use default | 462 ms | 21,978 ms | 21,516 ms | 47.53x |
| 8 MiB gzip | React completion marker | 462 ms | 50,058 ms | 49,596 ms | 108.31x |

These cells used 10 paired trials through Browser Use 0.13.8 and Chrome 151.
Browser Use polls load readiness in coarse intervals, which absorbs part of a
small page's latency floor. At 8 MiB, each unique asset needs about 6.7 seconds
at 10 Mbps, exceeding Browser Use's roughly three-second readiness ceiling.
The default replay can therefore read the complete SSR DOM and leave each
vendor page before React finishes. The explicit completion-marker row models
the opposite contract: a page whose required behavior is unavailable until
JavaScript has completed. It uses the same byte-identical SSR HTML; only the
completion gate changes.

### Hetzner portability check

The shaped curve was repeated for 10 paired trials on the benchmark VPS
(8-vCPU AMD EPYC Milan, browser pinned to one vCPU, Chrome for Testing 149):

| Bundle/site | Minimal HTML | React hydration | Added time | Ratio | React script CPU | Cold / reused |
|---:|---:|---:|---:|---:|---:|---:|
| 64 KiB gzip | 333.5 ms | 1,123.2 ms | 789.7 ms | 3.37x | 159.7 ms | 6 / 2 |
| 1 MiB gzip | 324.9 ms | 5,916.3 ms | 5,591.4 ms | 18.21x | 220.8 ms | 6 / 2 |
| 3 MiB gzip | 323.4 ms | 16,146.5 ms | 15,823.2 ms | 49.93x | 287.6 ms | 6 / 2 |
| 8 MiB gzip | 335.1 ms | 48,675.5 ms | 48,340.5 ms | 145.28x | 645.8 ms | 7 / 1 |

The 8 MiB VPS cell transferred 56 MiB rather than 48 MiB. Chrome did not
retain the coordinator asset across all five intervening bundles, so the run
made seven server asset requests and only one cache reuse. This is consistent
with cache eviction under pressure and demonstrates that merely enabling the
cache does not guarantee reuse for very large bundles.

The large-bundle padding is deterministic inert JavaScript. It measures
delivery, parsing, and evaluation of the requested byte volume, but not the
additional application work that several MiB of real executable code may do.
The fixture also uses unique URLs on one origin, omitting cross-origin DNS and
TLS setup. Those choices make the CPU and connection portions conservative;
the controlled 10 Mbps transfer cost is exact for the stated gzip sizes.

The natural-language `gpt-4.1-mini` agent also completed and passed the
server-side acceptance check on both variants. Its raw wall times are not used
as performance evidence: different navigation choices changed the number of
model steps, overwhelming the sub-second browser signal. That is why the
action replay is the Browser Use timing result.
