// Editorial-light chart system for the Proa benchmark figures.
//
// Palette provenance: every categorical pairing used below was checked with the
// dataviz skill's validate_palette.js against the light surface #fcfcfb.
//   proa + peer          -> normal-vision dE 18.8, contrast >= 3:1 (PASS)
//   proa + alt           -> CVD dE 24.7, normal dE 33.6 (PASS)
//   seq[0..2]            -> ordinal ramp: monotone L, dL >= 0.06, single hue (PASS)
// The de-emphasis gray is deliberately achromatic: these figures use the
// *emphasis* form (one subject in accent, context in gray), not a categorical
// palette, so the chroma floor does not apply to it.

export const C = {
  paper:    '#fcfcfb',  // chart surface
  plane:    '#f4f3ef',  // outer plane / panel wash
  ink:      '#0b0b0b',  // primary text
  ink2:     '#52514e',  // secondary text
  muted:    '#898781',  // axis + tick text
  grid:     '#e6e4dc',  // hairline gridline
  axis:     '#c3c2b7',  // baseline / axis rule
  rule:     '#e1e0d9',  // divider hairline

  proa:     '#2a78d6',  // the subject
  proaWash: '#cde2fb',  // Proa at wash weight (areas, tracks)
  peer:     '#8f8d84',  // context / every other renderer
  peerWash: '#dcdad2',  // context at wash weight
  alt:      '#eb6834',  // the one genuine second series
  altWash:  '#fbdccd',
  floor:    '#4a3aa7',  // non-renderer controls (memcpy floor)
  kit:      '#287653',  // SvelteKit, wherever it is drawn beside Proa

  seq:      ['#86b6ef', '#3987e5', '#1c5cab'], // ordinal ramp (3 workloads)

  good:     '#0ca30c',
  warning:  '#fab219',
  critical: '#d03b3b',
};

export const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

// Type scale (px)
export const T = {
  title:   17,
  deck:    12.5,
  panel:   10.5, // uppercase eyebrow
  cat:     12,
  tick:    10.5,
  value:   11,
  note:    10,
};

// Approximate advance widths for a system sans, in em, indexed by charcode
// bucket. Used only to decide whether a label fits inside a mark; deliberately
// a shade generous so nothing is ever clipped.
const NARROW = new Set("iIlj|.,:;'`!()[]{}/\\ft".split(''));
const WIDE = new Set('mMWw@%'.split(''));
// Coefficients calibrated against Chromium's canvas metrics for this exact font
// stack, then scaled by 1.07 so the estimate always lands at or just above the
// real advance width. Over-estimating wraps a caption one word early; under-
// estimating runs it off the edge of the figure, which is unrecoverable in a
// static SVG.
const SAFETY = 1.07;
export function textWidth(s, size = 11, weight = 400) {
  let em = 0;
  for (const ch of String(s)) {
    if (NARROW.has(ch)) em += 0.33;
    else if (WIDE.has(ch)) em += 0.92;
    else if (ch >= '0' && ch <= '9') em += 0.60;
    else if (ch === ' ') em += 0.29;
    else if (ch >= 'A' && ch <= 'Z') em += 0.70;
    else em += 0.585;
  }
  if (weight >= 600) em *= 1.035;
  return em * size * SAFETY;
}

// ---- number formatting -----------------------------------------------------

export const commas = (n) =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function sig(n, digits = 3) {
  if (n === 0) return '0';
  const a = Math.abs(n);
  let s;
  if (a >= 100) s = n.toFixed(0);
  else if (a >= 10) s = n.toFixed(a >= 99.5 ? 0 : 1);
  else if (a >= 1) s = n.toFixed(2);
  else if (a >= 0.1) s = n.toFixed(2);
  else s = n.toPrecision(2);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return commas(s);
}

// Format a duration held in microseconds using the unit the README would use.
export function dur(us) {
  if (us >= 1000) return sig(us / 1000) + ' ms';
  if (us < 1) return sig(us * 1000) + ' ns';
  return sig(us) + ' µs';
}

export function bytes(b) {
  if (b >= 1e6) return sig(b / 1e6) + ' MB';
  if (b >= 1e3) return sig(b / 1e3) + ' kB';
  return commas(b) + ' B';
}

export function ratio(x) {
  if (x >= 10) return x.toFixed(1) + '×';
  return x.toFixed(2) + '×';
}
