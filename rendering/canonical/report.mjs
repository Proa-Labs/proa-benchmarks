import { createHash } from "node:crypto";

export const SCOREBOARD_START = "<!-- canonical-scoreboard:start -->";
export const SCOREBOARD_END = "<!-- canonical-scoreboard:end -->";
export const COVERAGE_START = "<!-- canonical-coverage:start -->";
export const COVERAGE_END = "<!-- canonical-coverage:end -->";
export const DETAILS_START = "<!-- canonical-details:start -->";
export const DETAILS_END = "<!-- canonical-details:end -->";
export const HISTORY_START = "<!-- historical-results:start -->";
export const HISTORY_END = "<!-- historical-results:end -->";

function fail(message) {
  throw new Error(`canonical result is incomplete: ${message}`);
}

export function validateCanonicalResult(result, roster, workloadManifest) {
  if (result.schema_version !== 2) fail("schema_version must be 2");
  if (result.benchmark_version !== "canonical-ssr-v1") {
    fail("benchmark_version must be canonical-ssr-v1");
  }
  if (typeof result.capture_id !== "string" || result.capture_id.length < 8) {
    fail("capture_id is missing");
  }
  if (!result.captured_at || Number.isNaN(Date.parse(result.captured_at))) {
    fail("captured_at is invalid");
  }
  if (result.status !== "pass") fail("status must be pass");
  if (!new Set(["canonical", "historical_partial"]).has(result.capture_kind)) {
    fail("capture_kind must be canonical or historical_partial");
  }
  if (
    result.capture_kind === "canonical" &&
    (!result.completed_at || Number.isNaN(Date.parse(result.completed_at)) ||
      Date.parse(result.completed_at) < Date.parse(result.captured_at))
  ) {
    fail("completed_at is missing or invalid");
  }

  const expectedRendererIds = roster.renderers.map(({ id }) => id);
  const expectedWorkloadIds = workloadManifest.workloads.map(({ id }) => id);
  const resultWorkloadIds = (result.workloads ?? []).map(({ id }) => id);
  if (
    JSON.stringify(resultWorkloadIds) !== JSON.stringify(expectedWorkloadIds)
  ) {
    fail("workload manifest is missing, reordered, or unexpected");
  }
  for (const expected of workloadManifest.workloads) {
    const actual = result.workloads.find(({ id }) => id === expected.id);
    if (
      actual.label !== expected.label ||
      actual.description !== expected.description
    ) {
      fail(
        `${expected.id} workload definition differs from the canonical manifest`,
      );
    }
  }
  const rendererIds = result.renderers.map(({ id }) => id);
  if (new Set(rendererIds).size !== rendererIds.length) {
    fail("renderer IDs are duplicated");
  }
  if (rendererIds.filter((id) => id === "proa").length !== 1) {
    fail("Proa must have exactly one renderer entry");
  }
  const proa = result.renderers.find(({ id }) => id === "proa");
  if (proa?.label !== "Proa") {
    fail("the public Proa label must be exactly `Proa`");
  }

  const missingRenderers = expectedRendererIds.filter((id) =>
    !rendererIds.includes(id)
  );
  const unexpectedRenderers = rendererIds.filter((id) =>
    !expectedRendererIds.includes(id)
  );
  if (missingRenderers.length > 0) {
    fail(`roster entries missing: ${missingRenderers.join(", ")}`);
  }
  if (unexpectedRenderers.length > 0) {
    fail(`unexpected renderers: ${unexpectedRenderers.join(", ")}`);
  }
  for (const definition of roster.renderers) {
    const renderer = result.renderers.find(({ id }) => id === definition.id);
    if (
      renderer.label !== definition.label ||
      renderer.language !== definition.language
    ) {
      fail(`${definition.id} label or language differs from the fixed roster`);
    }
  }

  const statuses = new Set(["included", "in_progress", "excluded"]);
  for (const renderer of result.renderers) {
    if (!statuses.has(renderer.status)) {
      fail(`${renderer.id} has invalid status ${renderer.status}`);
    }
    if (renderer.status !== "included" && !renderer.reason) {
      fail(
        `${renderer.id} ${renderer.status} status requires a concrete reason`,
      );
    }
    if (result.capture_kind === "canonical" && renderer.status !== "included") {
      fail(`${renderer.id} is not included in a canonical capture`);
    }
    const measurements = result.measurements?.[renderer.id] ?? {};
    const parity = result.parity?.[renderer.id] ?? {};
    if (renderer.status === "included") {
      for (const workloadId of expectedWorkloadIds) {
        const measurement = measurements[workloadId];
        if (!measurement) {
          fail(`${renderer.id}/${workloadId} measurement is missing`);
        }
        if (measurement.capture_id !== result.capture_id) {
          fail(`${renderer.id}/${workloadId} comes from a different capture`);
        }
        for (
          const field of [
            "p50_us",
            "p95_us",
            "p99_us",
            "mean_us",
            "process_p50_min_us",
            "process_p50_max_us",
            "output_bytes",
            "independent_processes",
            "samples_per_process",
            "warmups_per_process",
          ]
        ) {
          if (!Number.isFinite(measurement[field])) {
            fail(
              `${renderer.id}/${workloadId} ${field} is missing or non-numeric`,
            );
          }
        }
        if (measurement.p50_us <= 0 || measurement.output_bytes <= 0) {
          fail(
            `${renderer.id}/${workloadId} contains a non-positive public value`,
          );
        }
        if (parity[workloadId]?.status !== "pass") {
          fail(`${renderer.id}/${workloadId} parity pass is missing`);
        }
        if (parity[workloadId].mode !== "semantic DOM") {
          fail(`${renderer.id}/${workloadId} parity mode is not semantic DOM`);
        }
        if (!/^[a-f0-9]{64}$/.test(parity[workloadId].canonical_sha256 ?? "")) {
          fail(`${renderer.id}/${workloadId} canonical DOM digest is invalid`);
        }
        if (parity[workloadId].output_bytes !== measurement.output_bytes) {
          fail(
            `${renderer.id}/${workloadId} parity and measurement payload sizes differ`,
          );
        }
        if (
          typeof measurement.allocation_policy !== "string" ||
          !measurement.allocation_policy
        ) {
          fail(
            `${renderer.id}/${workloadId} output ownership policy is missing`,
          );
        }
        if (/reus|pool|cached output/i.test(measurement.allocation_policy)) {
          fail(
            `${renderer.id}/${workloadId} does not return independently owned output`,
          );
        }
      }
      const extraMeasurements = Object.keys(measurements).filter((id) =>
        !expectedWorkloadIds.includes(id)
      );
      if (extraMeasurements.length > 0) {
        fail(
          `${renderer.id} has unexpected workloads: ${
            extraMeasurements.join(", ")
          }`,
        );
      }
      const extraParity = Object.keys(parity).filter((id) =>
        !expectedWorkloadIds.includes(id)
      );
      if (extraParity.length > 0) {
        fail(
          `${renderer.id} has unexpected parity workloads: ${
            extraParity.join(", ")
          }`,
        );
      }
    } else if (Object.keys(measurements).length > 0) {
      fail(`${renderer.id} is ${renderer.status} but has public measurements`);
    }
  }

  for (const rendererId of Object.keys(result.measurements ?? {})) {
    if (!rendererIds.includes(rendererId)) {
      fail(`measurement has unexpected renderer ${rendererId}`);
    }
  }
  for (const rendererId of Object.keys(result.parity ?? {})) {
    if (!rendererIds.includes(rendererId)) {
      fail(`parity has unexpected renderer ${rendererId}`);
    }
  }

  const proaRows = expectedWorkloadIds.filter((id) =>
    result.measurements?.proa?.[id]
  );
  if (
    proa.status === "included" && proaRows.length !== expectedWorkloadIds.length
  ) {
    fail("Proa must have exactly one complete public row");
  }
  for (const workloadId of expectedWorkloadIds) {
    if (proa.status !== "included") break;
    const baseline = result.parity.proa[workloadId];
    if (
      baseline.payload_delta_bytes !== 0 || baseline.byte_equal_to_proa !== true
    ) {
      fail(`Proa/${workloadId} must be its own exact-byte baseline`);
    }
    for (
      const renderer of result.renderers.filter(({ status }) =>
        status === "included"
      )
    ) {
      const cell = result.parity[renderer.id][workloadId];
      if (cell.canonical_sha256 !== baseline.canonical_sha256) {
        fail(
          `${renderer.id}/${workloadId} canonical DOM digest differs from Proa`,
        );
      }
      const expectedDelta = cell.output_bytes - baseline.output_bytes;
      if (cell.payload_delta_bytes !== expectedDelta) {
        fail(`${renderer.id}/${workloadId} payload delta is inconsistent`);
      }
    }
  }
  if (
    !result.host?.cpu_model || !result.host?.os_name ||
    !result.host?.os_release || !result.host?.architecture ||
    !Number.isInteger(result.host?.logical_cpus) ||
    !Number.isFinite(result.host?.memory_bytes)
  ) {
    fail("host metadata is incomplete");
  }
  if (!result.versions || Object.keys(result.versions).length === 0) {
    fail("version metadata is missing");
  }
  for (
    const renderer of result.renderers.filter(({ status }) =>
      status === "included"
    )
  ) {
    if (!result.versions[renderer.label]) {
      fail(`${renderer.id} framework/runtime version is missing`);
    }
  }
  if (!Array.isArray(result.commands) || result.commands.length === 0) {
    fail("reproduction commands are missing");
  }
  if (!Array.isArray(result.limitations)) fail("limitations are missing");
  if (
    !Array.isArray(result.raw_artifacts) || result.raw_artifacts.length === 0
  ) {
    fail("raw artifact links are missing");
  }
  return result;
}

