#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { summarize } from "./stats.mjs";
import { numbersApproximatelyEqual } from "./validation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const resultPath = join(here, "results", "latest.json");
const readmePath = join(root, "http-capacity.md");
const startMarker = "<!-- suspense-load:start -->";
const endMarker = "<!-- suspense-load:end -->";
const check = process.argv.includes("--check");
const expectedRates = [250, 500, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000];
const expectedEngines = ["proa", "marko", "react"];
const expectedRepeats = 3;
const expectedDelayTiersMs = [5, 8, 12, 18, 27, 40, 60, 90];
const expectedBoundaries = 8;
const expectedCardsPerPanel = 12;
const expectedGeneratorLagP95LimitMs = 25;
const expectedGeneratorCpuLimit = 0.8;
const expectedProaWorkerThreads = 1;
// Keep this list synchronized with gitMetadata() in run.mjs. The report gate
// must reject a retained capture after any measured implementation changes.
const benchmarkSourceFiles = [
  ".nvmrc",
  "Cargo.lock",
  "Cargo.toml",
  "package.json",
  "pnpm-lock.yaml",
  "load/driver.mjs",
  "load/worker.mjs",
  "rendering/Cargo.toml",
  "rendering/external/marko/compile_suspense.mjs",
  "rendering/external/marko/package-lock.json",
  "rendering/external/marko/package.json",
  "rendering/external/marko/suspense_app.marko",
  "rendering/external/marko/suspense_server.mjs",
  "rendering/external/react/suite_components.mjs",
  "rendering/external/shared/suite_data.mjs",
  "rendering/src/bin/proa_suspense_server.rs",
  "rendering/src/topcoat_product_grid.rs",
  "suspense-load/react_server.mjs",
  "suspense-load/run.mjs",
  "suspense-load/scenario.mjs",
  "suspense-load/stats.mjs",
  "suspense-load/validate.mjs",
];

// This exact revision changes three strings in run.mjs: two console labels
// and the confirmation-check description. Restoring those strings reproduces
// the retained capture's original hash; no measured behavior changed. Accept
// only this verified pair so any subsequent source edit still fails the gate.
const displayOnlySourceRevisions = new Map([
  [
    "d5d62712da036b6354ef7797024b17abb293c2468da64ee75d466efab7b463fb",
    "72b56d24f17d0f072d549b376bbde6352734f4e376da56b1b126f2e16685e7ab",
  ],
]);

const median = (values) => summarize(values).p50;
const fixed = (value, digits = 1) => Number(value).toFixed(digits);
const integer = (value) => Math.round(value).toLocaleString("en-US");
const ms = (value) => `${fixed(value, value < 10 ? 2 : 1)} ms`;
const mib = (value) => `${fixed(value / 1024 / 1024, 1)} MiB`;

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

