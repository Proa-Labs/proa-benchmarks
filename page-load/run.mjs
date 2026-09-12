#!/usr/bin/env node
// Canonical pages over HTTP: the same parity-gated pages the scoreboard times,
// served by each framework's ordinary production server and driven with real
// loopback HTTP. Two phase kinds per engine/workload:
//   closed  N concurrent connections back to back -> capacity of one core
//   open    fixed-rate arrivals below every knee   -> latency at equal load
// A phase whose load generator ran hotter than its validity limit stops the
// run, because the number it produced is not a capacity measurement.
// --tolerate-generator-limits keeps going instead and marks the result
// generator-limited; it exists for smoke runs that prove every production
// server starts, passes parity and survives both phase kinds on hosts too
// small to out-generate Proa, and it can never write a publication artifact.

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  runClosedLoopPhase,
  runOpenLoopPhase,
  spawnWorkers,
  startServer,
  stopServer,
  waitForHealth,
} from "../load/driver.mjs";
import { ENGINES, PUBLICATION, SCENARIO_ID, WORKLOADS, scenarioContract } from "./scenario.mjs";

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const external = join(root, "rendering", "external");
const defaultOutput = join(here, "results", "latest.json");
const engineIds = ENGINES.map(({ id }) => id);
const workloadIds = WORKLOADS.map(({ id }) => id);
const basePorts = { proa: 15720, react: 15721, marko: 15722, "go-html-template": 15723 };

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

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function numberOption(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function positiveIntegerOption(name, fallback) {
  const value = numberOption(name, fallback);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a positive integer`);
  return value;
}

function listOption(name, fallback) {
  return String(option(name, fallback)).split(",").map((value) => value.trim()).filter(Boolean);
}

const outputOption = option("--out", defaultOutput);
const config = {
  concurrency: positiveIntegerOption("--concurrency", PUBLICATION.closedLoopConcurrency),
  preRollSeconds: numberOption("--pre-roll", PUBLICATION.preRollSeconds),
  durationSeconds: numberOption("--duration", PUBLICATION.durationSeconds),
  repeats: positiveIntegerOption("--repeats", PUBLICATION.repeats),
  warmupRequests: positiveIntegerOption("--warmup-requests", PUBLICATION.warmupRequests),
  workers: positiveIntegerOption("--workers", DEFAULT_WORKER_COUNT),
  engines: listOption("--engines", engineIds.join(",")),
  workloads: listOption("--workloads", workloadIds.join(",")),
  skipBuild: process.argv.includes("--no-build"),
  tolerateGeneratorLimits: process.argv.includes("--tolerate-generator-limits"),
  outputPath: isAbsolute(outputOption) ? outputOption : join(root, outputOption),
};
for (const engine of config.engines) {
  if (!engineIds.includes(engine)) throw new Error(`unknown engine: ${engine}`);
}
for (const workload of config.workloads) {
  if (!workloadIds.includes(workload)) throw new Error(`unknown workload: ${workload}`);
}
const publicationConfig =
  config.concurrency === PUBLICATION.closedLoopConcurrency &&
  config.preRollSeconds === PUBLICATION.preRollSeconds &&
  config.durationSeconds === PUBLICATION.durationSeconds &&
  config.repeats === PUBLICATION.repeats &&
  config.warmupRequests === PUBLICATION.warmupRequests &&
  config.engines.join(",") === engineIds.join(",") &&
  config.workloads.join(",") === workloadIds.join(",") &&
  !config.tolerateGeneratorLimits;
if (config.outputPath === defaultOutput && !publicationConfig) {
  throw new Error("custom page-load runs require an explicit --out path");
}

const rustBinary = (name) => join(root, "target", "release", name);
const goBinary = join(external, "go", "build", "canonical_suite");

async function run(command, args, options = {}) {
  try {
    return await execFile(command, args, { maxBuffer: 64 * 1024 * 1024, ...options });
  } catch (error) {
    process.stderr.write(error.stdout || "");
    process.stderr.write(error.stderr || "");
    throw error;
  }
}

async function build() {
  if (config.skipBuild) return;
  if (config.engines.includes("proa")) {
    console.log("Building the Proa release server and canonical adapter...");
    await run("cargo", [
      "build", "--release", "--locked", "-p", "proa_bench", "--features", "http-load,topcoat",
      "--bin", "proa_page_server", "--bin", "representative_suite_bench",
    ], { cwd: root });
  }
  if (config.engines.includes("go-html-template")) {
    console.log("Building the Go adapter...");
    await run("go", ["build", "-trimpath", "-o", goBinary, "suite_bench.go"], { cwd: join(external, "go") });
  }
  if (config.engines.includes("marko")) {
    console.log("Compiling the Marko templates ahead of time...");
    await run(process.execPath, [join(external, "marko", "compile_suite.mjs")], {
      cwd: join(external, "marko"),
      env: { ...process.env, NODE_ENV: "production" },
    });
  }
  for (const [engine, sentinel] of [["react", "react"], ["marko", "marko"]]) {
    if (!config.engines.includes(engine)) continue;
    if (!existsSync(join(external, engine, "node_modules", sentinel, "package.json"))) {
      throw new Error(`run npm ci in rendering/external/${engine} first`);
    }
  }
}

function adapterInvocation(engine, workload, dumpPath) {
  const extra = ["--workload", workload, "--dump", dumpPath, "--dump-only"];
  if (engine === "proa") {
    return { command: rustBinary("representative_suite_bench"), args: ["--framework", "proa", ...extra], options: { cwd: root } };
  }
  if (engine === "react") {
    return { command: process.execPath, args: ["suite_bench.mjs", ...extra], options: { cwd: join(external, "react"), env: { ...process.env, NODE_ENV: "production" } } };
  }
  if (engine === "marko") {
    return { command: process.execPath, args: ["suite_bench.mjs", ...extra], options: { cwd: join(external, "marko") } };
  }
  return { command: goBinary, args: extra, options: { cwd: join(external, "go") } };
}

async function canonicalDumps() {
  console.log("Rendering canonical dumps through each engine's timed adapter...");
  const directory = mkdtempSync(join(os.tmpdir(), "proa-page-load-"));
  const dumps = {};
  try {
    for (const engine of config.engines) {
      dumps[engine] = {};
      for (const workload of config.workloads) {
        const dumpPath = join(directory, `${engine}-${workload}.html`);
        const invocation = adapterInvocation(engine, workload, dumpPath);
        await run(invocation.command, invocation.args, invocation.options);
        const html = readFileSync(dumpPath);
        dumps[engine][workload] = {
          bytes: html.length,
          sha256: createHash("sha256").update(html).digest("hex"),
        };
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return dumps;
}

function serverSpec(engine, port) {
  if (engine === "proa") {
    return { spec: { label: "proa", command: rustBinary("proa_page_server"), args: [], cwd: root }, env: { PORT: String(port), PROA_WORKER_THREADS: "1" } };
  }
  if (engine === "react") {
    return { spec: { label: "react", command: process.execPath, args: [join(here, "react_server.mjs")], cwd: root }, env: { PORT: String(port) } };
  }
  if (engine === "marko") {
    return { spec: { label: "marko", command: process.execPath, args: [join(external, "marko", "page_server.mjs")], cwd: join(external, "marko") }, env: { PORT: String(port) } };
  }
  return { spec: { label: "go", command: goBinary, args: ["--serve", String(port)], cwd: join(external, "go") }, env: { GOMAXPROCS: "1" } };
}

function validateHealth(engine, health) {
  const mismatches = [];
  if (health.status !== "ok") mismatches.push(`status=${health.status}`);
  if (health.engine !== engine) mismatches.push(`engine=${health.engine}`);
  if (health.id !== SCENARIO_ID) mismatches.push(`id=${health.id}`);
  if (typeof health.framework !== "string" || !health.framework) mismatches.push("framework missing");
  for (const workload of WORKLOADS) {
    const declared = health.workloads?.[workload.id];
    if (declared?.path !== workload.path || declared?.cardinality !== workload.cardinality) {
      mismatches.push(`${workload.id}=${JSON.stringify(declared)}`);
    }
  }
  if (engine === "proa" && health.workerThreads !== 1) mismatches.push(`workerThreads=${health.workerThreads}`);
  if ((engine === "react" || engine === "marko") && health.nodeEnv !== "production") mismatches.push(`nodeEnv=${health.nodeEnv}`);
  if (engine === "react" && health.reactDomBuild !== "production") mismatches.push(`reactDomBuild=${health.reactDomBuild}`);
  if (engine === "go-html-template" && health.gomaxprocs !== 1) mismatches.push(`gomaxprocs=${health.gomaxprocs}`);
  if (mismatches.length) throw new Error(`${engine} health contract mismatch: ${mismatches.join(", ")}`);
  return health;
}

async function warmupAndValidate(engine, workload, port, agent, expected) {
  const first = await fetchBody(port, workload.path, agent);
  if (first.statusCode !== 200) throw new Error(`${engine}/${workload.id} returned ${first.statusCode}`);
  const digest = createHash("sha256").update(first.body).digest("hex");
  if (first.body.length !== expected.bytes || digest !== expected.sha256) {
    throw new Error(
      `${engine}/${workload.id} served ${first.body.length} bytes (${digest.slice(0, 12)}); canonical dump is ${expected.bytes} bytes (${expected.sha256.slice(0, 12)})`,
    );
  }
  const warmups = await Promise.all(
    Array.from({ length: config.warmupRequests }, () => fetchBody(port, workload.path, agent)),
  );
  if (warmups.some((response) => response.statusCode !== 200)) {
    throw new Error(`${engine}/${workload.id} had warmup failures`);
  }
  await delay(250);
  return { bytes: first.body.length, sha256: digest, byteIdenticalToCanonicalDump: true };
}

function printPhase(engine, workload, phase) {
  const latency = phase.mode === "open" ? phase.latencyMs.scheduledComplete : phase.latencyMs.complete;
  const load = phase.mode === "open" ? `${String(phase.offeredRps).padStart(5)} rps open  ` : `c=${String(phase.concurrency).padStart(3)} closed   `;
  console.log(
    `${engine.padEnd(17)} ${workload.padEnd(8)} r${phase.repeat} ${load}` +
      `${phase.completionThroughputRps.toFixed(0).padStart(6)} rps  ` +
      `${latency.p50.toFixed(2).padStart(8)} / ${latency.p99.toFixed(2).padStart(8)} ms p50/p99  ` +
      `${phase.cpu.cpuMsPerSuccessfulRequest.toFixed(3)} ms cpu/req  ${phase.cpu.averageCpuCores.toFixed(2)} cores  ` +
      `${(phase.memory.peakSampledRssBytes / 1024 / 1024).toFixed(1).padStart(6)} MiB  ` +
      `gen ${(phase.generator.busiestWorkerUtilization * 100).toFixed(0)}%${phase.loadGeneratorValid ? "" : "  !! generator-limited"}` +
      `${phase.errorCount ? `  !! ${phase.errorCount} errors` : ""}`,
  );
}

async function main() {
  await build();
  const dumps = await canonicalDumps();
  const git = await gitMetadata(root, benchmarkSourceFiles);
  const result = {
    schemaVersion: 1,
    status: "incomplete",
    captureKind: config.outputPath === defaultOutput ? "publication" : "engineering",
    capturedAt: new Date().toISOString(),
    scenario: scenarioContract(),
    methodology: {
      protocol: "HTTP/1.1 loopback with keep-alive and compression disabled",
      javascriptMode: "production: NODE_ENV=production is set by the driver and confirmed by each Node server's health endpoint; React also reports which react-dom server build it loaded",
      concurrencyModel: scenarioContract().concurrencyModel,
      closedLoop: `${config.concurrency} concurrent connections issue requests back to back; throughput is completions inside the observation window`,
      openLoop: "fixed-rate arrivals at each workload's fixed rate; latency is measured from scheduled arrival",
      loadGenerator: `${config.workers} forked Node worker processes share the schedule and hash every response`,
      cpu: "server process CPU-time delta across all threads divided by successful responses",
      memory: "server RSS sampled with ps every 100 ms; peak is the largest sample",
      validation: "every measured response is byte-identical to the engine's canonical adapter dump",
      preRollSeconds: config.preRollSeconds,
      durationSeconds: config.durationSeconds,
      repeats: config.repeats,
      warmupRequests: config.warmupRequests,
      closedLoopConcurrency: config.concurrency,
      generatorWorkers: config.workers,
      generatorLagP95LimitMs: DEFAULT_GENERATOR_LAG_P95_LIMIT_MS,
      generatorCpuLimit: DEFAULT_GENERATOR_CPU_LIMIT,
      generatorLimitedPhases: config.tolerateGeneratorLimits
        ? "recorded and reported, but do not stop the run; the result is marked generator-limited and is not a capacity measurement"
        : "stop the run",
      processLifecycle: "fresh production server process for every engine/workload/phase/repeat",
      executionSequence: [],
    },
    host: hostMetadata(),
    source: git,
    engines: config.engines.map((id) => ({
      ...ENGINES.find((engine) => engine.id === id),
      framework: "unknown",
      health: null,
      workloads: Object.fromEntries(config.workloads.map((workload) => [workload, { canonicalDump: dumps[id][workload], parity: null, phases: [] }])),
    })),
  };
  const partialOutputPath = `${config.outputPath}.partial`;
  await mkdir(dirname(config.outputPath), { recursive: true });
  const workers = await spawnWorkers(config.workers);
  let portOffset = 0;
  const generatorLimited = [];

  try {
    for (const workloadId of config.workloads) {
      const workload = WORKLOADS.find(({ id }) => id === workloadId);
      for (const kind of ["closed", "open"]) {
        console.log(`\n${workload.label} · ${kind === "closed" ? `${config.concurrency} closed-loop connections` : `${workload.fixedRateRps} rps open loop`}`);
        for (let repeatIndex = 0; repeatIndex < config.repeats; repeatIndex += 1) {
          const rotated = config.engines.map((_, index) => config.engines[(index + repeatIndex) % config.engines.length]);
          for (const engine of rotated) {
            const engineResult = result.engines.find((candidate) => candidate.id === engine);
            const port = basePorts[engine] + (portOffset++ % 200) * 10;
            result.methodology.executionSequence.push({ engine, workload: workloadId, kind, repeat: repeatIndex + 1, port });
            const { spec, env } = serverSpec(engine, port);
            const server = startServer(spec, env);
            const agent = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 64 });
            try {
              const health = await waitForHealth(server, port, agent, (value) => validateHealth(engine, value));
              const parity = await warmupAndValidate(engine, workload, port, agent, dumps[engine][workloadId]);
              const common = {
                workers, server, port, path: workload.path,
                headers: { accept: "text/html", "accept-encoding": "identity" },
                preRollSeconds: config.preRollSeconds, durationSeconds: config.durationSeconds,
                validatorModule: join(here, "validate.mjs"),
                validatorOptions: { expectedBytes: parity.bytes, expectedSha256: parity.sha256 },
                validateEvery: 1, metricsAgent: agent, timeoutMs: 30_000,
              };
              const phase = kind === "closed"
                ? await runClosedLoopPhase({ ...common, concurrency: config.concurrency, maxSocketsPerWorker: Math.ceil(config.concurrency / config.workers) + 1 })
                : await runOpenLoopPhase({ ...common, rate: workload.fixedRateRps });
              phase.repeat = repeatIndex + 1;
              engineResult.framework = health.framework;
              engineResult.health ??= health;
              engineResult.workloads[workloadId].parity ??= parity;
              engineResult.workloads[workloadId].phases.push(phase);
              printPhase(engine, workloadId, phase);
              await writeFile(partialOutputPath, `${JSON.stringify(result, null, 2)}\n`);
              if (!phase.loadGeneratorValid) {
                const label = `${engine}/${workloadId} ${kind} repeat ${repeatIndex + 1}`;
                if (!config.tolerateGeneratorLimits) throw new Error(`${label} exceeded the load-generator validity limits`);
                generatorLimited.push(label);
              }
              if (phase.errorCount) {
                throw new Error(`${engine}/${workloadId} ${kind} repeat ${repeatIndex + 1} had ${phase.errorCount} failed responses: ${phase.errorSamples.join("; ")}`);
              }
            } finally {
              agent.destroy();
              await stopServer(server);
            }
            await delay(500);
          }
        }
      }
    }
  } finally {
    await closeWorkers(workers);
  }

  result.status = generatorLimited.length ? "generator-limited" : "pass";
  result.generatorLimitedPhases = generatorLimited;
  result.completedAt = new Date().toISOString();
  if (generatorLimited.length) {
    console.log(
      `\n${generatorLimited.length} phase(s) exceeded the load-generator validity limits and were tolerated: ` +
        `${generatorLimited.join(", ")}. Every server started, passed parity and completed both phase kinds, ` +
        "but this result is not a capacity measurement.",
    );
  }
  await writeFile(partialOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  await rename(partialOutputPath, config.outputPath);
  console.log(`\nResult written to ${config.outputPath}`);
}

const releaseRunLock = await acquireRunLock(root, "page-load");
try {
  await main();
} finally {
  await releaseRunLock();
}
