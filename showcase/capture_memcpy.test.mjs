import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, summarizePages, validateCapture } from './capture_memcpy.mjs';

function capture() {
  const records = Object.keys(PAGES).flatMap((page) =>
    ['render', 'memcpy'].flatMap((mode) => Array.from({ length: 5 }, (_, i) => ({
      page, mode, repeat: i + 1, output_bytes: 1_000,
      canonical_output_sha256: 'same-document',
      p50_us: mode === 'memcpy' ? 1 : page === 'airbnb-parity' ? 40 : 4,
      operations_per_sample: mode === 'memcpy' ? Math.ceil(16 * 1024 * 1024 / 1_000) : 1,
      iterations: mode === 'memcpy' ? 2_000 : page === 'sentry-otel' ? 300 : 10_000,
      warmup: mode === 'memcpy' ? 200 : page === 'sentry-otel' ? 100 : 1_000,
    }))));
  return { schema_version: 1, benchmark_version: 'showcase-memcpy-v1', status: 'pass',
    configuration: { repeats: 5 }, records, pages: summarizePages(records) };
}

test('all pages remain in the result, including a page above 10×', () => {
  const result = capture();
  assert.equal(validateCapture(result, { verifyInputs: false }), true);
  assert.equal(result.pages.length, 12);
  assert.equal(result.pages[0].proa_over_memcpy, 40);
  assert.equal(result.pages.filter((page) => page.proa_over_memcpy <= 10).length, 11);
});

test('a copy of different bytes or a different document is rejected', () => {
  for (const field of ['output_bytes', 'canonical_output_sha256']) {
    const result = capture();
    result.records.find((cell) => cell.mode === 'memcpy')[field] = field === 'output_bytes' ? 900 : 'other-document';
    assert.throws(() => summarizePages(result.records), /same byte count|changed semantically/);
  }
});

test('missing process repeats and unnormalized copy batches are rejected', () => {
  const missing = capture();
  missing.records.pop();
  assert.throws(() => validateCapture(missing, { verifyInputs: false }), /Incomplete/);
  const batch = capture();
  batch.records.find((cell) => cell.mode === 'memcpy').operations_per_sample = 1;
  assert.throws(() => validateCapture(batch, { verifyInputs: false }), /batch normalization/);
});

test('a modified ratio cannot be published without matching process evidence', () => {
  const result = capture();
  result.pages[0].proa_over_memcpy = 4;
  assert.throws(() => validateCapture(result, { verifyInputs: false }), /does not reproduce/);
});
