#!/usr/bin/env node
// Checks the generated figures against the evidence pages they were drawn from.
//   node charts/verify.mjs
// Exits non-zero on the first failure, so this is safe to wire into CI.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSources, parseTables, readMeta, pick, num, toUs, clean } from './lib/tables.mjs';
import { textWidth, T } from './lib/theme.mjs';
import { measureReactHydrationPayload } from '../showcase/measure_react_hydration_payload.mjs';
import { suspenseLoad } from './figures/suspense.mjs';
import { pageLoad, coldStart } from './figures/pages.mjs';
import { representative } from './figures/engineering.mjs';
import { validateBuffers, updateBufferReadme } from '../showcase/capture_buffers.mjs';
import { validateCapture as validateMemcpyCapture, updateReadme as updateMemcpyReadme } from '../showcase/capture_memcpy.mjs';
import { renderingSourceFingerprint } from '../rendering/canonical/source_fingerprint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const md = readSources(join(HERE, '..'));
const tables = parseTables(md);
const SVG = join(HERE, 'svg');
const rosterSize = JSON.parse(readFileSync(
  join(HERE, '..', 'rendering', 'canonical', 'roster.json'),
  'utf8',
)).renderers.length;
const scalingCapture = JSON.parse(readFileSync(
  join(HERE, '..', 'rendering', 'results', 'product-scaling.json'),
  'utf8',
));

function currentRenderingSourceFingerprint() {
  const workspace = join(HERE, '..');
  return renderingSourceFingerprint(workspace);
}

let checks = 0, failures = 0;
const ok = (label) => { checks++; console.log(`  pass  ${label}`); };
const bad = (label, detail) => { checks++; failures++; console.log(`  FAIL  ${label}\n        ${detail}`); };
const eq = (label, a, b, tol = 0) => (Math.abs(a - b) <= tol ? ok(label) : bad(label, `${a} != ${b}`));

console.log('\nSource fidelity');

// 1 · the scoreboard's stated ratios and times reproduce from the detailed
//     P50s. Tolerance is half of each cell's own last displayed digit, so this
//     tests the numbers rather than the rounding.
{
  const t = pick(tables, ['Renderer', 'Component page', '1,000-row table', 'Product grid'], { heading: 'Current result' });
  const det = pick(tables, ['Renderer', 'Workload', 'P50', 'P95']);
  const exact = {}, printedRel = {};
  for (const o of det.objs) {
    const key = clean(o.Renderer) + '|' + clean(o.Workload);
    exact[key] = toUs(o.P50);
    // the detailed table itself prints three decimals, so a derived ratio
    // inherits half a unit of that rounding from each operand
    const printed = /(-?[\d,]+(?:\.(\d+))?)/.exec(clean(o.P50));
    const decimals = printed?.[2]?.length ?? 0;
    const unitScale = /ms/.test(o.P50) ? 1e3 : /ns/.test(o.P50) ? 1e-3 : 1;
    printedRel[key] = (0.5 * Math.pow(10, -decimals) * unitScale) / exact[key];
  }
  // half of the last displayed digit of a printed decimal
  const halfUlp = (printed) => {
    const dot = /\.(\d+)/.exec(printed);
    return 0.5 * Math.pow(10, dot ? -dot[1].length : 0);
  };
  const ratioBad = [], timeBad = [];
  for (const o of t.objs) {
    const name = clean(o.Renderer);
    for (const w of ['Component page', '1,000-row table', 'Product grid']) {
      const [timeCell, ratioCell] = o[w].split('·');
      const ratioTxt = ratioCell.replace(/[×x]/g, '').trim();
      const stated = parseFloat(ratioTxt);
      const derived = exact[name + '|' + w] / exact['Proa|' + w];
      const operandTolerance = derived * (printedRel[name + '|' + w] + printedRel['Proa|' + w]);
      if (Math.abs(derived - stated) > halfUlp(ratioTxt) * 1.01 + operandTolerance) {
        ratioBad.push(`${name}/${w}: README ${stated}×, detailed P50s give ${derived.toFixed(4)}×`);
      }
      const timeTxt = timeCell.trim();
      const unit = /(ns|µs|ms|s)/.exec(timeTxt)[1];
      const scale = { ns: 1e-3, 'µs': 1, ms: 1e3, s: 1e6 }[unit];
      if (Math.abs(toUs(timeTxt) - exact[name + '|' + w]) > halfUlp(timeTxt) * scale * 1.01) {
        timeBad.push(`${name}/${w}: README ${timeTxt}, detailed ${exact[name + '|' + w]} µs`);
      }
    }
  }
  ratioBad.length === 0
    ? ok(`all ${t.objs.length * 3} scoreboard ratios reproduce from the detailed P50s`)
    : bad('scoreboard ratios', ratioBad.join('\n        '));
  timeBad.length === 0
    ? ok(`all ${t.objs.length * 3} scoreboard times round faithfully from the detailed P50s`)
    : bad('scoreboard times', timeBad.join('\n        '));
}

