export function percentile(sortedValues, percent) {
  if (sortedValues.length === 0) return 0;
  const rank = (percent / 100) * (sortedValues.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedValues[lower];
  return (
    sortedValues[lower] +
    (sortedValues[upper] - sortedValues[lower]) * (rank - lower)
  );
}

export function summarize(values) {
  if (values.length === 0) {
    return {
      count: 0,
      min: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
    };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted[0],
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1),
  };
}

export function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function successfulCompletionThroughput(responses, startedAt, endedAt) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    throw new Error("completion window must have finite increasing bounds");
  }
  const completedResponses = responses.filter(
    (response) =>
      response.ok === true &&
      Number.isFinite(response.completedAt) &&
      response.completedAt >= startedAt &&
      response.completedAt < endedAt,
  ).length;
  return {
    completedResponses,
    responsesPerSecond: completedResponses * 1_000 / (endedAt - startedAt),
  };
}
