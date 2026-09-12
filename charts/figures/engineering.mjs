import { C, T, textWidth, dur, sig, commas, bytes, ratio } from '../lib/theme.mjs';
import { pick, toUs, num, clean, withRange, slashTriple } from '../lib/tables.mjs';
import { bufferComparisonPanel } from './buffers.mjs';
import {
  doc, header, footnotes, txt, rule, dot, hbar, axes, log10, linear,
  logTicks, thin, legend, eyebrow, f, PAD, WIDTH,
} from '../lib/svg.mjs';

const COL = WIDTH - PAD * 2;
const HIST = 'Superseded capture · Aug 30–31, 2026';

// ---------------------------------------------------------------------------
// 05 · Core renderers and showcase pages against memcpy
// ---------------------------------------------------------------------------
export function representative(tables) {
  const t = pick(tables, ['Workload', 'Renderer/control', 'Language', 'Output bytes']);
  const P50 = 'Process-median P50 µs [min–max]';
  const byW = {};
  for (const o of t.objs) {
    const r = withRange(o[P50]);
    (byW[clean(o.Workload)] ||= []).push({
      name: clean(o['Renderer/control']), lang: clean(o.Language),
      p50: r.v, lo: r.lo, hi: r.hi, p95: num(o['Process-median P95 µs']),
      bytes: num(o['Output bytes']),
      control: /memcpy/i.test(o['Renderer/control']),
    });
  }
  const ws = ['Cards', '96-product grid', '1,000-row table'];
  // Panels share one row order (the order the first workload lists) so a single
  // left gutter labels all three. Rank changes between panels then read as
  // movement rather than as a relabelled axis.
  const order = byW[ws[0]].map((r) => r.name.replace(/ \d.*$/, ''));
  const key = (r) => r.name.replace(/ \d.*$/, '');
  for (const w of ws) byW[w].sort((a, c) => order.indexOf(key(a)) - order.indexOf(key(c)));
  const rows = Math.max(...ws.map((w) => byW[w].length));
  const hdr = header(PAD, 44, 'Render time vs memcpy',
    'P50 / hot-buffer copy · log scales · lower is better', COL);
  let b = hdr.svg;

  const gutter = 122, gap = 26;
  const panelW = (COL - gutter - gap * 2) / 3;
  const px0 = (i) => PAD + gutter + i * (panelW + gap);
  const sectionY = 44 + hdr.h + 34;
  const eyeY = sectionY + 26, tickY = eyeY + 36, top = tickY + 12, rowH = 22;
  const bottom = top + rows * rowH - 6;
  const coreMax = Math.max(...ws.flatMap((w) => {
    const floor = byW[w].find((r) => r.control);
    if (!floor) throw new Error(`Missing memcpy control for ${w}`);
    return byW[w].map((r) => r.hi / floor.p50);
  }));
  const coreHi = Math.max(10, 10 ** Math.ceil(Math.log10(coreMax)));
  b += eyebrow(PAD, sectionY, 'Core workloads · Aug 31, 2026 · superseded');

  // All ratios in a workload use its measured Proa-byte copy P50. The shaded
  // decade and 10× guide make the requested threshold visible without a claim
  // about how many results fall inside it.
  const ratioAxis = (sc, y0, y1, ticks) => {
    let out = `<rect x="${f(sc(1))}" y="${f(y0)}" width="${f(sc(10) - sc(1))}" height="${f(y1 - y0)}" fill="${C.proa}" opacity=".045"/>`;
    for (const value of ticks) {
      out += rule(sc(value), y0, sc(value), y1,
        value === 1 ? C.floor : value === 10 ? C.axis : C.grid, value === 1 || value === 10 ? 1.4 : 1);
      out += txt(sc(value), y0 - 8, value + '×', value === 10 ? 'valb mid' : 'tick mid');
    }
    return out;
  };

  ws.forEach((w, i) => {
    const list = byW[w];
    const r0 = px0(i) + 2, r1 = px0(i) + panelW - 62;
    const sc = log10(0.7, coreHi, r0, r1);
    const floor = list.find((r) => r.control);
    b += eyebrow(r0, eyeY, w);
    b += txt(r0, eyeY + 15, `1× = ${dur(floor.p50)} · ${bytes(floor.bytes)}`, 'note');
    b += txt(px0(i) + panelW, tickY, '× copy', 'note end');
    b += ratioAxis(sc, tickY + 8, bottom, [1, 10, 100, 1000].filter((v) => v <= coreHi));
    b += rule(r0 - 2, bottom, r1 + 4, bottom, C.axis);

    list.forEach((r, ri) => {
      const y = top + ri * rowH + rowH / 2 - 1;
      const isProa = r.name === 'Proa';
      const col = r.control ? C.floor : isProa ? C.proa : C.peer;
      if (i === 0 && isProa) b += `<rect x="${f(PAD - 6)}" y="${f(y - rowH / 2 + 2)}" width="${f(COL + 12)}" height="${f(rowH - 4)}" rx="3" fill="${C.proa}" opacity=".055"/>`;
      if (i === 0) {
        b += txt(PAD + gutter - 16, y + 4, key(r).replace('Memcpy control', 'memcpy floor'),
          isProa ? 'catb end' : r.control ? 'note end' : 'cat end');
      }
      b += rule(sc(r.lo / floor.p50), y, sc(r.hi / floor.p50), y, r.control ? '#ded9f2' : isProa ? C.proaWash : C.peerWash, 3);
      b += dot(sc(r.p50 / floor.p50), y, col, isProa ? 5 : 4);
      b += txt(px0(i) + panelW, y + 3.5, ratio(r.p50 / floor.p50), isProa ? 'valb end' : 'val end');
    });
  });

  b += rule(PAD, bottom + 22, PAD + COL, bottom + 22, C.rule);
  const allocation = bufferComparisonPanel(tables, bottom + 44);
  b += allocation.body;
  const notes = footnotes(PAD, allocation.bottom + 22,
    'Full-size capacity is known before timing. Copy: warmed, reused buffers; allocation excluded. Ranges: process P50 min–max.', COL);

  return doc({
    w: WIDTH, h: allocation.bottom + 22 + notes.h + 12,
    title: `Render time relative to memcpy across ${ws.length} core workloads and ${allocation.pageCount} showcase pages`,
    desc: 'Each denominator copies the workload’s pre-rendered Proa HTML into a warmed, preallocated buffer. ' +
      ws.map((w) => {
        const floor = byW[w].find((r) => r.control);
        return `${w} — ` + byW[w].map((r) => `${r.name}: ${ratio(r.p50 / floor.p50)} memcpy, P50 ${dur(r.p50)}, range ${dur(r.lo)} to ${dur(r.hi)}, ${commas(r.bytes)} bytes`).join('; ');
      }).join('. ') + '. Matched Proa output allocation capture: ' + allocation.desc,
    body: b + notes.svg,
  });
}

