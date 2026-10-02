/**
 * Hydration goal and daily-total helpers (RFC 0023).
 *
 * Pure functions: no clock, I/O or randomness. The day total is the unit of
 * record; the host upserts one {@link WaterSample} per date.
 */
import type { WaterSample } from './types';

/** Millilitres of drinking water per kilogram of body weight per day. */
export const WATER_ML_PER_KG = 35;
/** Bounds keep the derived goal credible at very low or high body weights. */
export const WATER_GOAL_MIN_ML = 1500;
export const WATER_GOAL_MAX_ML = 4000;
/** Goals are rounded to this step for friendly display. */
export const WATER_GOAL_STEP_ML = 50;

/**
 * Recommend a daily water goal in millilitres from body weight using the
 * ~35 ml/kg guideline. The raw value is clamped to `[1500, 4000]` and rounded
 * to the nearest 50 ml. Throws `RangeError` for a non-finite or non-positive
 * weight.
 */
export function recommendWaterGoalMl(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError(
      `weightKg must be a finite positive number: ${weightKg}`,
    );
  }
  const raw = weightKg * WATER_ML_PER_KG;
  const clamped = Math.min(
    WATER_GOAL_MAX_ML,
    Math.max(WATER_GOAL_MIN_ML, raw),
  );
  return Math.round(clamped / WATER_GOAL_STEP_ML) * WATER_GOAL_STEP_ML;
}

/** Total millilitres logged for [date], or 0 when the day has no sample. */
export function waterForDate(
  water: readonly WaterSample[],
  date: string,
): number {
  return water.find((sample) => sample.date === date)?.amountMl ?? 0;
}
