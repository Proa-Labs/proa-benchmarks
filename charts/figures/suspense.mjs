import { C, dur, sig } from '../lib/theme.mjs';
import { pick, num, toUs } from '../lib/tables.mjs';
import {
  doc, header, footnotes, txt, rule, dot, line, log10, linear,
  logTicks, linTicks, thin, legend, eyebrow, f, PAD, WIDTH,
} from '../lib/svg.mjs';

const COL = WIDTH - PAD * 2;
const COLORS = { Proa: C.proa, Marko: C.peer, React: C.alt };

function panel({ x, y, w, h, title, sub, rows, value, format, log = false, ideal = false, reference = null, colors = COLORS }) {
  const rates = [...new Set(rows.map((row) => row.rate))].sort((a, b) => a - b);
  const values = rows.map(value);
  const x0 = x + 58, x1 = x + w - 18, y0 = y + (sub ? 40 : 25), y1 = y + h - 42;
  const xs = linear(0, Math.max(...rates), x0, x1);
  let ys, ticks;
  if (log) {
    const lo = Math.max(1, Math.min(...values) * 0.75);
    const hi = Math.max(...values) * 1.25;
    ys = log10(lo, hi, y1, y0);
    ticks = thin(logTicks(lo, hi).map((tick) => tick.v), ys, 34);
  } else {
    const scale = linTicks(Math.max(...values, ...(ideal ? rates : []), reference ? reference.value : 0) * 1.08, 4);
    ys = linear(0, scale.max, y1, y0);
    ticks = scale.ticks;
  }

  let body = eyebrow(x, y, title);
  if (sub) body += txt(x, y + 15, sub, 'note');
  for (const tick of ticks) {
    body += rule(x0, ys(tick), x1, ys(tick), C.grid);
    body += txt(x0 - 8, ys(tick) + 3.5, tick === 0 ? '0' : format(tick), 'tick end');
  }
  const labelled = new Set(thin(rates, xs, 34));
  for (const rate of rates) {
    body += rule(xs(rate), y1, xs(rate), y1 + 4, C.axis);
    if (labelled.has(rate)) body += txt(xs(rate), y1 + 17, rate >= 1000 ? `${rate / 1000}k` : String(rate), 'tick mid');
  }
  body += rule(x0, y1, x1, y1, C.axis);
  body += txt((x0 + x1) / 2, y1 + 34, 'Request rate (rps)', 'note mid');

  if (ideal) {
    const maximum = Math.max(...rates);
    body += line([[xs(0), ys(0)], [xs(maximum), ys(maximum)]], C.axis, 1.2, ' stroke-dasharray="4 4"');
  }
  if (reference) {
    body += rule(x0, ys(reference.value), x1, ys(reference.value), C.critical, 1.2);
    body += txt(x0 + 6, ys(reference.value) - 5, reference.label, 'note');
  }
  for (const engine of Object.keys(colors)) {
    const series = rows.filter((row) => row.engine === engine).sort((a, b) => a.rate - b.rate);
    const points = series.map((row) => [xs(row.rate), ys(value(row))]);
    body += line(points, colors[engine], engine.startsWith('Proa') ? 2.6 : 2.1);
    for (const point of points) body += dot(point[0], point[1], colors[engine], 4.1);
  }
  return body;
}

