import { C, dur, commas, bytes } from '../lib/theme.mjs';
import { pick, num, clean, withRange } from '../lib/tables.mjs';
import {
  doc, header, txt, rule, dot, log10,
  logTicks, thin, legend, eyebrow, f, PAD, WIDTH,
} from '../lib/svg.mjs';

const COL = WIDTH - PAD * 2;
const HIST = 'Superseded capture · Aug 30–31, 2026';

// ---------------------------------------------------------------------------
// 10 · Linked showcase corpus
// ---------------------------------------------------------------------------
export function showcase(tables) {
  const t = pick(tables, ['Showcase page', 'Output bytes', 'Recorded renders']);
  const P50 = 'Process-median P50 µs [95% CI]';
  const rows = t.objs.filter((o) => clean(o['Showcase page']) !== 'Airbnb parity').map((o) => {
    const r = withRange(o[P50]);
    return {
      page: clean(o['Showcase page']), bytes: num(o['Output bytes']),
      renders: num(o['Recorded renders']), p50: r.v, lo: r.lo, hi: r.hi,
      p95: num(o['Pooled P95 µs']), stable: /^yes/i.test(clean(o['Raw bytes stable?'])),
    };
  });
  const hdr = header(PAD, 44, 'Proa showcase render latency',
    `${HIST} · five processes per page · log scale`, COL);
  let b = hdr.svg;
  b += legend(PAD, 44 + hdr.h + 26, [
    { shape: 'dot', color: C.proa, label: 'P50' },
    { shape: 'line', color: C.proa, label: '95% CI' },
    { shape: 'hollow', color: C.proa, label: 'Pooled P95' },
  ]);

  const LX = PAD + 190, PX0 = PAD + 200, PX1 = PAD + COL - 250;
  const eyeY = 44 + hdr.h + 60, top = eyeY + 26, rowH = 21;
  const bottom = top + rows.length * rowH - 5;
  const lo = Math.min(...rows.map((r) => r.lo)) * 0.7;
  const hi = Math.max(...rows.map((r) => r.p95)) * 1.3;
  const sc = log10(lo, hi, PX0, PX1);

  b += eyebrow(PAD, eyeY, 'Render time');
  b += txt(PX1 + 52, eyeY, 'P50', 'note end');
  b += txt(PX1 + 132, eyeY, 'output', 'note end');
  b += txt(PAD + COL, eyeY, 'raw bytes', 'note end');
  for (const v of thin(logTicks(lo, hi).map((x) => x.v).filter((v) => sc(v) >= PX0 - 1 && sc(v) <= PX1 + 1), sc, 46)) {
    b += rule(sc(v), top - 4, sc(v), bottom, C.grid);
    b += txt(sc(v), top - 12, dur(v).replace(' ', ''), 'tick mid');
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2 + 2;
    b += txt(LX, y + 4, r.page, 'cat end');
    b += rule(sc(r.p50), y, sc(r.p95), y, C.proaWash, 1.5);
    b += rule(sc(r.lo), y, sc(r.hi), y, C.proa, 3);
    b += `<circle cx="${f(sc(r.p95))}" cy="${f(y)}" r="3.2" fill="${C.paper}" stroke="${C.proa}" stroke-width="1.6"/>`;
    b += dot(sc(r.p50), y, C.proa, 4.4);
    b += txt(PX1 + 52, y + 4, dur(r.p50), 'valb end');
    b += txt(PX1 + 132, y + 4, bytes(r.bytes), 'val end');
    b += txt(PAD + COL, y + 4, r.stable ? 'stable' : 'varies by process', r.stable ? 'val end' : 'note end');
  });
  b += rule(PX0, bottom, PX1, bottom, C.axis);

  return doc({
    w: WIDTH, h: bottom + 24,
    title: 'Linked showcase corpus render latency',
    desc: rows.map((r) => `${r.page}: P50 ${dur(r.p50)} (95% CI ${dur(r.lo)} to ${dur(r.hi)}), pooled P95 ${dur(r.p95)}, ${commas(r.bytes)} bytes, ${commas(r.renders)} recorded renders, raw bytes ${r.stable ? 'stable' : 'not stable'}`).join('. ') + '.',
    body: b,
  });
}
