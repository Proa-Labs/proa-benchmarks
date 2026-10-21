#!/usr/bin/env node
import { canonicalDocument, firstDifference } from "./dom.mjs";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { cpus, release as osRelease, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { renderingSourceFingerprint } from "./source_fingerprint.mjs";

const expectedNodeVersion = "v24.20.0";
if (process.version !== expectedNodeVersion) {
  throw new Error(
    `The canonical suite requires Node ${expectedNodeVersion}; running ${process.version}. Use ./rendering/run-all so the pinned runtime is selected.`,
  );
}

const canonicalDirectory = dirname(fileURLToPath(import.meta.url));
const renderingDirectory = dirname(canonicalDirectory);
const workspaceDirectory = dirname(renderingDirectory);
const externalDirectory = join(renderingDirectory, "external");
const resultDirectory = join(renderingDirectory, "results");
const roster = JSON.parse(
  readFileSync(join(canonicalDirectory, "roster.json"), "utf8"),
);
const workloadManifest = JSON.parse(
  readFileSync(join(canonicalDirectory, "workloads.json"), "utf8"),
);
const rendererIds = roster.renderers.map(({ id }) => id);
const workloads = workloadManifest.workloads;
const smoke = process.argv.includes("--smoke");
const skipSetup = process.argv.includes("--no-setup");
const parityOnly = process.argv.includes("--parity-only");
const setupOnly = process.argv.includes("--setup-only");
const productScaling = process.argv.includes("--product-scaling");

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const repeats = Number(argument("--repeats", smoke ? 1 : 5));
if (!Number.isInteger(repeats) || repeats < 1) {
  throw new Error("--repeats must be a positive integer");
}
if (productScaling && parityOnly) {
  throw new Error("--product-scaling cannot be combined with --parity-only");
}
if (productScaling && !smoke && repeats !== 5) {
  throw new Error(
    "publication product-scaling captures require five process rotations; use --smoke for a quick validation run",
  );
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: workspaceDirectory,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
}

function commandExists(command, args = ["--version"], options = {}) {
  try {
    run(command, args, { ...options, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveRuby() {
  const candidates = [
    process.env.CANONICAL_SUITE_RUBY,
    "/opt/homebrew/opt/ruby/bin/ruby",
    "/usr/local/opt/ruby/bin/ruby",
    "ruby",
  ].filter(Boolean);
  const versionCheck =
    "major, minor = RUBY_VERSION.split('.').first(2).map(&:to_i); exit(major > 3 || (major == 3 && minor >= 2) ? 0 : 1)";
  const ruby = candidates.find((candidate) =>
    commandExists(candidate, ["-e", versionCheck])
  );
  if (!ruby) throw new Error("Ruby 3.2+ is required for Rails");
  const rubyPath = ruby.includes("/") ? ruby : run("which", [ruby]).trim();
  const rubyDirectory = dirname(rubyPath);
  const bundleCandidate = join(rubyDirectory, "bundle");
  const bundle = commandExists(bundleCandidate, ["-v"])
    ? bundleCandidate
    : "bundle";
  return { ruby: rubyPath, bundle, rubyDirectory };
}

function resolveJavaEnvironment() {
  const homes = [
    process.env.JAVA_HOME,
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
  ].filter(Boolean);
  const javaHome = homes.find((home) => existsSync(join(home, "bin", "java")));
  if (!javaHome) throw new Error("Java 17+ is required for jte and Rocker");
  return {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${join(javaHome, "bin")}:${process.env.PATH}`,
  };
}

const ruby = resolveRuby();
const javaEnvironment = resolveJavaEnvironment();
const railsDirectory = join(externalDirectory, "rails");
const rustBinary = join(
  workspaceDirectory,
  "target",
  "release",
  "representative_suite_bench",
);
const goBinary = join(externalDirectory, "go", "build", "canonical_suite");
const jteBinary = join(
  externalDirectory,
  "jte",
  "build",
  "install",
  "proa-jte-bench",
  "bin",
  "proa-jte-bench",
);
const rockerBinary = join(
  externalDirectory,
  "rocker",
  "build",
  "install",
  "proa-rocker-bench",
  "bin",
  "proa-rocker-bench",
);

function railsOptions() {
  return {
    cwd: railsDirectory,
    env: { ...process.env, PATH: `${ruby.rubyDirectory}:${process.env.PATH}` },
  };
}

function npmBinary() {
  const candidate = join(dirname(process.execPath), "npm");
  return existsSync(candidate) ? candidate : "npm";
}

function ensureNodePackage(directory, sentinel) {
  const installedPath = join(
    directory,
    "node_modules",
    sentinel,
    "package.json",
  );
  const lockPath = join(directory, "package-lock.json");
  const expected = JSON.parse(readFileSync(lockPath, "utf8"))
    .packages?.[`node_modules/${sentinel}`]?.version;
  const installed = existsSync(installedPath)
    ? JSON.parse(readFileSync(installedPath, "utf8")).version
    : null;
  if (expected && installed === expected) return;
  console.log(`Installing pinned dependencies in ${directory}`);
  run(npmBinary(), ["ci", "--silent"], { cwd: directory, stdio: "inherit" });
}

function buildAll() {
  console.log("Building all canonical adapters");
  ensureNodePackage(join(externalDirectory, "react"), "react");
  ensureNodePackage(join(externalDirectory, "marko"), "marko");
  ensureNodePackage(join(externalDirectory, "handlebars"), "handlebars");
  ensureNodePackage(join(externalDirectory, "vue"), "vue");
  ensureNodePackage(join(externalDirectory, "svelte"), "svelte");

  try {
    run(ruby.bundle, ["check"], { ...railsOptions(), stdio: "ignore" });
  } catch {
    run(
      ruby.bundle,
      ["config", "set", "--local", "path", ".gems"],
      railsOptions(),
    );
    run(ruby.bundle, ["install", "--quiet"], {
      ...railsOptions(),
      stdio: "inherit",
    });
  }

  run("cargo", [
    "build",
    "--locked",
    "--release",
    "-p",
    "proa_bench",
    "--features",
    "topcoat",
    "--bin",
    "representative_suite_bench",
  ], { cwd: workspaceDirectory, stdio: "inherit" });
  mkdirSync(dirname(goBinary), { recursive: true });
  run("go", ["build", "-trimpath", "-o", goBinary, "suite_bench.go"], {
    cwd: join(externalDirectory, "go"),
    stdio: "inherit",
  });

  const jinjaDirectory = join(externalDirectory, "jinja");
  const python = join(jinjaDirectory, ".venv", "bin", "python3");
  if (!existsSync(python)) {
    run("python3", ["-m", "venv", ".venv"], {
      cwd: jinjaDirectory,
      stdio: "inherit",
    });
  }
  run(join(jinjaDirectory, ".venv", "bin", "pip"), [
    "install",
    "-q",
    "-r",
    "requirements.txt",
  ], { cwd: jinjaDirectory, stdio: "inherit" });

  if (!commandExists("gradle", ["--version"], { env: javaEnvironment })) {
    throw new Error("Gradle is required to build jte and Rocker");
  }
  run("gradle", [
    "--no-daemon",
    "--quiet",
    "installDist",
    "copyJteBinaryStaticContent",
  ], {
    cwd: join(externalDirectory, "jte"),
    env: javaEnvironment,
    stdio: "inherit",
  });
  run("gradle", ["--no-daemon", "--quiet", "installDist"], {
    cwd: join(externalDirectory, "rocker"),
    env: javaEnvironment,
    stdio: "inherit",
  });
  if (!commandExists("php", ["--version"])) {
    throw new Error("PHP is required for the canonical PHP adapter");
  }
}

function invocation(rendererId, workloadId, extraArguments) {
  if (
    ["proa", "askama", "sailfish", "leptos", "dioxus", "topcoat"].includes(
      rendererId,
    )
  ) {
    return {
      command: rustBinary,
      args: [
        "--framework",
        rendererId,
        "--workload",
        workloadId,
        ...extraArguments,
      ],
      options: { cwd: workspaceDirectory },
    };
  }
  if (rendererId === "react") {
    return {
      command: process.execPath,
      args: ["suite_bench.mjs", "--workload", workloadId, ...extraArguments],
      options: {
        cwd: join(externalDirectory, "react"),
        env: { ...process.env, NODE_ENV: "production" },
      },
    };
  }
  if (rendererId === "marko") {
    return {
      command: process.execPath,
      args: ["suite_bench.mjs", "--workload", workloadId, ...extraArguments],
      options: { cwd: join(externalDirectory, "marko") },
    };
  }
  if (rendererId === "vue" || rendererId === "svelte") {
    return {
      command: process.execPath,
      args: ["suite_bench.mjs", "--workload", workloadId, ...extraArguments],
      options: {
        cwd: join(externalDirectory, rendererId),
        env: { ...process.env, NODE_ENV: "production" },
      },
    };
  }
  if (rendererId === "handlebars") {
    return {
      command: process.execPath,
      args: ["suite_bench.mjs", "--workload", workloadId, ...extraArguments],
      options: { cwd: join(externalDirectory, "handlebars") },
    };
  }
  if (rendererId === "rails") {
    return {
      command: ruby.bundle,
      args: [
        "exec",
        "ruby",
        "suite_bench.rb",
        "--workload",
        workloadId,
        ...extraArguments,
      ],
      options: railsOptions(),
    };
  }
  if (rendererId === "go-html-template") {
    return {
      command: goBinary,
      args: ["--workload", workloadId, ...extraArguments],
      options: { cwd: join(externalDirectory, "go") },
    };
  }
  if (rendererId === "jinja2") {
    return {
      command: join(externalDirectory, "jinja", ".venv", "bin", "python3"),
      args: ["suite_bench.py", "--workload", workloadId, ...extraArguments],
      options: { cwd: join(externalDirectory, "jinja") },
    };
  }
  if (rendererId === "php") {
    return {
      command: "php",
      args: ["suite_bench.php", "--workload", workloadId, ...extraArguments],
      options: { cwd: join(externalDirectory, "php") },
    };
  }
  if (rendererId === "jte") {
    return {
      command: jteBinary,
      args: ["--workload", workloadId, ...extraArguments],
      options: {
        cwd: join(externalDirectory, "jte"),
        env: {
          ...javaEnvironment,
          ...(process.env.PROA_BENCH_PRODUCT_COUNT
            ? {
              PROA_BENCH_PRODUCT_COUNT:
                process.env.PROA_BENCH_PRODUCT_COUNT,
            }
            : {}),
        },
      },
    };
  }
  if (rendererId === "rocker") {
    return {
      command: rockerBinary,
      args: ["--workload", workloadId, ...extraArguments],
      options: {
        cwd: join(externalDirectory, "rocker"),
        env: {
          ...javaEnvironment,
          ...(process.env.PROA_BENCH_PRODUCT_COUNT
            ? {
              PROA_BENCH_PRODUCT_COUNT:
                process.env.PROA_BENCH_PRODUCT_COUNT,
            }
            : {}),
        },
      },
    };
  }
  throw new Error(`unknown canonical renderer ${rendererId}`);
}

function runCell(rendererId, workloadId, extraArguments) {
  const selected = invocation(rendererId, workloadId, extraArguments);
  return run(selected.command, selected.args, selected.options);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}


async function parityGate(temporaryDirectory, activeWorkloads = workloads) {
  console.log(
    `Parity gate: ${rendererIds.length} renderers × ${activeWorkloads.length} workloads`,
  );
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const page = await browser.newPage();
  const parity = Object.fromEntries(rendererIds.map((id) => [id, {}]));
  try {
    for (const workload of activeWorkloads) {
      let expectedHtml;
      let expectedCanonical;
      for (const rendererId of rendererIds) {
        const dumpPath = join(
          temporaryDirectory,
          `${workload.id}-${rendererId}.html`,
        );
        runCell(rendererId, workload.id, ["--dump", dumpPath, "--dump-only"]);
        const html = readFileSync(dumpPath, "utf8");
        const canonical = JSON.stringify(await canonicalDocument(page, html));
        if (rendererId === "proa") {
          expectedHtml = html;
          expectedCanonical = canonical;
          const adversarial = html.replace(
            "SSR Framework Benchmark",
            "SSR Framework Benchmark changed",
          ).replace("Customer Accounts", "Customer Accounts changed").replace(
            "All products",
            "All products changed",
          );
          const changed = JSON.stringify(
            await canonicalDocument(page, adversarial),
          );
          if (changed === canonical) {
            throw new Error(
              `${workload.id} parity negative control did not fail`,
            );
          }
        } else if (canonical !== expectedCanonical) {
          const difference = firstDifference(expectedCanonical, canonical);
          throw new Error(
            `${rendererId}/${workload.id} failed semantic DOM parity at canonical byte ${difference.index}\nexpected: ${difference.expected}\nactual:   ${difference.actual}`,
          );
        }
        parity[rendererId][workload.id] = {
          status: "pass",
          mode: "semantic DOM",
          canonical_sha256: sha256(canonical),
          output_bytes: Buffer.byteLength(html),
          payload_delta_bytes: Buffer.byteLength(html) -
            Buffer.byteLength(expectedHtml),
          byte_equal_to_proa: html === expectedHtml,
        };
        process.stdout.write(".");
      }
      console.log(
        ` ${workload.id} ${
          parity.proa[workload.id].canonical_sha256.slice(0, 16)
        }`,
      );
    }
  } finally {
    await page.close();
    await browser.close();
  }
  return { parity, browserVersion };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function benchmark(temporaryDirectory, activeWorkloads = workloads) {
  console.log(
    `Benchmarking ${
      rendererIds.length * activeWorkloads.length
    } cells across ${repeats} independent process rotations`,
  );
  const processResults = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    for (
      let workloadIndex = 0;
      workloadIndex < activeWorkloads.length;
      workloadIndex += 1
    ) {
      const workload = activeWorkloads[workloadIndex];
      const iterations = smoke ? 3 : workload.iterations;
      const warmup = smoke ? 1 : workload.warmup;
      const rotated = rendererIds.map((_, index) =>
        rendererIds[(index + repeat + workloadIndex) % rendererIds.length]
      );
      for (const rendererId of rotated) {
        const resultPath = join(
          temporaryDirectory,
          `run-${repeat}-${workload.id}-${rendererId}.json`,
        );
        const output = runCell(rendererId, workload.id, [
          "--iterations",
          String(iterations),
          "--warmup",
          String(warmup),
          "--out",
          resultPath,
        ]).trim();
        const cell = JSON.parse(readFileSync(resultPath, "utf8"));
        if (cell.framework_id !== rendererId || cell.workload !== workload.id) {
          throw new Error(
            `${rendererId}/${workload.id} returned identity ${cell.framework_id}/${cell.workload}`,
          );
        }
        if (cell.workload_cardinality !== workload.cardinality) {
          throw new Error(
            `${rendererId}/${workload.id} returned cardinality ${cell.workload_cardinality}; expected ${workload.cardinality}`,
          );
        }
        if (/reus|pool|cached output/i.test(cell.allocation_policy)) {
          throw new Error(
            `${rendererId}/${workload.id} does not declare fresh independently owned output: ${cell.allocation_policy}`,
          );
        }
        processResults.push({ ...cell, repeat });
        console.log(output.split("\n")[0]);
      }
    }
  }

  const measurements = Object.fromEntries(rendererIds.map((id) => [id, {}]));
  for (const rendererId of rendererIds) {
    for (const workload of activeWorkloads) {
      const cells = processResults.filter((cell) =>
        cell.framework_id === rendererId && cell.workload === workload.id
      );
      if (cells.length !== repeats) {
        throw new Error(
          `${rendererId}/${workload.id} has ${cells.length}/${repeats} process results`,
        );
      }
      const sizes = new Set(cells.map(({ output_bytes }) => output_bytes));
      if (sizes.size !== 1) {
        throw new Error(
          `${rendererId}/${workload.id} payload changed between processes`,
        );
      }
      const p50s = cells.map(({ p50_us }) => p50_us);
      measurements[rendererId][workload.id] = {
        p50_us: median(p50s),
        p95_us: median(cells.map(({ p95_us }) => p95_us)),
        p99_us: median(cells.map(({ p99_us }) => p99_us)),
        mean_us: median(cells.map(({ mean_us }) => mean_us)),
        process_p50_min_us: Math.min(...p50s),
        process_p50_max_us: Math.max(...p50s),
        independent_processes: repeats,
        samples_per_process: cells[0].iterations,
        warmups_per_process: cells[0].warmup,
        output_bytes: cells[0].output_bytes,
        allocation_policy: cells[0].allocation_policy,
      };
    }
  }
  return { processResults, measurements };
}

async function captureProductScaling(temporaryDirectory) {
  const counts = [12, 96, 768];
  const capturedAt = new Date().toISOString();
  const fingerprint = sourceFingerprint();
  const previousCount = process.env.PROA_BENCH_PRODUCT_COUNT;
  const measurements = Object.fromEntries(rendererIds.map((id) => [id, {}]));
  const parity = Object.fromEntries(rendererIds.map((id) => [id, {}]));
  const processResults = [];
  let browserVersion = null;

  try {
    for (const count of counts) {
      process.env.PROA_BENCH_PRODUCT_COUNT = String(count);
      const workload = {
        id: "products",
        label: `${count}-product grid`,
        cardinality: count,
        description: `${count} product cards and ${count * 5} SVG stars`,
        iterations: count === 12 ? 2_000 : count === 96 ? 500 : 100,
        warmup: count === 12 ? 200 : count === 96 ? 50 : 10,
      };
      const countDirectory = join(temporaryDirectory, String(count));
      mkdirSync(countDirectory, { recursive: true });
      const parityRun = await parityGate(countDirectory, [workload]);
      browserVersion ??= parityRun.browserVersion;
      const benchmarkResult = benchmark(countDirectory, [workload]);
      for (const rendererId of rendererIds) {
        parity[rendererId][count] = parityRun.parity[rendererId].products;
        measurements[rendererId][count] =
          benchmarkResult.measurements[rendererId].products;
      }
      processResults.push(...benchmarkResult.processResults);
    }
  } finally {
    if (previousCount === undefined) delete process.env.PROA_BENCH_PRODUCT_COUNT;
    else process.env.PROA_BENCH_PRODUCT_COUNT = previousCount;
  }

  const benchmarkVersion = "product-scaling-v1";
  const captureId = `${benchmarkVersion}-${capturedAt.slice(0, 10)}-${
    fingerprint.slice(0, 12)
  }`;
  const environment = metadata(capturedAt, fingerprint, browserVersion);
  if (!smoke) {
    const rawDirectory = join(resultDirectory, "raw", captureId);
    mkdirSync(rawDirectory, { recursive: true });
    writeFileSync(
      join(rawDirectory, "process-summaries.json"),
      `${JSON.stringify(processResults, null, 2)}\n`,
    );
  }
  const result = {
    schema_version: 1,
    benchmark_version: benchmarkVersion,
    capture_id: captureId,
    capture_kind: smoke ? "smoke" : "engineering",
    status: "pass",
    captured_at: capturedAt,
    completed_at: new Date().toISOString(),
    host: environment.host,
    counts,
    renderers: roster.renderers.map(({ id, label, language }) => ({
      id,
      label,
      language,
    })),
    parity,
    measurements,
    versions: environment.versions,
    provenance: environment.provenance,
    command: `./rendering/run-all --product-scaling${smoke ? " --smoke" : ""}`,
    limitations: [
      "Renderer-only latency excludes routing, middleware, databases, HTTP transfer, hydration, and network latency.",
      "Every row builds a fresh independently owned response; fixture data construction is outside the timed region.",
      "This engineering capture describes one machine and one scaling workload; it is not a universal application ranking.",
    ],
    ...(smoke
      ? {}
      : { raw_artifact: `raw/${captureId}/process-summaries.json` }),
  };
  const outputName = smoke ? "product-scaling-smoke.json" : "product-scaling.json";
  writeFileSync(
    join(resultDirectory, outputName),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(`Product-scaling capture passed and wrote rendering/results/${outputName}.`);
}

function sourceFingerprint() {
  return renderingSourceFingerprint(workspaceDirectory);
}

function firstLine(command, args, options = {}) {
  try {
    return run(command, args, options).trim().split("\n")[0];
  } catch {
    return null;
  }
}

function packageVersion(directory, name) {
  const packagePath = join(directory, "node_modules", name, "package.json");
  return existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, "utf8")).version
    : null;
}

function cargoPackage(name) {
  const lockfile = readFileSync(join(workspaceDirectory, "Cargo.lock"), "utf8");
  for (const block of lockfile.split("[[package]]").slice(1)) {
    if (block.match(/^\s*name = "([^"]+)"/m)?.[1] !== name) continue;
    const version = block.match(/^version = "([^"]+)"/m)?.[1] ?? "unknown";
    const source = block.match(/^source = "([^"]+)"/m)?.[1] ?? null;
    return { version, source };
  }
  return { version: "unknown", source: null };
}

function dependencyVersion(path, pattern) {
  return readFileSync(path, "utf8").match(pattern)?.[1] ?? "unknown";
}

function proaVersion() {
  const dependency = cargoPackage("proa_core");
  const commit = dependency.source?.match(/#([a-f0-9]{40})$/)?.[1];
  const branch = decodeURIComponent(
    dependency.source?.match(/[?&]branch=([^&#]+)/)?.[1] ?? "",
  );
  const branchNote = branch && branch !== "main" ? ` (${branch})` : "";
  return `${dependency.version}${commit ? ` @ ${commit}` : ""}${branchNote}`;
}

function metadata(capturedAt, fingerprint, browserVersion) {
  const firstCpu = cpus()[0];
  const node = process.version;
  const rust = firstLine("rustc", ["--version"]);
  const rubyVersion = firstLine(ruby.ruby, ["-v"]);
  const railsVersion = firstLine(
    ruby.bundle,
    ["exec", "rails", "--version"],
    railsOptions(),
  );
  const java = firstLine(join(javaEnvironment.JAVA_HOME, "bin", "java"), [
    "--version",
  ], { env: javaEnvironment });
  const go = firstLine("go", ["version"]);
  const python = firstLine(
    join(externalDirectory, "jinja", ".venv", "bin", "python3"),
    ["--version"],
  );
  const php = firstLine("php", ["--version"]);
  const jinja = firstLine(
    join(externalDirectory, "jinja", ".venv", "bin", "python3"),
    ["-c", "import jinja2; print(jinja2.__version__)"],
  );
  const jte = dependencyVersion(
    join(externalDirectory, "jte", "build.gradle"),
    /gg\.jte:jte:([^']+)'/,
  );
  const rocker = dependencyVersion(
    join(externalDirectory, "rocker", "build.gradle"),
    /version = '([^']+)'/,
  );
  return {
    captured_at: capturedAt,
    host: {
      cpu_model: firstCpu?.model ?? "unknown CPU",
      logical_cpus: cpus().length,
      memory_bytes: totalmem(),
      architecture: process.arch,
      os_name: process.platform === "darwin"
        ? "macOS (Darwin)"
        : process.platform,
      os_release: osRelease(),
    },
    versions: {
      Proa: `${proaVersion()} / ${rust}`,
      Marko: `${
        packageVersion(join(externalDirectory, "marko"), "marko")
      } / Node ${node}`,
      React: `${
        packageVersion(join(externalDirectory, "react"), "react")
      } / Node ${node}`,
      Vue: `${
        packageVersion(join(externalDirectory, "vue"), "vue")
      } / Node ${node}`,
      Svelte: `${
        packageVersion(join(externalDirectory, "svelte"), "svelte")
      } / Node ${node}`,
      Rails: `${railsVersion} / ${rubyVersion}`,
      jte: `${jte} / ${java}`,
      Rocker: `${rocker} / ${java}`,
      Handlebars: `${
        packageVersion(join(externalDirectory, "handlebars"), "handlebars")
      } / Node ${node}`,
      "Go html/template": go,
      Jinja2: `${jinja} / ${python}`,
      PHP: php,
      Askama: `${cargoPackage("askama").version} / ${rust}`,
      Sailfish: `${cargoPackage("sailfish").version} / ${rust}`,
      Leptos: `${cargoPackage("leptos").version} / ${rust}`,
      Dioxus: `${cargoPackage("dioxus").version} + dioxus-ssr ${
        cargoPackage("dioxus-ssr").version
      } / ${rust}`,
      Topcoat: `${cargoPackage("topcoat").version} / ${rust}`,
      Playwright: packageVersion(workspaceDirectory, "playwright"),
      Chromium: browserVersion,
    },
    provenance: {
      harness_commit: run("git", ["rev-parse", "HEAD"], {
        cwd: workspaceDirectory,
      }).trim(),
      dirty: run("git", ["status", "--porcelain"], { cwd: workspaceDirectory })
        .trim().length > 0,
      source_sha256: fingerprint,
    },
  };
}

if (!skipSetup) buildAll();
if (setupOnly) {
  console.log("All canonical adapters are built and ready.");
  process.exit(0);
}
for (const path of [rustBinary, goBinary, jteBinary, rockerBinary]) {
  if (!existsSync(path)) {
    throw new Error(`canonical adapter build output is missing: ${path}`);
  }
}

mkdirSync(resultDirectory, { recursive: true });
const temporaryDirectory = mkdtempSync(join(tmpdir(), "proa-canonical-"));
try {
  if (productScaling) {
    await captureProductScaling(temporaryDirectory);
  } else {
    const capturedAt = new Date().toISOString();
    const fingerprint = sourceFingerprint();
    const parityRun = await parityGate(temporaryDirectory);
    const parity = parityRun.parity;
    if (parityOnly) {
      writeFileSync(
        join(resultDirectory, "canonical-parity.json"),
        `${
          JSON.stringify(
            {
              schema_version: 1,
              captured_at: capturedAt,
              browser_version: parityRun.browserVersion,
              parity,
            },
            null,
            2,
          )
        }\n`,
      );
      console.log(
        "All canonical parity cells passed; timing was not requested.",
      );
    }
    if (!parityOnly) {
      const benchmarkResult = benchmark(temporaryDirectory);
      const captureId = `canonical-ssr-v1-${capturedAt.slice(0, 10)}-${
        fingerprint.slice(0, 12)
      }`;
      for (const renderer of roster.renderers) {
        for (const workload of workloads) {
          benchmarkResult.measurements[renderer.id][workload.id].capture_id =
            captureId;
        }
      }
      const environment = metadata(
        capturedAt,
        fingerprint,
        parityRun.browserVersion,
      );
      const result = {
        schema_version: 2,
        benchmark_version: "canonical-ssr-v1",
        capture_id: captureId,
        capture_kind: smoke ? "smoke" : "canonical",
        status: "pass",
        captured_at: capturedAt,
        completed_at: new Date().toISOString(),
        host: environment.host,
        workloads,
        renderers: roster.renderers.map(({ id, label, language }) => ({
          id,
          label,
          language,
          status: "included",
        })),
        parity,
        measurements: benchmarkResult.measurements,
        versions: environment.versions,
        provenance: environment.provenance,
        commands: [
          "npm ci (React, Marko, and Handlebars adapter directories)",
          "bundle check || bundle install (Rails adapter directory)",
          "cargo build --locked --release -p proa_bench --features topcoat --bin representative_suite_bench",
          "go build -trimpath -o rendering/external/go/build/canonical_suite rendering/external/go/suite_bench.go",
          "python3 -m venv rendering/external/jinja/.venv && pip install -r rendering/external/jinja/requirements.txt",
          "gradle --no-daemon --quiet installDist copyJteBinaryStaticContent (jte adapter directory)",
          "gradle --no-daemon --quiet installDist (Rocker adapter directory)",
          "./rendering/run-all",
        ],
        limitations: [
          "Renderer-only latency excludes routing, middleware, databases, HTTP transfer, hydration, and network latency.",
          "Semantic DOM parity permits documented serializer metadata and whitespace differences; payload deltas remain visible.",
          "This capture describes one machine and these three workloads; it is not a universal application ranking.",
        ],
        raw_artifacts: smoke
          ? [{ label: "Smoke result", path: "canonical-smoke.json" }]
          : [
            {
              label: "Per-process summaries",
              path: `raw/${captureId}/process-summaries.json`,
            },
            { label: "Result-table migration map", path: "../MIGRATION.md" },
          ],
      };
      if (smoke) {
        writeFileSync(
          join(resultDirectory, "canonical-smoke.json"),
          `${JSON.stringify(result, null, 2)}\n`,
        );
        console.log(
          "Smoke capture passed; public latest files were not modified.",
        );
      } else {
        const rawDirectory = join(resultDirectory, "raw", captureId);
        mkdirSync(rawDirectory, { recursive: true });
        writeFileSync(
          join(rawDirectory, "process-summaries.json"),
          `${JSON.stringify(benchmarkResult.processResults, null, 2)}\n`,
        );
        mkdirSync(join(resultDirectory, "archive"), { recursive: true });
        writeFileSync(
          join(resultDirectory, "latest.json"),
          `${JSON.stringify(result, null, 2)}\n`,
        );
        writeFileSync(
          join(resultDirectory, "archive", `${captureId}.json`),
          `${JSON.stringify(result, null, 2)}\n`,
        );
        run(process.execPath, [join(renderingDirectory, "generate-report.mjs")], {
          cwd: workspaceDirectory,
          stdio: "inherit",
        });
        console.log(`Canonical capture ${captureId} is complete.`);
      }
    }
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
