#!/usr/bin/env node
// Cold start: the time from spawning each framework's production server to
// its first complete product-grid response, repeated across fresh processes.
// This is the cost paid by every autoscaling event, serverless invocation on a
// cold instance, per-tenant process, and developer restart.

import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { delay, gitMetadata, hostMetadata, processSample, acquireRunLock } from "../load/driver.mjs";
import { summarize } from "../suspense-load/stats.mjs";
import { sourceFiles as sveltekitSourceFiles, build as buildSvelteKit, directory as sveltekitDirectory, serverSpec as sveltekitServerSpec, validateDump as validateSvelteKitDump } from "../rendering/external/sveltekit/benchmark.mjs";

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const external = join(root, "rendering", "external");
const defaultOutput = join(here, "results", "latest.json");
const ENGINES = [
  { id: "proa", label: "Proa", language: "Rust" },
  { id: "react", label: "React", language: "JavaScript" },
  { id: "marko", label: "Marko", language: "JavaScript" },
  { id: "go-html-template", label: "Go html/template", language: "Go" },
  { id: "sveltekit", label: "SvelteKit", language: "JavaScript" },
];
const WORKLOAD = { id: "products", path: "/products", label: "Product grid" };
export const PUBLICATION = Object.freeze({ starts: 15, warmupStarts: 2 });

