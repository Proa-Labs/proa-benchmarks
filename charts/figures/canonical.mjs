import { C, T, textWidth, dur } from '../lib/theme.mjs';
import { pick, toUs, clean } from '../lib/tables.mjs';
import {
  doc, header, txt, rule, dot, log10,
  logTicks, thin, legend, eyebrow, f, PAD, WIDTH,
} from '../lib/svg.mjs';

const WORKLOADS = ['Component page', '1,000-row table', 'Product grid'];
const SHAPE = {
  'Component page': '32 cards · 160 features',
  '1,000-row table': '1,000 rows × 12 columns',
  'Product grid': '96 product cards · 480 SVG stars',
};
const COL = WIDTH - PAD * 2;
const GUTTER = 112, GAP = 16;
const PANEL = (COL - GUTTER - GAP * 2) / 3;
const px0 = (i) => PAD + GUTTER + i * (PANEL + GAP);

// Shared scaffold: header, three panel eyebrows, and roster rows.
function scaffold({ title, decks, legendItems, rows, rowH = 18.6, labelRoom = 52 }) {
  const hdr = header(PAD, 44, title, decks, COL);
  let y = 44 + hdr.h;
  let svg = hdr.svg;
  if (legendItems) { y += 26; svg += legend(PAD, y, legendItems); }
  const eyeY = y + 34, shapeY = eyeY + 14, tickY = shapeY + 22, top = tickY + 12;
  const bottom = top + rows * rowH - 4;
  return {
    svg, top, bottom, eyeY, shapeY, tickY, rowH,
    plot: (i) => [px0(i) + 2, px0(i) + PANEL - labelRoom],
    rowY: (r) => top + r * rowH + rowH / 2 - 1,
  };
}

function rosterLabel(s, name, r, isProa, wash = true) {
  const y = s.rowY(r);
  let out = '';
  if (isProa && wash) {
    out += `<rect x="${f(PAD - 6)}" y="${f(y - s.rowH / 2 + 1)}" width="${f(COL + 12)}" height="${f(s.rowH - 2)}" rx="3" fill="${C.proa}" opacity=".055"/>`;
  }
  out += txt(PAD + GUTTER - 16, y + 4, name, isProa ? 'catb end' : 'cat end');
  return out;
}

// ---------------------------------------------------------------------------
// 01 · Canonical scoreboard
// ---------------------------------------------------------------------------
export function scoreboard(tables, meta) {
  const t = pick(tables, ['Renderer', 'Component page', '1,000-row table', 'Product grid'],
    { heading: 'Current result' });
  const roster = t.objs.map((o) => ({
    name: clean(o.Renderer),
    cells: WORKLOADS.map((w) => ({
      us: toUs(o[w].split('·')[0]),
      x: parseFloat(o[w].split('·')[1].replace(/[×x]/g, '').trim()),
    })),
  }));

  const s = scaffold({
    title: 'Server-render latency',
    decks: `P50 relative to Proa · log scale · lower is better · ${meta.date}`,
    rows: roster.length,
  });
  let b = s.svg;

  WORKLOADS.forEach((w, i) => {
    const [r0, r1] = s.plot(i);
    const sc = log10(0.68, 62, r0, r1);
    b += eyebrow(r0, s.eyeY, w);
    b += txt(r0, s.shapeY, SHAPE[w], 'note');
    for (const v of [1, 2, 5, 10, 20, 50]) {
      const X = sc(v), ref = v === 1;
      b += rule(X, s.tickY + 4, X, s.bottom, ref ? C.proaWash : C.grid, ref ? 1.5 : 1);
      b += txt(X, s.tickY, v + '×', 'tick mid');
    }
    b += rule(r0 - 2, s.bottom, r1 + 4, s.bottom, C.axis);

    roster.forEach((r, ri) => {
      const y = s.rowY(ri), isProa = r.name === 'Proa';
      if (i === 0) b += rosterLabel(s, r.name, ri, isProa);
      const X = sc(r.cells[i].x);
      if (!isProa) b += rule(sc(1), y, X, y, C.peerWash, 1.5);
      b += dot(X, y, isProa ? C.proa : C.peer, isProa ? 5 : 4);
    });

    // selective direct labels: the reference, the fastest, the slowest
    const iFast = roster.reduce((a, r, k) => (r.cells[i].x < roster[a].cells[i].x ? k : a), 0);
    const iSlow = roster.reduce((a, r, k) => (r.cells[i].x > roster[a].cells[i].x ? k : a), 0);
    const iProa = roster.findIndex((r) => r.name === 'Proa');
    for (const k of new Set([iProa, iFast, iSlow])) {
      const r = roster[k], y = s.rowY(k) + 3.5, X = sc(r.cells[i].x);
      const label = dur(r.cells[i].us);
      const fits = X + 9 + textWidth(label, T.value, 600) <= px0(i) + PANEL;
      b += txt(fits ? X + 9 : X - 9, y, label,
        (r.name === 'Proa' ? 'valb' : 'val') + (fits ? '' : ' end'));
    }
  });

  return doc({
    w: WIDTH, h: s.bottom + 24,
    title: `Server-render latency relative to Proa — ${meta.date} canonical capture`,
    desc: `Renderer-only latency, excluding HTTP and hydration. Each dot is the median of five process P50s on a logarithmic axis. All cells passed DOM parity. ${roster.length} renderers across three workloads as a multiple of Proa's P50. ` +
      roster.map((r) => `${r.name} — ` + WORKLOADS.map((w, i) => `${w}: ${dur(r.cells[i].us)}, ${r.cells[i].x}×`).join('; ')).join('. ') + '.',
    body: b,
  });
}

