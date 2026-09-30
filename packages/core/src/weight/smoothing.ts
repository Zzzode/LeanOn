/**
 * Weight-signal smoothing. Daily weight is dominated by water, glycogen, sodium
 * and gut contents, so display and decisions always operate on aggregates.
 */

/** Arithmetic mean; throws on an empty array. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('mean() requires at least one value');
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/**
 * Centered trailing rolling mean. The first `window - 1` outputs average the
 * available prefix so no samples are dropped from the leading edge.
 */
export function rollingMean(values: readonly number[], window: number): number[] {
  if (!Number.isInteger(window) || window < 1) {
    throw new RangeError('window must be a positive integer');
  }
  const result: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    result.push(mean(values.slice(start, i + 1)));
  }
  return result;
}

/** Median of a copy of the input (the input is not mutated). */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('median() requires at least one value');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // For even lengths return the average of the two central values.
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}
