// Copyright Proa Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
	bootstrapMedianConfidenceInterval,
	executedIntervals,
	mergeIntervals,
	quantile,
	shuffled,
	utf8BytesForIntervals,
} from "./client_js_stats.mjs";

test("quantile uses linear interpolation", () => {
	assert.equal(quantile([4, 1, 3, 2], 0.5), 2.5);
	assert.equal(quantile([4, 1, 3, 2], 0.95), 3.8499999999999996);
});

test("seeded shuffle and bootstrap are reproducible", () => {
	assert.deepEqual(shuffled([1, 2, 3, 4, 5], 42), shuffled([1, 2, 3, 4, 5], 42));
	assert.deepEqual(
		bootstrapMedianConfidenceInterval([1, 2, 3, 4, 5], {
			resamples: 100,
			seed: 19,
		}),
		bootstrapMedianConfidenceInterval([1, 2, 3, 4, 5], {
			resamples: 100,
			seed: 19,
		}),
	);
});

test("coverage lets an unexecuted child override an executed parent", () => {
	const functions = [
		{ ranges: [{ startOffset: 0, endOffset: 20, count: 1 }] },
		{ ranges: [{ startOffset: 5, endOffset: 10, count: 0 }] },
		{ ranges: [{ startOffset: 12, endOffset: 16, count: 2 }] },
	];
	assert.deepEqual(executedIntervals(functions, 20), [
		[0, 5],
		[10, 20],
	]);
});

test("interval merging and byte accounting handle UTF-16 offsets", () => {
	assert.deepEqual(
		mergeIntervals([
			[4, 8],
			[0, 2],
			[2, 5],
		]),
		[[0, 8]],
	);
	const source = "aé🙂z";
	assert.equal(source.length, 5);
	assert.equal(utf8BytesForIntervals(source, [[1, 4]]), 6);
});
