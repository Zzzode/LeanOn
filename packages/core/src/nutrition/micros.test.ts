import { expect, test } from '@rstest/core';
import {
  addMicros,
  microsForDate,
  recommendMicroGoals,
  ZERO_MICROS,
} from './micros';
import type { IntakeSample, Micros } from '../types';

const meal = (date: string, micros: Micros): IntakeSample => ({
  date,
  kcal: 500,
  macros: { proteinG: 0, carbsG: 0, fatG: 0 },
  micros,
});

const m = (fiberG: number, sugarG: number, saturatedFatG: number, sodiumMg: number): Micros =>
  ({ fiberG, sugarG, saturatedFatG, sodiumMg });

test('addMicros sums component-wise', () => {
  expect(addMicros(m(1, 2, 3, 100), m(4, 5, 6, 200))).toEqual(
    m(5, 7, 9, 300),
  );
});

test('microsForDate accumulates the day meals and ignores other dates', () => {
  const intake = [
    meal('2026-10-01', m(10, 20, 5, 1000)),
    meal('2026-10-01', m(5.5, 10, 2, 800)),
    meal('2026-09-30', m(100, 100, 100, 9000)),
  ];
  expect(microsForDate(intake, '2026-10-01')).toEqual(
    m(15.5, 30, 7, 1800),
  );
});

test('microsForDate rounds grams to 1 dp', () => {
  const intake = [
    meal('2026-10-01', m(10.23, 1, 1, 1)),
    meal('2026-10-01', m(10.31, 1, 1, 1)),
  ];
  const r = microsForDate(intake, '2026-10-01');
  expect(r.fiberG).toBe(20.5);
  expect(r.sodiumMg).toBe(2);
});

test('microsForDate returns zeros for an empty day', () => {
  expect(microsForDate([], '2026-10-01')).toEqual(ZERO_MICROS);
  expect(microsForDate([meal('2026-09-30', m(1, 1, 1, 1))], '2026-10-01')).toEqual(
    ZERO_MICROS,
  );
});

test('recommendMicroGoals uses fixed goals and energy-based saturated fat', () => {
  const goals = recommendMicroGoals(2000);
  expect(goals.fiberG).toBe(30);
  expect(goals.sugarG).toBe(50);
  expect(goals.sodiumMg).toBe(2300);
  expect(goals.saturatedFatG).toBe(22); // 200 / 9 = 22.2
  expect(recommendMicroGoals(1880).saturatedFatG).toBe(21); // 188 / 9 = 20.9
});

test('recommendMicroGoals rejects non-finite or non-positive energy', () => {
  expect(() => recommendMicroGoals(0)).toThrow(RangeError);
  expect(() => recommendMicroGoals(-100)).toThrow(RangeError);
  expect(() => recommendMicroGoals(Number.NaN)).toThrow(RangeError);
});
