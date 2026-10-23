import { summarize } from "../suspense-load/stats.mjs";

const median = (values) => summarize(values).p50;

export const DEFAULT_TARGET_RPS = 10_000;
export const PUBLICATION_SCENARIO_ID = "canonical_pages_v1";

export function parseTargetRates(value, fallback = [DEFAULT_TARGET_RPS]) {
  const parsed = String(value == null || value === "" ? fallback.join(",") : value)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => Number(token));
  if (parsed.length === 0) throw new Error("--target-rps must list at least one rate");
  const seen = new Set();
  const unique = [];
  for (const rate of parsed) {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("--target-rps values must be positive numbers");
    }
    if (seen.has(rate)) continue;
    seen.add(rate);
    unique.push(rate);
  }
  return unique;
}

export function parseHeadroom(value) {
  if (value == null || value === "") return 0;
  const headroom = Number(value);
  if (!Number.isFinite(headroom) || headroom < 0) {
    throw new Error("--headroom must be a fraction 0 or greater (0.3 is 30%)");
  }
  if (headroom >= 5) {
    throw new Error("--headroom is a fraction (0.3 is 30%); values >= 5 look like percents");
  }
  return headroom;
}

export function parseMaxCores(value) {
  if (value == null || value === "") return null;
  const maxCores = Number(value);
  if (!Number.isFinite(maxCores) || maxCores <= 0) {
    throw new Error("--max-cores must be a positive number");
  }
  return maxCores;
}

function requireFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} is missing or not a finite non-negative number`);
  }
  return value;
}

export function closedLoopCpuMs(cell, label) {
  const closed = (cell?.phases ?? []).filter((phase) => phase.mode === "closed");
  if (closed.length === 0) throw new Error(`${label} is missing closed-loop phases`);
  for (const phase of closed) {
    if (phase.loadGeneratorValid !== true) {
      throw new Error(`${label} includes a generator-limited closed-loop phase`);
    }
  }
  return requireFinite(
    median(closed.map((phase) => phase.cpu?.cpuMsPerSuccessfulRequest)),
    `${label} CPU per response`,
  );
}

export function coresForRate(cpuMsPerResponse, targetRps, headroom = 0) {
  const raw = cpuMsPerResponse * targetRps / 1_000;
  return {
    raw,
    provisioned: raw * (1 + headroom),
  };
}

export function displayCores(value) {
  return Number(value).toFixed(1);
}

export function planFleet(capture, options = {}) {
  if (capture == null || typeof capture !== "object") throw new Error("capture is missing");
  if (capture.status && capture.status !== "pass") {
    throw new Error(`capture status is ${capture.status}`);
  }
  if (capture.captureKind && capture.captureKind !== "publication") {
    throw new Error("only publication page-load captures can size a fleet");
  }
  if (capture.scenario?.id !== PUBLICATION_SCENARIO_ID) {
    throw new Error(`capture scenario is ${capture.scenario?.id ?? "missing"}, not ${PUBLICATION_SCENARIO_ID}`);
  }

  const targetRps = options.targetRps ?? [DEFAULT_TARGET_RPS];
  const headroom = options.headroom ?? 0;
  const maxCores = options.maxCores ?? null;
  if (!Array.isArray(targetRps) || targetRps.length === 0) {
    throw new Error("targetRps must be a non-empty list");
  }
  if (!Number.isFinite(headroom) || headroom < 0) throw new Error("headroom must be a fraction 0 or greater");

  const workloads = capture.scenario.workloads;
  if (!Array.isArray(workloads) || workloads.length === 0) {
    throw new Error("capture is missing workload definitions");
  }
  const engines = capture.engines;
  if (!Array.isArray(engines) || engines.length === 0) {
    throw new Error("capture is missing engines");
  }

  const cpuByKey = new Map();
  for (const engine of engines) {
    for (const workload of workloads) {
      const cell = engine.workloads?.[workload.id];
      if (!cell) throw new Error(`${engine.id} is missing ${workload.id}`);
      cpuByKey.set(
        `${engine.id}/${workload.id}`,
        closedLoopCpuMs(cell, `${engine.id}/${workload.id}`),
      );
    }
  }

  const tables = targetRps.map((rate) => {
    const rows = workloads.map((workload) => {
      const cells = engines.map((engine) => {
        const cpuMsPerResponse = cpuByKey.get(`${engine.id}/${workload.id}`);
        const { raw, provisioned } = coresForRate(cpuMsPerResponse, rate, headroom);
        return {
          engineId: engine.id,
          engine: engine.label ?? engine.id,
          cpuMsPerResponse,
          cores: raw,
          provisioned,
          display: displayCores(provisioned),
          exceedsMax: maxCores == null ? false : provisioned > maxCores,
        };
      });
      return {
        workloadId: workload.id,
        workload: workload.label ?? workload.id,
        cells,
      };
    });
    return { targetRps: rate, rows };
  });

  const overflows = tables.flatMap((table) =>
    table.rows.flatMap((row) =>
      row.cells
        .filter((cell) => cell.exceedsMax)
        .map((cell) => ({
          targetRps: table.targetRps,
          workload: row.workload,
          engine: cell.engine,
          provisioned: cell.provisioned,
        }))
    )
  );

  return {
    scenario: capture.scenario.id,
    captureKind: capture.captureKind ?? null,
    capturedAt: capture.capturedAt ?? capture.captured_at ?? null,
    host: capture.host?.cpuModel ?? capture.host?.cpu_model ?? null,
    sourceSha256: capture.source?.sourceSha256 ?? null,
    headroom,
    maxCores,
    engines: engines.map((engine) => ({ id: engine.id, label: engine.label ?? engine.id })),
    workloads: workloads.map((workload) => ({ id: workload.id, label: workload.label ?? workload.id })),
    tables,
    overflows,
  };
}

function formatRate(rate) {
  return rate.toLocaleString("en-US");
}

function formatWhen(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "unknown date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function renderMarkdown(plan) {
  const headroomNote = plan.headroom === 0
    ? "No extra headroom is applied; add `--headroom 0.3` for a 30% reserve."
    : `Provisioned cores include ${(plan.headroom * 100).toFixed(0)}% headroom.`;
  const maxNote = plan.maxCores == null
    ? ""
    : ` A cell exceeds the ${plan.maxCores}-core budget when its provisioned value is larger.`;

  const tables = plan.tables.map((table) => {
    const header = `| Workload | ${plan.engines.map((engine) => engine.label).join(" | ")} |`;
    const divider = `| --- | ${plan.engines.map(() => "---:").join(" | ")} |`;
    const body = table.rows
      .map((row) => `| ${row.workload} | ${row.cells.map((cell) => cell.display).join(" | ")} |`)
      .join("\n");
    return `## ${formatRate(table.targetRps)} responses/s

${header}
${divider}
${body}`;
  }).join("\n\n");

  const overflow = plan.overflows.length === 0
    ? plan.maxCores == null
      ? ""
      : `\n\nNo cell exceeds ${plan.maxCores} cores at the requested rates.`
    : `\n\nOver the ${plan.maxCores}-core budget:\n${
      plan.overflows
        .map((row) => `- ${row.workload} / ${row.engine} at ${formatRate(row.targetRps)} rps: ${displayCores(row.provisioned)} cores`)
        .join("\n")
    }`;

  return `# Fleet size from CPU per response

Capture taken ${formatWhen(plan.capturedAt)}${plan.host ? ` on ${plan.host}` : ""}. Cores needed = (CPU ms/response) × (target responses/s) / 1000. ${headroomNote}${maxNote} This is a translation of the retained one-core CPU/response measurement; it is not a multi-core run.

${tables}${overflow}
`;
}