function validateResult(result) {
  const fail = (message) => {
    throw new Error(`invalid suspense publication artifact: ${message}`);
  };
  if (result.status !== "pass" || result.captureKind !== "publication") {
    fail(`status/capture kind is ${result.status}/${result.captureKind}`);
  }
  if (result.schemaVersion !== 3) fail(`schema version is ${result.schemaVersion}`);
  if (result.scenario?.id !== "suspense_marketplace_v2") fail(`scenario is ${result.scenario?.id}`);
  if (result.scenario?.boundaries !== expectedBoundaries) fail(`scenario must contain ${expectedBoundaries} boundaries`);
  if (result.scenario?.cardsPerPanel !== expectedCardsPerPanel) fail(`scenario must carry ${expectedCardsPerPanel} cards per panel`);
  if (JSON.stringify(result.scenario?.delayTiersMs) !== JSON.stringify(expectedDelayTiersMs)) {
    fail(`delay tiers are ${JSON.stringify(result.scenario?.delayTiersMs)}`);
  }
  if (JSON.stringify(result.methodology?.ratesRps) !== JSON.stringify(expectedRates)) {
    fail(`rates are ${JSON.stringify(result.methodology?.ratesRps)}`);
  }
  if (
    result.methodology?.durationSecondsPerRate !== 5 ||
    result.methodology?.preRollSecondsPerRate !== 1 ||
    result.methodology?.repeats !== expectedRepeats ||
    result.methodology?.warmupRequestsPerEngineRateProcess !== 24 ||
    result.methodology?.generatorLagP95LimitMs !== expectedGeneratorLagP95LimitMs ||
    result.methodology?.generatorCpuLimit !== expectedGeneratorCpuLimit ||
    result.methodology?.proaWorkerThreads !== expectedProaWorkerThreads ||
    !Number.isInteger(result.methodology?.generatorWorkers) ||
    result.methodology.generatorWorkers < 2
  ) {
    fail("pre-roll, duration, repeat, warmup, generator limits, or Proa thread count does not match the publication protocol");
  }
  const engineIds = result.engines?.map(({ id }) => id);
  if (JSON.stringify(engineIds) !== JSON.stringify(expectedEngines)) {
    fail(`engine roster is ${JSON.stringify(engineIds)}`);
  }
  if (!/^[a-f0-9]{64}$/.test(result.source?.sourceSha256 ?? "")) {
    fail("source SHA-256 is missing");
  }
  if (!Number.isFinite(Date.parse(result.capturedAt)) || !Number.isFinite(Date.parse(result.completedAt))) {
    fail("capture timestamps are missing or invalid");
  }

  for (const engine of result.engines) {
    if (typeof engine.framework !== "string" || engine.framework.length === 0) {
      fail(`${engine.id} framework version is missing`);
    }
    if (engine.id === "proa" && engine.health?.workerThreads !== expectedProaWorkerThreads) {
      fail("Proa did not report the publication worker-thread count");
    }
    if (engine.id === "proa") {
      const check = engine.multiThread;
      if (
        !Number.isInteger(check?.workerThreads) || check.workerThreads < 2 ||
        check.offeredRps !== expectedRates.at(-1) ||
        check.phases?.length !== expectedRepeats ||
        check.phases.some((phase) => phase.loadGeneratorValid !== true || phase.offeredRps !== check.offeredRps)
      ) {
        fail("Proa multi-thread confirmation phases are missing or invalid");
      }
    }
    if (engine.id !== "proa" && engine.health?.nodeEnv !== "production") {
      fail(`${engine.id} did not confirm NODE_ENV=production`);
    }
    if (engine.id === "react" && engine.health?.reactDomBuild !== "production") {
      fail("React did not confirm the production react-dom server build");
    }
    if (
      engine.parity?.fallbackPanels !== result.scenario.boundaries ||
      engine.parity?.readyPanels !== result.scenario.boundaries ||
      engine.parity?.productCards !== result.scenario.productCards ||
      !Number.isFinite(engine.parity?.responseBytes) ||
      engine.parity.responseBytes <= 0
    ) {
      fail(`${engine.id} parity evidence is incomplete`);
    }
    const phaseKeys = new Set();
    for (const phase of engine.phases ?? []) {
      const key = `${phase.offeredRps}/${phase.repeat}`;
      if (phaseKeys.has(key)) fail(`${engine.id} has duplicate phase ${key}`);
      phaseKeys.add(key);
      if (
        !expectedRates.includes(phase.offeredRps) ||
        !Number.isInteger(phase.repeat) ||
        phase.repeat < 1 ||
        phase.repeat > expectedRepeats
      ) {
        fail(`${engine.id} has unexpected phase ${key}`);
      }
      if (
        phase.sentRequests !== phase.successfulRequests + phase.errorCount ||
        phase.durationSeconds !== result.methodology.durationSecondsPerRate ||
        phase.preRollSeconds !== result.methodology.preRollSecondsPerRate ||
        phase.arrivalWindowSeconds !==
          result.methodology.preRollSecondsPerRate + result.methodology.durationSecondsPerRate ||
        phase.totalSentRequests !== phase.offeredRps * phase.arrivalWindowSeconds ||
        phase.sentRequests !== phase.offeredRps * phase.durationSeconds ||
        !numbersApproximatelyEqual(
          phase.completionThroughputRps,
          phase.steadyStateCompletedResponses / phase.durationSeconds,
        )
      ) {
        fail(`${engine.id} phase ${key} has inconsistent request accounting`);
      }
      for (const [label, value] of [
        ["steady-state completion throughput", phase.completionThroughputRps],
        ["shell P50", phase.latencyMs?.scheduledFirstByte?.p50],
        ["completion P50", phase.latencyMs?.scheduledComplete?.p50],
        ["completion P95", phase.latencyMs?.scheduledComplete?.p95],
        ["completion P99", phase.latencyMs?.scheduledComplete?.p99],
        ["CPU cores", phase.cpu?.averageCpuCores],
        ["CPU/request", phase.cpu?.cpuMsPerSuccessfulRequest],
        ["peak RSS", phase.memory?.peakSampledRssBytes],
        ["max in-flight", phase.maxObservedInFlight],
        ["generator lag P95", phase.latencyMs?.schedulerLag?.p95],
        ["generator busiest worker", phase.generator?.busiestWorkerUtilization],
      ]) {
        if (!Number.isFinite(value) || value < 0) {
          fail(`${engine.id} phase ${key} has invalid ${label}`);
        }
      }
      if (
        phase.loadGeneratorValid !== true ||
        phase.latencyMs.schedulerLag.p95 > result.methodology.generatorLagP95LimitMs ||
        phase.generator.busiestWorkerUtilization > result.methodology.generatorCpuLimit
      ) {
        fail(`${engine.id} phase ${key} exceeded the load-generator validity limit`);
      }
    }
    for (const rate of expectedRates) {
      for (let repeat = 1; repeat <= expectedRepeats; repeat += 1) {
        if (!phaseKeys.has(`${rate}/${repeat}`)) {
          fail(`${engine.id} is missing phase ${rate}/${repeat}`);
        }
      }
    }
  }
}