// 2 · zero payload deltas must reproduce the table's exact-byte match counts.
{
  const det = pick(tables, ['Renderer', 'Workload', 'P50', 'P95']);
  const par = pick(tables, ['Workload', 'Canonical DOM SHA-256', 'Exact-byte matches']);
  for (const p of par.objs) {
    const w = clean(p.Workload);
    const derived = det.objs.filter((o) => clean(o.Workload) === w && num(o['Payload Δ vs Proa']) === 0).length;
    const total = det.objs.filter((o) => clean(o.Workload) === w).length;
    const stated = clean(p['Exact-byte matches']);
    stated === `${derived}/${total}`
      ? ok(`byte-identity derivation for ${w} reproduces ${stated}`)
      : bad(`byte-identity derivation for ${w}`, `derived ${derived}/${total}, README says ${stated}`);
  }
}

// 3 · every cell in the canonical capture passed parity, and the retained
//     distribution statistics are ordered and usable by figures 02 and 13
{
  const det = pick(tables, ['Renderer', 'Workload', 'P50', 'P95']);
  const failed = det.objs.filter((o) => !/pass/i.test(o.Parity));
  failed.length === 0 ? ok(`all ${det.objs.length} canonical cells recorded a parity pass`)
    : bad('parity', `${failed.length} cells did not pass`);
  const inverted = det.objs.filter((o) => toUs(o.P95) < toUs(o.P50));
  inverted.length === 0 ? ok('no cell has a P95 below its P50')
    : bad('percentile ordering', inverted.map((o) => clean(o.Renderer)).join(', '));
  const inverted99 = det.objs.filter((o) => toUs(o.P99) < toUs(o.P95));
  inverted99.length === 0 ? ok('no cell has a P99 below its P95')
    : bad('P99 ordering', inverted99.map((o) => clean(o.Renderer)).join(', '));
  const invalidMeans = det.objs.filter((o) => toUs(o.Mean) <= 0);
  invalidMeans.length === 0 ? ok('every cell has a positive retained mean')
    : bad('mean values', invalidMeans.map((o) => clean(o.Renderer)).join(', '));
}

// 4 · retained payload deltas must agree with each workload's Proa response.
{
  const det = pick(tables, ['Renderer', 'Workload', 'P50', 'P95']);
  const proa = {};
  for (const o of det.objs) if (clean(o.Renderer) === 'Proa') proa[clean(o.Workload)] = num(o['Payload bytes']);
  let worst = 0;
  for (const o of det.objs) {
    const b = num(o['Payload bytes']), d = num(o['Payload Δ vs Proa']);
    worst = Math.max(worst, Math.abs((b - d) - proa[clean(o.Workload)]));
  }
  eq('payload bytes minus delta equals Proa\'s payload on every row', worst, 0);
}

