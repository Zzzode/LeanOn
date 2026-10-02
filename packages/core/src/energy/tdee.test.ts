import { expect, test } from '@rstest/core';
import type { IntakeSample, WeightSample } from '../types';
import { adaptiveTdee, staticTdee } from './tdee';

const date = (offset: number): string => {
  const d = new Date(Date.UTC(2026, 8, 3) + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const weights28: WeightSample[] = Array.from({ length: 28 }, (_, i) => ({
  date: date(i),
  weightKg: 80 - (2 * i) / 27, // 80 -> 78 kg
}));
const intake28: IntakeSample[] = Array.from({ length: 28 }, (_, i) => ({
  date: date(i),
  kcal: 1800,
  macros: { proteinG: 120, carbsG: 180, fatG: 60 },
  micros: { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0 },
}));

test('staticTdee multiplies BMR by the activity factor', () => {
  expect(staticTdee(1748.75, 'sedentary')).toBeCloseTo(2098.5, 2);
});

test('adaptiveTdee infers ~2370 kcal from the losing trend and 1800 intake', () => {
  const result = adaptiveTdee({ weights: weights28, intake: intake28 });
  expect(result).not.toBeNull();
  expect(result!.tdee).toBeCloseTo(2370.37, 1);
  expect(result!.lower).toBeLessThan(result!.tdee);
  expect(result!.upper).toBeGreaterThan(result!.tdee);
  expect(result!.confidence).toBe('high');
  // The anchor day (latest weight) is still in progress and excluded from the
  // completed-day intake, so coverage is 27 of 28 days.
  expect(result!.coverage).toBeCloseTo(27 / 28, 2);
  expect(result!.slopePerDay).toBeCloseTo(-2 / 27, 4);
});

test('adaptiveTdee returns null with too few logged days', () => {
  const sparseIntake = intake28.slice(0, 5);
  expect(adaptiveTdee({ weights: weights28, intake: sparseIntake })).toBeNull();
});

test('adaptiveTdee returns null without intake or weights', () => {
  expect(adaptiveTdee({ weights: weights28, intake: [] })).toBeNull();
  expect(adaptiveTdee({ weights: [], intake: intake28 })).toBeNull();
});
