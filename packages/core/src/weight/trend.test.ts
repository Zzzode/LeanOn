import { expect, test } from '@rstest/core';
import { fitWeightTrend, linearTrend, weightPoints } from './trend';

test('linearTrend fits a perfect line y = x + 1', () => {
  const trend = linearTrend([
    { x: 0, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 3 },
  ]);
  expect(trend.slopePerDay).toBeCloseTo(1);
  expect(trend.intercept).toBeCloseTo(1);
  expect(trend.r2).toBeCloseTo(1);
  expect(trend.sampleCount).toBe(3);
});

test('linearTrend requires at least two points and distinct x', () => {
  expect(() => linearTrend([{ x: 0, y: 1 }])).toThrow();
  expect(() =>
    linearTrend([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]),
  ).toThrow();
});

test('weightPoints indexes days from the first sample', () => {
  const points = weightPoints([
    { date: '2026-09-03', weightKg: 80 },
    { date: '2026-09-05', weightKg: 79 },
  ]);
  expect(points).toEqual([
    { x: 0, y: 80 },
    { x: 2, y: 79 },
  ]);
});

test('fitWeightTrend returns null for fewer than two samples', () => {
  expect(fitWeightTrend([])).toBeNull();
  expect(fitWeightTrend([{ date: '2026-09-03', weightKg: 80 }])).toBeNull();
});

test('fitWeightTrend restricts to a trailing window', () => {
  const samples = [
    { date: '2026-09-01', weightKg: 100 },
    { date: '2026-09-20', weightKg: 80 },
    { date: '2026-09-27', weightKg: 79 },
  ];
  // A 6-day window excludes both earlier samples and leaves fewer than two points.
  expect(fitWeightTrend(samples, 6)).toBeNull();
  expect(fitWeightTrend(samples, 30)?.sampleCount).toBe(3);
});
