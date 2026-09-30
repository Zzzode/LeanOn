import { expect, test } from '@rstest/core';
import type { PeriodRecord, WeightSample } from '../types';
import { alignToCycle, weightsAtCycleDay } from './cycle';

const periods: PeriodRecord[] = [
  { startDate: '2026-09-01' },
  { startDate: '2026-09-29' },
];

test('alignToCycle assigns cycle day and phase', () => {
  expect(alignToCycle('2026-09-01', periods)?.cycleDay).toBe(1);
  expect(alignToCycle('2026-09-01', periods)?.phase).toBe('menstrual');
  expect(alignToCycle('2026-09-05', periods)?.phase).toBe('menstrual');
  expect(alignToCycle('2026-09-08', periods)?.phase).toBe('follicular');
  expect(alignToCycle('2026-09-15', periods)?.phase).toBe('ovulatory');
  expect(alignToCycle('2026-09-25', periods)?.phase).toBe('luteal');
});

test('a new period resets cycle day to 1', () => {
  const aligned = alignToCycle('2026-09-29', periods);
  expect(aligned?.cycleDay).toBe(1);
  expect(aligned?.cycleStart).toBe('2026-09-29');
});

test('dates before the first logged period cannot be aligned', () => {
  expect(alignToCycle('2026-08-20', periods)).toBeNull();
});

test('alignment beyond the expected cycle length is extrapolated', () => {
  const single: PeriodRecord[] = [{ startDate: '2026-09-01' }];
  expect(alignToCycle('2026-09-28', single)?.extrapolated).toBe(false);
  expect(alignToCycle('2026-09-29', single)?.extrapolated).toBe(true);
});

test('weightsAtCycleDay compares the same cycle phase across months', () => {
  const weights: WeightSample[] = [
    { date: '2026-09-21', weightKg: 70 }, // cycle 1, day 21
    { date: '2026-10-19', weightKg: 69 }, // cycle 2, day 21
  ];
  const points = weightsAtCycleDay(weights, periods, 21, { toleranceDays: 0 });
  expect(points).toHaveLength(2);
  expect(points[0]?.weightKg).toBe(70);
  expect(points[1]?.weightKg).toBe(69);
});
