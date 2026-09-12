import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES as SHOWCASE } from './capture_memcpy.mjs';
import { quantile, shuffled, stableStringHash } from './client_js_stats.mjs';
import { renderingSourceFingerprint } from '../rendering/canonical/source_fingerprint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESULT = resolve(ROOT, 'showcase/results/buffer-comparison.json');
const START = '<!-- proa-buffers:start -->', END = '<!-- proa-buffers:end -->';
const INPUTS = [
  'fixtures/proa-buffer-comparison/Cargo.toml', 'fixtures/proa-buffer-comparison/Cargo.lock',
  'fixtures/proa-buffer-comparison/src/main.rs', 'fixtures/proa-buffer-comparison/src/preallocated.rs',
  'fixtures/airbnb-parity-dump/src/main.rs', 'fixtures/airbnb-parity-dump/src/memcpy.rs',
  'showcase/build_buffer_bench.mjs', 'showcase/capture_buffers.mjs',
  'showcase/capture_memcpy.mjs', 'showcase/client_js_stats.mjs',
];
export const PAGES = {
  'core-cards': 'Cards', 'core-products': '96-product grid', 'core-table': '1,000-row table',
  ...Object.fromEntries(Object.entries(SHOWCASE).filter(([page]) => page !== 'airbnb-parity')),
};
export const MODES = ['render', 'preallocated', 'memcpy'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const counts = (page, mode) => mode === 'memcpy' ? [200, 2_000] :
  page === 'sentry-otel' || page === 'core-table' ? [100, 1_000] : [1_000, 10_000];

export function summarizeBuffers(records) {
  return Object.entries(PAGES).map(([page, label]) => {
    const cells = records.filter((cell) => cell.page === page);
    check(new Set(cells.map((c) => c.output_bytes)).size === 1, `${page}: output byte counts differ`);
    check(new Set(cells.map((c) => c.canonical_output_sha256)).size === 1, `${page}: output documents differ`);
    const stats = Object.fromEntries(MODES.map((mode) => {
      const values = cells.filter((c) => c.mode === mode).map((c) => c.p50_us);
      check(values.length, `${page}: missing ${mode}`);
      return [mode, { p50_us: quantile(values, .5), min_us: Math.min(...values), max_us: Math.max(...values) }];
    }));
    return { page, label, output_bytes: cells[0].output_bytes, ...stats,
      render_over_copy: stats.render.p50_us / stats.memcpy.p50_us,
      preallocated_over_copy: stats.preallocated.p50_us / stats.memcpy.p50_us,
      speedup: stats.render.p50_us / stats.preallocated.p50_us };
  });
}

export function validateBuffers(capture, { verifyInputs = true } = {}) {
  check(capture.schema_version === 1 && capture.benchmark_version === 'proa-buffers-v1' && capture.status === 'pass',
    'Not a completed buffer comparison');
  check(capture.configuration.repeats === 5, 'Five process repeats required');
  check(capture.configuration.allocation_included === true, 'Fresh allocation must be included');
  check(capture.records.length === Object.keys(PAGES).length * MODES.length * 5, 'Incomplete process roster');
  for (const page of Object.keys(PAGES)) for (const mode of MODES) {
    const cells = capture.records.filter((c) => c.page === page && c.mode === mode);
    check(cells.length === 5 && new Set(cells.map((c) => c.repeat)).size === 5, `${page}/${mode}: missing repeat`);
    for (const cell of cells) {
      const [warmup, iterations] = counts(page, mode);
      check(cell.warmup === warmup && cell.iterations === iterations, `${page}/${mode}: sample count changed`);
      check(cell.parity_pass === true, `${page}/${mode}: output parity failed`);
      check(Number.isFinite(cell.p50_us) && cell.p50_us > 0, `${page}/${mode}: invalid timing`);
      const operations = mode === 'memcpy' ? Math.ceil(16 * 1024 * 1024 / cell.output_bytes) : 1;
      check(cell.operations_per_sample === operations, `${page}/${mode}: batch normalization changed`);
      if (mode === 'preallocated') check(cell.initial_capacity === cell.output_bytes && cell.final_capacity === cell.output_bytes,
        `${page}: full-size output allocation grew`);
    }
  }
  check(JSON.stringify(summarizeBuffers(capture.records)) === JSON.stringify(capture.pages), 'Summary differs from process evidence');
  if (verifyInputs) {
    check(JSON.stringify(capture.provenance.inputs.map((i) => i.path)) === JSON.stringify(INPUTS), 'Capture input roster changed');
    for (const input of capture.provenance.inputs) check(sha256(readFileSync(resolve(ROOT, input.path))) === input.sha256,
      `Buffer capture source changed: ${input.path}`);
    check(renderingSourceFingerprint(ROOT) === capture.provenance.core_sources_sha256, 'Core rendering sources changed');
  }
  return true;
}

export function bufferTable(capture) {
  const time = (s) => `${s.p50_us.toFixed(3)} [${s.min_us.toFixed(3)}–${s.max_us.toFixed(3)}]`;
  const date = capture.captured_at.slice(0, 10);
  return `${START}
## Proa output-buffer allocation

| Buffer capture | Date (UTC) | Proa revision |
| --- | --- | --- |
| ${capture.pages.length} workloads · five processes per cell | ${date} | \`${capture.provenance.proa_revision.slice(0, 12)}\` |

Standard Proa uses its 4 KiB chained writer. The full-size variant allocates a
fresh contiguous output buffer for every render, with capacity set to the final
HTML byte count measured before timing. Allocation, page construction and
runtime-tag insertion are timed; response destruction is outside both timings.
Memcpy copies the same HTML into a warmed reusable buffer with allocation excluded.

| Buffer comparison workload | Output bytes | Default P50 µs [min–max] | Full-size P50 µs [min–max] | Copy P50 µs [min–max] | Default / copy | Full-size / copy | Speedup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${capture.pages.map((p) => `| ${p.label} | ${p.output_bytes.toLocaleString('en-US')} | ${time(p.render)} | ${time(p.preallocated)} | ${time(p.memcpy)} | ${p.render_over_copy.toFixed(2)}× | ${p.preallocated_over_copy.toFixed(2)}× | ${p.speedup.toFixed(2)}× |`).join('\n')}

Cells run in seeded randomized blocks, with five fresh processes per workload
and mode. Values are medians of process P50s; ranges show their min–max.
Every process verifies equal output bytes and canonical HTML, and the full-size
buffer must keep its original capacity through every measured render.
The exact-size hint is an experimental input, not knowledge available to every
production request. The comparison changes the output writer as well as its
allocation strategy. See the [retained capture](showcase/results/buffer-comparison.json)
and [reproduction instructions](showcase/README.md#output-buffer-comparison).
${END}`;
}

export function updateBufferReadme(readme, capture) {
  const start = readme.indexOf(START), end = readme.indexOf(END), block = bufferTable(capture);
  if (start !== -1 || end !== -1) {
    check(start !== -1 && end > start, 'Unmatched buffer README markers');
    return readme.slice(0, start) + block + readme.slice(end + END.length);
  }
  const anchor = readme.indexOf('## Client JavaScript reference');
  check(anchor !== -1, 'README insertion point missing');
  return readme.slice(0, anchor) + block + '\n\n' + readme.slice(anchor);
}

function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  check(!result.error && result.status === 0, `${binary}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}

async function main() {
  const args = process.argv.slice(2), smoke = args.includes('--smoke');
  check(args.every((a) => ['--smoke', '--check', '--report'].includes(a)), 'Usage: node showcase/capture_buffers.mjs [--smoke|--check|--report]');
  const readmePath = resolve(ROOT, 'engineering.md');
  if (args.includes('--check') || args.includes('--report')) {
    const capture = JSON.parse(readFileSync(RESULT, 'utf8'));
    validateBuffers(capture);
    const readme = readFileSync(readmePath, 'utf8'), updated = updateBufferReadme(readme, capture);
    if (args.includes('--check')) check(readme === updated, 'engineering.md buffer comparison table is stale');
    else writeFileSync(readmePath, updated);
    console.log('Buffer comparison and source evidence verified.');
    return;
  }
  const binary = resolve(ROOT, 'fixtures/proa-buffer-comparison/target/buffer-bench');
  const repeats = smoke ? 1 : 5, seed = 8_405_027, records = [], rawRecords = [];
  const cells = Object.keys(PAGES).flatMap((page) => MODES.map((mode) => ({ page, mode })));
  for (let repeat = 1; repeat <= repeats; repeat++) for (const { page, mode } of shuffled(cells, seed ^ stableStringHash(`buffers:${repeat}`))) {
    const [warmup, iterations] = smoke ? [1, 3] : counts(page, mode);
    const sample = JSON.parse(run(binary, [page, mode, String(warmup), String(iterations)]));
    const { raw_ns, ...summary } = sample;
    check(sample.page === page && sample.mode === mode, 'Wrong benchmark cell');
    check(raw_ns.length === iterations && raw_ns.every((ns) => Number.isSafeInteger(ns) && ns > 0), 'Missing raw timing evidence');
    const sorted = [...raw_ns].sort((a, b) => a - b);
    check(Math.abs(sorted[Math.ceil(iterations / 2) - 1] / 1_000 / sample.operations_per_sample - sample.p50_us) < 1e-9,
      `${page}/${mode}: P50 does not reproduce from raw timings`);
    const record = { repeat, sequence: records.length + 1, ...summary };
    records.push(record); rawRecords.push({ ...record, raw_ns });
    console.log(`${repeat}/${repeats} ${page} ${mode}: ${sample.p50_us.toFixed(3)} µs`);
  }
  const lock = readFileSync(resolve(ROOT, INPUTS[1]), 'utf8');
  const revision = lock.match(/name = "proa_showcase"[\s\S]*?source = "git\+[^#]+#([0-9a-f]{40})"/)?.[1];
  check(revision, 'Missing Proa lock revision');
  const capture = {
    schema_version: 1, benchmark_version: 'proa-buffers-v1', status: smoke ? 'smoke' : 'pass',
    captured_at: new Date().toISOString(), configuration: { repeats, seed, allocation_included: true },
    provenance: {
      proa_revision: revision, core_sources_sha256: renderingSourceFingerprint(ROOT),
      binary: { path: relative(ROOT, binary), sha256: sha256(readFileSync(binary)) },
      inputs: INPUTS.map((path) => ({ path, sha256: sha256(readFileSync(resolve(ROOT, path))) })),
      host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logical_cpus: cpus().length, memory_bytes: totalmem() },
      rustc: run('rustc', ['--version']).trim(),
    }, pages: summarizeBuffers(records), records,
  };
  if (!smoke) validateBuffers(capture);
  const out = smoke ? RESULT.replace('.json', '-smoke.json') : RESULT;
  const rawPath = out.replace('.json', '-raw.json'), raw = JSON.stringify(rawRecords);
  capture.raw_artifact = { path: relative(ROOT, rawPath), sha256: sha256(raw) };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(rawPath, raw);
  writeFileSync(out, JSON.stringify(capture, null, 2) + '\n');
  if (!smoke) writeFileSync(readmePath, updateBufferReadme(readFileSync(readmePath, 'utf8'), capture));
  console.log(`Saved ${relative(ROOT, out)}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
