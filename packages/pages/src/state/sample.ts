import type { HostData } from './types';

/** ISO date `n` days before the fixed sample "today" (2026-10-01, UTC). */
function isoDaysAgo(n: number): string {
  const today = Date.UTC(2026, 9, 1);
  return new Date(today - n * 86_400_000).toISOString().slice(0, 10);
}

const WEIGHT_DAYS = 35;

/**
 * Deterministic sample dataset (no randomness): a male user trending down from
 * 84.0 kg toward a 72 kg goal, currently around 80.4 kg, logging consistently.
 * This stands in for host data until the bridge delivers real records.
 */
export const sampleHostData: HostData = (() => {
  const weights = Array.from({ length: WEIGHT_DAYS }, (_, i) => {
    const trend = 84.0 - i * 0.103;
    const noise = Math.sin(i * 1.3) * 0.22 + Math.sin(i * 0.5) * 0.12;
    return {
      date: isoDaysAgo(WEIGHT_DAYS - 1 - i),
      weightKg: Math.round((trend + noise) * 10) / 10,
    };
  });

  // Historical intake for the previous 13 days, near the planned target.
  const historicalIntake = Array.from({ length: 13 }, (_, k) => {
    const i = k + 21;
    const kcal = 1760 + Math.round(Math.sin(i * 1.1) * 90);
    return {
      date: isoDaysAgo(WEIGHT_DAYS - 1 - i),
      kcal,
      macros: { proteinG: 132, carbsG: 178, fatG: 54 },
    };
  });

  // Today: breakfast + lunch logged so far.
  const todayIntake = {
    date: isoDaysAgo(0),
    kcal: 1180,
    macros: { proteinG: 78, carbsG: 128, fatG: 36 },
  };

  return {
    today: isoDaysAgo(0),
    todayHour: 19,
    profile: {
      sex: 'male',
      birthDate: '1993-05-12',
      heightCm: 178,
      activityLevel: 'lightly_active',
    },
    goalWeightKg: 72,
    weeklyLossKg: 0.6,
    weights,
    intake: [...historicalIntake, todayIntake],
    todayExerciseKcal: 240,
    streak: 13,
    customFoods: [],
    favoriteFoodIds: [],
    recentFoodIds: [],
  };
})();
