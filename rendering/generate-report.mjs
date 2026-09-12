#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertReadmeCurrent,
  renderDetailedReport,
  updateReadme,
  validateCanonicalResult,
} from "./canonical/report.mjs";

const renderingDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = dirname(renderingDirectory);
const resultPath = join(renderingDirectory, "results", "latest.json");
const reportPath = join(renderingDirectory, "results", "latest.md");
const productScalingPath = join(
  renderingDirectory,
  "results",
  "product-scaling.json",
);
// The canonical blocks live in scoreboard.md; the product-scaling and archived
// blocks live in engineering.md. report.mjs replaces every marker pair in one
// string, so the two pages are joined for generation and split for writing.
const scoreboardPath = join(workspaceDirectory, "scoreboard.md");
const engineeringPath = join(workspaceDirectory, "engineering.md");
const pageBreak = "\n<!-- generate-report:page-break -->\n";
const historicalReportPath = join(
  workspaceDirectory,
  "archive",
  "public-report-2026-08-31.md",
);
const roster = JSON.parse(
  readFileSync(join(renderingDirectory, "canonical", "roster.json"), "utf8"),
);
const workloads = JSON.parse(
  readFileSync(join(renderingDirectory, "canonical", "workloads.json"), "utf8"),
);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const productScaling = JSON.parse(readFileSync(productScalingPath, "utf8"));
const historicalReport = readFileSync(historicalReportPath, "utf8");

const productScalingStart = "<!-- product-scaling:start -->";
const productScalingEnd = "<!-- product-scaling:end -->";

function formatDuration(microseconds) {
  return microseconds >= 1_000
    ? `${(microseconds / 1_000).toFixed(3)} ms`
    : `${microseconds.toFixed(3)} µs`;
}

function renderProductScaling(capture) {
  if (
    capture.schema_version !== 1 ||
    capture.benchmark_version !== "product-scaling-v1" ||
    capture.capture_kind !== "engineering" ||
    capture.status !== "pass"
  ) {
    throw new Error("product-scaling result is not a completed engineering capture");
  }
  const counts = capture.counts ?? [];
  if (counts.length === 0 || new Set(counts).size !== counts.length) {
    throw new Error("product-scaling result has an invalid count roster");
  }
  const rows = capture.renderers.map((renderer) => {
    const cells = counts.map((count) => {
      const measurement = capture.measurements?.[renderer.id]?.[count];
      if (!Number.isFinite(measurement?.p50_us) || measurement.p50_us <= 0) {
        throw new Error(`product-scaling result is missing ${renderer.id}/${count}`);
      }
      if (capture.parity?.[renderer.id]?.[count]?.status !== "pass") {
        throw new Error(`product-scaling parity did not pass for ${renderer.id}/${count}`);
      }
      return formatDuration(measurement.p50_us);
    });
    return `| ${renderer.label} | ${cells.join(" | ")} |`;
  });
  const firstMeasurement =
    capture.measurements[capture.renderers[0].id][counts[0]];
  const processCount = firstMeasurement.independent_processes;
  const samples = counts.map(
    (count) => capture.measurements[capture.renderers[0].id][count].samples_per_process,
  );
  const capturedDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(capture.captured_at));
  const headings = counts.map((count) => `${count} cards P50`);

  return `${productScalingStart}
## Product-grid scaling capture

This ${capturedDate} UTC engineering capture repeats the canonical product-grid
contract at ${counts.slice(0, -1).join(", ")}, and ${counts.at(-1)} cards. Every value includes component/template
execution and a fresh independently owned response; deterministic input
construction remains outside timing. All ${capture.renderers.length * counts.length} renderer/size cells passed the same
semantic-DOM parity gate used by the canonical scoreboard. Each cell below is
the median of ${processCount} independent process P50s, using ${samples.slice(0, -1).join(", ")}, and ${samples.at(-1)} measured
renders per process respectively.

| Renderer | ${headings.join(" | ")} |
| --- | ${counts.map(() => "---:").join(" | ")} |
${rows.join("\n")}

The ${counts[1]}-card column is an independent engineering capture, not a replacement
for the canonical result. Reproduce the matrix with
\`./rendering/run-all --product-scaling\`; the retained summary and per-process
measurements are in [\`rendering/results/product-scaling.json\`](rendering/results/product-scaling.json)
and [its raw process artifact](rendering/results/${capture.raw_artifact}).
${productScalingEnd}`;
}

function updateProductScaling(readme, capture) {
  const block = renderProductScaling(capture);
  const markedStart = readme.indexOf(productScalingStart);
  const markedEnd = readme.indexOf(productScalingEnd);
  if (markedStart !== -1 || markedEnd !== -1) {
    if (markedStart === -1 || markedEnd < markedStart) {
      throw new Error("engineering.md has unmatched product-scaling markers");
    }
    return `${readme.slice(0, markedStart)}${block}${readme.slice(markedEnd + productScalingEnd.length)}`;
  }
  const heading = "## Product-grid scaling capture";
  const nextHeading = "## Client JavaScript reference";
  const start = readme.indexOf(heading);
  const end = readme.indexOf(nextHeading, start);
  if (start === -1 || end === -1) {
    throw new Error("engineering.md product-scaling section could not be located");
  }
  return `${readme.slice(0, start)}${block}\n\n${readme.slice(end)}`;
}

validateCanonicalResult(result, roster, workloads);
if (result.capture_kind === "canonical") {
  const archivePath = join(
    renderingDirectory,
    "results",
    "archive",
    `${result.capture_id}.json`,
  );
  if (
    !existsSync(archivePath) ||
    readFileSync(archivePath, "utf8") !== readFileSync(resultPath, "utf8")
  ) {
    throw new Error("latest.json does not have an identical capture archive");
  }
}
for (const artifact of result.raw_artifacts) {
  const artifactPath = join(renderingDirectory, "results", artifact.path);
  if (!existsSync(artifactPath)) {
    throw new Error(`declared raw artifact is missing: ${artifact.path}`);
  }
}
const detailed = `${
  renderDetailedReport(result, roster, workloads).trimEnd()
}\n`;
const currentPages = [scoreboardPath, engineeringPath]
  .map((path) => readFileSync(path, "utf8"))
  .join(pageBreak);
const canonicalPages = updateReadme(
  currentPages,
  result,
  roster,
  workloads,
  historicalReport,
);
const generatedPages = updateProductScaling(canonicalPages, productScaling);

if (process.argv.includes("--check")) {
  if (readFileSync(reportPath, "utf8") !== detailed) {
    throw new Error(
      "rendering/results/latest.md is stale; run node rendering/generate-report.mjs",
    );
  }
  assertReadmeCurrent(
    currentPages,
    result,
    roster,
    workloads,
    historicalReport,
  );
  if (generatedPages !== currentPages) {
    throw new Error(
      "engineering.md product-scaling section is stale; run node rendering/generate-report.mjs",
    );
  }
  console.log(
    "Canonical result, detailed report, scoreboard.md, and engineering.md are complete and synchronized.",
  );
} else {
  const pages = generatedPages.split(pageBreak);
  if (pages.length !== 2) {
    throw new Error("generated pages lost their page break");
  }
  writeFileSync(reportPath, detailed);
  writeFileSync(scoreboardPath, pages[0]);
  writeFileSync(engineeringPath, pages[1]);
  console.log(`Generated ${reportPath} and synchronized ${scoreboardPath} and ${engineeringPath}.`);
}