// 5 · figure 09's table is a presentation of the retained scaling capture,
//     rather than a second hand-maintained result set. The retained summary is
//     also checked against every raw process summary so an incomplete capture
//     cannot be described as a complete five-process result.
{
  const expectedCounts = [12, 96, 768];
  const expectedSamples = { 12: 2000, 96: 500, 768: 100 };
  const expectedWarmups = { 12: 200, 96: 50, 768: 10 };
  const table = pick(
    tables,
    ['Renderer', '12 cards P50', '96 cards P50', '768 cards P50'],
    { heading: 'Product-grid scaling capture' },
  );
  const captureRenderers = scalingCapture.renderers ?? [];
  const captureByLabel = new Map(
    captureRenderers.map((renderer) => [renderer.label, renderer.id]),
  );
  const tableLabels = table.objs.map((row) => clean(row.Renderer));
  const fidelityFailures = [];
  if (
    tableLabels.length !== captureRenderers.length ||
    new Set(tableLabels).size !== tableLabels.length ||
    captureRenderers.some(({ label }) => !tableLabels.includes(label))
  ) {
    fidelityFailures.push('README renderer rows do not exactly match the capture roster');
  }
  for (const row of table.objs) {
    const label = clean(row.Renderer);
    const rendererId = captureByLabel.get(label);
    if (!rendererId) {
      fidelityFailures.push(`${label}: no renderer in product-scaling.json`);
      continue;
    }
    for (const count of expectedCounts) {
      const cell = row[`${count} cards P50`];
      const displayed = toUs(cell);
      const exact = scalingCapture.measurements?.[rendererId]?.[count]?.p50_us;
      const decimals = /\.(\d+)/.exec(cell)?.[1].length ?? 0;
      const unit = /(ns|µs|us|ms|s)\b/.exec(clean(cell))?.[1];
      const unitInUs = { ns: 1e-3, 'µs': 1, us: 1, ms: 1e3, s: 1e6 }[unit];
      const tolerance = 0.5 * 10 ** -decimals * unitInUs * 1.01;
      if (!Number.isFinite(exact) || Math.abs(displayed - exact) > tolerance) {
        fidelityFailures.push(
          `${label}/${count}: README ${cell}, capture ${exact} µs`,
        );
      }
    }
  }
  fidelityFailures.length === 0
    ? ok(`all ${table.objs.length * expectedCounts.length} scaling values round faithfully from the retained capture`)
    : bad('product-scaling capture fidelity', fidelityFailures.join('\n        '));

  const artifactFailures = [];
  if (
    scalingCapture.schema_version !== 1 ||
    scalingCapture.benchmark_version !== 'product-scaling-v1' ||
    scalingCapture.capture_kind !== 'engineering' ||
    scalingCapture.status !== 'pass'
  ) {
    artifactFailures.push('capture identity, kind, or status is invalid');
  }
  const currentSourceFingerprint = currentRenderingSourceFingerprint();
  if (scalingCapture.provenance?.source_sha256 !== currentSourceFingerprint) {
    artifactFailures.push(
      `capture source is ${scalingCapture.provenance?.source_sha256 ?? 'missing'}, current benchmark source is ${currentSourceFingerprint}`,
    );
  }
  if (JSON.stringify(scalingCapture.counts) !== JSON.stringify(expectedCounts)) {
    artifactFailures.push(`card counts are ${JSON.stringify(scalingCapture.counts)}`);
  }
  if (
    captureRenderers.length !== rosterSize ||
    new Set(captureRenderers.map(({ id }) => id)).size !== captureRenderers.length
  ) {
    artifactFailures.push(`capture must contain ${rosterSize} unique renderer IDs`);
  }
  const proaParity = scalingCapture.parity?.proa ?? {};
  for (const { id, label } of captureRenderers) {
    if (!scalingCapture.versions?.[label]) {
      artifactFailures.push(`${id}: runtime version is missing`);
    }
    for (const count of expectedCounts) {
      const measurement = scalingCapture.measurements?.[id]?.[count];
      const parity = scalingCapture.parity?.[id]?.[count];
      if (!measurement) {
        artifactFailures.push(`${id}/${count}: measurement is missing`);
        continue;
      }
      for (const field of ['p50_us', 'p95_us', 'p99_us', 'mean_us', 'output_bytes']) {
        if (!Number.isFinite(measurement[field]) || measurement[field] <= 0) {
          artifactFailures.push(`${id}/${count}: ${field} is invalid`);
        }
      }
      if (
        measurement.independent_processes !== 5 ||
        measurement.samples_per_process !== expectedSamples[count] ||
        measurement.warmups_per_process !== expectedWarmups[count]
      ) {
        artifactFailures.push(`${id}/${count}: process or sample shape is invalid`);
      }
      if (
        !parity || parity.status !== 'pass' || parity.mode !== 'semantic DOM' ||
        parity.canonical_sha256 !== proaParity[count]?.canonical_sha256 ||
        parity.output_bytes !== measurement.output_bytes
      ) {
        artifactFailures.push(`${id}/${count}: parity evidence is missing or inconsistent`);
      }
    }
  }

  const expectedRawArtifact =
    `raw/${scalingCapture.capture_id}/process-summaries.json`;
  let raw = [];
  if (scalingCapture.raw_artifact !== expectedRawArtifact) {
    artifactFailures.push(`raw artifact path should be ${expectedRawArtifact}`);
  } else {
    try {
      raw = JSON.parse(readFileSync(
        join(HERE, '..', 'rendering', 'results', scalingCapture.raw_artifact),
        'utf8',
      ));
    } catch (error) {
      artifactFailures.push(`raw artifact cannot be read: ${error.message}`);
    }
  }
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  };
  for (const { id } of captureRenderers) {
    for (const count of expectedCounts) {
      const cells = raw.filter((cell) =>
        cell.framework_id === id && cell.workload === 'products' &&
        cell.workload_cardinality === count);
      if (cells.length !== 5) {
        artifactFailures.push(`${id}/${count}: expected 5 raw process cells, found ${cells.length}`);
        continue;
      }
      const measurement = scalingCapture.measurements[id][count];
      for (const field of ['p50_us', 'p95_us', 'p99_us', 'mean_us']) {
        if (median(cells.map((cell) => cell[field])) !== measurement[field]) {
          artifactFailures.push(`${id}/${count}: ${field} does not reproduce from raw cells`);
        }
      }
    }
  }
  if (raw.length !== rosterSize * expectedCounts.length * 5) {
    artifactFailures.push(`expected ${rosterSize * expectedCounts.length * 5} raw cells, found ${raw.length}`);
  }
  artifactFailures.length === 0
    ? ok(`all ${rosterSize * expectedCounts.length} scaling cells have complete parity and five-process raw evidence`)
    : bad('product-scaling artifact completeness', artifactFailures.join('\n        '));
}

