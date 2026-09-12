import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertReadmeCurrent,
  renderHistoricalResults,
  renderReadmeDetails,
  renderScoreboard,
  updateReadme,
  validateCanonicalResult,
} from "./report.mjs";
import {
  renderingSourceFiles,
  renderingSourceFingerprint,
} from "./source_fingerprint.mjs";

const canonicalDirectory = dirname(fileURLToPath(import.meta.url));
const renderingDirectory = dirname(canonicalDirectory);
const workspaceDirectory = dirname(renderingDirectory);
const roster = JSON.parse(
  readFileSync(join(canonicalDirectory, "roster.json"), "utf8"),
);
const workloads = JSON.parse(
  readFileSync(join(canonicalDirectory, "workloads.json"), "utf8"),
);
const historicalFixture = [
  "# Archived report",
  "",
  "## Raw results — test capture",
  "",
  "| Experiment | Value |",
  "| --- | ---: |",
  "| Legacy fixture | 12.3 µs |",
].join("\n");

function readmeTemplate() {
  return `# Test

<!-- canonical-scoreboard:start -->
stale
<!-- canonical-scoreboard:end -->

<!-- canonical-coverage:start -->
stale
<!-- canonical-coverage:end -->

<!-- canonical-details:start -->
stale
<!-- canonical-details:end -->

<!-- historical-results:start -->
stale
<!-- historical-results:end -->
`;
}

function fixture() {
  const captureId = "canonical-test-capture";
  const included = new Set(["proa", "react"]);
  const result = {
    schema_version: 2,
    benchmark_version: "canonical-ssr-v1",
    capture_id: captureId,
    capture_kind: "historical_partial",
    status: "pass",
    captured_at: "2026-08-31T19:52:49.022Z",
    completed_at: "2026-08-31T19:53:49.022Z",
    host: {
      cpu_model: "Test CPU",
      logical_cpus: 8,
      memory_bytes: 1,
      architecture: "arm64",
      os_name: "Test OS",
      os_release: "1",
    },
    workloads: structuredClone(workloads.workloads),
    renderers: roster.renderers.map(({ id, label, language }) => ({
      id,
      label,
      language,
      status: included.has(id) ? "included" : "in_progress",
      ...(included.has(id) ? {} : { reason: "No unified capture yet." }),
    })),
    parity: {},
    measurements: {},
    versions: { Proa: "1", React: "1", Test: "1" },
    provenance: { harness_commit: "abc", dirty: false },
    commands: ["./rendering/run-all"],
    limitations: ["test"],
    raw_artifacts: [{ label: "test", path: "test.json" }],
  };
  for (const rendererId of included) {
    result.parity[rendererId] = {};
    result.measurements[rendererId] = {};
    for (const [index, workload] of workloads.workloads.entries()) {
      const multiplier = rendererId === "proa" ? 1 : 10;
      const outputBytes = 1_000 + index + (rendererId === "proa" ? 0 : 10);
      result.parity[rendererId][workload.id] = {
        status: "pass",
        mode: "semantic DOM",
        canonical_sha256: "a".repeat(64),
        output_bytes: outputBytes,
        payload_delta_bytes: rendererId === "proa" ? 0 : 10,
        byte_equal_to_proa: rendererId === "proa",
      };
      result.measurements[rendererId][workload.id] = {
        capture_id: captureId,
        p50_us: (index + 1) * multiplier,
        p95_us: (index + 2) * multiplier,
        p99_us: (index + 3) * multiplier,
        mean_us: (index + 1.5) * multiplier,
        process_p50_min_us: (index + 0.9) * multiplier,
        process_p50_max_us: (index + 1.1) * multiplier,
        output_bytes: outputBytes,
        independent_processes: 5,
        samples_per_process: 100,
        warmups_per_process: 10,
        allocation_policy: "fresh independently owned string",
      };
    }
  }
  return result;
}

test("validates a complete included roster subset with explicit coverage states", () => {
  assert.equal(
    validateCanonicalResult(fixture(), roster, workloads).capture_id,
    "canonical-test-capture",
  );
});

test("fails when an included renderer silently loses a workload", () => {
  const result = fixture();
  delete result.measurements.react.products;
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /react\/products measurement is missing/,
  );
});

test("fails when parity evidence is missing", () => {
  const result = fixture();
  delete result.parity.react.table;
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /react\/table parity pass is missing/,
  );
});

test("fails when a public number comes from another capture", () => {
  const result = fixture();
  result.measurements.react.cards.capture_id = "another-capture";
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /different capture/,
  );
});

test("fails when an expected renderer disappears", () => {
  const result = fixture();
  result.renderers = result.renderers.filter(({ id }) => id !== "jinja2");
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /roster entries missing: jinja2/,
  );
});

test("fails when the captured workload manifest changes", () => {
  const result = fixture();
  result.workloads.pop();
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /workload manifest/,
  );
});

test("fails when parity payload metadata disagrees with timing", () => {
  const result = fixture();
  result.parity.react.cards.output_bytes += 1;
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /payload sizes differ/,
  );
});

test("fails when an included renderer declares reused output", () => {
  const result = fixture();
  result.measurements.react.cards.allocation_policy = "reused pooled output";
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /independently owned output/,
  );
});