function rowFor(engine, rate) {
  const phases = engine.phases.filter((phase) => phase.offeredRps === rate);
  if (phases.length === 0) throw new Error(`${engine.id} has no ${rate} rps phase`);
  const pick = (selector) => median(phases.map(selector));
  return {
    engine: engine.id === "proa" ? "Proa" : engine.id === "marko" ? "Marko" : "React",
    rate,
    completionRps: pick((phase) => phase.completionThroughputRps),
    shellP50: pick((phase) => phase.latencyMs.scheduledFirstByte.p50),
    completeP50: pick((phase) => phase.latencyMs.scheduledComplete.p50),
    completeP95: pick((phase) => phase.latencyMs.scheduledComplete.p95),
    completeP99: pick((phase) => phase.latencyMs.scheduledComplete.p99),
    cpuCores: pick((phase) => phase.cpu.averageCpuCores),
    cpuMsPerRequest: pick((phase) => phase.cpu.cpuMsPerSuccessfulRequest),
    peakRss: pick((phase) => phase.memory.peakSampledRssBytes),
    maxInFlight: pick((phase) => phase.maxObservedInFlight),
    generatorLagP95: pick((phase) => phase.latencyMs.schedulerLag.p95),
    generatorBusiest: Math.max(...phases.map((phase) => phase.generator.busiestWorkerUtilization)),
    errors: phases.reduce((sum, phase) => sum + phase.errorCount, 0),
  };
}

