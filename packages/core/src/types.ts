/**
 * Shared domain types for the LeanOn engine.
 *
 * The engine is pure: it never reads these records from disk or the network.
 * Callers pass plain, date-sorted arrays and receive computed results.
 */

export type Sex = 'female' | 'male';

/** Day-zero activity classification used only until personal data exists. */
export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active';

export interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Profile {
  sex: Sex;
  /** ISO calendar date `YYYY-MM-DD`; age is derived from this, never stored. */
  birthDate: string;
  heightCm: number;
  activityLevel: ActivityLevel;
  /** Fraction in the range (0, 1), e.g. 0.22 for 22% body fat. */
  bodyFatPercent?: number;
}

export interface WeightSample {
  date: string;
  weightKg: number;
}

/**
 * A logged menstrual period. `startDate` is the first day of menstruation
 * (cycle day 1); `cycleLengthDays` is the length of that cycle if known.
 */
export interface PeriodRecord {
  startDate: string;
  cycleLengthDays?: number;
}

export interface IntakeSample {
  date: string;
  kcal: number;
  macros: Macros;
}

export type Confidence = 'low' | 'medium' | 'high';

/** A value paired with an explicit confidence level instead of false precision. */
export interface Estimate<T> {
  value: T;
  confidence: Confidence;
}

/** Half-open interval of calendar dates, `[start, end)`, as ISO dates. */
export interface DateRange {
  start: string;
  end: string;
}
