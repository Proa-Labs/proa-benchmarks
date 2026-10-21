#!/usr/bin/env node
// Renders the canonical-pages HTTP capture into its README section. The
// section is regenerated from results/latest.json; nothing here is typed by
// hand, and the generator refuses a capture whose measured sources changed.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { summarize } from "../suspense-load/stats.mjs";
import { numbersApproximatelyEqual } from "../suspense-load/validation.mjs";
import { ENGINES, PUBLICATION, SCENARIO_ID, WORKLOADS } from "./scenario.mjs";
import { sourceFiles as sveltekitSourceFiles } from "../rendering/external/sveltekit/benchmark.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const resultPath = join(here, "results", "latest.json");
const readmePath = join(root, "http-capacity.md");
export const startMarker = "<!-- page-load:start -->";
export const endMarker = "<!-- page-load:end -->";
const check = process.argv.includes("--check");
// Keep this list synchronized with run.mjs.
export const benchmarkSourceFiles = [
  ...sveltekitSourceFiles,
  ".nvmrc",
  "Cargo.lock",
  "Cargo.toml",
  "package.json",
  "pnpm-lock.yaml",
  "load/driver.mjs",
  "load/worker.mjs",
  "page-load/react_server.mjs",
  "page-load/run.mjs",
  "page-load/scenario.mjs",
  "page-load/validate.mjs",
  "rendering/Cargo.toml",
  "rendering/external/go/suite_bench.go",
  "rendering/external/marko/compile_suite.mjs",
  "rendering/external/marko/package-lock.json",
  "rendering/external/marko/package.json",
  "rendering/external/marko/page_server.mjs",
  "rendering/external/marko/page_table.marko",
  "rendering/external/marko/suite_cards.marko",
  "rendering/external/marko/suite_products.marko",
  "rendering/external/react/package-lock.json",
  "rendering/external/react/package.json",
  "rendering/external/react/suite_components.mjs",
  "rendering/external/shared/suite_data.mjs",
  "rendering/src/bin/proa_page_server.rs",
  "rendering/src/data_table_page.rs",
  "rendering/src/http_load.rs",
  "rendering/src/proa_page.rs",
  "rendering/src/representative_suite.rs",
  "rendering/src/topcoat_product_grid.rs",
];

const median = (values) => summarize(values).p50;
const fixed = (value, digits = 1) => Number(value).toFixed(digits);
const integer = (value) => Math.round(value).toLocaleString("en-US");
const ms = (value) => `${fixed(value, value < 10 ? 2 : 1)} ms`;
const mib = (value) => `${fixed(value / 1024 / 1024, 1)} MiB`;
const ratio = (value) => `${fixed(value, value >= 10 ? 1 : 2)}×`;

