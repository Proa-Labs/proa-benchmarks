import { C, dur, ratio } from '../lib/theme.mjs';
import { pick, num, clean, withRange } from '../lib/tables.mjs';
import { txt, rule, dot, log10, legend, eyebrow, f, PAD, WIDTH } from '../lib/svg.mjs';

export function bufferComparisonPanel(tables, sectionY) {
  const source = pick(tables, ['Buffer comparison workload', 'Output bytes']);
  const capture = pick(tables, ['Buffer capture', 'Date (UTC)', 'Proa revision']).objs[0];
  const rows = source.objs.map((o) => ({
    name: clean(o['Buffer comparison workload']),
    standard: withRange(o['Default P50 µs [min–max]']),
    full: withRange(o['Full-size P50 µs [min–max]']),
    copy: withRange(o['Copy P50 µs [min–max]']),
    standardRatio: num(o['Default / copy']), fullRatio: num(o['Full-size / copy']),
    speedup: num(o.Speedup),
  }));
  const col = WIDTH - PAD * 2;
  let b = eyebrow(PAD, sectionY, `Proa output allocation · ${clean(capture['Date (UTC)'])}`);
  b += txt(PAD + col, sectionY, 'Fresh buffers · allocation included', 'note end');
  const legendY = sectionY + 26;
  b += legend(PAD, legendY, [
    { shape: 'dot', color: C.proa, label: 'Default · 4 KiB chunks' },
    { shape: 'hollow', color: C.alt, label: 'Full-size · one output buffer' },
  ]);
  const x0 = PAD + 214, x1 = PAD + 554, top = legendY + 44, rowH = 28;
  const yAt = (i) => top + i * rowH + (i >= 3 ? 12 : 0) + rowH / 2;
  const bottom = yAt(rows.length - 1) + rowH / 2 - 3;
  const max = Math.max(...rows.flatMap((r) => [r.standard.hi / r.copy.v, r.full.hi / r.copy.v]));
  const upper = Math.max(10, 10 ** Math.ceil(Math.log10(max)));
  const sc = log10(.7, upper, x0, x1);
  b += `<rect x="${f(sc(1))}" y="${f(top - 2)}" width="${f(sc(10) - sc(1))}" height="${f(bottom - top + 2)}" fill="${C.proa}" opacity=".045"/>`;
  for (const tick of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter((t) => t <= upper)) {
    b += rule(sc(tick), top - 2, sc(tick), bottom, tick === 10 ? C.axis : C.grid);
    b += txt(sc(tick), top - 12, `${tick}×`, tick === 10 ? 'valb mid' : 'tick mid');
  }
  const cols = [PAD + 678, PAD + 798, PAD + col];
  ['Default / copy', 'Full-size / copy', 'Speedup'].forEach((label, i) => {
    b += txt(cols[i], top - 12, label, 'note end');
  });
  b += rule(PAD, yAt(2) + rowH / 2 + 8, PAD + col, yAt(2) + rowH / 2 + 8, C.rule);
  rows.forEach((r, i) => {
    const y = yAt(i);
    b += txt(x0 - 16, y + 4, r.name, 'cat end');
    b += rule(sc(r.standardRatio), y, sc(r.fullRatio), y, C.axis, 1.2);
    b += rule(sc(r.standard.lo / r.copy.v), y, sc(r.standard.hi / r.copy.v), y, C.proaWash, 3);
    b += rule(sc(r.full.lo / r.copy.v), y, sc(r.full.hi / r.copy.v), y, C.alt, 2);
    b += dot(sc(r.standardRatio), y, C.proa, 4);
    b += `<circle cx="${f(sc(r.fullRatio))}" cy="${f(y)}" r="5" fill="none" stroke="${C.alt}" stroke-width="1.8"/>`;
    b += txt(cols[0], y + 4, ratio(r.standardRatio), 'val end');
    b += txt(cols[1], y + 4, ratio(r.fullRatio), 'valb end');
    b += txt(cols[2], y + 4, ratio(r.speedup), 'val end');
  });
  b += rule(x0, bottom, x1, bottom, C.axis);
  return {
    body: b, bottom, pageCount: rows.length - 3,
    desc: 'Both Proa variants include allocation, page construction and runtime tags. Full-size rendering uses an exact-size contiguous Vec writer; the default uses 4 KiB chunks. ' +
      rows.map((r) => `${r.name}: default ${dur(r.standard.v)} (${ratio(r.standardRatio)} memcpy), full-size ${dur(r.full.v)} (${ratio(r.fullRatio)} memcpy), copy ${dur(r.copy.v)}, speedup ${ratio(r.speedup)}`).join('. ') + '.',
  };
}
