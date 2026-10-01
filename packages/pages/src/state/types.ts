import type { IntakeSample, Profile, WeightSample } from '@zzzode/core';

/**
 * Raw records the host platform provides (in production via the typed bridge;
 * for the first slice, injected through global props with a bundled sample).
 * The UI never owns a clock or persistence layer.
 */
export interface HostData {
  /** ISO date `YYYY-MM-DD` the host considers "today". */
  today: string;
  /** Local hour 0-23, used only for the greeting. */
  todayHour?: number;
  profile: Profile;
  /** Goal/target weight in kilograms. */
  goalWeightKg: number;
  /** Desired loss rate in kilograms per week (0.5-1 is the safe range). */
  weeklyLossKg: number;
  weights: WeightSample[];
  intake: IntakeSample[];
  /** Kilocalories burned through intentional exercise today. */
  todayExerciseKcal?: number;
  /** Number of consecutive logging days. */
  streak: number;
}

export interface MacroProgress {
  label: string;
  /** Grams logged today. */
  grams: number;
  /** Target grams for the day. */
  targetGrams: number;
}

/** The fully resolved, presentation-ready model for the Home screen. */
export interface TodayState {
  greeting: string;
  dateLabel: string;
  /** Daily calorie target after the planned deficit. */
  energyGoalKcal: number;
  /** Calories eaten today. */
  foodKcal: number;
  /** Calories burned through exercise today. */
  exerciseKcal: number;
  /** Calories still available (goal - food + exercise). */
  remainingKcal: number;
  /** Fraction of the budget remaining, clamped to [0, 1]. */
  remainingFraction: number;
  overBudget: boolean;
  currentWeightKg: number;
  startWeightKg: number;
  goalWeightKg: number;
  /** Kilograms left to the goal. */
  weightToGoalKg: number;
  /** Kilograms lost since the first sample. */
  weightLostKg: number;
  /** Human-readable weight trend, e.g. "-0.6 kg/week". */
  trendLabel: string;
  streak: number;
  macros: {
    protein: MacroProgress;
    carbs: MacroProgress;
    fat: MacroProgress;
  };
  /** False when the computed target had to be raised to the safe floor. */
  safe: boolean;
}