// 6 · the standalone React payload measurement is rebuilt from its checked-in entry point
//     and must still equal the README row
{
  const table = pick(
    tables,
    ['Client reference', 'JS requests', 'Raw bytes', 'Gzip-9 bytes', 'Brotli-11 bytes'],
    { heading: 'Client JavaScript reference' },
  );
  const row = table.objs.find(
    (candidate) => clean(candidate['Client reference']) === 'React 19 SSR hydration fixture',
  );
  const measured = await measureReactHydrationPayload();
  const fields = [
    ['JS requests', 'js_requests'],
    ['Raw bytes', 'raw_bytes'],
    ['Gzip-9 bytes', 'gzip_9_bytes'],
    ['Brotli-11 bytes', 'brotli_11_bytes'],
  ];
  const mismatches = !row ? ['missing React reference row'] : fields.flatMap(
    ([column, key]) => num(row[column]) === measured[key]
      ? []
      : [`${column}: README ${num(row[column])}, rebuilt ${measured[key]}`],
  );
  mismatches.length === 0
    ? ok('React hydration payload bytes reproduce from the production bundle')
    : bad('React hydration payload fidelity', mismatches.join('; '));
}

// 7 · figure 20 is exactly reproducible from the generated suspense table.
//     This makes a stale or missing committed capacity chart a verification
//     failure rather than relying on developers to remember to rebuild it.
{
  const expected = suspenseLoad(tables);
  const path = join(SVG, '07-suspense-load.svg');
  let actual = null;
  try {
    actual = readFileSync(path, 'utf8');
  } catch {}
  actual === expected
    ? ok('Suspense load chart reproduces exactly from its README table')
    : bad('Suspense load chart fidelity', actual === null ? 'chart 20 is missing' : 'committed SVG is stale');
}

