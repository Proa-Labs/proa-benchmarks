import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStreaming } from './report.mjs';

const capture = JSON.parse(readFileSync(new URL('./results/latest.json', import.meta.url)));
test('accepts the complete retained production streaming/browser capture', () => {
  assert.doesNotThrow(() => validateStreaming(capture));
});
test('rejects incomplete, smoke, generator-limited and inconsistent browser evidence', () => {
  for (const corrupt of [
    x => { x.captureKind = 'smoke'; },
    x => { x.http.pop(); },
    x => { x.http[0].mode = 'closed'; },
    x => { x.browser.profiles[1].cpu = 1; },
    x => { x.http[0].loadGeneratorValid = false; },
    x => { x.http[0].health.workerThreads = 2; },
    x => { x.browser.samples[0].resolvedDomSha256 = '0'.repeat(64); },
    x => { x.browser.samples[0].productCards = 95; },
    x => { x.browser.summaries[0].allPanelsMs.p50 += 1; },
    x => { x.browser.controls[0].productCards = 96; },
  ]) {
    const changed = structuredClone(capture);
    corrupt(changed);
    assert.throws(() => validateStreaming(changed), /Invalid SvelteKit comparison/);
  }
});
