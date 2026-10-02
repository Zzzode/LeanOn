/**
 * Micronutrient accumulation and reference-goal helpers (RFC 0024).
 *
 * Pure functions: no clock, I/O or randomness. Fiber, sugar and saturated fat
 * are grams; sodium is milligrams.
 */
import type { IntakeSample, Micros } from '../types';

/** All-zero micronutrients; safe to share (callers must not mutate). */
export const ZERO_MICROS: Micros = {
  fiberG: 0,
  sugarG: 0,
  saturatedFatG: 0,
  sodiumMg: 0,
};

/** Reference daily diet-quality goals; same shape as {@link Micros}. */
export type MicroGoals = Micros;

const FIBER_GOAL_G = 30;
const SUGAR_GOAL_G = 50;
const SODIUM_GOAL_MG = 2300;
/** Saturated fat is capped below this fraction of daily energy. */
const SATURATED_FAT_ENERGY_FRACTION = 0.1;
const KCAL_PER_G_FAT = 9;

/** Component-wise sum of two micronutrient values. */
export function addMicros(a: Micros, b: Micros): Micros {
  return {
    fiberG: a.fiberG + b.fiberG,
    sugarG: a.sugarG + b.sugarG,
    saturatedFatG: a.saturatedFatG + b.saturatedFatG,
    sodiumMg: a.sodiumMg + b.sodiumMg,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Sum every intake sample on [date]; gram fields to 1 dp, sodium to whole mg. */
export function microsForDate(
  intake: readonly IntakeSample[],
  date: string,
): Micros {
  const total: Micros = { ...ZERO_MICROS };
  for (const sample of intake) {
    if (sample.date === date) {
      total.fiberG += sample.micros.fiberG;
      total.sugarG += sample.micros.sugarG;
      total.saturatedFatG += sample.micros.saturatedFatG;
      total.sodiumMg += sample.micros.sodiumMg;
    }
  }
  return {
    fiberG: round1(total.fiberG),
    sugarG: round1(total.sugarG),
    saturatedFatG: round1(total.saturatedFatG),
    sodiumMg: Math.round(total.sodiumMg),
  };
}

/**
 * Reference daily micronutrient goals for display. Fiber, sugar and sodium use
 * fixed population guidelines; saturated fat is capped at 10% of the energy
 * goal (9 kcal/g). Throws `RangeError` for a non-finite or non-positive
 * `energyGoalKcal`.
 */
export function recommendMicroGoals(energyGoalKcal: number): MicroGoals {
  if (!Number.isFinite(energyGoalKcal) || energyGoalKcal <= 0) {
    throw new RangeError(
      `energyGoalKcal must be a finite positive number: ${energyGoalKcal}`,
    );
  }
  return {
    fiberG: FIBER_GOAL_G,
    sugarG: SUGAR_GOAL_G,
    saturatedFatG: Math.round(
      (energyGoalKcal * SATURATED_FAT_ENERGY_FRACTION) / KCAL_PER_G_FAT,
    ),
    sodiumMg: SODIUM_GOAL_MG,
  };
}