// ---------------------------------------------------------------------------
// 06 · Criterion micro-benchmarks
// ---------------------------------------------------------------------------
export function criterion(tables) {
  const std = pick(tables, ['Standard-page row', 'Output bytes/render', 'Raw time, µs/10 renders']);
  const cri = pick(tables, ['Criterion row', 'Output bytes', 'Raw time, µs']);

  const stdRows = std.objs.map((o) => {
    const [lo, v, hi] = slashTriple(o['Raw time, µs/10 renders']);
    return { label: clean(o['Standard-page row']), lo, v, hi, bytes: num(o['Output bytes/render']) };
  });

  // Split each Criterion id into family / fixture / engine so the head-to-head
  // groups can be found structurally instead of by hand.
  const ENGINE = /(proa|sailfish|askama|topcoat|leptos|dioxus|yew)/;
  const all = cri.objs.map((o) => {
    const [lo, v, hi] = slashTriple(o['Raw time, µs']);
    const id = clean(o['Criterion row']);
    const [fam, variant = ''] = id.split('/');
    const m = ENGINE.exec(variant);
    const fixture = m ? variant.slice(0, m.index).replace(/_$/, '') : '';
    return {
      id, fam, variant, fixture, lo, v, hi, bytes: num(o['Output bytes']),
      engine: m ? variant.slice(m.index) : variant,
      proa: /proa/i.test(variant),
      group: fam + (fixture ? '/' + fixture : ''),
    };
  });
  // A group earns a place only if a non-Proa engine ran the same fixture.
  const groups = [...new Set(all.map((r) => r.group))]
    .filter((g) => all.some((r) => r.group === g && !r.proa));
  const head = all.filter((r) => groups.includes(r.group));
  const hdr = header(PAD, 44, 'Criterion microbenchmarks',
    `${HIST} · point estimates with 95% slope intervals · log scales`, COL);
  let b = hdr.svg;

  const LX = PAD + 214, PX0 = PAD + 224, PX1 = PAD + COL - 196;
  const VX = PAD + COL - 104, BX = PAD + COL;

  b += legend(PAD, 44 + hdr.h + 26, [
    { shape: 'dot', color: C.proa, label: 'Proa' },
    { shape: 'dot', color: C.peer, label: 'Peer engine' },
  ]);

  // --- panel A: the standard page, 10-render batches
  let y = 44 + hdr.h + 62;
  b += eyebrow(PAD, y, 'Standard page · 10 renders/batch');
  b += txt(VX, y, 'time', 'note end');
  b += txt(BX, y, 'bytes/render', 'note end');
  const aTop = y + 30, aRowH = 20;
  const aLo = Math.min(...stdRows.map((r) => r.lo)) * 0.75;
  const aHi = Math.max(...stdRows.map((r) => r.hi)) * 1.3;
  const asc = log10(aLo, aHi, PX0, PX1);
  const aBottom = aTop + stdRows.length * aRowH - 6;
  for (const v of thin(logTicks(aLo, aHi).map((t) => t.v).filter((v) => asc(v) >= PX0 - 1 && asc(v) <= PX1 + 1), asc, 48)) {
    b += rule(asc(v), aTop - 6, asc(v), aBottom, C.grid);
    b += txt(asc(v), aTop - 14, dur(v).replace(' ', ''), 'tick mid');
  }
  stdRows.forEach((r, i) => {
    const Y = aTop + i * aRowH + aRowH / 2 - 3;
    const isProa = /^Proa/i.test(r.label);
    b += txt(LX, Y + 4, r.label, isProa ? 'catb end' : 'cat end');
    b += rule(asc(r.lo), Y, asc(r.hi), Y, isProa ? C.proaWash : C.peerWash, 3);
    b += dot(asc(r.v), Y, isProa ? C.proa : C.peer, isProa ? 4.6 : 4);
    b += txt(VX, Y + 4, dur(r.v), (isProa ? 'valb' : 'val') + ' end');
    b += txt(BX, Y + 4, commas(r.bytes) + ' B', 'val end');
  });
  b += rule(PX0, aBottom, PX1, aBottom, C.axis);

  // --- panel B: head-to-head fixtures
  let by = aBottom + 46;
  b += rule(PAD, by - 22, PAD + COL, by - 22, C.rule);
  b += eyebrow(PAD, by, 'Paired fixtures · 1 render; bursts: 100 requests');
  b += txt(VX, by, 'time', 'note end');
  b += txt(BX, by, 'bytes/render', 'note end');
  const bTop = by + 30, bRowH = 19;
  const lo = Math.min(...head.map((r) => r.lo)) * 0.75;
  const hi = Math.max(...head.map((r) => r.hi)) * 1.3;
  const bsc = log10(lo, hi, PX0, PX1);
  const bHeight = head.length * bRowH + groups.length * 11;
  for (const v of thin(logTicks(lo, hi).map((t) => t.v).filter((v) => bsc(v) >= PX0 - 1 && bsc(v) <= PX1 + 1), bsc, 52)) {
    b += rule(bsc(v), bTop - 6, bsc(v), bTop + bHeight, C.grid);
    b += txt(bsc(v), bTop - 14, dur(v).replace(' ', ''), 'tick mid');
  }
  let cursor = bTop;
  for (const g of groups) {
    const list = head.filter((r) => r.group === g);
    b += `<text x="${f(PAD)}" y="${f(cursor + 12)}" class="eb mono">${g}</text>`;
    list.forEach((r, i) => {
      const Y = cursor + i * bRowH + bRowH / 2 + 3;
      b += txt(LX, Y + 4, r.engine.replace(/_/g, ' '), r.proa ? 'catb end' : 'cat end');
      b += rule(bsc(r.lo), Y, bsc(r.hi), Y, r.proa ? C.proaWash : C.peerWash, 3);
      b += dot(bsc(r.v), Y, r.proa ? C.proa : C.peer, r.proa ? 4.6 : 4);
      b += txt(VX, Y + 4, dur(r.v), (r.proa ? 'valb' : 'val') + ' end');
      b += txt(BX, Y + 4, commas(r.bytes) + ' B', 'val end');
    });
    cursor += list.length * bRowH + 11;
  }
  const bBottom = cursor - 5;
  b += rule(PX0, bBottom, PX1, bBottom, C.axis);

  const notes = footnotes(PAD, bBottom + 20,
    'One Criterion process; output sizes differ between engines.', COL);

  return doc({
    w: WIDTH, h: bBottom + 20 + notes.h + 12,
    title: 'Criterion micro-benchmarks',
    desc: 'Standard page, 10-render batches: ' + stdRows.map((r) => `${r.label} ${dur(r.v)}, ${commas(r.bytes)} bytes`).join('; ') +
      '. Head-to-head fixtures: ' + head.map((r) => `${r.id} ${dur(r.v)}, ${commas(r.bytes)} bytes`).join('; ') + '.',
    body: b + notes.svg,
  });
}