function render(result) {
  validateResult(result);
  const rates = result.methodology.ratesRps;
  const repeats = result.methodology.repeats;
  const rows = result.engines.flatMap((engine) => rates.map((rate) => rowFor(engine, rate)));
  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(new Date(result.capturedAt));
  const duration = result.methodology.durationSecondsPerRate;
  const preRoll = result.methodology.preRollSecondsPerRate;
  const boundaries = result.scenario.boundaries;
  const host = result.host.cpuModel;
  const proaRevision = result.source.proaRevision.slice(0, 8);
  const proaBranch = result.source.proaBranch && result.source.proaBranch !== "main" ? ` on \`${result.source.proaBranch}\`` : "";

  const parityRows = result.engines
    .map(
      (engine) => {
        const label = engine.id === "proa"
          ? `Proa 0.3.0 @ ${proaRevision}`
          : engine.framework;
        return `| ${label} | ${engine.parity.fallbackPanels} | ${engine.parity.readyPanels} | ${integer(engine.parity.productCards)} | ${integer(engine.parity.responseBytes)} |`;
      },
    )
    .join("\n");
  const proaEngine = result.engines.find(({ id }) => id === "proa");
  const check = proaEngine.multiThread;
  const pickCheck = (selector) => median(check.phases.map(selector));
  const checkRow = {
    threads: check.workerThreads,
    rate: check.offeredRps,
    completionRps: pickCheck((phase) => phase.completionThroughputRps),
    completeP50: pickCheck((phase) => phase.latencyMs.scheduledComplete.p50),
    completeP99: pickCheck((phase) => phase.latencyMs.scheduledComplete.p99),
    cpuMsPerRequest: pickCheck((phase) => phase.cpu.cpuMsPerSuccessfulRequest),
    cpuCores: pickCheck((phase) => phase.cpu.averageCpuCores),
    peakRss: pickCheck((phase) => phase.memory.peakSampledRssBytes),
    errors: check.phases.reduce((sum, phase) => sum + phase.errorCount, 0),
  };
  const oneThreadTop = rows.find((row) => row.engine === "Proa" && row.rate === check.offeredRps);
  const metricRows = rows
    .map(
      (row) =>
        `| ${row.engine} | ${integer(row.rate)} | ${fixed(row.completionRps, 0)} | ${ms(row.shellP50)} | ${ms(row.completeP50)} | ${ms(row.completeP95)} | ${ms(row.completeP99)} | ${fixed(row.cpuMsPerRequest, 3)} ms | ${fixed(row.cpuCores, 2)} | ${mib(row.peakRss)} | ${integer(row.maxInFlight)} | ${ms(row.generatorLagP95)} | ${integer(row.errors)} |`,
    )
    .join("\n");

  return `${startMarker}
## Suspense streaming over HTTP, one core each

**${date} · ${host} · ${boundaries} async boundaries × ${result.scenario.cardsPerPanel} product cards · one worker thread or process per engine**

This is the product grid from the capacity section, streamed. Equivalent production-mode Proa, Marko, and React applications run over real loopback HTTP/1.1. Every request streams a shell with ${boundaries} fallback panels, starts ${boundaries} independent data operations across the ${result.scenario.delayTiersMs.join(", ")} ms delay tiers, and completes only after every panel has resolved to its ${result.scenario.cardsPerPanel} product cards on the wire, ${result.scenario.productCards} cards in all. Delayed values stay typed and in memory; there is no JSON serialization, deserialization, or external I/O in the measured request path. Rendering, boundary scheduling, replacement framing, and one flush per boundary are all inside the measurement.

Every engine is limited to one unit of concurrency: Proa runs ${result.methodology.proaWorkerThreads} Tokio worker thread, and Marko and React each run one Node process. Proa serves this page through \`RouteResponse::ssr_stream_send\`, the compiler-proved \`Send\` streaming path introduced by [Proa PR #82](https://github.com/Proa-Labs/proa/pull/82): Axum polls the response stream directly, with no per-response bridge thread. The cores column shows what each process actually used, and CPU/request charges every thread of every engine the same way.

Each row is the median of ${repeats} fresh-process phases under fixed-rate open-loop arrivals from ${result.methodology.generatorWorkers} separate load-generator processes, so saturation remains visible as in-flight work and scheduled-arrival latency instead of being suppressed by a client waiting for each prior response. A ${preRoll}-second pre-roll fills the async pipeline, then successful full responses completed inside a fixed ${duration}-second observation window determine steady-state throughput. Complete-response percentiles and shell P50 cover requests arriving during that observation window and include load-generator scheduling lag and server queueing. CPU/request is the server process's exact CPU-time delta divided by successful responses across the full phase. Errors are summed across the ${repeats} repeats. Publication aborts if scheduler-lag P95 exceeds ${result.methodology.generatorLagP95LimitMs} ms or any generator worker exceeds ${Math.round(result.methodology.generatorCpuLimit * 100)}% busy in any phase, and each phase waits for the previous phase's client sockets to leave TIME_WAIT before it starts.

| Engine | Request rate (rps) | Steady completion rps | Shell P50 | Complete P50 | Complete P95 | Complete P99 | CPU/request | Cores | Peak RSS | Max in-flight | Generator lag P95 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${metricRows}

**Every row above is one core.** Proa runs one Tokio worker thread and Marko and React each run one Node process, so the table compares what a single core delivers. Proa's knee near ${integer(Math.round(oneThreadTop.completionRps / 100) * 100)} responses per second is that one thread filling up at ${fixed(oneThreadTop.cpuMsPerRequest, 3)} ms of CPU per response; it is not a Proa limit, because a production server runs one worker thread per core.

**Reference point, outside the comparison.** To show the knee moves with the thread budget, Proa alone was rerun at the top rate with ${check.workerThreads} worker threads. Marko and React were not rerun with more processes, so this row is not comparable to theirs. With ${check.workerThreads} threads Proa completed ${integer(Math.round(checkRow.completionRps))} responses per second at a request-rate target of ${integer(checkRow.rate)} rps and a P99 of ${ms(checkRow.completeP99)}, using ${fixed(checkRow.cpuCores, 2)} cores.

| Proa worker threads | Request rate (rps) | Steady completion rps | Complete P50 | Complete P99 | CPU/request | Cores | Peak RSS | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ${checkRow.threads} | ${integer(checkRow.rate)} | ${fixed(checkRow.completionRps, 0)} | ${ms(checkRow.completeP50)} | ${ms(checkRow.completeP99)} | ${fixed(checkRow.cpuMsPerRequest, 3)} ms | ${fixed(checkRow.cpuCores, 2)} | ${mib(checkRow.peakRss)} | ${integer(checkRow.errors)} |

The parity gate checks the browser-consumable stream payload before load begins and validates every measured response: the shell, every fallback and resolved panel, and every product card. The cards are the same markup the scoreboard's product-grid parity gate accepted from each engine. Wire bytes legitimately differ because each framework carries its own boundary-replacement protocol.

| Engine version | Fallback panels | Resolved panels | Product cards | Stream bytes |
| --- | ---: | ---: | ---: | ---: |
${parityRows}

- Capture: [suspense-load/results/latest.json](suspense-load/results/latest.json); reproduce with \`pnpm run bench:suspense-load\`.
- The retained source hash predates three wording-only changes in the runner. The report verifier records both exact source hashes; measurements and the original capture hash are unchanged.
- Proa source: Cargo.lock revision ${proaRevision}${proaBranch}; Rust release build with native Proa Suspense and the direct \`ssr_stream_send\` Axum route. The same binary also serves the bounded local-executor path (\`ssr_stream\`) at \`/local\` for engineering comparison; it is not part of the published rows.
- Marko source: optimized ahead-of-time Marko template using native &lt;await&gt; plus &lt;@placeholder&gt;; its compiler is not resident in the measured server.
- React source: production React server build using renderToPipeableStream, Suspense, and use.
- Node engines run with \`NODE_ENV=production\`: the driver sets it, each server's health endpoint reports it back, and React reports that it loaded the production \`react-dom/server\` build. The runner refuses to measure otherwise.
- Stream bytes differ by protocol, not content: Proa base64-encodes each resolved boundary inside an inert template, so its stream is roughly a third larger on the wire than React's for the same 96 cards. Compression is off in every engine here; enabling it would remove most of that gap, at a CPU cost this benchmark deliberately leaves out.
- This is a single-host capacity curve, not a universal ranking. Loopback transfer, each framework’s HTTP adapter, boundary protocol, allocation, scheduling, and render work are all intentionally inside the application boundary.
${endMarker}`;
}

