import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const runner = fileURLToPath(new URL('./run.mjs', import.meta.url));

test('custom worker counts cannot target the publication capture', async () => {
  for (const args of [
    ['--workers', '1'],
    ['--workers', '24', '--out', 'sveltekit/results/latest.json'],
  ]) {
    await assert.rejects(execute(process.execPath, [runner, ...args], {
      // If the guard regresses, fail at the first build command rather than
      // launching a benchmark against the publication output during this test.
      env: { ...process.env, PATH: '' },
      timeout: 5000,
    }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Custom runs require --out/);
      assert.equal(error.stdout, '');
      return true;
    });
  }
});
