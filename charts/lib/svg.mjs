// Static-SVG primitives for the benchmark figures.
//
// These figures ship as plain SVG inside a Markdown README, where GitHub
// renders them through <img> and strips script and hover. There is therefore no
// interaction layer, and the usual "let the tooltip carry it" escape hatch does
// not exist: every plotted value is either direct-labelled or recoverable from
// the axis, and the README table beside the figure is its table view.

import { C, FONT, MONO, T, textWidth } from './theme.mjs';

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- scales ----------------------------------------------------------------

export function linear(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  f.domain = [d0, d1]; f.range = [r0, r1];
  return f;
}

export function log10(d0, d1, r0, r1) {
  const l0 = Math.log10(d0), l1 = Math.log10(d1);
  const f = (v) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0);
  f.domain = [d0, d1]; f.range = [r0, r1]; f.isLog = true;
  return f;
}

export function band(n, r0, r1, inner = 0.34) {
  const step = (r1 - r0) / n;
  const w = step * (1 - inner);
  const f = (i) => r0 + step * i + (step - w) / 2;
  f.width = w; f.step = step;
  return f;
}

export function niceMax(max, count = 5) {
  if (max <= 0) return 1;
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max / step) * step, step };
}

export function linTicks(max, count = 5) {
  const { max: m, step } = niceMax(max, count);
  const out = [];
  for (let v = 0; v <= m + step / 2; v += step) out.push(+v.toFixed(10));
  return { ticks: out, max: m };
}

// Drop ticks that would land closer than minPx to the last one kept. Log axes
// crowd badly at the top of each decade; without this the labels overlap.
export function thin(values, scale, minPx = 38) {
  const out = [];
  let last = -1e9;
  for (const v of values) {
    const x = scale(v);
    if (Math.abs(x - last) < minPx) continue;
    out.push(v); last = x;
  }
  return out;
}

export function logTicks(d0, d1) {
  const out = [];
  const lo = Math.floor(Math.log10(d0)), hi = Math.ceil(Math.log10(d1));
  for (let e = lo; e <= hi; e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= d0 * 0.999 && v <= d1 * 1.001) out.push({ v, major: m === 1 });
    }
  }
  return out;
}

// ---- marks -----------------------------------------------------------------

// Horizontal bar growing right from x0: 4px rounded data-end, square baseline.
export function hbar(x0, y, w, h, fill, r = 4, extra = '') {
  const neg = w < 0;
  const W = Math.abs(w);
  const x = neg ? x0 - W : x0;
  const rr = Math.min(r, W, h / 2);
  if (W <= 0.35) return '';
  const d = neg
    ? `M${f(x + W)} ${f(y)}H${f(x + rr)}a${f(rr)} ${f(rr)} 0 0 0 -${f(rr)} ${f(rr)}V${f(y + h - rr)}a${f(rr)} ${f(rr)} 0 0 0 ${f(rr)} ${f(rr)}H${f(x + W)}Z`
    : `M${f(x)} ${f(y)}H${f(x + W - rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}V${f(y + h - rr)}a${f(rr)} ${f(rr)} 0 0 1 -${f(rr)} ${f(rr)}H${f(x)}Z`;
  return `<path d="${d}" fill="${fill}"${extra}/>`;
}

// Vertical column growing up from baseline y0: rounded cap, square base.
export function vbar(x, y0, w, h, fill, r = 4, extra = '') {
  const H = Math.abs(h);
  if (H <= 0.35) return '';
  const rr = Math.min(r, H, w / 2);
  const y = y0 - H;
  const d = `M${f(x)} ${f(y0)}V${f(y + rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} -${f(rr)}H${f(x + w - rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}V${f(y0)}Z`;
  return `<path d="${d}" fill="${fill}"${extra}/>`;
}

export const f = (n) => (Math.round(n * 100) / 100).toString();

export function line(pts, stroke, width = 2, extra = '') {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;
}

// Marker with the 2px surface ring that keeps it legible over other marks.
export function dot(x, y, fill, r = 4, ring = C.paper) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" stroke="${ring}" stroke-width="2"/>`;
}

