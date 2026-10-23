import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  captureIdentity,
  compareCaptures,
  detectSuite,
  extractCells,
  formatDelta,
  formatRatio,
  formatValue,
  renderMarkdown,
} from "./lib.mjs";
import { main, parseArgs, usage } from "./run.mjs";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./run.mjs", import.meta.url));
const workspace = fileURLToPath(new URL("..", import.meta.url));

function canonicalFixture(overrides = {}) {
  return {
    schema_version: 2,
    benchmark_version: "canonical-ssr-v1",
    capture_id: "canonical-test-a",
    capture_kind: "canonical",
    status: "pass",
    captured_at: "2026-09-05T01:50:57.896Z",
    host: { cpu_model: "Apple M4 Max", os_name: "macOS (Darwin)" },
    provenance: { source_sha256: "a".repeat(64) },
    workloads: [
      { id: "cards", label: "Component page" },
      { id: "products", label: "Product grid" },
    ],
    renderers: [
      { id: "proa", label: "Proa" },
      { id: "react", label: "React" },
    ],
    measurements: {
      proa: {
        cards: { p50_us: 2, output_bytes: 25_108 },
        products: { p50_us: 26, output_bytes: 284_908 },
      },
      react: {
        cards: { p50_us: 70, output_bytes: 25_202 },
        products: { p50_us: 400, output_bytes: 285_868 },
      },
    },
    ...overrides,
  };
}

function pageLoadFixture() {
  const phase = (mode, throughput, cpu, p50) => ({
    mode,
    completionThroughputRps: throughput,
    cpu: { cpuMsPerSuccessfulRequest: cpu },
    memory: { peakSampledRssBytes: 8_000_000 },
    latencyMs: { scheduledComplete: { p50 } },
  });
  const cell = (closed, open) => ({
    phases: [
      phase("closed", closed[0], closed[1], 1),
      phase("closed", closed[0] + 10, closed[1], 1),
      phase("closed", closed[0] - 10, closed[1], 1),
      phase("open", 500, 0.2, open),
      phase("open", 500, 0.2, open),
      phase("open", 500, 0.2, open),
    ],
  });
  return {
    schemaVersion: 1,
    captureKind: "publication",
    capturedAt: "2026-10-21T01:25:20.806Z",
    scenario: {
      id: "canonical_pages_v1",
      workloads: [{ id: "products", label: "Product grid" }],
    },
    host: { cpuModel: "Apple M4 Max" },
    source: { sourceSha256: "b".repeat(64) },
    engines: [
      {
        id: "proa",
        label: "Proa",
        workloads: { products: cell([17_838, 0.056], 0.23) },
      },
      {
        id: "react",
        label: "React",
        workloads: { products: cell([1_614, 0.635], 0.74) },
      },
    ],
  };
}

test("detects retained capture suites and rejects unknown JSON", () => {
  assert.equal(detectSuite(canonicalFixture()), "canonical");
  assert.equal(detectSuite({ benchmark_version: "product-scaling-v1" }), "product-scaling");
  assert.equal(detectSuite(pageLoadFixture()), "page-load");
  assert.equal(detectSuite({ scenario: { id: "cold_start_products_v1" } }), "cold-start");
  assert.throws(() => detectSuite({ scenario: { id: "other" } }), /unrecognized capture/);
  assert.throws(() => detectSuite(null), /missing/);
});

test("canonical comparison reports P50 and payload deltas with stable ratios", () => {
  const earlier = canonicalFixture();
  const later = canonicalFixture({
    capture_id: "canonical-test-b",
    captured_at: "2026-10-21T01:22:11.093Z",
    measurements: {
      proa: {
        cards: { p50_us: 2, output_bytes: 25_108 },
        products: { p50_us: 26.292, output_bytes: 284_908 },
      },
      react: {
        cards: { p50_us: 72.666, output_bytes: 25_202 },
        products: { p50_us: 404.25, output_bytes: 285_868 },
      },
    },
  });
  const comparison = compareCaptures(earlier, later);
  assert.equal(comparison.suite, "canonical");
  assert.equal(comparison.before.captureId, "canonical-test-a");
  assert.equal(comparison.after.captureId, "canonical-test-b");
  const reactCards = comparison.rows.find((row) => row.key === "react/cards/p50");
  assert.equal(reactCards.before, 70);
  assert.equal(reactCards.after, 72.666);
  assert.equal(reactCards.change, "regressed");
  assert.equal(formatRatio(reactCards.ratio), "1.04×");
  const proaCards = comparison.rows.find((row) => row.key === "proa/cards/p50");
  assert.equal(proaCards.change, "unchanged");
  assert.equal(formatValue(2, "us"), "2.00 µs");
  assert.equal(formatDelta(2.666, "us"), "+2.67 µs");
});

test("reports subjects that appear on only one side", () => {
  const earlier = canonicalFixture();
  const later = canonicalFixture({
    measurements: {
      proa: earlier.measurements.proa,
    },
  });
  const comparison = compareCaptures(earlier, later);
  assert.ok(comparison.removed.includes("react/cards/p50"));
  assert.equal(comparison.added.length, 0);
  assert.equal(comparison.rows.some((row) => row.subject === "React"), false);
});