function orderedIncluded(result, roster) {
  const byId = new Map(
    result.renderers.map((renderer) => [renderer.id, renderer]),
  );
  return roster.renderers.map(({ id }) => byId.get(id)).filter(({ status }) =>
    status === "included"
  );
}

function prettyDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function unitForWorkload(result, renderers, workloadId) {
  const maximum = Math.max(
    ...renderers.map(({ id }) => result.measurements[id][workloadId].p50_us),
  );
  return maximum >= 1_000 ? "ms" : "µs";
}

function duration(valueUs, unit) {
  const value = unit === "ms" ? valueUs / 1_000 : valueUs;
  const digits = value < 0.1 ? 3 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${unit}`;
}

function ratio(value) {
  if (Math.abs(value - 1) < 1e-9) return "1.00×";
  if (value < 10) return `${value.toFixed(2)}×`;
  if (value < 100) return `${value.toFixed(1)}×`;
  return `${value.toFixed(0)}×`;
}

export function renderTakeaway(result, roster, workloadManifest) {
  const includedIds = new Set(
    orderedIncluded(result, roster).map(({ id }) => id),
  );
  const peerId = includedIds.has("react")
    ? "react"
    : roster.renderers.find(({ id }) => id !== "proa" && includedIds.has(id))
      ?.id;
  if (!peerId || !includedIds.has("proa")) {
    return `On these workloads, the ${
      prettyDate(result.captured_at)
    } capture on ${result.host.cpu_model} contains no eligible Proa-to-peer ratio.`;
  }
  const peer = result.renderers.find(({ id }) => id === peerId);
  const comparisons = workloadManifest.workloads.map(({ id, label }) => {
    const proaValue = result.measurements.proa[id].p50_us;
    const peerValue = result.measurements[peerId][id].p50_us;
    return `the ${label.toLowerCase()} ${
      ratio(peerValue / proaValue)
    } faster than ${peer.label}`;
  });
  return `On these workloads, the ${
    prettyDate(result.captured_at)
  } capture on ${result.host.cpu_model} measured Proa rendering ${
    comparisons[0]
  }, ${comparisons[1]}, and ${
    comparisons[2]
  }. These ratios describe this capture, not every application.`;
}

export function renderScoreboard(result, roster, workloadManifest) {
  validateCanonicalResult(result, roster, workloadManifest);
  const renderers = orderedIncluded(result, roster);
  const units = Object.fromEntries(
    workloadManifest.workloads.map((
      { id },
    ) => [id, unitForWorkload(result, renderers, id)]),
  );
  const headings = workloadManifest.workloads.map(({ label }) => label);
  const lines = [`${SCOREBOARD_START}`];
  if (result.capture_kind === "historical_partial") {
    lines.push(
      "",
      "> **Historical unified-core capture.** The included rows came from one parity-gated run. Newly ported adapters remain in progress until the expanded roster is rerun; no older values were inserted.",
    );
  }
  lines.push(
    "",
    `**${
      prettyDate(result.captured_at)
    } · ${result.host.cpu_model} · ${result.host.os_name}**`,
    "",
    renderTakeaway(result, roster, workloadManifest),
    "",
    "> Lower is better. Every listed renderer produced an equivalent page and passed the parity gate.",
    "",
    "Each cell is `P50 render time · relative to Proa`.",
    "",
    `| Renderer | ${headings.join(" | ")} |`,
    `| --- | ${headings.map(() => "---:").join(" | ")} |`,
  );
  for (const renderer of renderers) {
    const cells = workloadManifest.workloads.map(({ id }) => {
      const measurement = result.measurements[renderer.id][id];
      const baseline = result.measurements.proa[id].p50_us;
      return `${duration(measurement.p50_us, units[id])} · ${
        ratio(measurement.p50_us / baseline)
      }`;
    });
    lines.push(`| ${renderer.label} | ${cells.join(" | ")} |`);
  }
  lines.push(
    "",
    `Rows use the fixed order in [the canonical roster](rendering/canonical/roster.json); columns are never ranked independently.`,
    SCOREBOARD_END,
  );
  return `${lines.join("\n")}\n`;
}

export function renderCoverage(result, roster, workloadManifest) {
  validateCanonicalResult(result, roster, workloadManifest);
  const byId = new Map(
    result.renderers.map((renderer) => [renderer.id, renderer]),
  );
  const lines = [
    COVERAGE_START,
    "| Renderer | Status | Detail |",
    "| --- | --- | --- |",
  ];
  for (const definition of roster.renderers) {
    const renderer = byId.get(definition.id);
    const status = {
      included: "Included",
      in_progress: "In progress",
      excluded: "Excluded",
    }[renderer.status];
    const detail = renderer.status === "included"
      ? `All ${workloadManifest.workloads.length} workloads passed parity in this capture.`
      : renderer.reason;
    lines.push(`| ${renderer.label} | ${status} | ${detail} |`);
  }
  lines.push(COVERAGE_END);
  return `${lines.join("\n")}\n`;
}

function replaceSection(markdown, start, end, replacement) {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `README markers ${start} / ${end} are missing or out of order`,
    );
  }
  return `${markdown.slice(0, startIndex)}${replacement.trimEnd()}${
    markdown.slice(endIndex + end.length)
  }`;
}

export function renderReadmeDetails(result, roster, workloadManifest) {
  const report = renderDetailedReport(result, roster, workloadManifest);
  const lines = report.split("\n");
  const metadataStart = lines.findIndex((line) => line.startsWith("- Capture:"));
  const scoreboardStart = lines.indexOf("## Public scoreboard");
  const detailsStart = lines.indexOf("## Detailed measurements");
  if (metadataStart === -1 || scoreboardStart === -1 || detailsStart === -1) {
    throw new Error("detailed canonical report is missing an expected section");
  }

  const metadata = lines.slice(metadataStart, scoreboardStart);
  while (metadata.at(-1) === "") metadata.pop();
  const details = lines.slice(detailsStart).map((line) => {
    const demoted = line.startsWith("## ") ? `### ${line.slice(3)}` : line;
    return demoted
      .replace(/\]\(raw\//g, "](rendering/results/raw/")
      .replace(/\]\(\.\.\//g, "](rendering/");
  });

  return [
    DETAILS_START,
    "### Capture metadata",
    "",
    ...metadata,
    "",
    ...details,
    DETAILS_END,
    "",
  ].join("\n");
}

