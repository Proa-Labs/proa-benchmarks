import assert from "node:assert/strict";
import test from "node:test";

import {
  mean,
  percentile,
  successfulCompletionThroughput,
  summarize,
} from "./stats.mjs";
import { numbersApproximatelyEqual } from "./validation.mjs";

test("percentile linearly interpolates a sorted sample", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([0, 10], 95), 9.5);
});

test("summarize reports stable empty and populated shapes", () => {
  assert.deepEqual(summarize([]), {
    count: 0,
    min: 0,
    mean: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    max: 0,
  });
  assert.deepEqual(summarize([4, 1, 3, 2]), {
    count: 4,
    min: 1,
    mean: 2.5,
    p50: 2.5,
    p95: 3.8499999999999996,
    p99: 3.9699999999999998,
    max: 4,
  });
  assert.equal(mean([2, 4, 6]), 4);
});

test("steady-state throughput counts successful completions in a half-open window", () => {
  const result = successfulCompletionThroughput([
    { ok: true, completedAt: 999 },
    { ok: true, completedAt: 1_000 },
    { ok: false, completedAt: 1_500 },
    { ok: true, completedAt: 1_999.9 },
    { ok: true, completedAt: 2_000 },
  ], 1_000, 2_000);
  assert.deepEqual(result, { completedResponses: 2, responsesPerSecond: 2 });
  assert.throws(
    () => successfulCompletionThroughput([], 2_000, 1_000),
    /increasing bounds/,
  );
});

test("publication accounting tolerates floating-point roundoff only", () => {
  assert.equal(numbersApproximatelyEqual(3979.1999999999766, 19_896 / 5), true);
  assert.equal(numbersApproximatelyEqual(3979.19, 19_896 / 5), false);
  assert.equal(numbersApproximatelyEqual(Number.NaN, 0), false);
});
