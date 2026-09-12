// Every figure in this directory is drawn from the evidence pages' own tables,
// so a re-capture that regenerates a page also regenerates the charts. Nothing
// here retypes a measurement.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The front page and the three evidence pages, in reading order. Tables are
// picked by header signature (and heading) across all of them, so a table may
// live on whichever page explains it.
export const EVIDENCE_PAGES = ['README.md', 'scoreboard.md', 'http-capacity.md', 'engineering.md'];

export function readReadme(path) {
  return readFileSync(path, 'utf8');
}

export function readSources(root) {
  return EVIDENCE_PAGES.map((name) => readFileSync(join(root, name), 'utf8')).join('\n\n');
}

const cells = (row) =>
  row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

// Capture metadata that the figures print in their titles and decks. Each date
// is read from inside the evidence-page section its figure is drawn from, and a missing
// one stops the build: a figure that silently picks up another section's date
// is worse than no figure. (The scoreboard once took the first date in the file,
// which became the HTTP headline's date when that section moved above it.)
export function readMeta(md) {
  const within = (section, re, what) => {
    const start = md.indexOf(`<!-- ${section}:start -->`);
    const end = md.indexOf(`<!-- ${section}:end -->`, start);
    const m = start === -1 || end === -1 ? null : re.exec(md.slice(start, end));
    if (!m) throw new Error(`evidence pages: could not read ${what} inside the ${section} section`);
    return m[1];
  };
  return {
    date: within('canonical-scoreboard', /\*\*(\w+ \d+, \d{4}) · /, 'the canonical capture date'),
    scalingDate: within('product-scaling', /This (\w+ \d+, \d{4}) UTC engineering capture/, 'the product-scaling capture date'),
    host: (/- Host: (.+)/.exec(md) || [, ''])[1],
    capture: (/- Capture: `(.+?)`/.exec(md) || [, ''])[1],
  };
}

export function parseTables(md) {
  const lines = md.split('\n');
  const out = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const m = /^#{2,6}\s+(.*)$/.exec(lines[i]);
    if (m) { heading = m[1].trim(); continue; }
    if (!/^\s*\|/.test(lines[i])) continue;
    if (!lines[i + 1] || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const headers = cells(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j])) { rows.push(cells(lines[j])); j++; }
    out.push({ headers, rows, heading });
    i = j - 1;
  }
  return out;
}

// Find the one table whose leading headers match `sig` exactly.
export function pick(tables, sig, { heading } = {}) {
  const hits = tables.filter((t) =>
    sig.every((h, i) => t.headers[i] === h) &&
    (!heading || t.heading.includes(heading)));
  if (hits.length !== 1) {
    throw new Error(
      `table signature [${sig.join(' | ')}]${heading ? ` under "${heading}"` : ''} matched ${hits.length} tables ` +
      `(expected exactly 1). Headings seen: ${hits.map((h) => JSON.stringify(h.heading)).join(', ') || 'none'}`);
  }
  const t = hits[0];
  return {
    ...t,
    // row objects keyed by header name
    objs: t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? '']))),
  };
}

// ---- value parsers ---------------------------------------------------------

const DASH = /[–—-]/;          // en dash, em dash, hyphen
export const clean = (s) => String(s).replace(/`/g, '').replace(/\*\*/g, '').trim();

export function num(s) {
  const m = /-?[\d,]+(?:\.\d+)?/.exec(clean(s));
  if (!m) throw new Error(`no number in ${JSON.stringify(s)}`);
  return parseFloat(m[0].replace(/,/g, ''));
}

// All durations are normalised to microseconds so panels share one unit.
const UNIT = { ns: 1e-3, 'µs': 1, us: 1, ms: 1e3, s: 1e6 };
export function toUs(s) {
  const str = clean(s);
  const m = /(-?[\d,]+(?:\.\d+)?)\s*(ns|µs|us|ms|s)\b/.exec(str);
  if (!m) throw new Error(`no duration in ${JSON.stringify(s)}`);
  return parseFloat(m[1].replace(/,/g, '')) * UNIT[m[2]];
}

// Numbers here carry thousands separators ("1,736.88"), so a range cannot be
// split on the comma — pull the numbers out with a separator-aware pattern.
const NUMS = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
export function nums(s) {
  return (clean(s).match(NUMS) || []).map((n) => parseFloat(n.replace(/,/g, '')));
}

// "1.96 [1.75–2.42]" / "171.250 [170.917, 171.667]" -> {v, lo, hi}
export function withRange(s) {
  const str = clean(s);
  const v = num(str);
  const b = /\[([^\]]+)\]/.exec(str);
  if (!b) return { v, lo: v, hi: v };
  const parts = nums(b[1]);
  return { v, lo: parts[0], hi: parts[1] ?? parts[0] };
}

// "21.000 / 21.046 / 21.092" -> [lower, point, upper]; keeps any trailing unit.
export function slashTriple(s) {
  const str = clean(s);
  const unit = /(ns|µs|us|ms|s)\s*$/.exec(str);
  const k = unit ? UNIT[unit[1]] : 1;
  const parts = str.replace(/(ns|µs|us|ms|s)\s*$/, '').split('/')
    .map((p) => parseFloat(p.replace(/,/g, '').trim()));
  return parts.map((p) => p * k);
}

// Sample lists are comma-separated and their members may themselves carry
// thousands separators ("35,735.762, 42,505.743, ...").
export function csvNums(s) {
  return nums(s);
}

export { DASH };
