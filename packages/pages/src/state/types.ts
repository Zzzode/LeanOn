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

/** Part of day used to pick a localized greeting. */
export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Calendar parts; the view localizes names and order. */
export interface DateParts {
  /** 0 = Sunday. */
  weekday: number;
  /** 0 = January. */
  month: number;
  day: number;
}

export interface MacroProgress {
  /** Grams logged today. */
  grams: number;
  /** Target grams for the day. */
  targetGrams: number;
}

/**
 * The fully resolved, language-neutral presentation model for Home. The view
 * combines it with a translator (`@zzzode/i18n`) to render text.
 */
export interface TodayState {
  dayPart: DayPart;
  dateParts: DateParts;
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
  /** Fitted trend in kilograms per week (negative = losing). */
  trendKgPerWeek: number;
  streak: number;
  macros: {
    protein: MacroProgress;
    carbs: MacroProgress;
    fat: MacroProgress;
  };
  /** False when the computed target had to be raised to the safe floor. */
  safe: boolean;
}