export function txt(x, y, s, cls = 'cat', extra = '') {
  return `<text x="${f(x)}" y="${f(y)}" class="${cls}"${extra}>${esc(s)}</text>`;
}

export function rule(x1, y1, x2, y2, stroke = C.grid, w = 1) {
  return `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}" stroke="${stroke}" stroke-width="${w}"/>`;
}

// Beeswarm offsets for a strip of raw samples. Position on the value axis stays
// exact; the perpendicular offset carries no meaning and exists only so that
// samples closer together than a marker width remain individually countable.
export function beeswarm(values, scale, r = 3, maxLanes = 5) {
  const sorted = [...values].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length);
  const lanes = [];
  for (const { v, i } of sorted) {
    const x = scale(v);
    let lane = 0;
    while (lane < maxLanes && lanes[lane] !== undefined && x - lanes[lane] < r * 2.1) lane++;
    // Past maxLanes the strip would grow taller than its row; wrap instead, so a
    // very tight cluster overlaps slightly rather than colliding with its neighbours.
    if (lane >= maxLanes) lane = lanes.reduce((a, v, k) => (v < lanes[a] ? k : a), 0);
    lanes[lane] = x;
    // 0, -1, +1, -2, +2 ... so the strip stays centred on its row
    const step = Math.ceil(lane / 2) * (lane % 2 === 1 ? -1 : 1);
    out[i] = { x, dy: step * (r * 2.1) };
  }
  return out;
}

// ---- composed pieces -------------------------------------------------------

export function eyebrow(x, y, s) {
  // ASCII-only uppercase: 'µs'.toUpperCase() is 'ΜS' with a Greek capital Mu,
  // which renders as "MS" and silently changes the unit.
  return txt(x, y, String(s).replace(/[a-z]/g, (c) => c.toUpperCase()), 'eb');
}

export function legend(x, y, items, gap = 18) {
  let cx = x, out = '';
  for (const it of items) {
    const w = textWidth(it.label, T.cat);
    if (it.shape === 'line') {
      out += `<path d="M${f(cx)} ${f(y - 3.5)}h14" stroke="${it.color}" stroke-width="2" stroke-linecap="round"/>`;
      out += txt(cx + 20, y, it.label, 'lg');
      cx += 20 + w + gap;
    } else if (['dot', 'hollow', 'diamond', 'tick'].includes(it.shape)) {
      const mx = cx + 5, my = y - 3.5;
      if (it.shape === 'diamond') {
        out += `<polygon points="${f(mx)},${f(my - 4)} ${f(mx + 4)},${f(my)} ${f(mx)},${f(my + 4)} ${f(mx - 4)},${f(my)}" fill="${C.paper}" stroke="${it.color}" stroke-width="1.4"/>`;
      } else if (it.shape === 'tick') {
        out += rule(mx, my - 5, mx, my + 5, it.color, 1.5);
      } else {
        out += `<circle cx="${f(mx)}" cy="${f(my)}" r="4" fill="${it.shape === 'hollow' ? C.paper : it.color}" stroke="${it.color}" stroke-width="1.8"/>`;
      }
      out += txt(cx + 15, y, it.label, 'lg');
      cx += 15 + w + gap;
    } else {
      out += `<rect x="${f(cx)}" y="${f(y - 9)}" width="11" height="11" rx="2.5" fill="${it.color}"/>`;
      out += txt(cx + 17, y, it.label, 'lg');
      cx += 17 + w + gap;
    }
  }
  return out;
}

// A framed plot box: hairline grid, tick labels on the left and below, and a
// solid baseline. Returns the svg for the chrome only; marks are drawn over it.
export function axes({ x0, x1, y0, y1, xs, ys, xTicks, yTicks, xFmt = String, yFmt = String, xTitle, yTitle, xGrid = false }) {
  let out = '';
  for (const t of yTicks) {
    const Y = ys(t);
    if (Y < y0 - 1 || Y > y1 + 1) continue;
    out += rule(x0, Y, x1, Y, C.grid);
    out += txt(x0 - 9, Y + 3.5, yFmt(t), 'tick end');
  }
  for (const t of xTicks) {
    const X = xs(t);
    if (X < x0 - 1 || X > x1 + 1) continue;
    if (xGrid) out += rule(X, y0, X, y1, C.grid);
    out += rule(X, y1, X, y1 + 4, C.axis);
    out += txt(X, y1 + 16, xFmt(t), 'tick mid');
  }
  out += rule(x0, y1, x1, y1, C.axis);
  if (xTitle) out += txt((x0 + x1) / 2, y1 + 33, xTitle, 'note mid');
  if (yTitle) out += txt(x0, y0 - 12, yTitle, 'note');
  return out;
}

