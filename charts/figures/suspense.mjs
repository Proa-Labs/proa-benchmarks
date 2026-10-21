import { C, dur, sig } from '../lib/theme.mjs';
import { pick, num, toUs } from '../lib/tables.mjs';
import {
  doc, header, footnotes, txt, rule, dot, line, log10, linear,
  logTicks, linTicks, thin, legend, eyebrow, f, PAD, WIDTH,
} from '../lib/svg.mjs';

const COL = WIDTH - PAD * 2;
const COLORS = { Proa: C.proa, Marko: C.peer, React: C.alt, SvelteKit: C.kit };

function panel({ x, y, w, h, title, sub, rows, value, format, ideal = false }) {
  const rates = [...new Set(rows.map((row) => row.rate))].sort((a, b) => a - b);
  const values = rows.map(value);
  const x0 = x + 58, x1 = x + w - 18, y0 = y + (sub ? 40 : 25), y1 = y + h - 42;
  const xs = linear(0, Math.max(...rates), x0, x1);
  const scale = linTicks(Math.max(...values, ...(ideal ? rates : [])) * 1.08, 4);
  const ys = linear(0, scale.max, y1, y0);
  const ticks = scale.ticks;

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
  for (const engine of Object.keys(COLORS)) {
    const series = rows.filter((row) => row.engine === engine).sort((a, b) => a.rate - b.rate);
    const points = series.map((row) => [xs(row.rate), ys(value(row))]);
    body += line(points, COLORS[engine], engine === 'Proa' ? 2.6 : 2.1);
    for (const point of points) body += dot(point[0], point[1], COLORS[engine], 4.1);
  }
  return body;
}

export function suspenseLoad(tables, meta) {
  // Use the fresh paired Proa/SvelteKit capture and retained Marko/React rows.
  const table = pick(tables, ['Engine', 'Request rate (rps)', 'Steady completion rps', 'Shell P50', 'Complete P50'], {
    heading: 'Suspense streaming over HTTP',
  });
  const rows = table.objs.filter(row => row.Engine !== 'Proa').map((row) => ({
    engine: row.Engine,
    rate: num(row['Request rate (rps)']),
    throughput: num(row['Steady completion rps']),
    p50Ms: toUs(row['Complete P50']) / 1000,
    p95Ms: toUs(row['Complete P95']) / 1000,
    p99Ms: toUs(row['Complete P99']) / 1000,
    rssMiB: num(row['Peak RSS']),
    errors: num(row.Errors),
  }));
  const comparison = pick(tables, ['Framework', 'Offered rps', 'Response ends/s', 'First byte P50'], {
    heading: 'HTTP streaming capacity and latency',
  });
  rows.push(...comparison.objs.map(row => ({
    engine: row.Framework,
    rate: num(row['Offered rps']),
    throughput: num(row['Response ends/s']),
    p50Ms: toUs(row['Response end P50']) / 1000,
    p95Ms: toUs(row['Response end P95']) / 1000,
    p99Ms: toUs(row['Response end P99']) / 1000,
    rssMiB: num(row['Peak RSS']),
    errors: num(row.Errors),
  })));
  // Latency labels switch to seconds once queueing takes over.
  const latency = (ms) => ms >= 1000 ? `${sig(ms / 1000)} s` : `${sig(ms)} ms`;

  const hdr = header(PAD, 44, 'Suspense streaming under load',
    '96 cards · 8 boundaries · one worker/process per engine · medians of 3 processes', COL);
  let body = hdr.svg;
  body += legend(PAD, 44 + hdr.h + 27, Object.entries(COLORS).map(([label, color]) => ({ shape: 'line', color, label })));

  const top = 44 + hdr.h + 66;
  const gapX = 58, gapY = 42;
  const panelW = (COL - gapX) / 2;
  const panelH = 246;
  body += panel({
    x: PAD, y: top, w: panelW, h: panelH,
    title: 'Response ends/s', sub: 'Higher is better · dashed: request-rate target', rows,
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
  const latGap = 24;
  const latW = (COL - latGap * 3) / 4;
  const latH = 280;
  const allLatency = rows.flatMap((row) => [row.p50Ms, row.p95Ms, row.p99Ms]).filter((v) => v > 0);
  // headroom above the highest point so its leader label clears the panel title
  const latLo = Math.min(...allLatency) * 0.6, latHi = Math.max(...allLatency) * 2.6;
  body += eyebrow(PAD, latTop, 'Response-end latency · shared log scale');
  Object.keys(COLORS).forEach((engine, index) => {
    const x = PAD + index * (latW + latGap);
    const x0 = x + 52, x1 = x + latW - 12, y0 = latTop + 54, y1 = latTop + latH - 42;
    const series = rows.filter((row) => row.engine === engine).sort((a, b) => a.rate - b.rate);
    const rates = series.map((row) => row.rate);
    const xs = linear(0, Math.max(...rates), x0, x1);
    const ys = log10(latLo, latHi, y1, y0);
    const color = COLORS[engine];
    body += txt(x0, latTop + 26, engine, engine === 'Proa' ? 'catb' : 'cat');
    body += txt(x0, latTop + 41, `${series.reduce((sum, row) => sum + row.errors, 0).toLocaleString('en-US')} failures in sweep`, 'note');
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
    // P50-to-P99 band, then the three percentile lines
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

  const notesY = latTop + latH + 26;
  const notes = footnotes(PAD, notesY, [
    `Proa/SvelteKit: ${meta.sveltekitDate} UTC. Marko/React: ${meta.suspenseDate}. Same host, fixture and offered rates.`,
    'SvelteKit response end delivers data; the others deliver resolved HTML. Browser completion: sveltekit/browser.svg.',
    'Successful-response latency includes scheduled queueing. Failures by rate remain in the source tables.',
  ], COL);

  return doc({
    w: WIDTH,
    h: notesY + notes.h + 12,
    title: 'Proa, Marko, React and SvelteKit streaming the product grid under HTTP load',
    desc: `Proa and SvelteKit captured ${meta.sveltekitDate} UTC; Marko and React captured ${meta.suspenseDate}. One worker thread or process per engine. SvelteKit response end delivers promised data and excludes browser rendering; the other streams deliver resolved HTML. ` + rows.map((row) => `${row.engine} at ${row.rate} req/s target: ${row.throughput} response ends per second, response-end P50 ${row.p50Ms}, P95 ${row.p95Ms} and P99 ${row.p99Ms} milliseconds, ${row.rssMiB} MiB peak RSS, ${row.errors} failures across three repeats`).join('. ') + '.',
    body: body + notes.svg,
  });
}