// 7b · figure 21 is exactly reproducible from the generated page-load table,
//      and the table's own derived column reproduces from its throughput cells.
{
  const expected = pageLoad(tables);
  const path = join(SVG, '08-canonical-pages-http.svg');
  let actual = null;
  try {
    actual = readFileSync(path, 'utf8');
  } catch {}
  actual === expected
    ? ok('Canonical pages HTTP chart reproduces exactly from its README table')
    : bad('Canonical pages HTTP chart fidelity', actual === null ? 'chart 21 is missing' : 'committed SVG is stale');
  const t = pick(tables, ['Workload', 'Engine', 'Sustained responses/s', 'Proa ÷ engine', 'CPU per response'], { heading: 'Canonical pages over HTTP' });
  const proa = {};
  for (const o of t.objs) if (clean(o.Engine) === 'Proa') proa[clean(o.Workload)] = num(o['Sustained responses/s']);
  const ratioBad = [];
  for (const o of t.objs) {
    const stated = parseFloat(clean(o['Proa ÷ engine']).replace(/[×x]/g, ''));
    const engineRps = num(o['Sustained responses/s']);
    const derived = proa[clean(o.Workload)] / engineRps;
    // both throughput cells are rounded to integers, so the derived ratio can
    // differ from the stated one by half a unit of each operand
    const operandTolerance = derived * (0.5 / engineRps + 0.5 / proa[clean(o.Workload)]);
    if (Math.abs(derived - stated) > (stated >= 10 ? 0.06 : 0.006) + operandTolerance) {
      ratioBad.push(`${clean(o.Engine)}/${clean(o.Workload)}: README ${stated}×, throughput cells give ${derived.toFixed(3)}×`);
    }
  }
  ratioBad.length === 0
    ? ok(`all ${t.objs.length} page-load throughput ratios reproduce from their rows`)
    : bad('page-load throughput ratios', ratioBad.join('\n        '));
}

// 7c · figure 22 is exactly reproducible from the generated cold-start table
{
  const expected = coldStart(tables);
  const path = join(SVG, '09-cold-start.svg');
  let actual = null;
  try {
    actual = readFileSync(path, 'utf8');
  } catch {}
  actual === expected
    ? ok('Cold-start chart reproduces exactly from its README table')
    : bad('Cold-start chart fidelity', actual === null ? 'chart 22 is missing' : 'committed SVG is stale');
}

// 7d · the expanded floor comparison retains every showcase page, and both its
//      table and SVG must reproduce from the matched process measurements.
{
  try {
    const capture = JSON.parse(readFileSync(join(HERE, '..', 'showcase', 'results', 'memcpy-floor.json'), 'utf8'));
    validateMemcpyCapture(capture);
    updateMemcpyReadme(md, capture) === md
      ? ok('all showcase memcpy process measurements, source hashes and README values agree')
      : bad('showcase memcpy table', 'engineering.md table is stale');
  } catch (error) {
    bad('showcase memcpy capture', error.message);
  }
  const expected = representative(tables);
  const actual = readFileSync(join(SVG, '03-representative-matrix.svg'), 'utf8');
  actual === expected
    ? ok('all renderer-to-memcpy ratios and the expanded figure reproduce from their tables')
    : bad('memcpy figure fidelity', 'committed SVG is stale');
}

