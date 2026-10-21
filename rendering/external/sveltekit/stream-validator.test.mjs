import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createValidator, decodeResolutions } from './stream-validator.mjs';
import { buildPanels } from '../../../suspense-load/scenario.mjs';

function body(panels = buildPanels(2, 1)) {
  return '<main data-benchmark-shell="suspense-load">' + panels.map(p => `<section data-panel-fallback="${p.key}"></section>`).join('') + '</main>' + panels.map((p,i) => `<script>__sveltekit_test.resolve(${i+1}, () => [${JSON.stringify(p)}])</script>`).join('');
}
test('accepts complete native promised data in either completion order', () => {
  const validate = createValidator({ boundaries: 2, cardsPerPanel: 1 });
  validate(Buffer.from(body()));
  const html = body();
  const scripts = [...html.matchAll(/<script>[\s\S]*?<\/script>/g)].map(m=>m[0]);
  validate(Buffer.from(html.slice(0,html.indexOf('<script>'))+scripts.reverse().join('')));
});
test('rejects missing panels, corrupted product values, duplicate promise IDs and executable factories', () => {
  const validate = createValidator({ boundaries: 2, cardsPerPanel: 1 });
  const html = body();
  assert.throws(()=>validate(Buffer.from(html.replace(/<script>[\s\S]*?<\/script>/,''))));
  assert.throws(()=>validate(Buffer.from(html.replace('Meridian', 'CORRUPTED'))));
  assert.throws(()=>validate(Buffer.from(html.replace('resolve(2,', 'resolve(1,'))));
  assert.throws(()=>validate(Buffer.from(html.replace('resolve(2,', 'resolve(99,'))));
  assert.throws(()=>decodeResolutions('<script>__sveltekit_test.resolve(1, () => process.exit())</script>'));
});