// ---- document --------------------------------------------------------------

export function doc({ w, h, title, desc, body }) {
  // No font-family attribute on the root: the stack contains "Segoe UI" with
  // double quotes, which cannot be nested inside a double-quoted XML attribute.
  // GitHub serves .svg as image/svg+xml and parses it strictly, so an SVG that
  // renders in a browser preview can still fail there. The <style> rule below
  // sets the same stack, where quoted family names are legal.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="ttl dsc">
<title id="ttl">${esc(title)}</title>
<desc id="dsc">${esc(desc)}</desc>
<style>
  text { font-family: ${FONT}; }
  .t   { font-size: ${T.title}px; font-weight: 600; fill: ${C.ink}; letter-spacing: -.005em; }
  .d   { font-size: ${T.deck}px; font-weight: 400; fill: ${C.ink2}; }
  .eb  { font-size: ${T.panel}px; font-weight: 600; fill: ${C.muted}; letter-spacing: .09em; }
  .cat { font-size: ${T.cat}px; font-weight: 400; fill: ${C.ink2}; }
  .catb{ font-size: ${T.cat}px; font-weight: 600; fill: ${C.ink}; }
  .lg  { font-size: ${T.cat}px; font-weight: 400; fill: ${C.ink2}; }
  .tick{ font-size: ${T.tick}px; font-weight: 400; fill: ${C.muted}; font-variant-numeric: tabular-nums; }
  .val { font-size: ${T.value}px; font-weight: 500; fill: ${C.ink2}; font-variant-numeric: tabular-nums;
         paint-order: stroke; stroke: ${C.paper}; stroke-width: 3.5px; stroke-linejoin: round; }
  .valb{ font-size: ${T.value}px; font-weight: 600; fill: ${C.ink}; font-variant-numeric: tabular-nums;
         paint-order: stroke; stroke: ${C.paper}; stroke-width: 3.5px; stroke-linejoin: round; }
  .valw{ font-size: ${T.value}px; font-weight: 600; fill: ${C.paper}; font-variant-numeric: tabular-nums; }
  .note{ font-size: ${T.note}px; font-weight: 400; fill: ${C.muted}; }
  .mono{ font-family: ${MONO}; }
  .end { text-anchor: end; }
  .mid { text-anchor: middle; }
</style>
<rect width="${w}" height="${h}" fill="${C.paper}"/>
${body}
</svg>
`;
}

// Keep visible chrome to a short title, one-line subtitle, and essential keys.
// Methodology and interpretation belong in the README and accessible <desc>.
// Text still wraps to the measured width to protect against future overflow.

export function wrap(text, maxW, size) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && textWidth(next, size) > maxW) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Returns { svg, h } so callers can size the document around the real text.
export function header(x, y, title, decks, w) {
  let out = txt(x, y, title, 't');
  let cy = y;
  for (const d of [].concat(decks).filter(Boolean)) {
    for (const l of wrap(d, w, T.deck)) { cy += 17; out += txt(x, cy, l, 'd'); }
  }
  return { svg: out, h: cy - y };
}

export function noteLines(lines, w) {
  return [].concat(lines).filter(Boolean).flatMap((l) => wrap(l, w, T.note));
}

export function footnotes(x, yTop, lines, w) {
  const ls = noteLines(lines, w);
  let out = rule(x, yTop, x + w, yTop, C.rule);
  ls.forEach((l, i) => { out += txt(x, yTop + 15 + i * 12.5, l, 'note'); });
  return { svg: out, h: 15 + ls.length * 12.5 };
}

export const PAD = 34;
export const WIDTH = 980;
