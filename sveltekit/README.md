# SvelteKit production comparison

See [the generated results](../sveltekit.md). The production app lives in
[`rendering/external/sveltekit/`](../rendering/external/sveltekit/), built with
pinned SvelteKit, Svelte, Vite and `adapter-node` dependencies.

The existing canonical and scaling suites measure Svelte's compiled renderer.
The HTTP and cold-start suites include SvelteKit's actual production router and
adapter as a fifth engine. The streaming comparison uses one native route per
framework: Proa's resolved-HTML stream and SvelteKit's promise streaming.

The HTTP response-end metrics have different completion semantics. Browser
navigation-to-all-96-cards is the comparable completed-UI metric. Browser samples
must have the same entire resolved panel DOM, not just the same number of cards.
The benchmark deliberately preserves the existing fixture's document mode and
markup, including its lack of loaded CSS or product images.

```sh
npm ci --prefix rendering/external/sveltekit
node sveltekit/run.mjs --smoke
node sveltekit/run.mjs
node sveltekit/report.mjs
node sveltekit/report.mjs --check
node --test rendering/external/sveltekit/stream-validator.test.mjs sveltekit/benchmark.test.mjs
```

Full defaults: eight rates (250–6,000 rps), three process repeats, one-second
pre-roll, five-second observation, twelve load workers. Browsers use thirty
fresh contexts per variant/profile across three launches. The profiles are
specified in [`browser.mjs`](browser.mjs). A custom protocol requires `--out`
and cannot overwrite `results/latest.json`; smoke captures are never published.
Failed captures remain `.partial` files. A shared stream-suite lock prevents
concurrent runs with the original Suspense suite. Run all timed suites
sequentially, with other heavy host activity stopped.

`run.mjs` records source hashes and rejects edits made during the capture.
`report.mjs` checks complete protocol coverage, generator health, production
mode, HTTP throughput against retained completion counts, raw browser metrics
against their summaries, identical DOM hashes, JavaScript-disabled controls,
and source hashes for all five underlying suites.
It also verifies the generated SVG. Raw samples and phase summaries are kept in
`results/latest.json`; no selected “best run” is substituted for the protocol.
The raw capture includes a buffered validation control that is not plotted.
