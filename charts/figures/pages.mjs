import { C, dur, sig, commas } from '../lib/theme.mjs';
import { pick, num, toUs, clean } from '../lib/tables.mjs';
import {
  doc, header, txt, rule, hbar, linear, linTicks, legend, eyebrow, f, PAD, WIDTH,
} from '../lib/svg.mjs';

const COL = WIDTH - PAD * 2;
const WORKLOADS = ['Component page', 'Product grid', '1,000-row table'];
const SHAPE = {
  'Component page': '25 kB · 32 cards',
  'Product grid': '285 kB · 96 cards',
  '1,000-row table': '990 kB · 1,000 rows × 12 columns',
};
const GUTTER = 118, GAP = 22;
const PANEL = (COL - GUTTER - GAP * 2) / 3;
const px0 = (i) => PAD + GUTTER + i * (PANEL + GAP);

// One row of three panels (one per workload), each holding a horizontal bar
// per engine. Values are direct-labelled; the axis carries the scale.
function barRow({ y, title, engines, cells, value, format, showShape = false, rowH = 21 }) {
  let svg = eyebrow(PAD, y, title);
  const titleY = y + 24;
  const labelH = showShape ? 30 : 20;
  const top = titleY + labelH;
  const labelRoom = 62;
  for (const [i, w] of WORKLOADS.entries()) {
    const x0 = px0(i), x1 = px0(i) + PANEL - labelRoom;
    const values = engines.map((e) => value(cells[w][e]));
    const { ticks, max } = linTicks(Math.max(...values), 3);
    const sc = linear(0, max, x0, x1);
    svg += txt(x0, titleY, w, 'catb');
    if (showShape) svg += txt(x0, titleY + 13, SHAPE[w], 'note');
    for (const t of ticks) {
      const X = sc(t);
      svg += rule(X, top - 4, X, top + engines.length * rowH - 6, C.grid);
      svg += txt(X, top + engines.length * rowH + 8, t === 0 ? '0' : format(t, true), 'tick mid');
    }
    engines.forEach((e, r) => {
      const v = value(cells[w][e]);
      const yy = top + r * rowH;
      const isProa = e === 'Proa';
      svg += hbar(sc(0), yy, sc(v) - sc(0), rowH - 8, isProa ? C.proa : C.peer, 3);
      svg += txt(sc(v) + 6, yy + rowH / 2 + 0.5, format(v), isProa ? 'valb' : 'val');
      if (i === 0) svg += txt(PAD + GUTTER - 16, yy + rowH / 2 + 0.5, e, isProa ? 'catb end' : 'cat end');
    });
    svg += rule(x0, top - 4, x0, top + engines.length * rowH - 6, C.axis);
  }
  return { svg, h: 24 + labelH + engines.length * rowH + 22 };
}

export function pageLoad(tables) {
  const t = pick(tables, ['Workload', 'Engine', 'Sustained responses/s', 'Proa ÷ engine', 'CPU per response'], {
    heading: 'Canonical pages over HTTP',
  });
  const engines = [...new Set(t.objs.map((o) => clean(o.Engine)))];
  const cells = Object.fromEntries(WORKLOADS.map((w) => [w, {}]));
  for (const o of t.objs) {
    cells[clean(o.Workload)][clean(o.Engine)] = {
      rps: num(o['Sustained responses/s']),
      cpuMs: toUs(o['CPU per response']) / 1000,
      rssMiB: num(o['Peak RSS']),
      cores: num(o['Cores used']),
    };
  }
  const hdr = header(PAD, 44, 'HTTP capacity on one core',
    'Loopback HTTP/1.1 · uncompressed · medians of 3 server processes', COL);
  let body = hdr.svg;
  let y = 44 + hdr.h + 40;

  const rows = [
    { title: 'Responses/s · higher is better', showShape: true, value: (c) => c.rps, format: (v, tick) => tick ? (v >= 1000 ? `${sig(v / 1000)}k` : String(v)) : commas(Math.round(v)) },
    { title: 'CPU/response · lower is better', value: (c) => c.cpuMs, format: (v) => dur(v * 1000) },
    { title: 'Peak RSS · lower is better', value: (c) => c.rssMiB, format: (v) => `${sig(v)} MiB` },
  ];
  for (const row of rows) {
    const r = barRow({ y, engines, cells, ...row });
    body += r.svg;
    y += r.h + 18;
  }

  return doc({
    w: WIDTH,
    h: y,
    title: 'Proa, React, Marko and Go html/template serving the canonical pages over HTTP on one core',
    desc: 'One core per engine, uncompressed loopback HTTP/1.1. Medians of three fresh processes; CPU counts all server threads. ' + t.objs.map((o) => `${clean(o.Engine)} on the ${clean(o.Workload)}: ${o['Sustained responses/s']} responses per second, ${o['CPU per response']} CPU per response, ${o['Peak RSS']} peak RSS`).join('. ') + '.',
    body,
  });
}

