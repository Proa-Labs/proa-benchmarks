#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_GENERATOR_CPU_LIMIT,
  DEFAULT_GENERATOR_LAG_P95_LIMIT_MS,
  DEFAULT_WORKER_COUNT,
  acquireRunLock,
  closeWorkers,
  delay,
  fetchBody,
  gitMetadata,
  hostMetadata,
  runOpenLoopPhase,
  spawnWorkers,
  startServer,
  stopServer,
  waitForHealth,
} from "../load/driver.mjs";
import {
  DEFAULT_BOUNDARY_COUNT,
  DEFAULT_CARDS_PER_PANEL,
  normalizeBoundaryCount,
  normalizeCardsPerPanel,
  scenarioContract,
} from "./scenario.mjs";
import { validateBody } from "./validate.mjs";

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const defaultOutput = join(here, "results", "latest.json");
const basePorts = { proa: 15710, react: 15711, marko: 15712 };
const engineOrder = ["proa", "marko", "react"];
const PROA_WORKER_THREADS = 1;
// After the per-core matrix, Proa alone reruns the top rate with this many
// worker threads. The per-core knee is a thread budget, not a ceiling, and
// the artifact should show that rather than assert it.
const PROA_CONFIRMATION_WORKER_THREADS = Math.min(4, os.cpus().length);