// ---------------------------------------------------------------------------
// 02 · P50 → P95 dispersion
// ---------------------------------------------------------------------------
export function tails(tables, meta) {
  const t = pick(tables, ['Renderer', 'Workload', 'P50', 'P95']);
  const byW = {};
  for (const o of t.objs) {
    (byW[clean(o.Workload)] ||= []).push({
      name: clean(o.Renderer), p50: toUs(o.P50), p95: toUs(o.P95),
    });
  }
  const rows = byW[WORKLOADS[0]].length;

  const s = scaffold({
    title: 'Render latency: P50–P95',
    decks: `Separate log scales · lower is better · ${meta.date}`,
    legendItems: [
      { shape: 'dot', color: C.peer, label: 'P50' },
      { shape: 'hollow', color: C.peer, label: 'P95' },
      { shape: 'dot', color: C.warning, label: 'P95 ≥ 3× P50' },
    ],
    rows, labelRoom: 60,
  });
  let b = s.svg;

  WORKLOADS.forEach((w, i) => {
    const list = byW[w];
    const [r0, r1] = s.plot(i);
    const lo = Math.min(...list.map((r) => r.p50)) * 0.75;
    const hi = Math.max(...list.map((r) => r.p95)) * 1.25;
    const sc = log10(lo, hi, r0, r1);
    b += eyebrow(r0, s.eyeY, w);
    b += txt(r0, s.shapeY, SHAPE[w], 'note');

    const cand = logTicks(lo, hi).map((t) => t.v).filter((v) => sc(v) >= r0 - 1 && sc(v) <= r1 + 1);
    for (const v of thin(cand, sc, 42)) {
      const X = sc(v);
      b += rule(X, s.tickY + 4, X, s.bottom, C.grid);
      b += txt(X, s.tickY, dur(v).replace(' ', ''), 'tick mid');
    }
    b += rule(r0 - 2, s.bottom, r1 + 4, s.bottom, C.axis);

    list.forEach((r, ri) => {
      const y = s.rowY(ri), isProa = r.name === 'Proa';
      const flag = r.p95 / r.p50 >= 3;
      const col = isProa ? C.proa : flag ? C.warning : C.peer;
      if (i === 0) b += rosterLabel(s, r.name, ri, isProa);
      b += rule(sc(r.p50), y, sc(r.p95), y, flag ? C.warning : isProa ? C.proaWash : C.peerWash, 3);
      b += dot(sc(r.p50), y, col, 4);
      b += `<circle cx="${f(sc(r.p95))}" cy="${f(y)}" r="3.4" fill="${C.paper}" stroke="${col}" stroke-width="1.8"/>`;
      if (flag) b += txt(sc(r.p95) + 9, y + 3.5, (r.p95 / r.p50).toFixed(1) + '× tail', 'val');
    });
  });

  return doc({
    w: WIDTH, h: s.bottom + 24,
    title: 'P50 to P95 dispersion per renderer and workload',
    desc: Object.entries(byW).map(([w, l]) =>
      `${w} — ` + l.map((r) => `${r.name}: P50 ${dur(r.p50)}, P95 ${dur(r.p95)}`).join('; ')).join('. ') + '.',
    body: b,
  });
}