// ---------------------------------------------------------------------------
// 22 · Cold start to first response
// ---------------------------------------------------------------------------
export function coldStart(tables) {
  const t = pick(tables, ['Engine', 'First response P50', 'P95', 'Max', 'First byte P50'], {
    heading: 'Cold start to first response',
  });
  const rows = t.objs.map((o) => ({
    name: clean(o.Engine).replace(/ 0\.3\.0 @ [0-9a-f]+(?: \([^)]*\))?$/, ''),
    p50: toUs(o['First response P50']) / 1000,
    p95: toUs(o.P95) / 1000,
    max: toUs(o.Max) / 1000,
    rssMiB: num(o['RSS after first response']),
  }));
  const hdr = header(PAD, 44, 'Cold start to first response',
    'Spawn to complete product-grid response · 15 fresh processes per engine', COL);
  let body = hdr.svg;
  body += legend(PAD, 44 + hdr.h + 26, [
    { color: C.peer, label: 'P50' },
    { shape: 'tick', color: C.ink, label: 'P95' },
    { shape: 'hollow', color: C.peer, label: 'Max' },
  ]);
  const top = 44 + hdr.h + 64;
  const rowH = 26;
  const gutter = 118;
  const rssW = 120;
  const x0 = PAD + gutter, x1 = WIDTH - PAD - rssW - 70;
  const { ticks, max } = linTicks(Math.max(...rows.map((r) => r.max)) * 1.05, 4);
  const sc = linear(0, max, x0, x1);
  body += eyebrow(PAD, top - 16, 'Response time · lower is better');
  body += eyebrow(x1 + 24, top - 16, 'RSS after response');
  for (const tick of ticks) {
    body += rule(sc(tick), top - 4, sc(tick), top + rows.length * rowH - 6, C.grid);
    body += txt(sc(tick), top + rows.length * rowH + 8, tick === 0 ? '0' : `${sig(tick)} ms`, 'tick mid');
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const isProa = r.name === 'Proa';
    body += txt(PAD + gutter - 16, y + rowH / 2 + 0.5, r.name, isProa ? 'catb end' : 'cat end');
    body += hbar(sc(0), y + 2, sc(r.p50) - sc(0), rowH - 12, isProa ? C.proa : C.peer, 3);
    body += rule(sc(r.p95), y + 1, sc(r.p95), y + rowH - 9, C.ink, 1.5);
    body += `<circle cx="${f(sc(r.max))}" cy="${f(y + rowH / 2 - 4)}" r="3.2" fill="${C.paper}" stroke="${isProa ? C.proa : C.peer}" stroke-width="1.5"/>`;
    body += txt(sc(r.max) + 9, y + rowH / 2 + 0.5, `${sig(r.p50)} ms`, isProa ? 'valb' : 'val');
    body += txt(x1 + 24, y + rowH / 2 + 0.5, `${sig(r.rssMiB)} MiB`, isProa ? 'valb' : 'val');
  });
  body += rule(x0, top - 4, x0, top + rows.length * rowH - 6, C.axis);
  return doc({
    w: WIDTH,
    h: top + rows.length * rowH + 30,
    title: 'Cold start to first product-grid response for Proa, React, Marko and Go html/template',
    desc: 'Wall time includes process creation, runtime and module loading, fixture construction and the first render. Fifteen fresh processes per engine on one host. ' + rows.map((r) => `${r.name}: ${sig(r.p50)} ms median, ${sig(r.p95)} ms P95, ${sig(r.max)} ms slowest, ${sig(r.rssMiB)} MiB after the first response`).join('. ') + '.',
    body,
  });
}