async function currentSourceSha256() {
  const hash = createHash("sha256");
  for (const relativePath of benchmarkSourceFiles) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function validateResult(result) {
  const fail = (message) => {
    throw new Error(`invalid page-load publication artifact: ${message}`);
  };
  if (result.status !== "pass" || result.captureKind !== "publication") {
    fail(`status/capture kind is ${result.status}/${result.captureKind}`);
  }
  if (result.schemaVersion !== 1) fail(`schema version is ${result.schemaVersion}`);
  if (result.scenario?.id !== SCENARIO_ID) fail(`scenario is ${result.scenario?.id}`);
  const m = result.methodology ?? {};
  if (
    m.closedLoopConcurrency !== PUBLICATION.closedLoopConcurrency ||
    m.preRollSeconds !== PUBLICATION.preRollSeconds ||
    m.durationSeconds !== PUBLICATION.durationSeconds ||
    m.repeats !== PUBLICATION.repeats ||
    m.warmupRequests !== PUBLICATION.warmupRequests
  ) {
    fail("concurrency, pre-roll, duration, repeat, or warmup does not match the publication protocol");
  }
  const engineIds = result.engines?.map(({ id }) => id);
  if (JSON.stringify(engineIds) !== JSON.stringify(ENGINES.map(({ id }) => id))) {
    fail(`engine roster is ${JSON.stringify(engineIds)}`);
  }
  if (!/^[a-f0-9]{64}$/.test(result.source?.sourceSha256 ?? "")) fail("source SHA-256 is missing");
  if (!Number.isFinite(Date.parse(result.capturedAt)) || !Number.isFinite(Date.parse(result.completedAt))) {
    fail("capture timestamps are missing or invalid");
  }
  for (const engine of result.engines) {
    if (typeof engine.framework !== "string" || !engine.framework) fail(`${engine.id} framework version is missing`);
    if (engine.id === "proa" && engine.health?.workerThreads !== 1) fail("Proa did not run one worker thread");
    if (engine.id === "go-html-template" && engine.health?.gomaxprocs !== 1) fail("Go did not run GOMAXPROCS=1");
    if (["react", "marko", "sveltekit"].includes(engine.id) && engine.health?.nodeEnv !== "production") fail(`${engine.id} did not confirm NODE_ENV=production`);
    if (engine.id === "react" && engine.health?.reactDomBuild !== "production") fail("React did not confirm the production react-dom build");
    for (const workload of WORKLOADS) {
      const cell = engine.workloads?.[workload.id];
      if (!cell) fail(`${engine.id} is missing ${workload.id}`);
      if (
        cell.parity?.byteIdenticalToCanonicalDump !== true ||
        cell.parity.bytes !== cell.canonicalDump?.bytes ||
        cell.parity.sha256 !== cell.canonicalDump?.sha256
      ) {
        fail(`${engine.id}/${workload.id} parity evidence is incomplete`);
      }
      const seen = new Set();
      for (const phase of cell.phases ?? []) {
        const key = `${phase.mode}/${phase.repeat}`;
        if (seen.has(key)) fail(`${engine.id}/${workload.id} has duplicate phase ${key}`);
        seen.add(key);
        if (phase.mode === "open" && phase.offeredRps !== workload.fixedRateRps) {
          fail(`${engine.id}/${workload.id} open phase ran at ${phase.offeredRps} rps`);
        }
        if (phase.mode === "closed" && phase.concurrency !== PUBLICATION.closedLoopConcurrency) {
          fail(`${engine.id}/${workload.id} closed phase ran ${phase.concurrency} connections`);
        }
        if (phase.errorCount !== 0) fail(`${engine.id}/${workload.id} ${key} recorded ${phase.errorCount} errors`);
        if (phase.loadGeneratorValid !== true) fail(`${engine.id}/${workload.id} ${key} was generator-limited`);
        if (
          !numbersApproximatelyEqual(
            phase.completionThroughputRps,
            phase.steadyStateCompletedResponses / m.durationSeconds,
          )
        ) {
          fail(`${engine.id}/${workload.id} ${key} has inconsistent throughput accounting`);
        }
        for (const [label, value] of [
          ["throughput", phase.completionThroughputRps],
          ["CPU/request", phase.cpu?.cpuMsPerSuccessfulRequest],
          ["cores", phase.cpu?.averageCpuCores],
          ["peak RSS", phase.memory?.peakSampledRssBytes],
          ["P50", phase.latencyMs?.complete?.p50],
          ["P99", phase.latencyMs?.complete?.p99],
          ["scheduled P99", phase.latencyMs?.scheduledComplete?.p99],
        ]) {
          if (!Number.isFinite(value) || value < 0) fail(`${engine.id}/${workload.id} ${key} has invalid ${label}`);
        }
      }
      for (const mode of ["closed", "open"]) {
        for (let repeat = 1; repeat <= PUBLICATION.repeats; repeat += 1) {
          if (!seen.has(`${mode}/${repeat}`)) fail(`${engine.id}/${workload.id} is missing ${mode} repeat ${repeat}`);
        }
      }
    }
  }
}

export function rowsFor(result) {
  const rows = [];
  for (const workload of WORKLOADS) {
    const proa = result.engines.find(({ id }) => id === "proa");
    const proaClosed = proa.workloads[workload.id].phases.filter((phase) => phase.mode === "closed");
    const proaRps = median(proaClosed.map((phase) => phase.completionThroughputRps));
    for (const engine of result.engines) {
      const cell = engine.workloads[workload.id];
      const closed = cell.phases.filter((phase) => phase.mode === "closed");
      const open = cell.phases.filter((phase) => phase.mode === "open");
      const pickClosed = (selector) => median(closed.map(selector));
      const pickOpen = (selector) => median(open.map(selector));
      const sustainedRps = pickClosed((phase) => phase.completionThroughputRps);
      rows.push({
        workload: workload.label,
        workloadId: workload.id,
        engine: engine.label,
        engineId: engine.id,
        sustainedRps,
        relativeThroughput: proaRps / sustainedRps,
        cpuMsPerResponse: pickClosed((phase) => phase.cpu.cpuMsPerSuccessfulRequest),
        coresAtCapacity: pickClosed((phase) => phase.cpu.averageCpuCores),
        peakRssAtCapacity: pickClosed((phase) => phase.memory.peakSampledRssBytes),
        fixedRateRps: workload.fixedRateRps,
        fixedRateP50: pickOpen((phase) => phase.latencyMs.scheduledComplete.p50),
        fixedRateP99: pickOpen((phase) => phase.latencyMs.scheduledComplete.p99),
        fixedRateCpuMs: pickOpen((phase) => phase.cpu.cpuMsPerSuccessfulRequest),
        fixedRateRss: pickOpen((phase) => phase.memory.peakSampledRssBytes),
        bytes: cell.parity.bytes,
        generatorBusiest: Math.max(...cell.phases.map((phase) => phase.generator.busiestWorkerUtilization)),
      });
    }
  }
  return rows;
}

export function render(result) {
  validateResult(result);
  const rows = rowsFor(result);
  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(new Date(result.capturedAt));
  const m = result.methodology;
  const host = result.host.cpuModel;
  const proaRevision = result.source.proaRevision.slice(0, 8);
  const proaBranch = result.source.proaBranch && result.source.proaBranch !== "main" ? ` (${result.source.proaBranch})` : "";
  const frameworks = Object.fromEntries(result.engines.map((engine) => [engine.id, engine.id === "proa" ? `Proa 0.3.0 @ ${proaRevision}${proaBranch}` : engine.framework]));

  const capacityRows = rows
    .map((row) =>
      `| ${row.workload} | ${row.engine} | ${integer(row.sustainedRps)} | ${ratio(row.relativeThroughput)} | ${fixed(row.cpuMsPerResponse, 3)} ms | ${fixed(row.coresAtCapacity, 2)} | ${mib(row.peakRssAtCapacity)} |`,
    )
    .join("\n");
  const latencyRows = rows
    .map((row) =>
      `| ${row.workload} | ${row.engine} | ${integer(row.fixedRateRps)} | ${ms(row.fixedRateP50)} | ${ms(row.fixedRateP99)} | ${fixed(row.fixedRateCpuMs, 3)} ms | ${mib(row.fixedRateRss)} |`,
    )
    .join("\n");
  const targetRps = 10_000;
  const coreRows = WORKLOADS.map((workload) => {
    const cells = rows.filter((row) => row.workloadId === workload.id);
    return `| ${workload.label} | ${cells.map((row) => fixed(row.cpuMsPerResponse * targetRps / 1_000, 1)).join(" | ")} |`;
  }).join("\n");
  const parityRows = result.engines
    .map((engine) => `| ${frameworks[engine.id]} | ${WORKLOADS.map((workload) => integer(engine.workloads[workload.id].parity.bytes)).join(" | ")} | byte-identical |`)
    .join("\n");
  const products = rows.filter((row) => row.workloadId === "products");
  const proaProducts = products.find((row) => row.engineId === "proa");
  const reactProducts = products.find((row) => row.engineId === "react");
  const engineLabels = ENGINES.map(({ label }) => label);

  return `${startMarker}
## Canonical pages over HTTP, one core each

**${date} · ${host} · ${result.engines.length} production servers · every response byte-identical to its parity-gated dump**

This is the capacity question behind the scoreboard: the same three parity-gated pages, served over real loopback HTTP/1.1 by each framework's ordinary production server, with every engine limited to one core of work. Proa runs one Tokio worker thread on Axum, React, Marko, and SvelteKit run one Node process, and Go runs \`GOMAXPROCS=1\` on \`net/http\`. On the product grid, one Proa core sustained ${integer(proaProducts.sustainedRps)} complete responses per second against ${integer(reactProducts.sustainedRps)} for React, and spent ${fixed(proaProducts.cpuMsPerResponse, 3)} ms of CPU per response against React's ${fixed(reactProducts.cpuMsPerResponse, 3)} ms.

Each value is the median of ${m.repeats} fresh server processes. **Capacity** rows use ${m.closedLoopConcurrency} closed-loop connections issuing requests back to back; throughput counts complete responses inside a fixed ${m.durationSeconds}-second window after a ${m.preRollSeconds}-second pre-roll. **CPU per response** is the server process's exact CPU-time delta across all of its threads, including garbage-collector helpers, divided by successful responses. The load generator is ${m.generatorWorkers} separate worker processes that hash every response; a phase is rejected if any worker's event loop exceeds ${Math.round(m.generatorCpuLimit * 100)}% busy.

| Workload | Engine | Sustained responses/s | Proa ÷ engine | CPU per response | Cores used | Peak RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${capacityRows}

Translating CPU per response into fleet size: the cores needed to serve ${integer(targetRps)} responses per second of each page, from the measured CPU per response. Real deployments add headroom, but the ratios carry over.

| Workload | ${engineLabels.join(" | ")} |
| --- | ${engineLabels.map(() => "---:").join(" | ")} |
${coreRows}

**Latency at equal load** uses fixed-rate open-loop arrivals below every engine's knee, so the percentiles compare the same request-rate target rather than each server's own saturation point. Latency is measured from scheduled arrival and includes generator lag.

| Workload | Engine | Request rate (rps) | Complete P50 | Complete P99 | CPU per response | Peak RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${latencyRows}

Every measured response was compared byte for byte against the dump the same engine produced through its canonical adapter, which is the dump that passed the scoreboard's browser-DOM parity gate.

| Engine version | ${WORKLOADS.map(({ label }) => `${label} bytes`).join(" | ")} | HTTP responses |
| --- | ${WORKLOADS.map(() => "---:").join(" | ")} | --- |
${parityRows}

- Capture: [page-load/results/latest.json](page-load/results/latest.json); reproduce with \`pnpm run bench:page-load\`.
- Proa serves through \`RouteResponse::ssr\` on an Axum router; React through \`renderToString\` into \`response.end\`; Marko through its compiled template's \`render().pipe(response)\`; Go through \`html/template\` \`Execute\` into the \`ResponseWriter\`; SvelteKit through its production Node adapter with server-side rendering and \`csr=false\`.
- Node engines run with \`NODE_ENV=production\`: the driver sets it, each server's health endpoint reports it back, and React reports that it loaded the production \`react-dom/server\` build. The runner refuses to measure otherwise.
- Compression is disabled for every engine so CPU is not dominated by a shared compression setting. Databases and external network latency are outside this measurement; framework routing (including SvelteKit’s production router), HTTP parsing, response serialization, allocation, and each server's write path are inside it.
- This is a one-host, one-core capacity measurement. Multi-core deployments scale each engine by its own process or thread model; the per-response CPU cost is the portable number.
${endMarker}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [resultText, readme, sourceSha256] = await Promise.all([
    readFile(resultPath, "utf8"),
    readFile(readmePath, "utf8"),
    currentSourceSha256(),
  ]);
  const result = JSON.parse(resultText);
  if (result.source?.sourceSha256 !== sourceSha256) {
    throw new Error(
      `page-load publication source mismatch: captured ${result.source?.sourceSha256 ?? "missing"}, current ${sourceSha256}`,
    );
  }
  const block = render(result);
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  let next;
  if (start === -1 && end === -1) {
    const anchor = "<!-- suspense-load:start -->";
    const at = readme.indexOf(anchor);
    if (at === -1) throw new Error(`README anchor not found: ${anchor}`);
    next = `${readme.slice(0, at)}${block}\n\n${readme.slice(at)}`;
  } else if (start !== -1 && end !== -1 && end > start) {
    next = `${readme.slice(0, start)}${block}${readme.slice(end + endMarker.length)}`;
  } else {
    throw new Error("README has an unmatched page-load marker");
  }
  if (check) {
    if (next !== readme) throw new Error("http-capacity.md page-load block is stale; run node page-load/report.mjs");
    console.log("Page-load http-capacity.md block is current.");
  } else {
    await writeFile(readmePath, next);
    console.log("Updated the http-capacity.md page-load section.");
  }
}