// Keep this list synchronized with report.mjs. The report gate must reject a
// retained capture after any measured implementation changes.
export const benchmarkSourceFiles = [
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

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function numberOption(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function positiveIntegerOption(name, fallback) {
  const value = numberOption(name, fallback);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function listOption(name, fallback) {
  return String(option(name, fallback))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const outputOption = option("--out", defaultOutput);
const config = {
  boundaries: normalizeBoundaryCount(numberOption("--boundaries", DEFAULT_BOUNDARY_COUNT)),
  cardsPerPanel: normalizeCardsPerPanel(option("--cards-per-panel", DEFAULT_CARDS_PER_PANEL)),
  rates: listOption("--rates", "250,500,1000,2000,3000,4000,5000,6000").map((value) => {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`invalid rate: ${value}`);
    return rate;
  }),
  preRollSeconds: numberOption("--pre-roll", 1),
  durationSeconds: numberOption("--duration", 5),
  repeats: positiveIntegerOption("--repeats", 3),
  warmupRequests: positiveIntegerOption("--warmup-requests", 24),
  // The streamed page is about 290 kB, so the generator hashes ~2 GB/s at
  // Proa's knee; a wider worker pool keeps every worker under the 80% limit.
  workers: positiveIntegerOption("--workers", Math.max(DEFAULT_WORKER_COUNT, Math.min(12, os.cpus().length - 4))),
  engines: listOption("--engines", engineOrder.join(",")),
  outputPath: isAbsolute(outputOption) ? outputOption : join(root, outputOption),
};

if (config.rates.length === 0) throw new Error("--rates must include at least one rate");
if (new Set(config.rates).size !== config.rates.length) {
  throw new Error("--rates must not contain duplicates");
}
if (config.engines.length === 0) throw new Error("--engines must include at least one engine");
if (new Set(config.engines).size !== config.engines.length) {
  throw new Error("--engines must not contain duplicates");
}
for (const engine of config.engines) {
  if (!engineOrder.includes(engine)) throw new Error(`unknown engine: ${engine}`);
}

const publicationConfig =
  config.boundaries === DEFAULT_BOUNDARY_COUNT &&
  config.cardsPerPanel === DEFAULT_CARDS_PER_PANEL &&
  config.rates.join(",") === "250,500,1000,2000,3000,4000,5000,6000" &&
  config.preRollSeconds === 1 &&
  config.durationSeconds === 5 &&
  config.repeats === 3 &&
  config.warmupRequests === 24 &&
  config.engines.join(",") === engineOrder.join(",");
if (config.outputPath === defaultOutput && !publicationConfig) {
  throw new Error("custom suspense-load runs require an explicit --out path");
}

async function buildProaServer() {
  console.log("Building the Proa release server...");
  try {
    await execFile(
      "cargo",
      ["build", "--release", "--locked", "-p", "proa_bench", "--features", "http-load,topcoat", "--bin", "proa_suspense_server"],
      { cwd: root, maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    process.stderr.write(error.stdout || "");
    process.stderr.write(error.stderr || "");
    throw error;
  }
}

async function buildMarkoTemplate() {
  console.log("Compiling the optimized Marko template...");
  await execFile(
    process.execPath,
    [join(root, "rendering", "external", "marko", "compile_suspense.mjs")],
    {
      cwd: join(root, "rendering", "external", "marko"),
      env: { ...process.env, NODE_ENV: "production" },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}

function commandFor(engine) {
  if (engine === "proa") {
    return { label: "proa", command: join(root, "target", "release", "proa_suspense_server"), args: [], cwd: root };
  }
  if (engine === "react") {
    return { label: "react", command: process.execPath, args: [join(here, "react_server.mjs")], cwd: root };
  }
  return {
    label: "marko",
    command: process.execPath,
    args: [join(root, "rendering", "external", "marko", "suspense_server.mjs")],
    cwd: join(root, "rendering", "external", "marko"),
  };
}

function validateHealth(engine, health, expectedProaThreads = PROA_WORKER_THREADS) {
  const expected = scenarioContract(config.boundaries, config.cardsPerPanel);
  const mismatches = [];
  if (health.status !== "ok") mismatches.push(`status=${health.status}`);
  if (health.engine !== engine) mismatches.push(`engine=${health.engine}`);
  if (health.id !== expected.id) mismatches.push(`id=${health.id}`);
  if (health.boundaries !== expected.boundaries) mismatches.push(`boundaries=${health.boundaries}`);
  if (health.cardsPerPanel !== expected.cardsPerPanel) mismatches.push(`cardsPerPanel=${health.cardsPerPanel}`);
  if (health.productCards !== expected.productCards) mismatches.push(`productCards=${health.productCards}`);
  if (health.longestDelayMs !== expected.longestDelayMs) mismatches.push(`longestDelayMs=${health.longestDelayMs}`);
  if (health.asyncValueModel !== expected.asyncValueModel) mismatches.push(`asyncValueModel=${health.asyncValueModel}`);
  if (JSON.stringify(health.delayTiersMs) !== JSON.stringify(expected.delayTiersMs)) {
    mismatches.push(`delayTiersMs=${JSON.stringify(health.delayTiersMs)}`);
  }
  if (typeof health.framework !== "string" || health.framework.length === 0) {
    mismatches.push("framework is missing");
  }
  if (engine === "proa" && health.workerThreads !== expectedProaThreads) {
    mismatches.push(`workerThreads=${health.workerThreads}`);
  }
  if (engine !== "proa" && health.nodeEnv !== "production") {
    mismatches.push(`nodeEnv=${health.nodeEnv}`);
  }
  if (engine === "react" && health.reactDomBuild !== "production") {
    mismatches.push(`reactDomBuild=${health.reactDomBuild}`);
  }
  if (mismatches.length) {
    throw new Error(`${engine} health contract mismatch: ${mismatches.join(", ")}`);
  }
  return health;
}

async function warmupAndValidate(engine, port, agent) {
  const first = await fetchBody(port, "/", agent);
  if (first.statusCode !== 200) throw new Error(`${engine} parity request returned ${first.statusCode}`);
  const contract = validateBody(first.body.toString("utf8"), config.boundaries, config.cardsPerPanel);
  const warmups = await Promise.all(
    Array.from({ length: config.warmupRequests }, () => fetchBody(port, "/", agent)),
  );
  const failures = warmups.filter((response) => response.statusCode !== 200);
  if (failures.length) {
    throw new Error(`${engine} had ${failures.length} warmup failures`);
  }
  await delay(250);
  return { responseBytes: first.body.length, ...contract };
}

function printPhase(engine, phase, repeat) {
  const complete = phase.latencyMs.scheduledComplete;
  console.log(
    `${engine.padEnd(6)} r${String(repeat).padEnd(2)} ${String(phase.offeredRps).padStart(5)} target rps  ` +
      `${phase.completionThroughputRps.toFixed(1).padStart(7)} steady rps  ` +
      `${complete.p50.toFixed(1).padStart(7)} / ${complete.p95.toFixed(1).padStart(7)} / ${complete.p99.toFixed(1).padStart(7)} ms scheduled p50/p95/p99  ` +
      `${phase.cpu.cpuMsPerSuccessfulRequest.toFixed(3)} ms cpu/req  ${phase.cpu.averageCpuCores.toFixed(2).padStart(5)} cores  ` +
      `${(phase.memory.peakSampledRssBytes / 1024 / 1024).toFixed(1).padStart(6)} MiB peak  ` +
      `gen ${(phase.generator.busiestWorkerUtilization * 100).toFixed(0)}% busiest${phase.loadGeneratorValid ? "" : "  !! generator-limited"}`,
  );
}

async function main() {
  if (config.engines.includes("proa")) await buildProaServer();
  if (config.engines.includes("marko")) await buildMarkoTemplate();
  const git = await gitMetadata(root, benchmarkSourceFiles);
  const result = {
    schemaVersion: 3,
    status: "incomplete",
    captureKind: config.outputPath === defaultOutput ? "publication" : "engineering",
    capturedAt: new Date().toISOString(),
    scenario: scenarioContract(config.boundaries, config.cardsPerPanel),
    methodology: {
      protocol: "HTTP/1.1 loopback with keep-alive and compression disabled",
      javascriptMode: "production: NODE_ENV=production is set by the driver and confirmed by each Node server's health endpoint; React also reports which react-dom server build it loaded",
      concurrencyModel: `one server process per engine; Proa runs ${PROA_WORKER_THREADS} Tokio worker thread and ${PROA_WORKER_THREADS} local-stream worker so every engine is measured per core`,
      proaRenderPath: "RouteResponse::ssr_stream_send: the compiler-proved Send stream that Axum polls directly",
      loadModel: "open-loop fixed-rate arrivals",
      loadGenerator: `${config.workers} forked Node worker processes share the arrival schedule and validate every response`,
      latency: "both client-dispatch and scheduled-arrival latency; scheduled latency includes generator lag and server queueing",
      throughput: "successful full streamed responses completed inside a fixed steady-state observation window after pre-roll",
      cpu: "server process CPU-time delta from process counters",
      memory: "server RSS sampled with ps every 100 ms; peak is the largest sample",
      validation: "every measured response must contain the shell, every fallback and resolved-panel marker, and every product card",
      asyncValues: "typed in-memory delayed values; no serialization or external I/O",
      warmupRequestsPerEngineRateProcess: config.warmupRequests,
      preRollSecondsPerRate: config.preRollSeconds,
      durationSecondsPerRate: config.durationSeconds,
      ratesRps: config.rates,
      repeats: config.repeats,
      processLifecycle: "fresh production server process for every engine/rate/repeat phase",
      proaWorkerThreads: PROA_WORKER_THREADS,
      proaConfirmationWorkerThreads: PROA_CONFIRMATION_WORKER_THREADS,
      proaConfirmationCheck: "after the per-core matrix, Proa reruns the top target rate with the confirmation worker-thread count so the per-core knee is shown to be a thread budget",
      generatorWorkers: config.workers,
      generatorLagP95LimitMs: DEFAULT_GENERATOR_LAG_P95_LIMIT_MS,
      generatorCpuLimit: DEFAULT_GENERATOR_CPU_LIMIT,
      engineExecutionOrder: config.engines,
      executionSequence: [],
    },
    host: hostMetadata(),
    source: git,
    engines: config.engines.map((engine) => ({
      id: engine,
      framework: "unknown",
      health: null,
      parity: null,
      phases: [],
    })),
  };
  const partialOutputPath = `${config.outputPath}.partial`;
  await mkdir(dirname(config.outputPath), { recursive: true });
  const workers = await spawnWorkers(config.workers);

  try {
    for (const [rateIndex, rate] of config.rates.entries()) {
      console.log(`\nTarget request rate: ${rate} requests/second`);
      for (let repeatIndex = 0; repeatIndex < config.repeats; repeatIndex += 1) {
        const rotatedEngines = config.engines.map(
          (_, index) => config.engines[(index + repeatIndex) % config.engines.length],
        );
        for (const engine of rotatedEngines) {
          const engineResult = result.engines.find((candidate) => candidate.id === engine);
          const repeat = repeatIndex + 1;
          const port = basePorts[engine] + rateIndex * 100 + repeatIndex * 10;
          result.methodology.executionSequence.push({ engine, rate, repeat, port });
          const server = startServer(commandFor(engine), {
            PORT: String(port),
            SUSPENSE_BOUNDARIES: String(config.boundaries),
            SUSPENSE_CARDS_PER_PANEL: String(config.cardsPerPanel),
            PROA_WORKER_THREADS: String(PROA_WORKER_THREADS),
          });
          const agent = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 64 });
          try {
            const health = await waitForHealth(server, port, agent, (value) => validateHealth(engine, value));
            const parity = await warmupAndValidate(engine, port, agent);
            const phase = await runOpenLoopPhase({
              workers,
              server,
              port,
              path: "/",
              headers: { accept: "text/html", "accept-encoding": "identity" },
              rate,
              preRollSeconds: config.preRollSeconds,
              durationSeconds: config.durationSeconds,
              validatorModule: join(here, "validate.mjs"),
              validatorOptions: { boundaries: config.boundaries, cardsPerPanel: config.cardsPerPanel },
              validateEvery: 1,
              metricsAgent: agent,
            });
            phase.repeat = repeat;
            engineResult.framework = health.framework;
            engineResult.health ??= health;
            engineResult.parity ??= parity;
            engineResult.phases.push(phase);
            printPhase(engine, phase, repeat);
            await writeFile(partialOutputPath, `${JSON.stringify(result, null, 2)}\n`);
            if (!phase.loadGeneratorValid) {
              throw new Error(
                `${engine} ${rate} rps repeat ${repeat} exceeded the load-generator validity limits (lag P95 ${phase.latencyMs.schedulerLag.p95.toFixed(2)} ms, busiest worker ${(phase.generator.busiestWorkerUtilization * 100).toFixed(0)}%)`,
              );
            }
          } finally {
            agent.destroy();
            await stopServer(server);
          }
          await delay(500);
        }
      }
    }

    if (config.engines.includes("proa")) {
      const engineResult = result.engines.find((candidate) => candidate.id === "proa");
      const rate = config.rates.at(-1);
      const threads = PROA_CONFIRMATION_WORKER_THREADS;
      engineResult.multiThread = { workerThreads: threads, offeredRps: rate, phases: [] };
      console.log(`\nProa with ${threads} worker threads at ${rate} requests/second`);
      for (let repeatIndex = 0; repeatIndex < config.repeats; repeatIndex += 1) {
        const repeat = repeatIndex + 1;
        const port = basePorts.proa + config.rates.length * 100 + repeatIndex * 10;
        result.methodology.executionSequence.push({ engine: "proa", rate, repeat, port, workerThreads: threads });
        const server = startServer(commandFor("proa"), {
          PORT: String(port),
          SUSPENSE_BOUNDARIES: String(config.boundaries),
          SUSPENSE_CARDS_PER_PANEL: String(config.cardsPerPanel),
          PROA_WORKER_THREADS: String(threads),
        });
        const agent = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 64 });
        try {
          await waitForHealth(server, port, agent, (value) => validateHealth("proa", value, threads));
          await warmupAndValidate("proa", port, agent);
          const phase = await runOpenLoopPhase({
            workers,
            server,
            port,
            path: "/",
            headers: { accept: "text/html", "accept-encoding": "identity" },
            rate,
            preRollSeconds: config.preRollSeconds,
            durationSeconds: config.durationSeconds,
            validatorModule: join(here, "validate.mjs"),
            validatorOptions: { boundaries: config.boundaries, cardsPerPanel: config.cardsPerPanel },
            validateEvery: 1,
            metricsAgent: agent,
          });
          phase.repeat = repeat;
          engineResult.multiThread.phases.push(phase);
          printPhase(`proa×${threads}`, phase, repeat);
          await writeFile(partialOutputPath, `${JSON.stringify(result, null, 2)}\n`);
          if (!phase.loadGeneratorValid) {
            throw new Error(`proa with ${threads} threads at ${rate} rps repeat ${repeat} exceeded the load-generator validity limits`);
          }
        } finally {
          agent.destroy();
          await stopServer(server);
        }
        await delay(500);
      }
    }
  } finally {
    await closeWorkers(workers);
  }

  result.status = "pass";
  result.completedAt = new Date().toISOString();
  await writeFile(partialOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  await rename(partialOutputPath, config.outputPath);
  console.log(`\nResult written to ${config.outputPath}`);
}

const releaseRunLock = await acquireRunLock(root, "suspense-load");
try {
  await main();
} finally {
  await releaseRunLock();
}