// 7e · matched standard and full-size renders retain output parity and capacity evidence.
{
  try {
    const capture = JSON.parse(readFileSync(join(HERE, '..', 'showcase', 'results', 'buffer-comparison.json'), 'utf8'));
    validateBuffers(capture);
    updateBufferReadme(md, capture) === md
      ? ok('Proa allocation timings, output parity, capacities and source hashes agree')
      : bad('Proa allocation table', 'engineering.md table is stale');
  } catch (error) {
    bad('Proa allocation capture', error.message);
  }
}

console.log('\nOutput integrity');

// 8 · the output directory contains exactly the documented chart set.
{
  const expected = [
    '01-canonical-scoreboard.svg',
    '02-canonical-tail-dispersion.svg',
    '03-representative-matrix.svg',
    '04-criterion-microbenchmarks.svg',
    '05-product-card-scaling.svg',
    '06-showcase-corpus.svg',
    '07-suspense-load.svg',
    '08-canonical-pages-http.svg',
    '09-cold-start.svg',
  ];
  const actual = readdirSync(SVG).filter((file) => file.endsWith('.svg')).sort();
  JSON.stringify(actual) === JSON.stringify(expected)
    ? ok(`output directory contains the exact ${expected.length}-figure set`)
    : bad('figure roster', `expected ${expected.join(', ')}; found ${actual.join(', ')}`);
}

// 9 · no figure carries a formatting failure into its labels
{
  let hits = [];
  for (const f of readdirSync(SVG).filter((f) => f.endsWith('.svg'))) {
    const s = readFileSync(join(SVG, f), 'utf8');
    for (const token of ['NaN', 'undefined', 'Infinity', 'null']) {
      if (s.includes('>' + token) || s.includes(token + '<') || s.includes(' ' + token + ' ')) hits.push(`${f}: ${token}`);
    }
  }
  hits.length === 0 ? ok('no NaN, undefined, Infinity or null reached a label')
    : bad('formatting', hits.join('; '));
}

// 10 · every text run stays inside its figure. This is the check that catches a
//     caption or a value label running off the right edge, which is invisible in
//     a browser preview but permanent in a committed file.
{
  const SIZE = { t: T.title, d: T.deck, eb: T.panel, cat: T.cat, catb: T.cat, lg: T.cat,
    tick: T.tick, val: T.value, valb: T.value, valw: T.value, note: T.note,
    title: 25, task: 13, small: 10, value: 10, phase: 11, unknown: 12 };
  const overflow = [];
  for (const f of readdirSync(SVG).filter((f) => f.endsWith('.svg'))) {
    const s = readFileSync(join(SVG, f), 'utf8');
    const W = +/width="(\d+(?:\.\d+)?)"/.exec(s)[1];
    const H = +/height="(\d+(?:\.\d+)?)"/.exec(s)[1];
    const re = /<text x="(-?[\d.]+)" y="(-?[\d.]+)" class="([^"]*)"[^>]*>([^<]*)<\/text>/g;
    let m;
    while ((m = re.exec(s))) {
      const [, xs, ys, cls, body] = m;
      const x = +xs, y = +ys;
      const base = cls.split(/\s+/)[0];
      const size = SIZE[base] ?? T.cat;
      const w = textWidth(body, size, /b$/.test(base) || base === 't' || base === 'eb' ? 600 : 400);
      const left = cls.includes('end') ? x - w : cls.includes('mid') ? x - w / 2 : x;
      const right = left + w;
      if (left < 2 || right > W - 2 || y < 8 || y > H - 2) {
        overflow.push(`${f}: ${JSON.stringify(body.slice(0, 40))} spans ${left.toFixed(0)}–${right.toFixed(0)} in ${W}×${H}`);
      }
    }
  }
  overflow.length === 0 ? ok('every text run sits inside its figure bounds')
    : bad('text overflow', overflow.slice(0, 8).join('\n        ') + (overflow.length > 8 ? `\n        ...and ${overflow.length - 8} more` : ''));
}

