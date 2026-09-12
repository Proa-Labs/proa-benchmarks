// Shared open-loop / closed-loop HTTP load driver.
//
// The driver owns the server process under test, samples its CPU and RSS,
// and fans request generation out across several worker processes so the
// generator itself is never the bottleneck it is measuring. Every phase
// returns the same summary shape, and every phase records how much CPU the
// generator used so a saturated client is visible in the artifact.

import { execFile as execFileCallback, fork, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, unlink } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { mean, successfulCompletionThroughput, summarize } from "../suspense-load/stats.mjs";

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const workerPath = join(here, "worker.mjs");

export const DEFAULT_WORKER_COUNT = Math.max(2, Math.min(8, os.cpus().length - 4));
export const DEFAULT_CLIENT_MAX_SOCKETS_PER_WORKER = 256;
// Saturated phases leave thousands of client sockets in TIME_WAIT. macOS keeps
// them for 30 seconds and offers only ~16k ephemeral ports, so a phase waits
// for the previous one's sockets to drain before it starts; the wait is
// recorded in the phase summary.
export const DEFAULT_TIME_WAIT_LIMIT = 1_500;
export const DEFAULT_SOCKET_DRAIN_TIMEOUT_MS = 90_000;
export const DEFAULT_GENERATOR_LAG_P95_LIMIT_MS = 25;
// A worker event loop that is busy more than this share of the phase is
// treated as a generator limit, not a server limit.
export const DEFAULT_GENERATOR_CPU_LIMIT = 0.8;

const now = () => performance.timeOrigin + performance.now();

// Spread-based Math.max overflows the call stack past ~100k records, which a
// fast engine reaches inside one phase.
function maxOf(values) {
  let max = -Infinity;
  for (const value of values) if (value > max) max = value;
  return max;
}

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// ---------------------------------------------------------------------------
// Workspace lock

export async function acquireRunLock(root, suite) {
  const workspaceKey = createHash("sha256").update(root).digest("hex").slice(0, 16);
  const lockPath = join(os.tmpdir(), `proa-${suite}-${workspaceKey}.lock`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`);
      return async () => {
        await handle.close();
        try {
          await unlink(lockPath);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = Number((await readFile(lockPath, "utf8").catch(() => "")).trim());
      let active = Number.isSafeInteger(owner) && owner > 0;
      if (active) {
        try {
          process.kill(owner, 0);
        } catch (ownerError) {
          if (ownerError.code === "ESRCH") active = false;
          else throw ownerError;
        }
      }
      if (active) {
        throw new Error(`another ${suite} capture is active in this workspace (pid ${owner})`);
      }
      await unlink(lockPath).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
    }
  }
  throw new Error(`could not acquire the ${suite} capture lock`);
}

// ---------------------------------------------------------------------------
// Socket drain

export async function countTimeWaitSockets() {
  try {
    const { stdout } = await execFile("netstat", ["-an", "-p", "tcp"], { maxBuffer: 64 * 1024 * 1024 });
    return stdout.split("\n").filter((line) => line.includes("TIME_WAIT")).length;
  } catch {
    try {
      const { stdout } = await execFile("ss", ["-tan", "state", "time-wait"], { maxBuffer: 64 * 1024 * 1024 });
      return Math.max(0, stdout.trim().split("\n").length - 1);
    } catch {
      return null;
    }
  }
}

export async function waitForSocketDrain(limit = DEFAULT_TIME_WAIT_LIMIT, timeoutMs = DEFAULT_SOCKET_DRAIN_TIMEOUT_MS) {
  const startedAt = performance.now();
  const before = await countTimeWaitSockets();
  let current = before;
  while (current !== null && current > limit && performance.now() - startedAt < timeoutMs) {
    await delay(1_000);
    current = await countTimeWaitSockets();
  }
  return { timeWaitBefore: before, timeWaitAtStart: current, waitedMs: performance.now() - startedAt };
}

// ---------------------------------------------------------------------------
// Server process management

export function startServer(spec, env = {}) {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, NODE_ENV: "production", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const collect = (chunk) => {
    output = `${output}${chunk}`.slice(-32_768);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.once("exit", (code, signal) => {
    if (code && !child.killed) {
      console.error(`${spec.label || spec.command} exited (${code || signal})\n${output}`);
    }
  });
  return { child, output: () => output, label: spec.label || spec.command };
}

export async function stopServer(server) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  const exited = new Promise((resolve) => server.child.once("exit", resolve));
  server.child.kill("SIGTERM");
  await Promise.race([exited, delay(2_000)]);
  if (server.child.exitCode === null && server.child.signalCode === null) {
    server.child.kill("SIGKILL");
    await exited;
  }
}

export function fetchJson(port, path, agent) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path, method: "GET", agent, headers: { accept: "application/json" } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`${path} returned ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(5_000, () => request.destroy(new Error(`${path} timed out`)));
    request.once("error", reject);
    request.end();
  });
}