export function suspenseLoad(tables, meta) {
  const table = pick(tables, ['Engine', 'Request rate (rps)', 'Steady completion rps', 'Shell P50', 'Complete P50'], {
    heading: 'Suspense streaming over HTTP',
  });
  const rows = table.objs.map((row) => ({
    engine: row.Engine,
    rate: num(row['Request rate (rps)']),
    throughput: num(row['Steady completion rps']),
    shellP50Ms: toUs(row['Shell P50']) / 1000,
    p50Ms: toUs(row['Complete P50']) / 1000,
    p95Ms: toUs(row['Complete P95']) / 1000,
    p99Ms: toUs(row['Complete P99']) / 1000,
    cpuMs: toUs(row['CPU/request']) / 1000,
    cores: num(row.Cores),
    inFlight: num(row['Max in-flight']),
    rssMiB: num(row['Peak RSS']),
  }));
  // Latency labels switch to seconds once queueing takes over.
  const latency = (ms) => ms >= 1000 ? `${sig(ms / 1000)} s` : `${sig(ms)} ms`;

  const hdr = header(PAD, 44, 'Suspense streaming under load',
    '96 cards · 8 boundaries · one worker/process per engine · two separate captures', COL);
  let body = hdr.svg;
  body += eyebrow(PAD, 44 + hdr.h + 30, 'Resolved-HTML streams');
  body += txt(WIDTH - PAD, 44 + hdr.h + 30, meta.suspenseDate, 'note end');
  body += legend(PAD, 44 + hdr.h + 54, [
    { shape: 'line', color: C.proa, label: 'Proa' },
    { shape: 'line', color: C.peer, label: 'Marko' },
    { shape: 'line', color: C.alt, label: 'React' },
  ]);

  const top = 44 + hdr.h + 88;
  const gapX = 58, gapY = 42;
  const panelW = (COL - gapX) / 2;
  const panelH = 246;
  body += panel({
    x: PAD, y: top, w: panelW, h: panelH,
    title: 'Responses completed/s', sub: 'Higher is better · dashed: request-rate target', rows,
    value: (row) => row.throughput, format: (value) => value >= 1000 ? `${value / 1000}k` : String(value), ideal: true,
  });
  body += panel({
    x: PAD + panelW + gapX, y: top, w: panelW, h: panelH,
    title: 'Peak server RSS', sub: 'Lower is better', rows,
    value: (row) => row.rssMiB, format: (value) => `${Math.round(value)} MiB`,
  });

  // Latency distribution: one small panel per engine on identical log axes, so
  // the vertical spread between P50 and P99 reads as the shape of the tail.
  const latTop = top + panelH + gapY;
  const latGap = 30;
  const latW = (COL - latGap * 2) / 3;
  const latH = 262;
  const allLatency = rows.flatMap((row) => [row.p50Ms, row.p95Ms, row.p99Ms]).filter((v) => v > 0);
  // headroom above the highest point so its leader label clears the panel title
  const latLo = Math.min(...allLatency) * 0.6, latHi = Math.max(...allLatency) * 2.6;
  body += eyebrow(PAD, latTop, 'Response latency · shared log scale');
  ['Proa', 'Marko', 'React'].forEach((engine, index) => {
    const x = PAD + index * (latW + latGap);
    const x0 = x + 52, x1 = x + latW - 12, y0 = latTop + 38, y1 = latTop + latH - 42;
    const series = rows.filter((row) => row.engine === engine).sort((a, b) => a.rate - b.rate);
    const rates = series.map((row) => row.rate);
    const xs = linear(0, Math.max(...rates), x0, x1);
    const ys = log10(latLo, latHi, y1, y0);
    const color = COLORS[engine];
    body += txt(x0, latTop + 26, engine, engine === 'Proa' ? 'catb' : 'cat');
    for (const tick of thin(logTicks(latLo, latHi).map((t) => t.v), ys, 30)) {
      body += rule(x0, ys(tick), x1, ys(tick), C.grid);
      body += txt(x0 - 8, ys(tick) + 3.5, dur(tick * 1000), 'tick end');
    }
    const labelled = new Set(thin(rates, xs, 34));
    for (const rate of rates) {
      body += rule(xs(rate), y1, xs(rate), y1 + 4, C.axis);
      if (labelled.has(rate)) body += txt(xs(rate), y1 + 17, rate >= 1000 ? `${rate / 1000}k` : String(rate), 'tick mid');
    }
    body += rule(x0, y1, x1, y1, C.axis);
    body += txt((x0 + x1) / 2, y1 + 34, 'Request rate (rps)', 'note mid');
    // P50-to-P99 band, then the three percentile lines and the shell line
    const upper = series.map((row) => `${f(xs(row.rate))} ${f(ys(row.p99Ms))}`);
    const lower = [...series].reverse().map((row) => `${f(xs(row.rate))} ${f(ys(row.p50Ms))}`);
    body += `<path d="M${[...upper, ...lower].join('L')}Z" fill="${color}" opacity=".13"/>`;
    body += line(series.map((row) => [xs(row.rate), ys(row.p99Ms)]), color, 1.4, ' stroke-dasharray="5 3"');
    body += line(series.map((row) => [xs(row.rate), ys(row.p95Ms)]), color, 1.4, ' stroke-dasharray="1.5 3"');
    body += line(series.map((row) => [xs(row.rate), ys(row.p50Ms)]), color, 2.4);
    for (const row of series) body += dot(xs(row.rate), ys(row.p50Ms), color, 3.6);
    // Leader from the axis to the panel's highest P99, with its value, so the
    // top of a log axis is never left to be guessed.
    const peak = series.reduce((best, row) => (row.p99Ms > best.p99Ms ? row : best), series[0]);
    const py = ys(peak.p99Ms);
    body += rule(x0, py, xs(peak.rate), py, C.ink2, 1);
    body += `<circle cx="${f(xs(peak.rate))}" cy="${f(py)}" r="3.4" fill="${C.paper}" stroke="${C.ink2}" stroke-width="1.4"/>`;
    body += txt(x0 + 4, py - 6, `max P99 ${latency(peak.p99Ms)}`, 'valb');
  });
  {
    // legend swatches carry the same dash patterns as the lines they name
    const ly = latTop + latH + 8;
    let lx = PAD;
    for (const [label, dash, width] of [['P50', '', 2.4], ['P95', '1.5 3', 1.4], ['P99', '5 3', 1.4]]) {
      body += `<path d="M${f(lx)} ${f(ly - 3.5)}h18" stroke="${C.ink2}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
      body += txt(lx + 24, ly, label, 'lg');
      lx += 24 + 30 + 18;
    }
    body += txt(lx, ly, 'shaded: P50 to P99', 'lg');
  }

  // Native SvelteKit sends promised data rather than resolved boundary HTML.
  // Keep the independently captured sweep in its own section and show errors
  // beside latency: successful-response percentiles are censored at overload.
  const kitTable = pick(tables, ['Variant', 'Offered rps', 'Response ends/s', 'First byte P50'], {
    heading: 'HTTP streaming capacity and latency',
  });
  const kitRows = kitTable.objs.map((row) => ({
    engine: row.Variant,
    rate: num(row['Offered rps']),
    throughput: num(row['Response ends/s']),
    p95Ms: toUs(row['Response end P95']) / 1000,
    errors: num(row.Errors),
  }));
  const kitColors = {
    'Proa HTML stream': C.proa,
    'SvelteKit data stream': C.peer,
    'SvelteKit buffered HTML': C.alt,
  };
  const kitTop = latTop + latH + 62;
  body += rule(PAD, kitTop - 24, WIDTH - PAD, kitTop - 24, C.rule);
  body += eyebrow(PAD, kitTop, 'SvelteKit native streaming');
  body += txt(WIDTH - PAD, kitTop, meta.sveltekitDate + ' UTC', 'note end');
  body += txt(PAD, kitTop + 19, 'HTTP response end: resolved HTML for Proa; promised data for SvelteKit streaming.', 'note');
  body += legend(PAD, kitTop + 43, Object.entries(kitColors).map(([label, color]) => ({ shape: 'line', color, label })));
  const kitPanelTop = kitTop + 77;
  const kitW = (COL - 30 * 2) / 3;
  const kitH = 246;
  const kitPanel = { y: kitPanelTop, w: kitW, h: kitH, rows: kitRows, colors: kitColors };
  body += panel({
    ...kitPanel, x: PAD,
    title: 'Response ends/s', sub: 'Median · dashed: offered rate',
    value: (row) => row.throughput, format: (value) => value >= 1000 ? `${value / 1000}k` : String(value), ideal: true,
  });
  body += panel({
    ...kitPanel, x: PAD + kitW + 30,
    title: 'Response-end P95', sub: 'Successful responses · log scale',
    value: (row) => row.p95Ms, format: latency, log: true,
  });
  body += panel({
    ...kitPanel, x: PAD + (kitW + 30) * 2,
    title: 'Failed requests', sub: 'Sum of 3 full phases, including drain',
    value: (row) => row.errors, format: (value) => value >= 1000 ? `${value / 1000}k` : String(value),
  });

  const notesY = kitPanelTop + kitH + 12;
  const notes = footnotes(PAD, notesY, [
    'Latency includes scheduled-arrival queueing. More failures can reduce the successful-response P95.',
    'Data response end excludes browser rendering. Complete-DOM timings: sveltekit/browser.svg.',
  ], COL);

  return doc({
    w: WIDTH,
    h: notesY + notes.h + 12,
    title: 'Proa, Marko, React and SvelteKit streaming the product grid under HTTP load',
    desc: 'Every engine runs one worker thread or process. Separate captures, not a combined ranking. Resolved-HTML capture: ' + meta.suspenseDate + '. ' + rows.map((row) => `${row.engine} at ${row.rate} req/s target: ${row.throughput} steady-state completions per second, complete-response P50 ${row.p50Ms}, P95 ${row.p95Ms} and P99 ${row.p99Ms} milliseconds, ${row.rssMiB} MiB peak RSS`).join('. ') + '. Native SvelteKit comparison: ' + meta.sveltekitDate + '. Data response end excludes hydration and browser rendering. ' + kitRows.map((row) => `${row.engine} at ${row.rate} req/s target: ${row.throughput} response ends per second, successful response-end P95 ${row.p95Ms} milliseconds, ${row.errors} failed requests across three full phases`).join('. ') + '.',
    body: body + notes.svg,
  });
}
