// Copyright Proa Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Buffer } from "node:buffer";

export function quantile(values, probability) {
	if (values.length === 0) return null;
	if (!(probability >= 0 && probability <= 1)) {
		throw new RangeError(`probability must be in [0, 1], got ${probability}`);
	}
	const sorted = [...values].sort((left, right) => left - right);
	if (sorted.length === 1) return sorted[0];
	const position = (sorted.length - 1) * probability;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	const fraction = position - lower;
	return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

export function createPrng(seed) {
	let state = Number(seed) >>> 0;
	if (state === 0) state = 0x6d2b79f5;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x1_0000_0000;
	};
}

export function shuffled(values, seed) {
	const result = [...values];
	const random = createPrng(seed);
	for (let index = result.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
	}
	return result;
}

export function bootstrapMedianConfidenceInterval(
	values,
	{ confidence = 0.95, resamples = 5_000, seed = 1 } = {},
) {
	if (values.length === 0) return null;
	const random = createPrng(seed);
	const medians = new Array(resamples);
	for (let sampleIndex = 0; sampleIndex < resamples; sampleIndex += 1) {
		const sample = new Array(values.length);
		for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
			sample[valueIndex] = values[Math.floor(random() * values.length)];
		}
		medians[sampleIndex] = quantile(sample, 0.5);
	}
	const tail = (1 - confidence) / 2;
	return {
		confidence,
		method: "percentile bootstrap",
		resamples,
		low: quantile(medians, tail),
		high: quantile(medians, 1 - tail),
	};
}

export function summarizeNumbers(values, { seed = 1, resamples = 5_000 } = {}) {
	if (values.length === 0) return null;
	return {
		n: values.length,
		min: Math.min(...values),
		mean: values.reduce((sum, value) => sum + value, 0) / values.length,
		p50: quantile(values, 0.5),
		p95: quantile(values, 0.95),
		max: Math.max(...values),
		medianCi95: bootstrapMedianConfidenceInterval(values, {
			confidence: 0.95,
			resamples,
			seed,
		}),
	};
}

export function mergeIntervals(intervals) {
	const normalized = intervals
		.map(([start, end]) => [Math.max(0, start), Math.max(0, end)])
		.filter(([start, end]) => end > start)
		.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
	const merged = [];
	for (const interval of normalized) {
		const previous = merged.at(-1);
		if (!previous || interval[0] > previous[1]) {
			merged.push([...interval]);
		} else {
			previous[1] = Math.max(previous[1], interval[1]);
		}
	}
	return merged;
}

// V8 detailed coverage ranges are nested. The smallest range covering a source
// segment is the governing block; an unexecuted child must override an executed
// parent function range. Offsets are UTF-16 code units, as required by CDP.
export function executedIntervals(functions, sourceLength) {
	const ranges = functions.flatMap((fn) => fn.ranges ?? []).map((range) => ({
		start: Math.max(0, Math.min(sourceLength, range.startOffset)),
		end: Math.max(0, Math.min(sourceLength, range.endOffset)),
		count: range.count,
	}));
	const boundaries = [...new Set([0, sourceLength, ...ranges.flatMap((range) => [range.start, range.end])])]
		.filter((offset) => offset >= 0 && offset <= sourceLength)
		.sort((left, right) => left - right);
	const executed = [];
	for (let index = 0; index + 1 < boundaries.length; index += 1) {
		const start = boundaries[index];
		const end = boundaries[index + 1];
		if (end <= start) continue;
		const covering = ranges
			.filter((range) => range.start <= start && range.end >= end)
			.sort(
				(left, right) =>
					left.end - left.start - (right.end - right.start) ||
					left.count - right.count,
			);
		if (covering[0]?.count > 0) executed.push([start, end]);
	}
	return mergeIntervals(executed);
}

export function utf8BytesForIntervals(source, intervals) {
	return mergeIntervals(intervals).reduce(
		(sum, [start, end]) => sum + Buffer.byteLength(source.slice(start, end)),
		0,
	);
}

export function stableStringHash(value) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}