// ---------------------------------------------------------------------------
// 09 · Full-response product-card scaling across the canonical roster
// ---------------------------------------------------------------------------
export function cardScaling(tables, meta) {
  const t = pick(tables, ['Renderer', '12 cards P50', '96 cards P50', '768 cards P50'],
    { heading: 'Product-grid scaling capture' });
  const sizes = [12, 96, 768];
  const series = [
    { count: 12, label: '12 cards', color: C.proa, shape: 'circle' },
    { count: 96, label: '96 cards', color: C.alt, shape: 'square' },
    { count: 768, label: '768 cards', color: C.floor, shape: 'diamond' },
  ];
  const rows = t.objs.map((o) => ({
    name: clean(o.Renderer),
    values: sizes.map((count) => ({ count, v: toUs(o[`${count} cards P50`]) })),
  }));
  const allV = rows.flatMap((r) => r.values.map((v) => v.v));

  const hdr = header(PAD, 44, 'Product-card render scaling',
    `Engineering capture · ${meta.scalingDate} UTC · fresh full responses · five processes per cell`, COL);
  let b = hdr.svg;

  const marker = (x, y, shape, color) => {
    if (shape === 'circle') return dot(x, y, color, 5);
    if (shape === 'square') {
      return `<rect x="${f(x - 4.7)}" y="${f(y - 4.7)}" width="9.4" height="9.4" rx="1.2" fill="${color}" stroke="${C.paper}" stroke-width="2"/>`;
    }
    return `<path d="M${f(x)} ${f(y - 6)}L${f(x + 6)} ${f(y)}L${f(x)} ${f(y + 6)}L${f(x - 6)} ${f(y)}Z" fill="${color}" stroke="${C.paper}" stroke-width="2"/>`;
  };

  const legendY = 44 + hdr.h + 34;
  let legendX = PAD;
  for (const item of series) {
    b += marker(legendX + 5, legendY - 4, item.shape, item.color);
    b += txt(legendX + 17, legendY, item.label, 'lg');
    legendX += 17 + textWidth(item.label, T.cat) + 28;
  }

  const x0 = PAD + 145, x1 = PAD + COL - 92;
  const columnY = legendY + 35, rowTop = columnY + 22, rowH = 23;
  const plotTop = rowTop - 13, plotBottom = rowTop + (rows.length - 1) * rowH + 13;
  const xLo = Math.min(...allV) * 0.65, xHi = Math.max(...allV) * 1.15;
  const xs = log10(xLo, xHi, x0, x1);
  const ys = linear(0, 1, plotBottom, plotTop);
  const xTicks = thin(logTicks(xLo, xHi).map((tick) => tick.v), xs, 52);

  b += eyebrow(PAD, columnY, 'Renderer');
  b += eyebrow(x0, columnY, 'P50 render time · log scale · lower is better');
  b += txt(PAD + COL, columnY, '768-CARD P50', 'eb end', ' text-anchor="end"');

  const proaIndex = rows.findIndex((row) => row.name === 'Proa');
  if (proaIndex >= 0) {
    const y = rowTop + proaIndex * rowH;
    b += `<rect x="${PAD}" y="${f(y - rowH / 2 + 1)}" width="${COL}" height="${rowH - 2}" rx="4" fill="${C.proaWash}" opacity=".28"/>`;
  }
  b += '<g text-anchor="middle">' + axes({
    x0, x1, y0: plotTop, y1: plotBottom, xs, ys,
    xTicks, yTicks: [], xFmt: (v) => dur(v),
    xGrid: true,
  }) + '</g>';

  rows.forEach((row, i) => {
    const isProa = row.name === 'Proa';
    const y = rowTop + i * rowH;
    const points = row.values.map(({ count, v }) => ({
      x: xs(v),
      item: series.find((item) => item.count === count),
    }));
    b += rule(x0, y, x1, y, C.grid);
    b += rule(points[0].x, y, points.at(-1).x, y,
      isProa ? C.proaWash : C.peerWash, isProa ? 3 : 2);
    b += txt(x0 - 14, y + 4, row.name, isProa ? 'catb end' : 'cat end',
      ' text-anchor="end"');
    for (const point of points) b += marker(point.x, y, point.item.shape, point.item.color);
    b += txt(PAD + COL, y + 4, dur(row.values.at(-1).v),
      isProa ? 'valb end' : 'val end', ' text-anchor="end"');
  });

  return doc({
    w: WIDTH, h: plotBottom + 40,
    title: `Product-grid scaling across ${rows.length} labelled renderer rows`,
    desc: rows.map((r) => `${r.name} — ` + r.values.map(({ count, v }) =>
      `${commas(count)} cards: ${dur(v)}`).join('; ')).join('. ') + '.',
    body: b,
  });
}
