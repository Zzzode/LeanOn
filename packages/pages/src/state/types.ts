/**
 * Raw records the host platform provides via the typed bridge (bootstrapped from
 * initData; see RFC 0010). The UI never owns a clock or persistence layer. The
 * shape is owned by the bridge as `HostDataDto` and re-exported here.
 */
export type { HostDataDto as HostData } from '@zzzode/bridge';

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
  /** Minutes of exercise today. */
  exerciseMin: number;
  /** Today's exercise sessions, in logged order (RFC 0017). */
  exerciseSessions: {
    id: string;
    typeId: string;
    durationMin: number;
    kcal: number;
  }[];
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