export function fetchBody(port, path, agent, headers = { accept: "text/html", "accept-encoding": "identity" }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path, method: "GET", agent, headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("end", () => {
          resolve({ statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) });
        });
        response.once("error", reject);
      },
    );
    request.setTimeout(15_000, () => request.destroy(new Error(`${path} timed out`)));
    request.once("error", reject);
    request.end();
  });
}

export async function waitForHealth(server, port, agent, validate) {
  const deadline = performance.now() + 60_000;
  let lastError;
  while (performance.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`${server.label} exited during startup:\n${server.output()}`);
    }
    try {
      const health = await fetchJson(port, "/health", agent);
      return validate ? validate(health) : health;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw new Error(`${server.label} health check timed out: ${lastError}\n${server.output()}`);
}

export async function processSample(pid) {
  try {
    const { stdout } = await execFile("ps", ["-o", "rss=,pcpu=", "-p", String(pid)]);
    const [rssKiB, cpuPercent] = stdout.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(rssKiB) || !Number.isFinite(cpuPercent)) return null;
    return { at: performance.now(), rssBytes: rssKiB * 1_024, cpuPercent };
  } catch {
    return null;
  }
}

export function startProcessSampler(pid, intervalMs = 100) {
  const samples = [];
  const pending = new Set();
  const sample = () => {
    const promise = processSample(pid)
      .then((value) => {
        if (value) samples.push(value);
      })
      .finally(() => pending.delete(promise));
    pending.add(promise);
  };
  sample();
  const timer = setInterval(sample, intervalMs);
  return {
    async stop() {
      clearInterval(timer);
      await Promise.all(pending);
      return samples.sort((left, right) => left.at - right.at);
    },
  };
}

// ---------------------------------------------------------------------------
// Generator workers

