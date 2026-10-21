import type {
  ExerciseSample,
  IntakeSample,
  WeightSample,
} from './types';
import { dayIndex, isoFromDayIndex } from './util/date';
import { linearTrend, type Point } from './weight/trend';

export interface BuildInsightsInput {
  /** Inclusive end date, typically today. */
  endDate: string;
  /** Positive integer window length in days (7 or 30). */
  windowDays: number;
  weights: readonly WeightSample[];
  intake: readonly IntakeSample[];
  exercises: readonly ExerciseSample[];
  /** The adaptive daily energy target used for the on-target comparison. */
  dailyBudgetKcal: number;
}

export interface DailyKcalPoint {
  date: string;
  kcal: number;
}

export interface WeightInsight {
  startWeightKg: number | null;
  endWeightKg: number | null;
  /** End - start over the window; null with fewer than one weight. */
  changeKg: number | null;
  /** Fitted OLS slope expressed per week; null with fewer than two days. */
  slopeKgPerWeek: number | null;
  r2: number | null;
  /** In-window weight points for the trend chart. */
  points: readonly Point[];
  /** Distinct days with a weight logged. */
  loggedDays: number;
}

export interface NutritionInsight {
  /** Distinct days with any intake. */
  loggedDays: number;
  /** Days whose total intake is at or below the budget. */
  onTargetDays: number;
  /** Mean intake over logged days only; null when none. */
  averageKcal: number | null;
  /** Budget minus the average intake; null when no logged days. */
  averageDeficitKcal: number | null;
  dailyKcal: readonly DailyKcalPoint[];
}

export interface ExerciseInsight {
  /** Distinct days with at least one session. */
  activeDays: number;
  totalKcal: number;
  totalMin: number;
}

export interface ProgressInsights {
  windowDays: number;
  startDate: string;
  endDate: string;
  weight: WeightInsight;
  nutrition: NutritionInsight;
  exercise: ExerciseInsight;
}

/**
 * Aggregate weight, nutrition and exercise over a trailing, UTC whole-day
 * window (RFC 0019). Pure and deterministic: records in, one result out, with
 * no clock or I/O. Intake averages use logged days only so that missing days
 * are never treated as fasting.
 */
export function buildProgressInsights(
  input: BuildInsightsInput,
): ProgressInsights {
  const { endDate, weights, intake, exercises, dailyBudgetKcal } = input;
  const { windowDays } = input;
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new RangeError(
      `windowDays must be a positive integer, received: ${windowDays}`,
    );
  }

  const endIndex = dayIndex(endDate);
  const startIndex = endIndex - (windowDays - 1);
  const startDate = isoFromDayIndex(startIndex);
  const inWindow = (date: string): boolean => {
    const index = dayIndex(date);
    return index >= startIndex && index <= endIndex;
  };

  // Weight: sort by day, endpoint change and an OLS weekly slope.
  const windowWeights = weights
    .filter((sample) => inWindow(sample.date))
    .sort((a, b) => dayIndex(a.date) - dayIndex(b.date));
  const points: Point[] = windowWeights.map((sample) => ({
    x: dayIndex(sample.date) - startIndex,
    y: sample.weightKg,
  }));
  const startWeight = windowWeights[0]?.weightKg ?? null;
  const endWeight = windowWeights[windowWeights.length - 1]?.weightKg ?? null;
  const changeKg =
    startWeight !== null && endWeight !== null ? endWeight - startWeight : null;
  let slopeKgPerWeek: number | null = null;
  let r2: number | null = null;
  const distinctDays = new Set(points.map((point) => point.x));
  if (distinctDays.size >= 2) {
    const fitted = linearTrend(points);
    slopeKgPerWeek = fitted.slopePerDay * 7;
    r2 = fitted.r2;
  }

  // Nutrition: accumulate multiple meals per calendar day.
  const byDay = new Map<string, number>();
  for (const sample of intake) {
    if (!inWindow(sample.date)) continue;
    byDay.set(sample.date, (byDay.get(sample.date) ?? 0) + sample.kcal);
  }
  const dailyKcal: DailyKcalPoint[] = [...byDay.entries()]
    .map(([date, kcal]) => ({ date, kcal }))
    .sort((a, b) => dayIndex(a.date) - dayIndex(b.date));
  const loggedDays = dailyKcal.length;
  const onTargetDays = dailyKcal.filter(
    (point) => point.kcal <= dailyBudgetKcal,
  ).length;
  const averageKcal =
    loggedDays > 0
      ? dailyKcal.reduce((sum, point) => sum + point.kcal, 0) / loggedDays
      : null;
  const averageDeficitKcal =
    averageKcal !== null ? dailyBudgetKcal - averageKcal : null;

  // Exercise: distinct active days plus totals.
  const activeDaySet = new Set<string>();
  let totalKcal = 0;
  let totalMin = 0;
  for (const session of exercises) {
    if (!inWindow(session.date)) continue;
    activeDaySet.add(session.date);
    totalKcal += session.kcal;
    totalMin += session.durationMin;
  }

  return {
    windowDays,
    startDate,
    endDate,
    weight: {
      startWeightKg: startWeight,
      endWeightKg: endWeight,
      changeKg,
      slopeKgPerWeek,
      r2,
      points,
      loggedDays: distinctDays.size,
    },
    nutrition: {
      loggedDays,
      onTargetDays,
      averageKcal,
      averageDeficitKcal,
      dailyKcal,
    },
    exercise: {
      activeDays: activeDaySet.size,
      totalKcal,
      totalMin: Math.round(totalMin),
    },
  };
}
