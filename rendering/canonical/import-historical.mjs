#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv.includes("--allow-historical-bootstrap")) {
  throw new Error(
    "This one-time migration importer would replace the unified public result. Pass --allow-historical-bootstrap only when reconstructing the pre-unification sample.",
  );
}

const canonicalDirectory = dirname(fileURLToPath(import.meta.url));
const renderingDirectory = dirname(canonicalDirectory);
const resultDirectory = join(renderingDirectory, "results");
const sourcePath = join(resultDirectory, "representative_suite.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
if (source.status !== "pass" || source.smoke || source.parity.length !== 21) {
  throw new Error(
    "the retained representative suite is not the complete 21-cell parity capture",
  );
}

const roster = JSON.parse(
  readFileSync(join(canonicalDirectory, "roster.json"), "utf8"),
);
const workloads = JSON.parse(
  readFileSync(join(canonicalDirectory, "workloads.json"), "utf8"),
);
const captureId = "canonical-ssr-v1-2026-08-31-4aee8369";
const includedIds = new Set([
  "proa",
  "marko",
  "react",
  "rails",
  "leptos",
  "dioxus",
  "topcoat",
]);
const sourceByCell = new Map(
  source.results
    .filter(({ comparison_role }) => comparison_role === "renderer")
    .map((cell) => [`${cell.framework_id}/${cell.workload}`, cell]),
);
const parityByCell = new Map(
  source.parity.map((cell) => [`${cell.framework}/${cell.workload}`, cell]),
);

const renderers = roster.renderers.map((definition) => ({
  id: definition.id,
  label: definition.label,
  language: definition.language,
  status: includedIds.has(definition.id) ? "included" : "in_progress",
  ...(includedIds.has(definition.id) ? {} : {
    reason:
      "Canonical adapter is ported, but this historical capture predates it; no parity-gated number is published until the unified roster is rerun.",
  }),
}));

const parity = {};
const measurements = {};
for (
  const renderer of renderers.filter(({ status }) => status === "included")
) {
  parity[renderer.id] = {};
  measurements[renderer.id] = {};
  for (const workload of workloads.workloads) {
    const sourceParity = parityByCell.get(`${renderer.id}/${workload.id}`);
    const cell = sourceByCell.get(`${renderer.id}/${workload.id}`);
    if (!sourceParity || !cell) {
      throw new Error(
        `retained cell missing: ${renderer.id}/${workload.id}`,
      );
    }
    const proa = sourceByCell.get(`proa/${workload.id}`);
    parity[renderer.id][workload.id] = {
      status: "pass",
      mode: "semantic DOM",
      canonical_sha256: sourceParity.canonical_sha256,
      output_bytes: sourceParity.output_bytes,
      payload_delta_bytes: sourceParity.output_bytes - proa.output_bytes,
      byte_equal_to_proa: renderer.id === "proa",
    };
    measurements[renderer.id][workload.id] = {
      capture_id: captureId,
      p50_us: cell.process_median_p50_us,
      p95_us: cell.process_median_p95_us,
      p99_us: cell.process_median_p99_us,
      mean_us: cell.process_median_mean_us,
      process_p50_min_us: cell.process_p50_min_us,
      process_p50_max_us: cell.process_p50_max_us,
      independent_processes: cell.independent_processes,
      samples_per_process: cell.iterations_per_process,
      warmups_per_process: cell.warmup_per_process,
      output_bytes: cell.output_bytes,
      allocation_policy: cell.allocation_policy,
    };
  }
}

const latest = {
  schema_version: 2,
  benchmark_version: "canonical-ssr-v1",
  capture_id: captureId,
  capture_kind: "historical_partial",
  status: "pass",
  captured_at: source.environment.captured_at,
  host: {
    cpu_model: source.environment.cpu_model,
    logical_cpus: source.environment.logical_cpus,
    memory_bytes: source.environment.total_memory_bytes,
    architecture: source.environment.architecture,
    os_name: "macOS (Darwin)",
    os_release: source.environment.os_release,
  },
  workloads: workloads.workloads,
  renderers,
  parity,
  measurements,
  versions: {
    Proa: "0.3.0 @ 85d7a6b2550f2889",
    Marko: "6.0.150 / Node v24.20.0",
    React: "19.2.4 / Node v24.20.0 LTS",
    Rails: "8.1.3.1 / Ruby 4.0.6",
    Leptos: "0.7.8",
    Dioxus: "0.6.3 / dioxus-ssr 0.6.2",
    Topcoat: "0.3.1",
    Rust: source.environment.rust,
  },
  provenance: {
    harness_commit: "4aee836970dfefad9601b1eef89866f0405120d5",
    merged_main_commit: "ac5b5d3e501d73d0f0d75e33423f263cc3016069",
    dirty: true,
    source_result: "representative_suite.json",
  },
  commands: [
    "./rendering/run_all.sh representative-suite-setup",
    "./rendering/run_all.sh representative-suite-parity",
    "./rendering/run_all.sh representative-suite",
  ],
  limitations: [
    "This retained capture predates the expanded fixed roster; only its seven same-run, parity-gated renderers are included.",
    "It is a single Apple Silicon workstation result, not a multi-host publication result.",
    "Only per-process aggregates were retained; ordered per-render samples are unavailable for this historical capture.",
    "Marko's table P95 was consistently much higher than its P50 and remains reported without post-hoc removal.",
    "Semantic DOM parity permits documented serializer metadata and whitespace differences; payload deltas remain visible here.",
  ],
  raw_artifacts: [
    {
      label: "Retained source capture",
      path: "archive/2026-08-31-representative-suite.json",
    },
    {
      label: "Historical cross-language adapter loop",
      path: "../../archive/legacy-cross-language.md",
    },
    { label: "Result-table migration map", path: "../MIGRATION.md" },
  ],
};

mkdirSync(join(resultDirectory, "archive"), { recursive: true });
writeFileSync(
  join(resultDirectory, "archive", "2026-08-31-representative-suite.json"),
  `${JSON.stringify(source, null, 2)}\n`,
);
writeFileSync(
  join(resultDirectory, "latest.json"),
  `${JSON.stringify(latest, null, 2)}\n`,
);
console.log(
  `Imported ${sourcePath} as ${captureId} without adding any legacy adapter values.`,
);
