import { expect, test } from '@rstest/core';
import { buildProgressInsights } from './insights';
import type {
  ExerciseSample,
  IntakeSample,
  WeightSample,
} from './types';

const END = '2026-10-01';
const BUDGET = 1880;

const macros = { proteinG: 100, carbsG: 200, fatG: 50 };
const micros = { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0 };

const weights: WeightSample[] = [
  { date: '2026-09-20', weightKg: 83 }, // outside the 7-day window
  { date: '2026-09-25', weightKg: 81.2 },
  { date: '2026-09-27', weightKg: 80.8 },
  { date: '2026-09-29', weightKg: 80.4 },
  { date: '2026-10-01', weightKg: 80 },
];

const intake: IntakeSample[] = [
  { date: '2026-09-20', kcal: 1900, macros, micros }, // outside
  { date: '2026-09-25', kcal: 1700, macros, micros },
  { date: '2026-09-26', kcal: 2000, macros, micros },
  { date: '2026-09-28', kcal: 1600, macros, micros },
  { date: '2026-10-01', kcal: 900, macros, micros },
  { date: '2026-10-01', kcal: 900, macros, micros }, // accumulates to 1800
];

const exercises: ExerciseSample[] = [
  {
    id: 'ex-out',
    date: '2026-09-20',
    typeId: 'strength',
    durationMin: 30,
    kcal: 200,
  },
  {
    id: 'ex-1',
    date: '2026-09-25',
    typeId: 'strength',
    durationMin: 36,
    kcal: 240,
  },
  {
    id: 'ex-2',
    date: '2026-09-28',
    typeId: 'jogging',
    durationMin: 30,
    kcal: 281,
  },
];

test('aggregates a perfect-line 7-day window', () => {
  const result = buildProgressInsights({
    endDate: END,
    windowDays: 7,
    weights,
    intake,
    exercises,
    dailyBudgetKcal: BUDGET,
  });

  expect(result.startDate).toBe('2026-09-25');
  expect(result.endDate).toBe(END);

  expect(result.weight.startWeightKg).toBeCloseTo(81.2);
  expect(result.weight.endWeightKg).toBeCloseTo(80);
  expect(result.weight.changeKg).toBeCloseTo(-1.2);
  expect(result.weight.slopeKgPerWeek).toBeCloseTo(-1.4);
  expect(result.weight.r2).toBeCloseTo(1);
  expect(result.weight.loggedDays).toBe(4);
  expect(result.weight.points).toHaveLength(4);

  expect(result.nutrition.loggedDays).toBe(4);
  expect(result.nutrition.onTargetDays).toBe(3);
  expect(result.nutrition.averageKcal).toBeCloseTo(1775);
  expect(result.nutrition.averageDeficitKcal).toBeCloseTo(105);
  expect(result.nutrition.dailyKcal).toHaveLength(4);

  expect(result.exercise.activeDays).toBe(2);
  expect(result.exercise.totalKcal).toBe(521);
  expect(result.exercise.totalMin).toBe(66);
});

test('empty window yields null averages and zero totals', () => {
  const onlyOld = [
    { date: '2026-09-01', weightKg: 90 },
  ] as WeightSample[];
  const result = buildProgressInsights({
    endDate: END,
    windowDays: 7,
    weights: onlyOld,
    intake: [],
    exercises: [],
    dailyBudgetKcal: BUDGET,
  });

  expect(result.weight.changeKg).toBeNull();
  expect(result.weight.slopeKgPerWeek).toBeNull();
  expect(result.nutrition.loggedDays).toBe(0);
  expect(result.nutrition.averageKcal).toBeNull();
  expect(result.nutrition.averageDeficitKcal).toBeNull();
  expect(result.exercise.activeDays).toBe(0);
  expect(result.exercise.totalKcal).toBe(0);
});

test('single weight gives zero endpoint change but no slope', () => {
  const result = buildProgressInsights({
    endDate: END,
    windowDays: 7,
    weights: [{ date: '2026-09-28', weightKg: 80.4 }],
    intake: [],
    exercises: [],
    dailyBudgetKcal: BUDGET,
  });
  expect(result.weight.changeKg).toBeCloseTo(0);
  expect(result.weight.slopeKgPerWeek).toBeNull();
});

test('rejects non-positive or non-integer windows', () => {
  const base = {
    endDate: END,
    weights,
    intake,
    exercises,
    dailyBudgetKcal: BUDGET,
  };
  expect(() => buildProgressInsights({ ...base, windowDays: 0 })).toThrow(
    RangeError,
  );
  expect(() => buildProgressInsights({ ...base, windowDays: -7 })).toThrow(
    RangeError,
  );
  expect(() => buildProgressInsights({ ...base, windowDays: 7.5 })).toThrow(
    RangeError,
  );
});
