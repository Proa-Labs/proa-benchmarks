export function numbersApproximatelyEqual(left, right, relativeTolerance = 1e-9) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= relativeTolerance * scale;
}
