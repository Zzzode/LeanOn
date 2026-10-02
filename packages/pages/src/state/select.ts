import {
  adaptiveTdee,
  estimateBmr,
  fitWeightTrend,
  macroTargets,
  staticTdee,
} from '@zzzode/core';
import type {
  DateParts,
  DayPart,
  HostData,
  MacroProgress,
  TodayState,
} from './types';

/** Safe minimum daily calories by sex (see RFC 0004 health floor). */
const MIN_CALORIES = { male: 1500, female: 1200 } as const;

function dayPartFor(hour: number | undefined): DayPart {
  if (hour === undefined) {
    return 'morning';
  }
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }
  return 'evening';
}

function datePartsFor(iso: string): DateParts {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: d.getUTCDay(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
  };
}

const round0 = (value: number): number => Math.round(value);

/** Resolve raw host records into the language-neutral model for Home. */
export function selectToday(data: HostData): TodayState {
  const first = data.weights[0];
  const last = data.weights[data.weights.length - 1];
  if (first === undefined || last === undefined) {
    throw new RangeError('selectToday() requires at least one weight sample');
  }

  const currentWeightKg = last.weightKg;
  const startWeightKg = first.weightKg;

  // Maintenance energy: prefer the adaptive estimate when enough data exists,
  // otherwise fall back to the static day-zero estimate.
  const bmr = estimateBmr(data.profile, {
    weightKg: currentWeightKg,
    onDate: data.today,
  });
  const adaptive = adaptiveTdee({ weights: data.weights, intake: data.intake });
  const tdee = adaptive?.tdee ?? staticTdee(bmr, data.profile.activityLevel);

  // Planned daily deficit from the desired weekly loss rate.
  const dailyDeficit = (data.weeklyLossKg / 7) * 7700;
  const floor = MIN_CALORIES[data.profile.sex];
  const requestedGoal = tdee - dailyDeficit;
  const safe = requestedGoal >= floor;
  const energyGoalKcal = round0(Math.max(requestedGoal, floor));

  // Today's food and macros (there may be several logged meals).
  let foodKcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const meal of data.intake) {
    if (meal.date === data.today) {
      foodKcal += meal.kcal;
      proteinG += meal.macros.proteinG;
      carbsG += meal.macros.carbsG;
      fatG += meal.macros.fatG;
    }
  }

  // Today's exercise sessions (RFC 0017), summed for the eat-back budget.
  const exerciseSessions = data.exercises
    .filter((session) => session.date === data.today)
    .map((session) => ({
      typeId: session.typeId,
      durationMin: session.durationMin,
      kcal: session.kcal,
    }));
  const exerciseKcal = exerciseSessions.reduce(
    (sum, session) => sum + session.kcal,
    0,
  );
  const exerciseMin = exerciseSessions.reduce(
    (sum, session) => sum + session.durationMin,
    0,
  );
  const remainingKcal = energyGoalKcal - foodKcal + exerciseKcal;
  const overBudget = remainingKcal < 0;
  const remainingFraction = Math.min(
    1,
    Math.max(0, remainingKcal / energyGoalKcal),
  );

  const targets = macroTargets({
    targetKcal: energyGoalKcal,
    goalWeightKg: data.goalWeightKg,
    currentWeightKg,
  });

  const macro = (grams: number, targetGrams: number): MacroProgress => ({
    grams: Math.round(grams),
    targetGrams: Math.round(targetGrams),
  });

  // Weight trend over the recent window, expressed per week.
  const trend = fitWeightTrend(data.weights);
  const trendKgPerWeek = (trend?.slopePerDay ?? 0) * 7;

  return {
    dayPart: dayPartFor(data.todayHour),
    dateParts: datePartsFor(data.today),
    energyGoalKcal,
    foodKcal: round0(foodKcal),
    exerciseKcal: round0(exerciseKcal),
    exerciseMin: round0(exerciseMin),
    exerciseSessions,
    remainingKcal: round0(remainingKcal),
    remainingFraction,
    overBudget,
    currentWeightKg,
    startWeightKg,
    goalWeightKg: data.goalWeightKg,
    weightToGoalKg: Math.round((currentWeightKg - data.goalWeightKg) * 10) / 10,
    weightLostKg: Math.round((startWeightKg - currentWeightKg) * 10) / 10,
    trendKgPerWeek,
    streak: data.streak,
    macros: {
      protein: macro(proteinG, targets.proteinG),
      carbs: macro(carbsG, targets.carbsG),
      fat: macro(fatG, targets.fatG),
    },
    safe,
  };
}
