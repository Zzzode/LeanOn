import type { PeriodRecord, WeightSample } from '../types';
import { dayIndex, daysBetween } from '../util/date';

/** Default cycle length used when a logged period does not record its length. */
export const DEFAULT_CYCLE_LENGTH_DAYS = 28;

/**
 * Coarse phases for an idealised 28-day cycle. These are planning
 * approximations, not a clinical classification.
 */
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export interface CycleAlignment {
  /** 1-based day of the cycle; day 1 is the first day of menstruation. */
  cycleDay: number;
  phase: CyclePhase;
  /** Start date (first day) of the cycle containing the date. */
  cycleStart: string;
  /** True beyond the expected length when the next period is not yet logged. */
  extrapolated: boolean;
}

function phaseFor(cycleDay: number): CyclePhase {
  if (cycleDay <= 5) {
    return 'menstrual';
  }
  if (cycleDay <= 13) {
    return 'follicular';
  }
  if (cycleDay <= 16) {
    return 'ovulatory';
  }
  return 'luteal';
}

/**
 * Align a date to the menstrual cycle. Returns null when no period starts on or
 * before the date; callers then widen the noise band instead of assuming a cycle.
 */
export function alignToCycle(
  date: string,
  periods: readonly PeriodRecord[],
  defaultCycleLengthDays: number = DEFAULT_CYCLE_LENGTH_DAYS,
): CycleAlignment | null {
  const sorted = [...periods].sort(
    (a, b) => dayIndex(a.startDate) - dayIndex(b.startDate),
  );

  let enclosing: PeriodRecord | null = null;
  for (const period of sorted) {
    if (daysBetween(period.startDate, date) >= 0) {
      enclosing = period;
    } else {
      break;
    }
  }
  if (enclosing === null) {
    return null;
  }

  const cycleDay = daysBetween(enclosing.startDate, date) + 1;
  const expectedLength = enclosing.cycleLengthDays ?? defaultCycleLengthDays;
  return {
    cycleDay,
    phase: phaseFor(cycleDay),
    cycleStart: enclosing.startDate,
    extrapolated: cycleDay > expectedLength,
  };
}

export interface SameCycleDayPoint {
  cycleStart: string;
  date: string;
  cycleDay: number;
  weightKg: number;
}

export interface CycleDayOptions {
  toleranceDays?: number;
  defaultCycleLengthDays?: number;
}

/**
 * Return, for each logged cycle, the weight nearest a target cycle day, so the
 * same cycle phase can be compared across months instead of adjacent weeks.
 * Cycles without a sample within the tolerance are omitted.
 */
export function weightsAtCycleDay(
  weights: readonly WeightSample[],
  periods: readonly PeriodRecord[],
  targetCycleDay: number,
  options?: CycleDayOptions,
): SameCycleDayPoint[] {
  const toleranceDays = options?.toleranceDays ?? 1;
  const defaultCycleLengthDays =
    options?.defaultCycleLengthDays ?? DEFAULT_CYCLE_LENGTH_DAYS;
  const sortedPeriods = [...periods].sort(
    (a, b) => dayIndex(a.startDate) - dayIndex(b.startDate),
  );

  interface AlignedItem {
    weight: WeightSample;
    alignment: CycleAlignment;
  }
  const byStart = new Map<string, AlignedItem[]>();
  for (const weight of weights) {
    const alignment = alignToCycle(weight.date, sortedPeriods, defaultCycleLengthDays);
    if (alignment === null) {
      continue;
    }
    const group = byStart.get(alignment.cycleStart) ?? [];
    group.push({ weight, alignment });
    byStart.set(alignment.cycleStart, group);
  }

  const points: SameCycleDayPoint[] = [];
  for (const [cycleStart, items] of byStart) {
    const inWindow = items.filter(
      (item) => Math.abs(item.alignment.cycleDay - targetCycleDay) <= toleranceDays,
    );
    if (inWindow.length === 0) {
      continue;
    }
    inWindow.sort(
      (a, b) =>
        Math.abs(a.alignment.cycleDay - targetCycleDay) -
        Math.abs(b.alignment.cycleDay - targetCycleDay),
    );
    const pick = inWindow[0]!;
    points.push({
      cycleStart,
      date: pick.weight.date,
      cycleDay: pick.alignment.cycleDay,
      weightKg: pick.weight.weightKg,
    });
  }
  return points.sort(
    (a, b) => dayIndex(a.cycleStart) - dayIndex(b.cycleStart),
  );
}
