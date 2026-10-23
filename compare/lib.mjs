import { summarize } from "../suspense-load/stats.mjs";

const median = (values) => summarize(values).p50;

export const SUITE_IDS = Object.freeze([
  "canonical",
  "product-scaling",
  "page-load",
  "cold-start",
]);

export function detectSuite(capture) {
  if (capture == null || typeof capture !== "object") {
    throw new Error("capture is missing");
  }
  if (capture.benchmark_version === "canonical-ssr-v1") return "canonical";
  if (capture.benchmark_version === "product-scaling-v1") return "product-scaling";
  if (capture.scenario?.id === "canonical_pages_v1") return "page-load";
  if (capture.scenario?.id === "cold_start_products_v1") return "cold-start";
  throw new Error(
    "unrecognized capture: expected a canonical, product-scaling, page-load, or cold-start artifact",
  );
}

export function captureIdentity(capture, suite = detectSuite(capture)) {
  const host = capture.host ?? {};
  return {
    suite,
    captureId: capture.capture_id ?? capture.captureId ?? capture.captureKind ?? "unidentified",
    capturedAt: capture.captured_at ?? capture.capturedAt ?? null,
    host: host.cpu_model ?? host.cpuModel ?? null,
    os: host.os_name ?? host.platform ?? null,
    sourceSha256: capture.provenance?.source_sha256 ?? capture.source?.sourceSha256 ?? null,
    status: capture.status ?? null,
  };
}

function requireFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} is missing or not a finite non-negative number`);
  }
  return value;
}

function rendererLabel(capture, id) {
  return capture.renderers?.find((renderer) => renderer.id === id)?.label ?? id;
}

function workloadLabel(capture, id) {
  return capture.workloads?.find((workload) => workload.id === id)?.label ??
    capture.scenario?.workloads?.find((workload) => workload.id === id)?.label ??
    id;
}

function canonicalCells(capture) {
  const cells = [];
  for (const [rendererId, byWorkload] of Object.entries(capture.measurements ?? {})) {
    for (const [workloadId, measurement] of Object.entries(byWorkload ?? {})) {
      cells.push({
        key: `${rendererId}/${workloadId}/p50`,
        group: workloadLabel(capture, workloadId),
        subject: rendererLabel(capture, rendererId),
        metric: "P50 render time",
        unit: "us",
        value: requireFinite(measurement.p50_us, `${rendererId}/${workloadId} P50`),
        better: "lower",
      });
      cells.push({
        key: `${rendererId}/${workloadId}/bytes`,
        group: workloadLabel(capture, workloadId),
        subject: rendererLabel(capture, rendererId),
        metric: "Payload bytes",
        unit: "bytes",
        value: requireFinite(measurement.output_bytes, `${rendererId}/${workloadId} payload`),
        better: "lower",
      });
    }
  }
  if (cells.length === 0) throw new Error("canonical capture has no measurements");
  return cells;
}

function productScalingCells(capture) {
  const cells = [];
  const counts = (capture.counts ?? []).map(String);
  for (const [rendererId, byCount] of Object.entries(capture.measurements ?? {})) {
    for (const [count, measurement] of Object.entries(byCount ?? {})) {
      if (counts.length > 0 && !counts.includes(String(count))) continue;
      cells.push({
        key: `${rendererId}/${count}/p50`,
        group: `${count} product cards`,
        subject: rendererLabel(capture, rendererId),
        metric: "P50 render time",
        unit: "us",
        value: requireFinite(measurement.p50_us, `${rendererId}/${count} P50`),
        better: "lower",
      });
    }
  }
  if (cells.length === 0) throw new Error("product-scaling capture has no measurements");
  return cells;
}

function pageLoadCells(capture) {
  const cells = [];
  for (const engine of capture.engines ?? []) {
    for (const [workloadId, cell] of Object.entries(engine.workloads ?? {})) {
      const closed = (cell.phases ?? []).filter((phase) => phase.mode === "closed");
      const open = (cell.phases ?? []).filter((phase) => phase.mode === "open");
      if (closed.length === 0) {
        throw new Error(`${engine.id}/${workloadId} is missing closed-loop phases`);
      }
      const group = workloadLabel(capture, workloadId);
      const subject = engine.label ?? engine.id;
      cells.push({
        key: `${engine.id}/${workloadId}/rps`,
        group,
        subject,
        metric: "Sustained responses/s",
        unit: "rps",
        value: requireFinite(
          median(closed.map((phase) => phase.completionThroughputRps)),
          `${engine.id}/${workloadId} throughput`,
        ),
        better: "higher",
      });
      cells.push({
        key: `${engine.id}/${workloadId}/cpu`,
        group,
        subject,
        metric: "CPU per response",
        unit: "ms",
        value: requireFinite(
          median(closed.map((phase) => phase.cpu?.cpuMsPerSuccessfulRequest)),
          `${engine.id}/${workloadId} CPU`,
        ),
        better: "lower",
      });
      if (open.length > 0) {
        cells.push({
          key: `${engine.id}/${workloadId}/p50`,
          group,
          subject,
          metric: "Equal-load complete P50",
          unit: "ms",
          value: requireFinite(
            median(open.map((phase) => phase.latencyMs?.scheduledComplete?.p50)),
            `${engine.id}/${workloadId} equal-load P50`,
          ),
          better: "lower",
        });
      }
    }
  }
  if (cells.length === 0) throw new Error("page-load capture has no engine measurements");
  return cells;
}

function coldStartCells(capture) {
  const cells = [];
  for (const engine of capture.engines ?? []) {
    const subject = engine.label ?? engine.id;
    cells.push({
      key: `${engine.id}/first-response`,
      group: capture.scenario?.workload?.label ?? "Product grid",
      subject,
      metric: "First response P50",
      unit: "ms",
      value: requireFinite(engine.summary?.firstResponseMs?.p50, `${engine.id} first response`),
      better: "lower",
    });
    cells.push({
      key: `${engine.id}/rss`,
      group: capture.scenario?.workload?.label ?? "Product grid",
      subject,
      metric: "RSS after first response",
      unit: "bytes",
      value: requireFinite(
        engine.summary?.rssAfterFirstResponseBytes?.p50 ??
          median((engine.starts ?? []).map((start) => start.rssAfterFirstResponseBytes)),
        `${engine.id} RSS`,
      ),
      better: "lower",
    });
  }
  if (cells.length === 0) throw new Error("cold-start capture has no engines");
  return cells;
}

const extractors = {
  canonical: canonicalCells,
  "product-scaling": productScalingCells,
  "page-load": pageLoadCells,
  "cold-start": coldStartCells,
};

export function extractCells(capture, suite = detectSuite(capture)) {
  const extract = extractors[suite];
  if (!extract) throw new Error(`unsupported suite: ${suite}`);
  return extract(capture);
}

function ratio(before, after) {
  if (before === 0) return after === 0 ? 1 : Infinity;
  return after / before;
}

function classify(row) {
  if (row.before === row.after) return "unchanged";
  const improved = row.better === "lower" ? row.after < row.before : row.after > row.before;
  return improved ? "improved" : "regressed";
}

export function compareCaptures(beforeCapture, afterCapture, options = {}) {
  const beforeSuite = detectSuite(beforeCapture);
  const afterSuite = detectSuite(afterCapture);
  if (beforeSuite !== afterSuite) {
    throw new Error(`cannot compare ${beforeSuite} with ${afterSuite}`);
  }
  if (options.suite && options.suite !== beforeSuite) {
    throw new Error(`capture suite is ${beforeSuite}, not ${options.suite}`);
  }

  const beforeCells = new Map(extractCells(beforeCapture, beforeSuite).map((cell) => [cell.key, cell]));
  const afterCells = new Map(extractCells(afterCapture, afterSuite).map((cell) => [cell.key, cell]));
  const rows = [];
  for (const [key, before] of beforeCells) {
    const after = afterCells.get(key);
    if (!after) continue;
    if (before.unit !== after.unit || before.better !== after.better) {
      throw new Error(`${key} changed shape between captures`);
    }
    const row = {
      key,
      group: after.group,
      subject: after.subject,
      metric: after.metric,
      unit: after.unit,
      better: after.better,
      before: before.value,
      after: after.value,
      delta: after.value - before.value,
      ratio: ratio(before.value, after.value),
    };
    row.change = classify(row);
    rows.push(row);
  }
  rows.sort((left, right) =>
    left.metric.localeCompare(right.metric) ||
    left.group.localeCompare(right.group) ||
    left.subject.localeCompare(right.subject)
  );

  return {
    suite: beforeSuite,
    before: captureIdentity(beforeCapture, beforeSuite),
    after: captureIdentity(afterCapture, afterSuite),
    rows,
    removed: [...beforeCells.keys()].filter((key) => !afterCells.has(key)).sort(),
    added: [...afterCells.keys()].filter((key) => !beforeCells.has(key)).sort(),
  };
}

function digitsFor(value) {
  const magnitude = Math.abs(value);
  if (magnitude === 0) return 0;
  if (magnitude < 0.1) return 3;
  if (magnitude < 10) return 2;
  if (magnitude < 100) return 1;
  return 0;
}

export function formatValue(value, unit) {
  if (!Number.isFinite(value)) return "n/a";
  if (unit === "us") {
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(digitsFor(value / 1_000))} ms`;
    return `${value.toFixed(digitsFor(value))} µs`;
  }
  if (unit === "ms") return `${value.toFixed(digitsFor(value))} ms`;
  if (unit === "rps") {
    return Math.abs(value) >= 100
      ? Math.round(value).toLocaleString("en-US")
      : value.toFixed(digitsFor(value));
  }
  if (unit === "bytes") {
    if (Math.abs(value) >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
    if (Math.abs(value) >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return Math.round(value).toLocaleString("en-US");
  }
  return String(value);
}

export function formatDelta(value, unit) {
  if (!Number.isFinite(value) || value === 0) return "0";
  const formatted = formatValue(Math.abs(value), unit);
  return value > 0 ? `+${formatted}` : `−${formatted}`;
}

export function formatRatio(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (Math.abs(value - 1) < 1e-9) return "1.00×";
  if (value < 10) return `${value.toFixed(2)}×`;
  if (value < 100) return `${value.toFixed(1)}×`;
  return `${value.toFixed(0)}×`;
}

function formatWhen(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function shortHash(value) {
  if (typeof value !== "string" || value.length < 12) return value ?? "unknown";
  return `${value.slice(0, 12)}…`;
}

export function renderMarkdown(comparison) {
  const metrics = [...new Set(comparison.rows.map((row) => row.metric))];
  const sections = metrics.map((metric) => {
    const rows = comparison.rows.filter((row) => row.metric === metric);
    const body = rows
      .map((row) =>
        `| ${row.subject} | ${row.group} | ${formatValue(row.before, row.unit)} | ${formatValue(row.after, row.unit)} | ${formatDelta(row.delta, row.unit)} | ${formatRatio(row.ratio)} | ${row.change} |`
      )
      .join("\n");
    return `## ${metric}

| Subject | Workload | Before | After | Δ | After ÷ before | Change |
| --- | --- | ---: | ---: | ---: | ---: | --- |
${body}`;
  });

  const extras = [];
  if (comparison.removed.length > 0) {
    extras.push(`Cells only in the earlier capture: ${comparison.removed.map((key) => `\`${key}\``).join(", ")}.`);
  }
  if (comparison.added.length > 0) {
    extras.push(`Cells only in the later capture: ${comparison.added.map((key) => `\`${key}\``).join(", ")}.`);
  }

  return `# Capture comparison

Compared **${comparison.suite}** captures. Headline values use the same reduction as the published evidence pages: canonical and product-scaling cells are process-median P50s, HTTP capacity cells are medians of closed-loop phases, and cold-start cells are the published first-response summaries.

| | Earlier | Later |
| --- | --- | --- |
| Capture | \`${comparison.before.captureId}\` | \`${comparison.after.captureId}\` |
| Taken | ${formatWhen(comparison.before.capturedAt)} | ${formatWhen(comparison.after.capturedAt)} |
| Host | ${comparison.before.host ?? "unknown"} | ${comparison.after.host ?? "unknown"} |
| Source SHA-256 | \`${shortHash(comparison.before.sourceSha256)}\` | \`${shortHash(comparison.after.sourceSha256)}\` |

Same host: ${comparison.before.host && comparison.before.host === comparison.after.host ? "yes" : "no"}. Same measured-source digest: ${comparison.before.sourceSha256 && comparison.before.sourceSha256 === comparison.after.sourceSha256 ? "yes" : "no"}.

${sections.join("\n\n")}${extras.length ? `\n\n${extras.join("\n")}` : ""}
`;
}