// 11 · no two text runs collide. A label flipped back over its own mark, or two
//     columns grown into each other, is unreadable and invisible to an edge check.
{
  const SIZE = { t: T.title, d: T.deck, eb: T.panel, cat: T.cat, catb: T.cat, lg: T.cat,
    tick: T.tick, val: T.value, valb: T.value, valw: T.value, note: T.note,
    title: 25, task: 13, small: 10, value: 10, phase: 11, unknown: 12 };
  const clashes = [];
  for (const f of readdirSync(SVG).filter((f) => f.endsWith('.svg'))) {
    const s = readFileSync(join(SVG, f), 'utf8');
    const re = /<text x="(-?[\d.]+)" y="(-?[\d.]+)" class="([^"]*)"[^>]*>([^<]*)<\/text>/g;
    const boxes = [];
    let m;
    while ((m = re.exec(s))) {
      const [, xs, ys, cls, body] = m;
      if (!body.trim()) continue;
      const base = cls.split(/\s+/)[0];
      const size = SIZE[base] ?? T.cat;
      const w = textWidth(body, size, /b$/.test(base) || base === 't' || base === 'eb' ? 600 : 400);
      const x = +xs, y = +ys;
      const left = cls.includes('end') ? x - w : cls.includes('mid') ? x - w / 2 : x;
      boxes.push({ x0: left, x1: left + w, y0: y - size * 0.78, y1: y + size * 0.24, body });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        // textWidth deliberately over-estimates, so require a real overlap
        const ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
        const oy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
        if (ox > 3 && oy > 1) {
          clashes.push(`${f}: ${JSON.stringify(a.body.slice(0, 26))} over ${JSON.stringify(c.body.slice(0, 26))}`);
        }
      }
    }
  }
  clashes.length === 0 ? ok('no two text runs overlap in any figure')
    : bad('label collisions', clashes.slice(0, 8).join('\n        ') + (clashes.length > 8 ? `\n        ...and ${clashes.length - 8} more` : ''));
}

// 12 · each figure carries a title and a description for screen readers
{
  const missing = [];
  for (const f of readdirSync(SVG).filter((f) => f.endsWith('.svg'))) {
    const s = readFileSync(join(SVG, f), 'utf8');
    const desc = /<desc id="dsc">([\s\S]*?)<\/desc>/.exec(s);
    if (!/<title id="ttl">.+?<\/title>/.test(s)) missing.push(`${f}: no title`);
    else if (!desc || desc[1].length < 80) missing.push(`${f}: description too short to serve as a text alternative`);
  }
  missing.length === 0 ? ok('every figure has a title and a substantive description')
    : bad('accessibility', missing.join('; '));
}

// 13 · the dates printed in the figures are the dates of the README sections
//      they are drawn from, not whichever date happens to come first in the file.
{
  const meta = readMeta(md);
  const stale = [];
  for (const f of ['01-canonical-scoreboard.svg', '02-canonical-tail-dispersion.svg']) {
    if (!readFileSync(join(SVG, f), 'utf8').includes(meta.date)) stale.push(`${f} does not carry the canonical capture date ${meta.date}`);
  }
  if (!readFileSync(join(SVG, '05-product-card-scaling.svg'), 'utf8').includes(`${meta.scalingDate} UTC`)) {
    stale.push(`05-product-card-scaling.svg does not carry the product-scaling capture date ${meta.scalingDate}`);
  }
  stale.length === 0 ? ok(`figure dates match their evidence-page sections (${meta.date}; scaling ${meta.scalingDate})`)
    : bad('figure dates', stale.join('; '));
}

console.log(`\n${checks - failures}/${checks} checks passed.\n`);
process.exit(failures ? 1 : 0);