export async function spawnWorkers(count) {
  const workers = [];
  for (let index = 0; index < count; index += 1) {
    const child = fork(workerPath, [], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    await new Promise((resolve, reject) => {
      const onMessage = (message) => {
        if (message.type === "ready") {
          child.off("message", onMessage);
          resolve();
        }
      };
      child.on("message", onMessage);
      child.once("exit", (code) => reject(new Error(`load worker ${index} exited with ${code}`)));
    });
    workers.push(child);
  }
  return workers;
}

export async function closeWorkers(workers) {
  await Promise.all(
    workers.map((worker) => {
      if (worker.exitCode !== null) return Promise.resolve();
      const exited = new Promise((resolve) => worker.once("exit", resolve));
      worker.kill("SIGTERM");
      return Promise.race([exited, delay(2_000)]).then(() => {
        if (worker.exitCode === null) worker.kill("SIGKILL");
      });
    }),
  );
}

function runWorker(worker, phase) {
  return new Promise((resolve, reject) => {
    const onExit = (code) => {
      worker.off("message", onMessage);
      reject(new Error(`load worker exited with ${code} mid-phase`));
    };
    const onMessage = (message) => {
      if (message.type === "done") {
        worker.off("message", onMessage);
        worker.off("exit", onExit);
        resolve(message);
      } else if (message.type === "error") {
        worker.off("message", onMessage);
        worker.off("exit", onExit);
        reject(new Error(`load worker failed: ${message.message}`));
      }
    };
    worker.on("message", onMessage);
    worker.once("exit", onExit);
    worker.send({ type: "run", phase });
  });
}

function mergeRecords(results) {
  const merged = { scheduledAt: [], dispatchedAt: [], firstByteAt: [], completedAt: [], bytes: [], ok: [], errors: {} };
  for (const result of results) {
    for (const key of ["scheduledAt", "dispatchedAt", "firstByteAt", "completedAt", "bytes", "ok"]) {
      for (const value of result.records[key]) merged[key].push(value);
    }
    for (const [error, count] of Object.entries(result.records.errors)) {
      merged.errors[error] = (merged.errors[error] || 0) + count;
    }
  }
  return merged;
}

function maxConcurrent(records) {
  const events = [];
  for (let index = 0; index < records.dispatchedAt.length; index += 1) {
    events.push([records.dispatchedAt[index], 1], [records.completedAt[index], -1]);
  }
  events.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let current = 0;
  let peak = 0;
  for (const [, change] of events) {
    current += change;
    peak = Math.max(peak, current);
  }
  return peak;
}

function summarizePhase({
  mode, rate, concurrency, records, workerResults, startedAt, measurementStartedAt,
  measurementEndedAt, endedAt, samples, baselineSample, cpuTimeMicros, preRollSeconds,
  durationSeconds, workerCount, generatorCpuLimit, generatorLagLimitMs,
}) {
  const total = records.ok.length;
  const inWindow = [];
  const successful = [];
  const errors = [];
  let allSuccessful = 0;
  for (let index = 0; index < total; index += 1) {
    const ok = records.ok[index] === 1;
    if (ok) allSuccessful += 1;
    const scheduledAt = records.scheduledAt[index];
    if (scheduledAt >= measurementStartedAt && scheduledAt < measurementEndedAt) {
      inWindow.push(index);
      if (ok) successful.push(index);
      else errors.push(index);
    }
  }
  const pluck = (indices, fn) => indices.map(fn);
  const steadyState = successfulCompletionThroughput(
    Array.from({ length: total }, (_, index) => ({
      ok: records.ok[index] === 1,
      completedAt: records.completedAt[index],
    })),
    measurementStartedAt,
    measurementEndedAt,
  );
  const wallMs = endedAt - startedAt;
  const rssValues = samples.map((sample) => sample.rssBytes);
  const cpuPercent = wallMs > 0 ? cpuTimeMicros / (wallMs * 10) : 0;
  const generatorCpuMicros = workerResults.reduce((sum, result) => sum + result.generator.cpuMicros, 0);
  const generatorWallMs = Math.max(...workerResults.map((result) => result.generator.wallMs));
  const generatorUtilization = workerResults.map((result) =>
    result.generator.wallMs > 0 ? result.generator.cpuMicros / (result.generator.wallMs * 1_000) : 0,
  );
  const schedulerLag = summarize(pluck(successful, (index) => records.dispatchedAt[index] - records.scheduledAt[index]));
  const generatorBusiest = Math.max(...generatorUtilization);
  return {
    mode,
    offeredRps: mode === "open" ? rate : null,
    concurrency: mode === "closed" ? concurrency : null,
    preRollSeconds,
    durationSeconds,
    arrivalWindowSeconds: preRollSeconds + durationSeconds,
    totalSentRequests: total,
    sentRequests: inWindow.length,
    successfulRequests: successful.length,
    errorCount: errors.length,
    errorSamples: Object.keys(records.errors).slice(0, 5),
    achievedGoodputRps: successful.length / durationSeconds,
    steadyStateCompletedResponses: steadyState.completedResponses,
    completionThroughputRps: steadyState.responsesPerSecond,
    phaseWallMs: wallMs,
    maxObservedInFlight: maxConcurrent(records),
    latencyMs: {
      firstByte: summarize(pluck(successful, (index) => records.firstByteAt[index] - records.dispatchedAt[index])),
      complete: summarize(pluck(successful, (index) => records.completedAt[index] - records.dispatchedAt[index])),
      scheduledFirstByte: summarize(pluck(successful, (index) => records.firstByteAt[index] - records.scheduledAt[index])),
      scheduledComplete: summarize(pluck(successful, (index) => records.completedAt[index] - records.scheduledAt[index])),
      schedulerLag,
    },
    responseBytes: summarize(pluck(successful, (index) => records.bytes[index])),
    cpu: {
      processCpuTimeMs: cpuTimeMicros / 1_000,
      averageCpuPercent: cpuPercent,
      averageCpuCores: cpuPercent / 100,
      cpuMsPerSuccessfulRequest: allSuccessful > 0 ? cpuTimeMicros / 1_000 / allSuccessful : 0,
      sampledCpuPercent: summarize(samples.map((sample) => sample.cpuPercent)),
    },
    memory: {
      baselineRssBytes: baselineSample?.rssBytes || 0,
      averageRssBytes: mean(rssValues),
      peakSampledRssBytes: rssValues.length ? maxOf(rssValues) : 0,
      peakRssGrowthBytes: rssValues.length && baselineSample ? maxOf(rssValues) - baselineSample.rssBytes : 0,
      sampleCount: samples.length,
    },
    generator: {
      workerCount,
      cpuMicros: generatorCpuMicros,
      wallMs: generatorWallMs,
      averageCores: generatorWallMs > 0 ? generatorCpuMicros / (generatorWallMs * 1_000) : 0,
      busiestWorkerUtilization: generatorBusiest,
      cpuLimit: generatorCpuLimit,
      lagP95LimitMs: generatorLagLimitMs,
    },
    loadGeneratorValid:
      generatorBusiest <= generatorCpuLimit &&
      (mode !== "open" || schedulerLag.p95 <= generatorLagLimitMs),
  };
}

async function runPhase({
  workers, server, port, path, headers, mode, rate, concurrency, preRollSeconds, durationSeconds,
  validatorModule, validatorOptions, validateEvery = 1, maxSocketsPerWorker = DEFAULT_CLIENT_MAX_SOCKETS_PER_WORKER,
  timeoutMs = 15_000, generatorCpuLimit = DEFAULT_GENERATOR_CPU_LIMIT,
  generatorLagLimitMs = DEFAULT_GENERATOR_LAG_P95_LIMIT_MS, metricsAgent,
}) {
  const workerCount = workers.length;
  const socketDrain = await waitForSocketDrain();
  const beforeMetrics = await fetchJson(port, "/metrics", metricsAgent);
  const baselineSample = await processSample(server.child.pid);
  const sampler = startProcessSampler(server.child.pid);
  const startedAt = now() + 50;
  const measurementStartedAt = startedAt + preRollSeconds * 1_000;
  const measurementEndedAt = measurementStartedAt + durationSeconds * 1_000;
  const common = {
    port, path, headers, validatorModule, validatorOptions, validateEvery,
    maxSockets: maxSocketsPerWorker, timeoutMs, startAtMs: startedAt,
  };
  let phases;
  if (mode === "open") {
    const totalRequests = Math.max(1, Math.floor(rate * (preRollSeconds + durationSeconds)));
    const intervalMs = 1_000 / rate;
    phases = workers.map((_, index) => ({
      ...common,
      mode: "open",
      intervalMs,
      firstIndex: index,
      indexStep: workerCount,
      count: Math.max(0, Math.ceil((totalRequests - index) / workerCount)),
    }));
  } else {
    const perWorker = Array.from({ length: workerCount }, (_, index) =>
      Math.floor(concurrency / workerCount) + (index < concurrency % workerCount ? 1 : 0),
    );
    phases = workers.map((_, index) => ({
      ...common,
      mode: "closed",
      concurrency: perWorker[index],
      endAtMs: measurementEndedAt,
    }));
  }
  const workerResults = await Promise.all(
    workers.map((worker, index) => (phases[index].count === 0 || phases[index].concurrency === 0
      ? Promise.resolve({ records: { scheduledAt: [], dispatchedAt: [], firstByteAt: [], completedAt: [], bytes: [], ok: [], errors: {} }, maxInFlight: 0, generator: { cpuMicros: 0, wallMs: 0 } })
      : runWorker(worker, phases[index]))),
  );
  const records = mergeRecords(workerResults);
  const endedAt = records.completedAt.length ? maxOf(records.completedAt) : now();
  const samples = await sampler.stop();
  const afterMetrics = await fetchJson(port, "/metrics", metricsAgent);
  const cpuTimeMicros = Math.max(0, Number(afterMetrics.cpuTimeMicros) - Number(beforeMetrics.cpuTimeMicros));
  return {
    ...summarizePhase({
      mode, rate, concurrency, records, workerResults, startedAt, measurementStartedAt,
      measurementEndedAt, endedAt, samples, baselineSample, cpuTimeMicros, preRollSeconds,
      durationSeconds, workerCount, generatorCpuLimit, generatorLagLimitMs,
    }),
    socketDrain,
  };
}

export function runOpenLoopPhase(options) {
  if (!(options.rate > 0)) throw new Error("open-loop phases need a positive rate");
  return runPhase({ ...options, mode: "open" });
}

export function runClosedLoopPhase(options) {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("closed-loop phases need a positive integer concurrency");
  }
  return runPhase({ ...options, mode: "closed" });
}

// ---------------------------------------------------------------------------
// Provenance

export async function sourceSha256(root, files) {
  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function gitMetadata(root, sourceFiles) {
  let commit = "unknown";
  let dirty = true;
  try {
    ({ stdout: commit } = await execFile("git", ["rev-parse", "HEAD"], { cwd: root }));
    const { stdout } = await execFile("git", ["status", "--porcelain"], { cwd: root });
    dirty = stdout.trim().length > 0;
  } catch {}
  const lock = await readFile(join(root, "Cargo.lock"), "utf8");
  const proaBlock = /name = "proa_core"[\s\S]*?source = "git\+([^#"]+)#([a-f0-9]+)"/.exec(lock);
  const proaBranch = decodeURIComponent(/[?&]branch=([^&#"]+)/.exec(proaBlock?.[1] || "")?.[1] || "unknown");
  return {
    repositoryCommit: commit.trim(),
    dirty,
    proaRevision: proaBlock?.[2] || "unknown",
    proaBranch,
    sourceSha256: await sourceSha256(root, sourceFiles),
  };
}

export function hostMetadata() {
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model || "unknown",
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    node: process.version,
  };
}
