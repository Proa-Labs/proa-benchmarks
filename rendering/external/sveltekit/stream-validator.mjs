// Decode the pinned SvelteKit promise-resolution envelope without executing JS.
// A body ending is only successful if every promised product actually arrived.
import { parse } from 'acorn';
import { isDeepStrictEqual } from 'node:util';
import { buildPanels } from '../../../suspense-load/scenario.mjs';

function literal(node) {
  if (!node) throw new Error('Missing resolution value');
  if (node.type === 'Literal' && !node.regex && (node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value))) return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') {
    const result = Object.create(null);
    for (const property of node.properties) {
      if (property.type !== 'Property' || property.kind !== 'init' || property.method || property.computed || property.shorthand) throw new Error('Non-data property');
      const key = property.key.type === 'Identifier' ? property.key.name : literal(property.key);
      if (Object.hasOwn(result, key)) throw new Error('Duplicate property');
      result[key] = literal(property.value);
    }
    return result;
  }
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value;
  throw new Error(`Non-literal streamed value: ${node.type}`);
}

export function decodeResolutions(html) {
  const result = [];
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    const source = match[1].trim();
    if (!/^__sveltekit_[\w]+\.resolve\(/.test(source)) continue;
    const program = parse(source, { ecmaVersion: 2022 });
    const statement = program.body[0];
    const call = statement?.expression;
    if (program.body.length !== 1 || statement.type !== 'ExpressionStatement' || call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression' || call.callee.computed || call.callee.property.name !== 'resolve' || call.arguments.length !== 2) throw new Error('Unexpected promise envelope');
    const id = literal(call.arguments[0]);
    const factory = call.arguments[1];
    if (!Number.isInteger(id) || factory.type !== 'ArrowFunctionExpression' || factory.params.length || factory.async) throw new Error('Unexpected promise factory');
    const payload = literal(factory.body);
    if (!Array.isArray(payload) || payload.length !== 1) throw new Error('Rejected or malformed promise');
    // Restore ordinary object prototypes after interpreting the data-only AST.
    result.push({ id, panel: JSON.parse(JSON.stringify(payload[0])) });
  }
  return result;
}

export function createValidator({ boundaries = 8, cardsPerPanel = 12, mode = 'data' } = {}) {
  const expected = buildPanels(boundaries, cardsPerPanel);
  const keys = expected.map(p => p.key);
  return buffer => {
    const html = buffer.toString('utf8');
    if (!html.includes('data-benchmark-shell="suspense-load"')) throw new Error('Missing marketplace shell');
    const markers = attribute => [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map(m => m[1]);
    if (mode === 'buffered') {
      if (!isDeepStrictEqual(markers('data-panel-ready'), keys) || markers('data-panel-fallback').length) throw new Error('Incomplete buffered HTML');
      if ((html.match(/href="\/products\/\d+"/g) || []).length !== boundaries * cardsPerPanel) throw new Error('Missing product HTML');
      return;
    }
    if (!isDeepStrictEqual(markers('data-panel-fallback'), keys) || markers('data-panel-ready').length) throw new Error('Data streaming did not carry the expected SSR fallback shell');
    const resolutions = decodeResolutions(html);
    if (resolutions.length !== expected.length || new Set(resolutions.map(p => p.id)).size !== expected.length) throw new Error('Missing or duplicate promise resolutions');
    if (resolutions.some(r => r.id !== r.panel.index + 1)) throw new Error('Resolution ID does not match its deferred panel');
    const actual = resolutions.map(r => r.panel).sort((a,b) => a.index-b.index);
    if (!isDeepStrictEqual(actual, expected)) throw new Error('Streamed data differs from the complete expected panels/products');
  };
}
