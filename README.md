# Proa benchmarks

[Proa](https://github.com/Proa-Labs/proa) renders typed Rust components to HTML on the server, streams them, and hydrates fine-grained browser islands. This page shows what one core [serves over HTTP](#serving-three-pages-on-one-core), how fast [seventeen renderers](#rendering-the-same-pages-in-seventeen-renderers) render those pages, and [how to reproduce them](#reproducing-a-capture).

If you see an issue with the benchmarks or would like to add any, please open an issue!

<!-- Keep this HTML table free of blank lines so GitHub renders it as one block. -->
<table>
  <tr>
    <td valign="top" width="50%">
      <h3 id="rendering-the-same-pages-in-seventeen-renderers">Rendering the same pages in seventeen renderers</h3>
      <p>Renderer-only benchmark across three canonical pages: component, table, and product grid.</p>
      <!-- charts:scoreboard:start -->
      <a href="charts/svg/01-canonical-scoreboard.svg">
        <img width="100%" alt="Dot plot of seventeen renderers across three workloads, on a logarithmic axis of render time relative to Proa" src="charts/svg/01-canonical-scoreboard.svg">
      </a>
      <p><em>Seventeen renderers, one-core P50 multiples on log scale. <a href="scoreboard.md">Details</a> · <a href="charts/svg/01-canonical-scoreboard.svg">Full size</a> · <a href="charts/">how the figures are built</a></em></p>
      <!-- charts:scoreboard:end -->
    </td>
    <td valign="top" width="50%">
      <h3 id="serving-three-pages-on-one-core">Serving three pages on one core</h3>
      <p>Three sample pages, one core each: throughput at saturation, latency at a fixed request rate.</p>
      <!-- charts:headline:start -->
      <a href="charts/svg/08-canonical-pages-http.svg">
        <img width="100%" alt="Sustained responses per second, CPU per response, and peak RSS for Proa, React, Marko, and Go html/template serving three canonical pages over HTTP on one core" src="charts/svg/08-canonical-pages-http.svg">
      </a>
      <p><em>Three parity-gated pages on loopback HTTP, one core per engine. <a href="http-capacity.md#canonical-pages-over-http-one-core-each">Details</a> · <a href="charts/svg/08-canonical-pages-http.svg">Full size</a> · <a href="charts/">how the figures are built</a></em></p>
      <!-- charts:headline:end -->
    </td>
  </tr>
  <tr>
    <td valign="top" width="50%">
      <h3 id="suspense-streaming-over-http-one-core-each">Streaming the product grid through Suspense</h3>
      <p>Single-core Suspense streaming with eight async boundaries per request.</p>
      <!-- charts:suspense:start -->
      <a href="charts/svg/07-suspense-load.svg">
        <img width="100%" alt="Responses completed per second, latency distribution and peak memory for Proa, Marko and React streaming the product grid through Suspense over HTTP on one core" src="charts/svg/07-suspense-load.svg">
      </a>
      <p><em>Throughput sweep with queueing markers (P50/P95/P99 + memory) at each rate. <a href="http-capacity.md#suspense-streaming-over-http-one-core-each">Details</a> · <a href="charts/svg/07-suspense-load.svg">Full size</a> · <a href="charts/">how the figures are built</a></em></p>
      <!-- charts:suspense:end -->
    </td>
    <td valign="top" width="50%">
      <h3 id="cold-start-to-first-response">Cold start to first response</h3>
      <p>Startup latency from process creation to first byte-identical response.</p>
      <!-- charts:coldstart:start -->
      <a href="charts/svg/09-cold-start.svg">
        <img width="100%" alt="Median, P95 and slowest time from process spawn to first complete product-grid response for Proa, React, Marko and Go html/template, with RSS after the first response" src="charts/svg/09-cold-start.svg">
      </a>
      <p><em>Median, P95, and worst-start across 15 fresh processes. <a href="http-capacity.md#cold-start-to-first-response">Details</a> · <a href="charts/svg/09-cold-start.svg">Full size</a> · <a href="charts/">how the figures are built</a></em></p>
      <!-- charts:coldstart:end -->
    </td>
  </tr>
  <tr>
    <td valign="top" width="50%">
      <h3 id="canonical-tails-on-one-core">Canonical latency tails on one core</h3>
      <p>Single-core P50 and P95 for the same three canonical workloads.</p>
      <!-- charts:canonical-tail-dispersion:start -->
      <a href="charts/svg/02-canonical-tail-dispersion.svg">
        <img width="100%" alt="P50 and P95 render-latency spread for seventeen renderers on three workloads, one core" src="charts/svg/02-canonical-tail-dispersion.svg">
      </a>
      <p><em>Tail spread with heavy-tail markers on three workloads. <a href="scoreboard.md#detailed-measurements">Details</a> · <a href="charts/svg/02-canonical-tail-dispersion.svg">Full size</a> · <a href="charts/">how the figures are built</a></em></p>
      <!-- charts:canonical-tail-dispersion:end -->
    </td>
    <td valign="top" width="50%">
      <h3 id="render-time-vs-memcpy-on-one-core">Render time vs memcpy on one core</h3>
      <p>Legacy one-core mechanism view: workload speed vs Proa memcpy floor.</p>
      <!-- charts:representative-core-matrix:start -->
      <a href="charts/svg/03-representative-matrix.svg">
        <img width="100%" alt="Render time relative to memcpy across three workloads and eleven showcase pages on one core" src="charts/svg/03-representative-matrix.svg">
      </a>
      <p><em>Three workloads + allocation context as multiples of a memcpy baseline. <a href="engineering.md#showcase-memcpy-floor">Details</a> · <a href="charts/svg/03-representative-matrix.svg">Full size</a> · <a href="charts/">how the figures are built</a></em></p>
      <!-- charts:representative-core-matrix:end -->
    </td>
  </tr>
  <tr>
    <td valign="top" width="50%">
      <h3 id="proa-linked-showcase-corpus">Proa linked showcase corpus</h3>
      <p>Proa-only linked pages: five runs each, with render range and size.</p>
      <!-- charts:showcase-corpus:start -->
      <a href="charts/svg/06-showcase-corpus.svg">
        <img width="100%" alt="Proa linked showcase corpus render times" src="charts/svg/06-showcase-corpus.svg">
      </a>
      <p><em>Application-like page samples and stability notes. <a href="engineering.md#linked-proa_showcase-corpus">Details</a> · <a href="charts/svg/06-showcase-corpus.svg">Full size</a> · <a href="charts/">how the figures are built</a></em></p>
      <!-- charts:showcase-corpus:end -->
    </td>
    <td valign="top" width="50%"></td>
  </tr>
</table>

## Reproducing a capture

Install the JavaScript dependencies once. You need Node.js 24.20.0 exactly — the canonical runner compares `process.version` and refuses to run on anything else — with pnpm, the Rust toolchain in [`rust-toolchain.toml`](rust-toolchain.toml), and Go 1.25. The full scoreboard also needs Ruby 3.2+, a JDK 17+ with Gradle, PHP 8, and Python 3.13+.

```sh filename="Terminal"
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
npm ci --prefix rendering/external/react
npm ci --prefix rendering/external/marko
npm ci --prefix rendering/external/handlebars
```

Then run a suite. Each command builds its servers, gates every page for parity, and rewrites its evidence page. It refuses to publish a phase whose load generator was the bottleneck.

```sh filename="Terminal"
./rendering/run-all            # scoreboard: build, parity-gate, time, regenerate scoreboard.md
pnpm run bench:page-load       # canonical pages over HTTP, one core each
pnpm run bench:cold-start      # cold start to first response
pnpm run bench:suspense-load   # Suspense streaming over HTTP
pnpm run refresh               # regenerate every evidence page and figure from the captures
```

> **Good to know**: the committed numbers are dated evidence from one machine, not universal claims. Rerun the relevant suite before publishing a current comparison.

## Next steps

- [HTTP capacity, cold start and streaming](http-capacity.md)
  - Sustained responses per second, CPU per response, latency at equal load, and cold start for four production servers.
- [Canonical scoreboard evidence](scoreboard.md)
  - The seventeen-renderer table, parity coverage, every retained percentile, and the adapters side by side.
- [Engineering, application and agent captures](engineering.md)
  - Product-grid scaling, the memcpy floor, Proa's buffer allocation, client JavaScript, and the archived August report.
- [Benchmark figures](charts/)
  - How every SVG is drawn from the evidence pages' own tables and checked against them.
- [Canonical benchmark protocol](rendering/protocol.md)
  - The fairness rules, workload shapes, and parity gate in full.
- Suite READMEs: [`rendering/`](rendering/), [`page-load/`](page-load/), [`suspense-load/`](suspense-load/), [`load/`](load/), [`showcase/`](showcase/), [`agent-chain/`](agent-chain/), and the separate [`travel-agent/`](travel-agent/) control.

## License and attribution

This repository is Apache-2.0; see [`LICENSE`](LICENSE). Benchmark adapters incorporate upstream work under its own terms, recorded in [`rendering/UPSTREAM_LICENSES.md`](rendering/UPSTREAM_LICENSES.md).

React, Marko, Vue, Svelte, Rails, jte, Rocker, Handlebars, Go, Jinja2, PHP, Askama, Sailfish, Leptos, Dioxus, and Topcoat belong to their respective owners. They appear here as the subjects of a benchmark; their inclusion implies no endorsement.
