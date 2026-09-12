import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, MODES, summarizeBuffers, validateBuffers } from './capture_buffers.mjs';

function capture() {
  const records = Object.keys(PAGES).flatMap((page) => MODES.flatMap((mode) =>
    Array.from({ length: 5 }, (_, i) => ({
      page, mode, repeat: i + 1, output_bytes: 1_000, canonical_output_sha256: 'same-html',
      parity_pass: true, initial_capacity: mode === 'preallocated' ? 1_000 : null,
      final_capacity: mode === 'preallocated' ? 1_000 : null,
      p50_us: mode === 'memcpy' ? 1 : mode === 'preallocated' ? 2 : 4,
      operations_per_sample: mode === 'memcpy' ? Math.ceil(16 * 1024 * 1024 / 1_000) : 1,
      warmup: mode === 'memcpy' ? 200 : ['core-table', 'sentry-otel'].includes(page) ? 100 : 1_000,
      iterations: mode === 'memcpy' ? 2_000 : ['core-table', 'sentry-otel'].includes(page) ? 1_000 : 10_000,
    }))));
  return { schema_version: 1, benchmark_version: 'proa-buffers-v1', status: 'pass',
    configuration: { repeats: 5, allocation_included: true }, records, pages: summarizeBuffers(records) };
}

test('paired capture covers three core workloads and eleven application pages', () => {
  const result = capture();
  assert.equal(validateBuffers(result, { verifyInputs: false }), true);
  assert.equal(result.pages.length, 14);
  assert(!result.pages.some((p) => p.page === 'airbnb-parity'));
  assert.equal(result.pages[0].speedup, 2);
});

test('a growing output buffer cannot be labelled full-size preallocation', () => {
  const result = capture();
  result.records.find((c) => c.mode === 'preallocated').final_capacity = 2_000;
  assert.throws(() => validateBuffers(result, { verifyInputs: false }), /allocation grew/);
});

test('different documents or a failed parity probe invalidate the comparison', () => {
  const different = capture();
  different.records.find((c) => c.mode === 'preallocated').canonical_output_sha256 = 'different-html';
  assert.throws(() => validateBuffers(different, { verifyInputs: false }), /documents differ/);
  const failed = capture();
  failed.records[0].parity_pass = false;
  assert.throws(() => validateBuffers(failed, { verifyInputs: false }), /parity failed/);
});

test('missing repeats and invented speedups cannot be published', () => {
  const missing = capture();
  missing.records.pop();
  assert.throws(() => validateBuffers(missing, { verifyInputs: false }), /Incomplete/);
  const invented = capture();
  invented.pages[0].speedup = 10;
  assert.throws(() => validateBuffers(invented, { verifyInputs: false }), /Summary differs/);
});
