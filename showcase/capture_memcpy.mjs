// Matched render/copy capture for every page in the linked showcase binary.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quantile, shuffled, stableStringHash } from './client_js_stats.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESULT = resolve(ROOT, 'showcase/results/memcpy-floor.json');
const START = '<!-- showcase-memcpy:start -->';
const END = '<!-- showcase-memcpy:end -->';
const INPUTS = [
  'fixtures/airbnb-parity-dump/Cargo.toml',
  'fixtures/airbnb-parity-dump/Cargo.lock',
  'fixtures/airbnb-parity-dump/src/main.rs',
  'fixtures/airbnb-parity-dump/src/memcpy.rs',
  'showcase/capture_memcpy.mjs',
  'showcase/client_js_stats.mjs',
];
export const PAGES = {
  'airbnb-parity': 'Airbnb parity',
  'airbnb-home': 'Airbnb home',
  'airbnb-search': 'Airbnb search',
  'airbnb-listing': 'Airbnb listing',
  'nike-catalog': 'Nike catalog',
  'nike-product': 'Nike product',
  'ebay-cards': 'eBay cards',
  'ebay-chrome': 'eBay chrome',
  'ebay-real-chrome': 'eBay real chrome',
  espn: 'ESPN game page',
  'sentry-otel': 'Sentry OTel, 400 rows',
  'settings-console': 'Settings console',
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const median = (values) => quantile(values, 0.5);
const check = (condition, message) => { if (!condition) throw new Error(message); };

function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  check(!result.error && result.status === 0,
    `${binary} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}

export function summarizePages(records) {
  return Object.entries(PAGES).map(([page, label]) => {
    const cells = records.filter((record) => record.page === page);
    check(new Set(cells.map((cell) => cell.output_bytes)).size === 1,
      `${page}: render and memcpy must use the same byte count`);
    check(new Set(cells.map((cell) => cell.canonical_output_sha256)).size === 1,
      `${page}: output changed semantically across modes or processes`);
    const statistics = (mode) => {
      const values = cells.filter((cell) => cell.mode === mode).map((cell) => cell.p50_us);
      check(values.length > 0, `${page}: missing ${mode} measurements`);
      return { p50_us: median(values), min_us: Math.min(...values), max_us: Math.max(...values) };
    };
    const proa = statistics('render'), memcpy = statistics('memcpy');
    return { page, label, output_bytes: cells[0].output_bytes, proa, memcpy,
      proa_over_memcpy: proa.p50_us / memcpy.p50_us };
  });
}

export function validateCapture(capture, { verifyInputs = true } = {}) {
  check(capture.schema_version === 1 && capture.benchmark_version === 'showcase-memcpy-v1' && capture.status === 'pass',
    'Not a completed showcase memcpy capture');
  check(capture.configuration.repeats === 5, 'A retained capture requires five independent processes per cell');
  const records = capture.records;
  check(records.length === Object.keys(PAGES).length * 2 * 5, 'Incomplete showcase process roster');
  for (const page of Object.keys(PAGES)) {
    for (const mode of ['render', 'memcpy']) {
      const cells = records.filter((record) => record.page === page && record.mode === mode);
      check(cells.length === 5 && new Set(cells.map((cell) => cell.repeat)).size === 5,
        `${page}/${mode}: five distinct process repeats required`);
      for (const cell of cells) {
        const iterations = mode === 'memcpy' ? 2_000 : page === 'sentry-otel' ? 300 : 10_000;
        const warmup = mode === 'memcpy' ? 200 : page === 'sentry-otel' ? 100 : 1_000;
        check(cell.iterations === iterations && cell.warmup === warmup,
          `${page}/${mode}: unexpected sample count`);
        const operations = mode === 'memcpy' ? Math.ceil(16 * 1024 * 1024 / cell.output_bytes) : 1;
        check(cell.operations_per_sample === operations, `${page}/${mode}: incorrect batch normalization`);
        check(Number.isFinite(cell.p50_us) && cell.p50_us > 0, `${page}/${mode}: invalid P50`);
      }
    }
  }
  check(JSON.stringify(summarizePages(records)) === JSON.stringify(capture.pages),
    'Showcase summary does not reproduce from retained process measurements');
  if (verifyInputs) {
    check(JSON.stringify(capture.provenance.inputs.map((input) => input.path)) === JSON.stringify(INPUTS),
      'Capture source roster differs from the harness');
    for (const input of capture.provenance.inputs) {
      check(sha256(readFileSync(resolve(ROOT, input.path))) === input.sha256,
        `Capture source changed: ${input.path}`);
    }
  }
  return true;
}

export function renderTable(capture) {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(capture.captured_at));
  const time = (stat) => `${stat.p50_us.toFixed(3)} [${stat.min_us.toFixed(3)}–${stat.max_us.toFixed(3)}]`;
  const within = capture.pages.filter((page) => page.proa_over_memcpy <= 10).length;
  return `${START}
## Showcase memcpy floor

| Memcpy capture | Date (UTC) | Proa revision |
| --- | --- | --- |
| All ${capture.pages.length} linked pages | ${date} | \`${capture.provenance.proa_revision.slice(0, 12)}\` |

Complete Proa page rendering against a hot-buffer copy of that page's exact
pre-rendered HTML. Each cell is the median of five process P50s; brackets show
their min–max range. Rendering includes page construction and fresh output
allocation. Copying reuses warmed source and destination buffers and excludes
allocation. All linked pages are included: **${within} of ${capture.pages.length} are within 10×** in this capture.

| Showcase page | Output bytes | Proa P50 µs [min–max] | Memcpy P50 µs [min–max] | Proa / memcpy |
| --- | ---: | ---: | ---: | ---: |
${capture.pages.map((page) => `| ${page.label} | ${page.output_bytes.toLocaleString('en-US')} | ${time(page.proa)} | ${time(page.memcpy)} | ${page.proa_over_memcpy.toFixed(2)}× |`).join('\n')}

Render and copy cells run in seeded randomized blocks, one fresh process per
page and mode in each of five repeats. Rendering uses 1,000 warmups and 10,000
samples (Sentry: 100 and 300); copying uses 200 warmup batches and 2,000 measured
batches of at least 16 MiB, divided by copies per batch. Byte counts and canonical
document hashes must agree across every process and both modes.

These are Proa-only application fixtures; no equivalent React capture is available
here. They are separate from the dated core matrix and canonical scoreboard.
The [retained capture](showcase/results/memcpy-floor.json) includes per-process
measurements, source hashes, host details and the linked binary SHA-256.
See [reproduction instructions](showcase/README.md#memcpy-floor).
${END}`;
}

export function updateReadme(readme, capture) {
  const block = renderTable(capture);
  const start = readme.indexOf(START), end = readme.indexOf(END);
  if (start !== -1 || end !== -1) {
    check(start !== -1 && end > start, 'Unmatched showcase memcpy README markers');
    return readme.slice(0, start) + block + readme.slice(end + END.length);
  }
  const anchor = readme.indexOf('## Client JavaScript reference');
  check(anchor !== -1, 'README insertion point not found');
  return readme.slice(0, anchor) + block + '\n\n' + readme.slice(anchor);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--check') || args.includes('--report')) {
    const capture = JSON.parse(readFileSync(RESULT, 'utf8'));
    validateCapture(capture);
    const path = resolve(ROOT, 'engineering.md'), readme = readFileSync(path, 'utf8');
    const updated = updateReadme(readme, capture);
    if (args.includes('--check')) check(updated === readme, 'engineering.md showcase memcpy table is stale');
    else writeFileSync(path, updated);
    console.log('Showcase memcpy capture and engineering.md table verified.');
    return;
  }
  const smoke = args.includes('--smoke');
  let dump = resolve(ROOT, 'fixtures/airbnb-parity-dump/target/showcase-floor-dump');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--smoke') continue;
    check(args[i] === '--dump' && args[i + 1], 'Usage: node showcase/capture_memcpy.mjs [--dump PATH] [--smoke|--check|--report]');
    dump = resolve(args[++i]);
  }
  const available = run(dump, ['--list-pages']).trim().split(/\s+/);
  check(JSON.stringify(available) === JSON.stringify(Object.keys(PAGES)), 'The linked showcase page roster changed');
  const records = [], rawRecords = [], repeats = smoke ? 1 : 5, seed = 8_405_026;
  const cells = available.flatMap((page) => ['render', 'memcpy'].map((mode) => ({ page, mode })));
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const { page, mode } of shuffled(cells, seed ^ stableStringHash(`floor:${repeat}`))) {
      const command = ['--bench', '--page', page, '--mode', mode];
      if (smoke) command.push('--warmup', '1', '--iterations', '3');
      else if (mode === 'memcpy') command.push('--warmup', '200', '--iterations', '2000');
      const report = JSON.parse(run(dump, command));
      check(report.pages?.length === 1, 'Unexpected number of benchmark cells');
      const sample = report.pages[0];
      check(sample.page === page && sample.mode === mode, 'Linked binary returned the wrong page/mode');
      const { raw_ns, ...summary } = sample;
      check(raw_ns.length === sample.iterations && raw_ns.every((ns) => Number.isSafeInteger(ns) && ns > 0),
        `${page}/${mode}: missing raw timing evidence`);
      const sorted = [...raw_ns].sort((a, b) => a - b);
      const rawP50 = sorted[Math.ceil(sorted.length * 0.5) - 1] / 1_000 / sample.operations_per_sample;
      check(Math.abs(rawP50 - sample.p50_us) < 1e-9, `${page}/${mode}: P50 does not reproduce from raw batch durations`);
      const record = { repeat, sequence: records.length + 1, ...summary };
      records.push(record);
      rawRecords.push({ ...record, raw_ns });
      console.log(`${repeat}/${repeats} ${page} ${mode}: ${sample.p50_us.toFixed(3)} µs`);
    }
  }
  const lock = readFileSync(resolve(ROOT, INPUTS[1]), 'utf8');
  const proaRevision = lock.match(/name = "proa_showcase"[\s\S]*?source = "git\+[^#]+#([0-9a-f]{40})"/)?.[1];
  check(proaRevision, 'Proa revision missing from the fixture lockfile');
  const capture = {
    schema_version: 1, benchmark_version: 'showcase-memcpy-v1', status: smoke ? 'smoke' : 'pass',
    captured_at: new Date().toISOString(), configuration: { repeats, seed },
    provenance: {
      proa_revision: proaRevision,
      binary: { path: relative(ROOT, dump), sha256: sha256(readFileSync(dump)) },
      inputs: INPUTS.map((path) => ({ path, sha256: sha256(readFileSync(resolve(ROOT, path))) })),
      host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logical_cpus: cpus().length, memory_bytes: totalmem() },
      rustc: run('rustc', ['--version']).trim(),
    },
    pages: summarizePages(records), records,
  };
  if (!smoke) validateCapture(capture);
  const out = smoke ? resolve(ROOT, 'showcase/results/memcpy-floor-smoke.json') : RESULT;
  mkdirSync(dirname(out), { recursive: true });
  const rawPath = out.replace('.json', '-raw.json');
  const rawBytes = JSON.stringify(rawRecords);
  capture.raw_artifact = { path: relative(ROOT, rawPath), sha256: sha256(rawBytes) };
  writeFileSync(rawPath, rawBytes);
  writeFileSync(out, JSON.stringify(capture, null, 2) + '\n');
  if (!smoke) {
    const readme = resolve(ROOT, 'engineering.md');
    writeFileSync(readme, updateReadme(readFileSync(readme, 'utf8'), capture));
  }
  console.log(`Saved ${relative(ROOT, out)}`);
  for (const page of capture.pages) console.log(`${page.label}: ${page.proa_over_memcpy.toFixed(2)}× memcpy`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
