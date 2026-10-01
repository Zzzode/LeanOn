import type {
  ActivityLevel,
  Confidence,
  IntakeSample,
  WeightSample,
} from '../types';
import { dayIndex } from '../util/date';
import { fitWeightTrend } from '../weight/trend';

/** Day-zero activity multipliers (Harris-Benedict convention). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
};

/** Static TDEE from BMR and an activity factor; a day-zero estimate only. */
export function staticTdee(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activityLevel];
}

/**
 * Working energy density of weight change, 7700 kcal/kg (32.2 MJ/kg,
 * ~3500 kcal/lb). A working constant, not a physical law.
 */
export const ENERGY_DENSITY_KCAL_PER_KG = 7700;

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_MIN_SPAN_DAYS = 14;
const DEFAULT_MIN_LOGGED_DAYS = 10;

export interface AdaptiveTdeeInput {
  weights: readonly WeightSample[];
  intake: readonly IntakeSample[];
  /** Trailing window length in days. */
  windowDays?: number;
  /** Minimum fitted span before any estimate is returned. */
  minSpanDays?: number;
  /** Minimum number of logged intake days in the window. */
  minLoggedDays?: number;
}

export interface AdaptiveTdeeResult {
  /** Inferred real maintenance energy, kcal/day. */
  tdee: number;
  /** Lower end of the confidence band, kcal/day. */
  lower: number;
  /** Upper end of the confidence band, kcal/day. */
  upper: number;
  confidence: Confidence;
  windowDays: number;
  /** Number of distinct days with intake logged inside the window. */
  loggedDays: number;
  /** Fraction of the window covered by intake logs, in [0, 1]. */
  coverage: number;
  meanIntake: number;
  slopePerDay: number;
}

function bandHalfWidth(confidence: Confidence): number {
  switch (confidence) {
    case 'high':
      return 75;
    case 'medium':
      return 100;
    case 'low':
      return 150;
  }
}

/**
 * Infer adaptive TDEE from energy conservation:
 * `TDEE = mean(intake) - slopePerDay * rho`.
 *
 * Weight loss yields a negative slope, so TDEE is higher than mean intake.
 * Returns null until the window spans enough days with enough logged intake.
 */
export function adaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult | null {
  const {
    weights,
    intake,
    windowDays = DEFAULT_WINDOW_DAYS,
    minSpanDays = DEFAULT_MIN_SPAN_DAYS,
    minLoggedDays = DEFAULT_MIN_LOGGED_DAYS,
  } = input;

  if (weights.length === 0) {
    return null;
  }
  const anchorDay = dayIndex(weights[weights.length - 1]!.date);
  const windowStartDay = anchorDay - windowDays + 1;

  const windowWeights = weights.filter(
    (sample) => dayIndex(sample.date) >= windowStartDay,
  );
  const points = windowWeights.map((sample) => ({
    x: dayIndex(sample.date) - windowStartDay,
    y: sample.weightKg,
  }));
  if (points.length < 2) {
    return null;
  }
  const trend = fitWeightTrend(windowWeights, windowDays);
  if (trend === null) {
    return null;
  }
  const spanDays = (points[points.length - 1]?.x ?? 0) - (points[0]?.x ?? 0);

  // Aggregate intake per calendar day over COMPLETED days only. The anchor day
  // is the latest weight sample (typically today's morning weigh-in) and is still
  // in progress, so its partial intake must not move the maintenance estimate
  // and make the day's calorie budget jump on every logged meal.
  const kcalByDay = new Map<number, number>();
  for (const sample of intake) {
    const day = dayIndex(sample.date);
    if (day < windowStartDay || day >= anchorDay) {
      continue;
    }
    kcalByDay.set(day, (kcalByDay.get(day) ?? 0) + sample.kcal);
  }
  const loggedDays = kcalByDay.size;
  if (spanDays < minSpanDays || loggedDays < minLoggedDays) {
    return null;
  }
  let intakeTotal = 0;
  for (const kcal of kcalByDay.values()) {
    intakeTotal += kcal;
  }
  const meanIntake = intakeTotal / loggedDays;

  const tdee = meanIntake - trend.slopePerDay * ENERGY_DENSITY_KCAL_PER_KG;

  let confidence: Confidence;
  if (loggedDays >= 21 && spanDays >= 24) {
    confidence = 'high';
  } else if (loggedDays >= 12 && spanDays >= 14) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const halfWidth = bandHalfWidth(confidence);
  return {
    tdee,
    lower: tdee - halfWidth,
    upper: tdee + halfWidth,
    confidence,
    windowDays,
    loggedDays,
    coverage: loggedDays / windowDays,
    meanIntake,
    slopePerDay: trend.slopePerDay,
  };
}
