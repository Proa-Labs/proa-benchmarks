#!/usr/bin/env node
// Regenerates every figure in this directory from the evidence pages' own tables
// (README.md, scoreboard.md, http-capacity.md, engineering.md, sveltekit.md).
//   node charts/build.mjs
// Re-run it after any capture that rewrites one of those pages.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSources, parseTables, readMeta } from './lib/tables.mjs';

// These files are served as image/svg+xml and parsed strictly, so rendering in
// a browser preview is not proof they are valid — a browser will forgive things
// an XML parser will not. Every figure is checked before it is written.
const RAW_TEXT = new Set(['style', 'title', 'desc', 'text']);
const VOID_OK = new Set(['rect', 'circle', 'path', 'line', 'polyline', 'polygon', 'use', 'stop', 'image']);

function assertWellFormed(svg, name) {
  const fail = (msg, at) => {
    throw new Error(`${name}.svg is not well-formed XML: ${msg}` +
      (at === undefined ? '' : `\n  near: ${JSON.stringify(svg.slice(Math.max(0, at - 60), at + 60))}`));
  };
  const bare = svg.match(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
  if (bare) fail('an unescaped & in the output', bare.index);

  const tag = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"<>]*")*)\s*(\/?)>/g;
  const stack = [];
  let cursor = 0, m;
  while ((m = tag.exec(svg))) {
    const gap = svg.slice(cursor, m.index).replace(/<!--[\s\S]*?-->/g, '');
    // A "<" that the tag pattern refused is the signature of an attribute whose
    // value contains a double quote — such as font-family="... "Segoe UI" ...".
    if (gap.includes('<')) fail('a "<" that does not open a valid tag (an attribute value containing a double quote will do this)', cursor + gap.indexOf('<'));
    cursor = tag.lastIndex;
    const [, closing, el, , selfClose] = m;
    if (closing) {
      if (stack.pop() !== el) fail(`</${el}> does not close the open element`, m.index);
      continue;
    }
    if (selfClose) continue;
    if (RAW_TEXT.has(el)) {
      const close = svg.indexOf(`</${el}>`, tag.lastIndex);
      if (close === -1) fail(`<${el}> is never closed`, m.index);
      cursor = close;
      tag.lastIndex = close;
      stack.push(el);
      continue;
    }
    if (VOID_OK.has(el)) fail(`<${el}> must be self-closing in XML`, m.index);
    stack.push(el);
  }
  if (stack.length) fail(`<${stack[stack.length - 1]}> is never closed`);
  if (svg.slice(cursor).includes('<')) fail('trailing "<" after the last tag', cursor);
  return true;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const md = readSources(join(HERE, '..'));
const tables = parseTables(md);

const meta = readMeta(md);

const modules = [
  ['canonical', ['scoreboard', 'tails']],
  ['engineering', ['representative', 'criterion', 'cardScaling']],
  ['application', ['showcase']],
  ['suspense', ['suspenseLoad']],
  ['pages', ['pageLoad', 'coldStart']],
];

const NAMES = {
  scoreboard: '01-canonical-scoreboard',
  tails: '02-canonical-tail-dispersion',
  representative: '03-representative-matrix',
  criterion: '04-criterion-microbenchmarks',
  cardScaling: '05-product-card-scaling',
  showcase: '06-showcase-corpus',
  suspenseLoad: '07-suspense-load',
  pageLoad: '08-canonical-pages-http',
  coldStart: '09-cold-start',
};

mkdirSync(join(HERE, 'svg'), { recursive: true });

let n = 0;
for (const [mod, fns] of modules) {
  let m;
  try { m = await import(`./figures/${mod}.mjs`); }
  catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') { continue; } throw e; }
  for (const fn of fns) {
    if (typeof m[fn] !== 'function') continue;
    const svg = m[fn](tables, meta);
    assertWellFormed(svg, NAMES[fn]);
    const out = join(HERE, 'svg', NAMES[fn] + '.svg');
    writeFileSync(out, svg);
    n++;
    console.log(`  ${String(Math.round(svg.length / 1024)).padStart(3)} kB  charts/svg/${NAMES[fn]}.svg`);
  }
}
console.log(`\n${n} figures written from ${tables.length} evidence-page tables (capture ${meta.capture || 'n/a'}).`);