export function renderHistoricalResults(historicalReport) {
  const sectionStart = historicalReport.indexOf("## Raw results");
  if (sectionStart === -1) {
    throw new Error("historical report has no raw-results section");
  }
  const body = historicalReport.slice(sectionStart).trim().split("\n").map(
    (line) => {
      const demoted = /^(#{2,5}) /.test(line) ? `#${line}` : line;
      return demoted.replace(/\]\(\.\.\//g, "](");
    },
  );
  const supersededMatrix = body.indexOf(
    "##### Representative core matrix: seven renderers plus a memcpy floor",
  );
  if (supersededMatrix !== -1) {
    body.splice(
      supersededMatrix + 1,
      0,
      "",
      "> **Superseded capture.** This matrix predates the current 17-renderer run above. It remains here for process-to-process history and the memcpy control; do not use it as the current scoreboard.",
    );
  }
  return [
    HISTORY_START,
    "> **Historical and engineering evidence.** The tables below retain their original fixtures and measurement boundaries. Do not compare them with the current canonical scoreboard unless a section explicitly says it uses the same contract. The superseded seven-renderer matrix and the non-parity-gated cross-language loop are preserved as dated evidence, not current rankings.",
    "",
    ...body,
    HISTORY_END,
    "",
  ].join("\n");
}

export function updateReadme(
  readme,
  result,
  roster,
  workloadManifest,
  historicalReport,
) {
  let updated = replaceSection(
    readme,
    SCOREBOARD_START,
    SCOREBOARD_END,
    renderScoreboard(result, roster, workloadManifest),
  );
  updated = replaceSection(
    updated,
    COVERAGE_START,
    COVERAGE_END,
    renderCoverage(result, roster, workloadManifest),
  );
  updated = replaceSection(
    updated,
    DETAILS_START,
    DETAILS_END,
    renderReadmeDetails(result, roster, workloadManifest),
  );
  updated = replaceSection(
    updated,
    HISTORY_START,
    HISTORY_END,
    renderHistoricalResults(historicalReport),
  );
  return updated.endsWith("\n") ? updated : `${updated}\n`;
}

export function assertReadmeCurrent(
  readme,
  result,
  roster,
  workloadManifest,
  historicalReport,
) {
  for (
    const marker of [
      SCOREBOARD_START,
      SCOREBOARD_END,
      COVERAGE_START,
      COVERAGE_END,
      DETAILS_START,
      DETAILS_END,
      HISTORY_START,
      HISTORY_END,
    ]
  ) {
    if (readme.split(marker).length !== 2) {
      throw new Error(`README must contain exactly one ${marker} marker`);
    }
  }
  const expected = updateReadme(
    readme,
    result,
    roster,
    workloadManifest,
    historicalReport,
  );
  if (expected !== readme) {
    throw new Error(
      "README generated result sections are stale or were edited; regenerate it",
    );
  }
  const scoreboard = readme.slice(
    readme.indexOf(SCOREBOARD_START),
    readme.indexOf(SCOREBOARD_END) + SCOREBOARD_END.length,
  );
  const proaRows = scoreboard.match(/^\| Proa \|/gm) ?? [];
  if (proaRows.length !== 1) {
    throw new Error("the headline table must contain exactly one Proa row");
  }
  const scoreboardHeaders = readme.match(
    /^\| Renderer \| Component page \| 1,000-row table \| Product grid \|$/gm,
  ) ?? [];
  if (scoreboardHeaders.length !== 1) {
    throw new Error(
      "README must contain exactly one public rendering scoreboard",
    );
  }
  const outsideScoreboard = readme.replace(scoreboard, "");
  if (/\b(?:µs|ms)\s+·\s+\d+(?:\.\d+)?×/.test(outsideScoreboard)) {
    throw new Error("README contains a renderer result outside latest.json");
  }
}

function detailedDuration(value) {
  return value >= 1_000
    ? `${(value / 1_000).toFixed(3)} ms`
    : `${value.toFixed(3)} µs`;
}

export function renderDetailedReport(result, roster, workloadManifest) {
  validateCanonicalResult(result, roster, workloadManifest);
  const included = orderedIncluded(result, roster);
  const lines = [
    "# Canonical rendering result",
    "",
    result.capture_kind === "historical_partial"
      ? "> Historical unified-core capture. It is valid only for the included seven-renderer roster and remains the public sample until the expanded canonical suite is rerun."
      : "> Current canonical capture.",
    "",
    `- Capture: \`${result.capture_id}\``,
    `- Captured: ${result.captured_at}`,
    ...(result.completed_at ? [`- Completed: ${result.completed_at}`] : []),
    `- Host: ${result.host.cpu_model}, ${result.host.logical_cpus} logical CPUs, ${result.host.memory_bytes} bytes RAM`,
    `- OS: ${result.host.os_name} (${result.host.os_release}), ${result.host.architecture}`,
    `- Harness commit: \`${result.provenance.harness_commit}\`${
      result.provenance.dirty ? " (dirty; source digest retained)" : ""
    }`,
    ...(result.provenance.source_sha256
      ? [`- Canonical source SHA-256: \`${result.provenance.source_sha256}\``]
      : []),
    "",
    "## Public scoreboard",
    "",
    renderTakeaway(result, roster, workloadManifest),
    "",
    "> Lower is better. Every listed renderer produced an equivalent page and passed the parity gate.",
    "",
  ];
  const scoreboard = renderScoreboard(result, roster, workloadManifest)
    .split("\n")
    .filter((line) =>
      !line.startsWith("<!--") && !line.startsWith("> **Historical") &&
      !line.startsWith("**") && !line.startsWith("On these") &&
      !line.startsWith("> Lower") && !line.startsWith("Each cell") &&
      !line.startsWith("Rows use")
    );
  const compactScoreboard = scoreboard.filter((line, index, all) =>
    line !== "" || (index > 0 && all[index - 1] !== "")
  );
  while (compactScoreboard[0] === "") compactScoreboard.shift();
  while (compactScoreboard.at(-1) === "") compactScoreboard.pop();
  lines.push(...compactScoreboard, "", "## Detailed measurements", "");
  lines.push(
    "| Renderer | Workload | P50 | P95 | P99 | Mean | Process P50 range | Processes | Samples/process | Warmups/process | Payload bytes | Payload Δ vs Proa | Parity |",
  );
  lines.push(
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  );
  for (const renderer of included) {
    for (const workload of workloadManifest.workloads) {
      const measurement = result.measurements[renderer.id][workload.id];
      const parity = result.parity[renderer.id][workload.id];
      const range = Number.isFinite(measurement.process_p50_min_us) &&
          Number.isFinite(measurement.process_p50_max_us)
        ? `${detailedDuration(measurement.process_p50_min_us)}–${
          detailedDuration(measurement.process_p50_max_us)
        }`
        : "not retained";
      lines.push(
        `| ${renderer.label} | ${workload.label} | ${
          detailedDuration(measurement.p50_us)
        } | ${
          detailedDuration(measurement.p95_us)
        } | ${
          detailedDuration(measurement.p99_us)
        } | ${
          detailedDuration(measurement.mean_us)
        } | ${range} | ${measurement.independent_processes} | ${measurement.samples_per_process} | ${measurement.warmups_per_process} | ${
          measurement.output_bytes.toLocaleString("en-US")
        } | ${parity.payload_delta_bytes >= 0 ? "+" : ""}${
          parity.payload_delta_bytes.toLocaleString("en-US")
        } | ${parity.mode} pass |`,
      );
    }
  }

  const tailObservations = [];
  for (const renderer of included) {
    for (const workload of workloadManifest.workloads) {
      const measurement = result.measurements[renderer.id][workload.id];
      const tailRatio = measurement.p95_us / measurement.p50_us;
      if (tailRatio >= 3) {
        tailObservations.push(
          `${renderer.label}'s ${workload.label.toLowerCase()} P95 was ${
            ratio(tailRatio)
          } its P50 (${detailedDuration(measurement.p95_us)} versus ${
            detailedDuration(measurement.p50_us)
          }).`,
        );
      }
    }
  }
  lines.push("", "## Tail observations", "");
  if (tailObservations.length === 0) {
    lines.push(
      "No cell had a process-median P95 at least 3× its P50 in this capture.",
    );
  } else {
    lines.push(
      "The report flags every cell whose process-median P95 is at least 3× its P50:",
      "",
    );
    for (const observation of tailObservations) lines.push(`- ${observation}`);
  }

  lines.push(
    "",
    "## Parity",
    "",
    "Chromium parses every untimed dump. The gate requires identical elements, non-class attributes, class membership, visible text, and body order. It ignores renderer-internal comments, resource-preload hints, non-semantic `<head>` order, class-token order, and adjacent hydration-split text nodes. The timed response is never normalized.",
    "",
    "| Workload | Canonical DOM SHA-256 | Exact-byte matches |",
    "| --- | --- | ---: |",
  );
  for (const workload of workloadManifest.workloads) {
    const cells = included.map(({ id }) => result.parity[id][workload.id]);
    lines.push(
      `| ${workload.label} | \`${cells[0].canonical_sha256}\` | ${
        cells.filter(({ byte_equal_to_proa }) => byte_equal_to_proa).length
      }/${cells.length} |`,
    );
  }

  lines.push(
    "",
    "## Renderer and runtime versions",
    "",
    "| Renderer/runtime | Version |",
    "| --- | --- |",
  );
  for (const [name, version] of Object.entries(result.versions)) {
    lines.push(`| ${name} | ${version ?? "unavailable"} |`);
  }

  lines.push(
    "",
    "## Reproduction",
    "",
    "```sh",
    "./rendering/run-all",
    "```",
    "",
    "The runner builds every fixed-roster adapter, runs the complete parity matrix, stops before timing if any cell fails, rotates renderer process order, records per-process summaries, writes `latest.json`, and generates this report and the README tables.",
    "",
    "Full commands recorded by the capture:",
    "",
  );
  for (const command of result.commands) lines.push(`- \`${command}\``);

  lines.push("", "## Known limitations", "");
  for (const limitation of result.limitations) lines.push(`- ${limitation}`);
  lines.push("", "## Raw and related evidence", "");
  for (const artifact of result.raw_artifacts) {
    lines.push(`- [${artifact.label}](${artifact.path})`);
  }
  lines.push(
    "",
    "Allocation measurements and construction-path controls remain separate from this renderer scoreboard. They are embedded below the scoreboard in the root README and retained in the [engineering reports](../engineering/README.md).",
    "",
  );
  return lines.join("\n");
}

export function canonicalDigest(result) {
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}
