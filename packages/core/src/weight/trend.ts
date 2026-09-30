import type { WeightSample } from '../types';
import { dayIndex } from '../util/date';

export interface Point {
  x: number;
  y: number;
}

export interface LinearTrend {
  /** Fitted slope in kilograms per day; negative means weight is decreasing. */
  slopePerDay: number;
  /** Fitted value at x = 0. */
  intercept: number;
  /** Coefficient of determination in [0, 1]; 1 means a perfect linear fit. */
  r2: number;
  /** Number of points used in the fit. */
  sampleCount: number;
}

/**
 * Ordinary least-squares line over arbitrary points. At least two points with
 * distinct x values are required.
 */
export function linearTrend(points: readonly Point[]): LinearTrend {
  const n = points.length;
  if (n < 2) {
    throw new RangeError('linearTrend() requires at least two points');
  }
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    throw new RangeError('linearTrend() requires distinct x values');
  }
  const slopePerDay = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slopePerDay * sumX) / n;

  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const { x, y } of points) {
    const fitted = intercept + slopePerDay * x;
    ssTot += (y - yMean) ** 2;
    ssRes += (y - fitted) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slopePerDay, intercept, r2, sampleCount: n };
}

/** Convert weight samples to (day-index, weight) points measured from the first sample. */
export function weightPoints(samples: readonly WeightSample[]): Point[] {
  if (samples.length === 0) {
    return [];
  }
  const firstDay = dayIndex(samples[0]!.date);
  return samples.map((sample) => ({
    x: dayIndex(sample.date) - firstDay,
    y: sample.weightKg,
  }));
}

/**
 * Fit the weight trend over an optional trailing window. Returns null when there
 * is not yet enough data (fewer than two samples in the window).
 */
export function fitWeightTrend(
  samples: readonly WeightSample[],
  windowDays?: number,
): LinearTrend | null {
  const points = weightPoints(samples);
  if (windowDays === undefined) {
    return points.length < 2 ? null : linearTrend(points);
  }
  const maxX = points.length > 0 ? (points[points.length - 1]?.x ?? 0) : 0;
  const windowed = points.filter((point) => maxX - point.x <= windowDays);
  return windowed.length < 2 ? null : linearTrend(windowed);
}
