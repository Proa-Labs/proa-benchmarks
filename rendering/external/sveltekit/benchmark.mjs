import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalDocument } from '../../canonical/dom.mjs';
import { chromium } from 'playwright';

export const directory = fileURLToPath(new URL('./', import.meta.url));
export const sourceFiles = [
  'package.json', 'package-lock.json', 'vite.config.js', 'dump.mjs', 'benchmark.mjs', 'stream-validator.mjs',
  'src/app.html', 'src/hooks.server.js', 'src/lib/fixtures.js',
  'src/lib/server/scenario.js', 'src/lib/Hero.svelte', 'src/lib/FallbackPanel.svelte',
  'src/lib/ProductCard.svelte', 'src/lib/ReadyPanel.svelte',
  'src/routes/+layout.js', 'src/routes/(pages)/+layout.js',
  'src/routes/(pages)/cards/+page.svelte', 'src/routes/(pages)/table/+page.svelte',
  'src/routes/(pages)/products/+page.svelte', 'src/routes/health/+server.js',
  'src/routes/metrics/+server.js', 'src/routes/stream/+page.server.js',
  'src/routes/stream/+page.svelte', 'src/routes/buffered/+page.server.js',
  'src/routes/buffered/+page.js', 'src/routes/buffered/+page.svelte',
].map(path => `rendering/external/sveltekit/${path}`);
sourceFiles.push('rendering/canonical/dom.mjs', 'rendering/external/svelte/suite_cards.svelte', 'rendering/external/svelte/suite_table.svelte', 'rendering/external/svelte/suite_products.svelte');

const execute = promisify(execFile);
export async function build() {
  await execute(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: directory, env: { ...process.env, NODE_ENV: 'production' }, maxBuffer: 16 * 1024 * 1024 });
}

export async function validateDump(html, workload, temporaryDirectory) {
  // Svelte's canonical renderer is independently checked against Proa by the
  // full scoreboard gate. SvelteKit must preserve that same entire document.
  const path = join(temporaryDirectory, `svelte-reference-${workload}.html`);
  await mkdir(temporaryDirectory, { recursive: true });
  await execute(process.execPath, ['suite_bench.mjs', '--workload', workload, '--dump', path, '--dump-only'], { cwd: join(directory, '../svelte'), env: { ...process.env, NODE_ENV: 'production' } });
  const reference = await readFile(path, 'utf8');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const expected = JSON.stringify(await canonicalDocument(page, reference));
    const actual = JSON.stringify(await canonicalDocument(page, html.toString('utf8')));
    if (actual !== expected) throw new Error(`SvelteKit ${workload} DOM differs from the canonical Svelte adapter`);
    const marker = workload === 'products' ? 'All products' : workload === 'cards' ? 'SSR Framework Benchmark' : 'Customer Accounts';
    const corrupted = html.toString('utf8').replace(marker, 'PARITY NEGATIVE CONTROL');
    if (corrupted === html.toString('utf8') || JSON.stringify(await canonicalDocument(page, corrupted)) === expected) throw new Error('SvelteKit negative parity control failed');
    return { canonicalDomMatch: true, negativeControlRejected: true };
  } finally { await browser.close(); }
}

export function serverSpec(port) {
  return { spec: { label: 'sveltekit', command: process.execPath, args: ['build/index.js'], cwd: directory }, env: { PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' } };
}