test("a canonical capture cannot silently retain in-progress adapters", () => {
  const result = fixture();
  result.capture_kind = "canonical";
  assert.throws(
    () => validateCanonicalResult(result, roster, workloads),
    /is not included in a canonical capture/,
  );
});

test("renders exactly one Proa headline row", () => {
  const markdown = renderScoreboard(fixture(), roster, workloads);
  assert.equal((markdown.match(/^\| Proa \|/gm) ?? []).length, 1);
  assert.equal(markdown.includes("Memcpy"), false);
  assert.equal(markdown.includes("fresh owned"), false);
});

test("README synchronization rejects manually changed public values", () => {
  const current = updateReadme(
    readmeTemplate(),
    fixture(),
    roster,
    workloads,
    historicalFixture,
  );
  assert.doesNotThrow(() =>
    assertReadmeCurrent(
      current,
      fixture(),
      roster,
      workloads,
      historicalFixture,
    )
  );
  assert.throws(
    () =>
      assertReadmeCurrent(
        current.replace("10.0 µs", "11.0 µs"),
        fixture(),
        roster,
        workloads,
        historicalFixture,
      ),
    /generated result sections are stale/,
  );
});

test("README synchronization rejects a second manual result table", () => {
  const current = updateReadme(
    readmeTemplate(),
    fixture(),
    roster,
    workloads,
    historicalFixture,
  );
  const duplicate =
    `${current}\n| Renderer | Component page | 1,000-row table | Product grid |\n| --- | ---: | ---: | ---: |\n| Proa | 99 µs · 1.00× | 99 µs · 1.00× | 99 µs · 1.00× |\n`;
  assert.throws(
    () =>
      assertReadmeCurrent(
        duplicate,
        fixture(),
        roster,
        workloads,
        historicalFixture,
      ),
    /exactly one public rendering scoreboard|outside latest.json/,
  );
});

test("README embeds canonical details and historical result tables", () => {
  const details = renderReadmeDetails(fixture(), roster, workloads);
  assert.match(details, /### Detailed measurements/);
  assert.match(details, /\| Renderer \| Workload \| P50 \| P95 \| P99 \| Mean \|/);
  assert.match(details, /### Renderer and runtime versions/);
  assert.match(details, /\| React \| Component page \|/);

  const history = renderHistoricalResults(historicalFixture);
  assert.match(history, /### Raw results — test capture/);
  assert.match(history, /\| Legacy fixture \| 12\.3 µs \|/);
});

test("the retained latest artifact is complete when present", () => {
  const latestPath = join(renderingDirectory, "results", "latest.json");
  const latest = JSON.parse(readFileSync(latestPath, "utf8"));
  assert.doesNotThrow(() => validateCanonicalResult(latest, roster, workloads));
  // generate-report.mjs joins scoreboard.md and engineering.md with this
  // break, replaces every marker pair, and splits them again to write.
  const pages = ["scoreboard.md", "engineering.md"]
    .map((name) => readFileSync(join(workspaceDirectory, name), "utf8"))
    .join("\n<!-- generate-report:page-break -->\n");
  const historicalReport = readFileSync(
    join(workspaceDirectory, "archive", "public-report-2026-08-31.md"),
    "utf8",
  );
  assert.doesNotThrow(() =>
    assertReadmeCurrent(pages, latest, roster, workloads, historicalReport)
  );
});

test("the retained capture has one parity pass per roster/workload cell", () => {
  const latestPath = join(renderingDirectory, "results", "latest.json");
  const latest = JSON.parse(readFileSync(latestPath, "utf8"));
  const passes = latest.renderers.reduce(
    (count, renderer) =>
      count + Object.values(latest.parity[renderer.id] ?? {}).filter(
        ({ status }) => status === "pass",
      ).length,
    0,
  );
  assert.equal(passes, latest.renderers.length * workloads.workloads.length);
});

test("source fingerprints ignore generated files but include source edits", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "proa-source-fingerprint-"));
  try {
    mkdirSync(join(sandbox, "rendering", "canonical"), { recursive: true });
    mkdirSync(join(sandbox, "rendering", "external", "jte", ".gradle"), {
      recursive: true,
    });
    writeFileSync(
      join(sandbox, ".gitignore"),
      "rendering/external/**/.gradle/\n",
    );
    writeFileSync(join(sandbox, "package.json"), "{}\n");
    const sourcePath = join(sandbox, "rendering", "canonical", "run.mjs");
    writeFileSync(sourcePath, "export const value = 1;\n");
    execFileSync("git", ["init", "--quiet"], { cwd: sandbox });
    execFileSync(
      "git",
      ["add", ".gitignore", "package.json", "rendering/canonical/run.mjs"],
      { cwd: sandbox },
    );

    const initial = renderingSourceFingerprint(sandbox);
    writeFileSync(
      join(sandbox, "rendering", "external", "jte", ".gradle", "cache.bin"),
      "generated\n",
    );
    assert.equal(renderingSourceFingerprint(sandbox), initial);
    assert.deepEqual(renderingSourceFiles(sandbox), [
      "package.json",
      "rendering/canonical/run.mjs",
    ]);

    writeFileSync(sourcePath, "export const value = 2;\n");
    assert.notEqual(renderingSourceFingerprint(sandbox), initial);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