const [resultText, readme, sourceSha256] = await Promise.all([
  readFile(resultPath, "utf8"),
  readFile(readmePath, "utf8"),
  currentSourceSha256(),
]);
const result = JSON.parse(resultText);
if (
  result.source?.sourceSha256 !== sourceSha256 &&
  displayOnlySourceRevisions.get(result.source?.sourceSha256) !== sourceSha256
) {
  throw new Error(
    `suspense publication source mismatch: captured ${result.source?.sourceSha256 ?? "missing"}, current ${sourceSha256}`,
  );
}
const block = render(result);
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker);
let next;
if (start === -1 && end === -1) {
  const anchor = "## Product-grid scaling capture";
  const at = readme.indexOf(anchor);
  if (at === -1) throw new Error(`README anchor not found: ${anchor}`);
  next = `${readme.slice(0, at)}${block}\n\n${readme.slice(at)}`;
} else if (start !== -1 && end !== -1 && end > start) {
  next = `${readme.slice(0, start)}${block}${readme.slice(end + endMarker.length)}`;
} else {
  throw new Error("README has an unmatched suspense-load marker");
}

if (check) {
  if (next !== readme) throw new Error("http-capacity.md suspense-load block is stale; run node suspense-load/report.mjs");
  console.log("Suspense-load http-capacity.md block is current.");
} else {
  await writeFile(readmePath, next);
  console.log("Updated the http-capacity.md suspense-load section.");
}
