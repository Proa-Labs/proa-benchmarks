import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validateStreaming } from './report.mjs';

const capture = JSON.parse(readFileSync(new URL('./results/latest.json', import.meta.url)));

test('rejects throughput unsupported by retained completion counts', () => {
  for (const field of ['completionThroughputRps', 'steadyStateCompletedResponses']) {
    const changed = structuredClone(capture);
    changed.http[0][field] += 1;
    assert.throws(() => validateStreaming(changed), /HTTP throughput differs from retained completion count/);
  }
});

test('rejects missing phases and inconsistent browser evidence', () => {
  for (const corrupt of [
    x => { x.http.pop(); },
    x => { x.browser.samples[0].resolvedDomSha256 = '0'.repeat(64); },
    x => { x.browser.summaries[0].allPanelsMs.p50 += 1; },
  ]) {
    const changed = structuredClone(capture);
    corrupt(changed);
    assert.throws(() => validateStreaming(changed), /Invalid SvelteKit comparison/);
  }
});

test('rejects missing generator evidence and invalid published HTTP metrics', () => {
  for (const [corrupt, message] of [
    [p => { delete p.generator.busiestWorkerUtilization; }, /generator evidence/],
    [p => { p.latencyMs.schedulerLag.p95 = null; }, /generator evidence/],
    [p => { p.errorCount = -1; }, /HTTP failure count/],
    [p => { delete p.cpu.averageCpuCores; }, /missing HTTP metrics/],
    [p => { p.latencyMs.scheduledComplete.p95 = 1; }, /percentiles out of order/],
  ]) {
    const changed = structuredClone(capture);
    corrupt(changed.http[0]);
    assert.throws(() => validateStreaming(changed), message);
  }
});

test('custom worker counts cannot overwrite the publication capture', async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [
    fileURLToPath(new URL('./run.mjs', import.meta.url)), '--workers', '1',
  ], {
    // A regressed guard must fail at the build command, not start a capture.
    env: { ...process.env, PATH: '' }, timeout: 5000,
  }), /Error: Custom runs require --out/);
});