test("refuses to join two different suites", () => {
  assert.throws(
    () => compareCaptures(canonicalFixture(), pageLoadFixture()),
    /cannot compare canonical with page-load/,
  );
});

test("page-load cells use the median of closed-loop phases", () => {
  const cells = extractCells(pageLoadFixture());
  const proa = cells.find((cell) => cell.key === "proa/products/rps");
  assert.equal(proa.value, 17_838);
  assert.equal(proa.better, "higher");
  const cpu = cells.find((cell) => cell.key === "react/products/cpu");
  assert.equal(cpu.value, 0.635);
  const later = pageLoadFixture();
  later.engines[0].workloads.products.phases[0].completionThroughputRps = 20_000;
  later.engines[0].workloads.products.phases[1].completionThroughputRps = 20_000;
  later.engines[0].workloads.products.phases[2].completionThroughputRps = 20_000;
  const comparison = compareCaptures(pageLoadFixture(), later);
  const rps = comparison.rows.find((row) => row.key === "proa/products/rps");
  assert.equal(rps.change, "improved");
  assert.equal(rps.after, 20_000);
});

test("product-scaling and cold-start extractors keep card counts and first-response P50s", () => {
  const scaling = {
    benchmark_version: "product-scaling-v1",
    counts: [12, 96],
    renderers: [{ id: "proa", label: "Proa" }],
    measurements: {
      proa: {
        12: { p50_us: 3.2 },
        96: { p50_us: 26.4 },
        768: { p50_us: 214 },
      },
    },
  };
  const scalingCells = extractCells(scaling);
  assert.deepEqual(
    scalingCells.map((cell) => cell.key),
    ["proa/12/p50", "proa/96/p50"],
  );
  const cold = {
    scenario: { id: "cold_start_products_v1", workload: { label: "Product grid" } },
    engines: [
      {
        id: "proa",
        label: "Proa",
        summary: { firstResponseMs: { p50: 3.99 }, rssAfterFirstResponseBytes: { p50: 4_500_000 } },
      },
    ],
  };
  const identity = captureIdentity(cold);
  assert.equal(identity.suite, "cold-start");
  assert.equal(extractCells(cold)[0].value, 3.99);
});

test("rejects non-finite measurements", () => {
  const broken = canonicalFixture();
  broken.measurements.proa.cards.p50_us = Number.NaN;
  assert.throws(() => extractCells(broken), /P50/);
});

test("Markdown names both captures and groups rows by metric", () => {
  const markdown = renderMarkdown(compareCaptures(
    canonicalFixture(),
    canonicalFixture({ capture_id: "canonical-test-b" }),
  ));
  assert.match(markdown, /canonical-test-a/);
  assert.match(markdown, /canonical-test-b/);
  assert.match(markdown, /## P50 render time/);
  assert.match(markdown, /## Payload bytes/);
  assert.match(markdown, /Same host: yes/);
});

test("CLI writes JSON or Markdown and fails on mixed suites", async () => {
  const directory = await mkdtemp(join(tmpdir(), "capture-delta-"));
  const earlier = join(directory, "earlier.json");
  const later = join(directory, "later.json");
  await writeFile(earlier, JSON.stringify(canonicalFixture()));
  await writeFile(later, JSON.stringify(canonicalFixture({ capture_id: "canonical-test-b" })));
  const { stdout } = await exec(process.execPath, [cli, earlier, later], { cwd: workspace });
  assert.match(stdout, /Capture comparison/);
  const chunks = [];
  const code = await main(["--json", earlier, later], {
    stdout: { write(chunk) { chunks.push(chunk); } },
    writeFile,
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(chunks.join(""));
  assert.equal(parsed.suite, "canonical");
  const outPath = join(directory, "delta.md");
  await main(["--out", outPath, earlier, later], { stdout: { write() {} }, writeFile });
  assert.match(await readFile(outPath, "utf8"), /canonical-test-b/);
  await assert.rejects(
    exec(process.execPath, [cli, earlier, join(workspace, "page-load/results/latest.json")]),
    /cannot compare canonical with page-load/,
  );
});

test("CLI help and argument parsing reject unknown flags", () => {
  assert.match(usage(), /two retained captures/);
  assert.deepEqual(parseArgs(["--json", "a.json", "b.json"]).paths, ["a.json", "b.json"]);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
  assert.throws(() => parseArgs(["--suite", "http"]), /must be one of/);
});

test("compares the retained September and October canonical archives", async () => {
  const { stdout } = await exec(process.execPath, [
    cli,
    "rendering/results/archive/canonical-ssr-v1-2026-09-05-9363fc29b790.json",
    "rendering/results/latest.json",
  ], { cwd: workspace, maxBuffer: 2 * 1024 * 1024 });
  assert.match(stdout, /canonical-ssr-v1-2026-09-05-9363fc29b790/);
  assert.match(stdout, /canonical-ssr-v1-2026-10-21-77c5c5fce085/);
  assert.match(stdout, /P50 render time/);
  assert.match(stdout, /Proa/);
});
