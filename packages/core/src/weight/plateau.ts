import type { WeightSample } from '../types';
import { dayIndex } from '../util/date';
import { fitWeightTrend } from './trend';

export type WeightStatus =
  | 'insufficient_data'
  | 'losing'
  | 'gaining'
  | 'normal_variation'
  | 'plateau'
  | 'body_recomposition';

/** Minimum consecutive flat days required to call a plateau (RFC 0004). */
export const PLATEAU_WINDOW_DAYS = 21;
/** Weekly slope magnitude (kg/week) below which the trend is treated as flat. */
export const FLAT_BAND_KG_PER_WEEK = 0.2;
/** Minimum intake-log coverage required to trust a plateau call. */
export const MIN_PLATEAU_COVERAGE = 0.6;

export interface PlateauInput {
  weights: readonly WeightSample[];
  /** Trailing window in days; defaults to {@link PLATEAU_WINDOW_DAYS}. */
  windowDays?: number;
  /** Fraction of the window covered by intake logs, in [0, 1]. */
  coverage?: number;
  /** Waist-circumference slope in cm/week; negative means shrinking. */
  waistSlopePerWeek?: number;
}

export interface WeightStatusResult {
  status: WeightStatus;
  slopePerDay: number;
  slopePerWeek: number;
  r2: number;
  spanDays: number;
}

/**
 * Classify the recent weight trend.
 *
 * A plateau requires a flat fitted slope for >=21 days, consistent logging and
 * flat secondary signals. A flat scale with a shrinking waist is body
 * recomposition. Shorter flat spells are normal variation.
 */
export function classifyWeightStatus(input: PlateauInput): WeightStatusResult {
  const {
    weights,
    windowDays = PLATEAU_WINDOW_DAYS,
    coverage,
    waistSlopePerWeek,
  } = input;

  const trend = fitWeightTrend(weights, windowDays);
  if (trend === null || weights.length === 0) {
    return {
      status: 'insufficient_data',
      slopePerDay: 0,
      slopePerWeek: 0,
      r2: 0,
      spanDays: 0,
    };
  }

  const anchorDay = dayIndex(weights[weights.length - 1]!.date);
  const windowStartDay = anchorDay - windowDays + 1;
  const windowPoints = weights
    .map((sample) => dayIndex(sample.date) - windowStartDay)
    .filter((x) => x >= 0);
  const spanDays =
    windowPoints.length > 0
      ? (windowPoints[windowPoints.length - 1] ?? 0) - (windowPoints[0] ?? 0)
      : 0;

  const slopePerWeek = trend.slopePerDay * 7;
  const base = {
    slopePerDay: trend.slopePerDay,
    slopePerWeek,
    r2: trend.r2,
    spanDays,
  };

  if (slopePerWeek <= -FLAT_BAND_KG_PER_WEEK) {
    return { ...base, status: 'losing' };
  }
  if (slopePerWeek >= FLAT_BAND_KG_PER_WEEK) {
    return { ...base, status: 'gaining' };
  }

  // Flat scale. A shrinking waist means body recomposition, not a stall.
  if (waistSlopePerWeek !== undefined && waistSlopePerWeek <= -FLAT_BAND_KG_PER_WEEK) {
    return { ...base, status: 'body_recomposition' };
  }

  const loggingConsistent = coverage === undefined || coverage >= MIN_PLATEAU_COVERAGE;
  // 21 calendar days span 20 day-intervals from first to last sample.
  if (spanDays >= windowDays - 1 && loggingConsistent) {
    return { ...base, status: 'plateau' };
  }
  return { ...base, status: 'normal_variation' };
}