export const benchmarkSourceFiles = [
  ...sveltekitSourceFiles,
  ".nvmrc",
  "Cargo.lock",
  "Cargo.toml",
  "package.json",
  "pnpm-lock.yaml",
  "cold-start/run.mjs",
  "load/driver.mjs",
  "page-load/react_server.mjs",
  "rendering/Cargo.toml",
  "rendering/external/go/suite_bench.go",
  "rendering/external/marko/compile_suite.mjs",
  "rendering/external/marko/package-lock.json",
  "rendering/external/marko/page_server.mjs",
  "rendering/external/marko/suite_products.marko",
  "rendering/external/react/package-lock.json",
  "rendering/external/react/suite_components.mjs",
  "rendering/external/shared/suite_data.mjs",
  "rendering/src/bin/proa_page_server.rs",
  "rendering/src/http_load.rs",
  "rendering/src/representative_suite.rs",
  "rendering/src/topcoat_product_grid.rs",
];

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
function positiveIntegerOption(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
const outputOption = option("--out", defaultOutput);
const config = {
  starts: positiveIntegerOption("--starts", PUBLICATION.starts),
  warmupStarts: positiveIntegerOption("--warmup-starts", PUBLICATION.warmupStarts),
  engines: String(option("--engines", ENGINES.map(({ id }) => id).join(","))).split(",").map((v) => v.trim()).filter(Boolean),
  skipBuild: process.argv.includes("--no-build"),
  outputPath: isAbsolute(outputOption) ? outputOption : join(root, outputOption),
};
for (const engine of config.engines) {
  if (!ENGINES.some(({ id }) => id === engine)) throw new Error(`unknown engine: ${engine}`);
}
const publicationConfig =
  config.starts === PUBLICATION.starts &&
  config.warmupStarts === PUBLICATION.warmupStarts &&
  config.engines.join(",") === ENGINES.map(({ id }) => id).join(",");
if (config.outputPath === defaultOutput && !publicationConfig) {
  throw new Error("custom cold-start runs require an explicit --out path");
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
  if (config.engines.includes("sveltekit")) await buildSvelteKit();
  if (config.engines.includes("proa")) {
    await run("cargo", ["build", "--release", "--locked", "-p", "proa_bench", "--features", "http-load,topcoat", "--bin", "proa_page_server", "--bin", "representative_suite_bench"], { cwd: root });
  }
  if (config.engines.includes("go-html-template")) {
    await run("go", ["build", "-trimpath", "-o", goBinary, "suite_bench.go"], { cwd: join(external, "go") });
  }
  if (config.engines.includes("marko")) {
    await run(process.execPath, [join(external, "marko", "compile_suite.mjs")], { cwd: join(external, "marko"), env: { ...process.env, NODE_ENV: "production" } });
  }
}

function adapterInvocation(engine, dumpPath) {
  const extra = ["--workload", WORKLOAD.id, "--dump", dumpPath, "--dump-only"];
  if (engine === "sveltekit") return { command: process.execPath, args: ["dump.mjs", ...extra], options: { cwd: sveltekitDirectory, env: { ...process.env, NODE_ENV: "production" } } };
  if (engine === "proa") return { command: rustBinary("representative_suite_bench"), args: ["--framework", "proa", ...extra], options: { cwd: root } };
  if (engine === "react") return { command: process.execPath, args: ["suite_bench.mjs", ...extra], options: { cwd: join(external, "react"), env: { ...process.env, NODE_ENV: "production" } } };
  if (engine === "marko") return { command: process.execPath, args: ["suite_bench.mjs", ...extra], options: { cwd: join(external, "marko") } };
  return { command: goBinary, args: extra, options: { cwd: join(external, "go") } };
}

async function canonicalDumps() {
  const directory = mkdtempSync(join(os.tmpdir(), "proa-cold-start-"));
  const dumps = {};
  try {
    for (const engine of config.engines) {
      const dumpPath = join(directory, `${engine}.html`);
      const invocation = adapterInvocation(engine, dumpPath);
      await run(invocation.command, invocation.args, invocation.options);
      const html = readFileSync(dumpPath);
      if (engine === "sveltekit") await validateSvelteKitDump(html, WORKLOAD.id, directory);
      dumps[engine] = { bytes: html.length, sha256: createHash("sha256").update(html).digest("hex") };
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return dumps;
}

function serverSpec(engine, port) {
  if (engine === "sveltekit") {
    const { spec, env } = sveltekitServerSpec(port);
    return { ...spec, env, artifact: null };
  }
  if (engine === "proa") return { command: rustBinary("proa_page_server"), args: [], cwd: root, env: { PORT: String(port), PROA_WORKER_THREADS: "1" }, artifact: rustBinary("proa_page_server") };
  if (engine === "react") return { command: process.execPath, args: [join(root, "page-load", "react_server.mjs")], cwd: root, env: { PORT: String(port) }, artifact: null };
  if (engine === "marko") return { command: process.execPath, args: [join(external, "marko", "page_server.mjs")], cwd: join(external, "marko"), env: { PORT: String(port) }, artifact: null };
  return { command: goBinary, args: ["--serve", String(port)], cwd: join(external, "go"), env: { GOMAXPROCS: "1" }, artifact: goBinary };
}

function attempt(port, path, agent) {
  return new Promise((resolve) => {
    const request = http.request({ host: "127.0.0.1", port, path, method: "GET", agent, headers: { accept: "text/html", "accept-encoding": "identity" } }, (response) => {
      const chunks = [];
      let firstByteAt = null;
      response.on("data", (chunk) => { firstByteAt ??= performance.now(); chunks.push(chunk); });
      response.once("end", () => resolve({ ok: response.statusCode === 200, firstByteAt, completedAt: performance.now(), body: Buffer.concat(chunks) }));
      response.once("error", () => resolve({ ok: false }));
    });
    request.setTimeout(5_000, () => request.destroy());
    request.once("error", () => resolve({ ok: false }));
    request.end();
  });
}

async function coldStart(engine, port, expected) {
  const spec = serverSpec(engine, port);
  const spawnedAt = performance.now();
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, NODE_ENV: "production", ...spec.env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_192); });
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  try {
    let first = null;
    let attempts = 0;
    while (performance.now() - spawnedAt < 30_000) {
      if (child.exitCode !== null) throw new Error(`${engine} exited during startup: ${stderr}`);
      attempts += 1;
      const result = await attempt(port, WORKLOAD.path, agent);
      if (result.ok) { first = result; break; }
      await delay(1);
    }
    if (!first) throw new Error(`${engine} never answered: ${stderr}`);
    const digest = createHash("sha256").update(first.body).digest("hex");
    if (first.body.length !== expected.bytes || digest !== expected.sha256) {
      throw new Error(`${engine} first response differs from the canonical dump`);
    }
    const second = await attempt(port, WORKLOAD.path, agent);
    if (!second.ok) throw new Error(`${engine} second response failed`);
    const health = await attempt(port, "/health", agent);
    if (!health.ok) throw new Error(`${engine} health check failed`);
    const declared = JSON.parse(health.body.toString("utf8"));
    if (["react", "marko", "sveltekit"].includes(engine) && declared.nodeEnv !== "production") {
      throw new Error(`${engine} is not running with NODE_ENV=production (${declared.nodeEnv})`);
    }
    if (engine === "react" && declared.reactDomBuild !== "production") {
      throw new Error(`${engine} loaded the ${declared.reactDomBuild} react-dom build`);
    }
    const secondStartedAt = second.completedAt - (second.completedAt - (second.firstByteAt ?? second.completedAt));
    const sample = await processSample(child.pid);
    return {
      firstResponseMs: first.completedAt - spawnedAt,
      firstByteMs: (first.firstByteAt ?? first.completedAt) - spawnedAt,
      attempts,
      warmSecondResponseMs: second.completedAt - secondStartedAt,
      rssAfterFirstResponseBytes: sample?.rssBytes ?? 0,
    };
  } finally {
    agent.destroy();
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([exited, delay(2_000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
}

function artifactBytes(engine) {
  const spec = serverSpec(engine, 0);
  if (spec.artifact && existsSync(spec.artifact)) return statSync(spec.artifact).size;
  return null;
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
    scenario: {
      id: "cold_start_products_v1",
      workload: WORKLOAD,
      definition: "wall time from process spawn to the end of the first complete product-grid response, polling the port every millisecond; the response must be byte-identical to the engine's canonical dump",
      concurrencyModel: "same per-core server configuration as page-load: Proa one Tokio worker thread, Node single process, Go GOMAXPROCS=1",
    },
    methodology: {
      starts: config.starts,
      warmupStarts: config.warmupStarts,
      order: "engines rotate every start so no engine always follows a cold disk cache",
      rss: "server RSS sampled with ps immediately after the first response",
      javascriptMode: "production: NODE_ENV=production is set for every spawn and confirmed by each Node server's health endpoint after its first response",
    },
    host: { ...hostMetadata(), loadAverage1m: os.loadavg()[0] },
    source: git,
    engines: config.engines.map((id) => ({ ...ENGINES.find((engine) => engine.id === id), artifactBytes: artifactBytes(id), canonicalDump: dumps[id], starts: [] })),
  };
  const partialOutputPath = `${config.outputPath}.partial`;
  await mkdir(dirname(config.outputPath), { recursive: true });
  let port = 15730;
  for (let round = 0; round < config.warmupStarts + config.starts; round += 1) {
    const rotated = config.engines.map((_, index) => config.engines[(index + round) % config.engines.length]);
    for (const engine of rotated) {
      port += 1;
      const sample = await coldStart(engine, port, dumps[engine]);
      if (round >= config.warmupStarts) {
        result.engines.find(({ id }) => id === engine).starts.push(sample);
        console.log(`${engine.padEnd(17)} start ${String(round - config.warmupStarts + 1).padStart(2)}  ${sample.firstResponseMs.toFixed(1).padStart(7)} ms to first response  ${(sample.rssAfterFirstResponseBytes / 1024 / 1024).toFixed(1).padStart(6)} MiB`);
      }
      await delay(200);
    }
    await writeFile(partialOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  for (const engine of result.engines) {
    engine.summary = {
      firstResponseMs: summarize(engine.starts.map((start) => start.firstResponseMs)),
      firstByteMs: summarize(engine.starts.map((start) => start.firstByteMs)),
      rssAfterFirstResponseBytes: summarize(engine.starts.map((start) => start.rssAfterFirstResponseBytes)),
    };
  }
  result.status = "pass";
  result.completedAt = new Date().toISOString();
  await writeFile(partialOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  await rename(partialOutputPath, config.outputPath);
  console.log(`\nResult written to ${config.outputPath}`);
}

const releaseRunLock = await acquireRunLock(root, "cold-start");
try {
  await main();
} finally {
  await releaseRunLock();
}
