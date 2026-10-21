import { expect, test } from '@rstest/core';
import { buildProgressInsights } from '@zzzode/core';
import { buildWeightChartGeometry } from './chart';

test('observations retain irregular calendar spacing across a seven-day window', () => {
  const insights = buildProgressInsights({
    endDate: '2026-10-07',
    windowDays: 7,
    weights: [
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-02', weightKg: 79.9 },
      { date: '2026-10-07', weightKg: 79.5 },
    ],
    intake: [],
    exercises: [],
    dailyBudgetKcal: 2000,
  });
  const chart = buildWeightChartGeometry(insights.weight.points, 7);
  expect(chart.points.map(point => point.x)).toEqual([0, 1 / 6, 1]);
});

test('a late first observation leaves the unlogged part of the month visible', () => {
  const chart = buildWeightChartGeometry([
    { x: 20, y: 80 },
    { x: 29, y: 79 },
  ], 30);
  expect(chart.points[0]?.x).toBeCloseTo(20 / 29, 6);
  expect(chart.points[1]?.x).toBe(1);
});

test('axis labels and observations use the same padded weight domain', () => {
  const chart = buildWeightChartGeometry([
    { x: 0, y: 80 },
    { x: 6, y: 78 },
  ], 7);
  expect(chart.ticks[0]?.value).toBeCloseTo(80.3, 6);
  expect(chart.ticks[1]?.value).toBe(79);
  expect(chart.ticks[2]?.value).toBeCloseTo(77.7, 6);
  expect(chart.ticks.map(tick => tick.y)).toEqual([0, 0.5, 1]);
  expect(chart.points[0]?.y).toBeCloseTo(0.3 / 2.6, 6);
  expect(chart.points[1]?.y).toBeCloseTo(2.3 / 2.6, 6);
});

test('flat observations have a readable nonzero domain and a centered line', () => {
  const chart = buildWeightChartGeometry([
    { x: 0, y: 80 },
    { x: 6, y: 80 },
  ], 7);
  expect(chart.ticks[0]?.value).toBeCloseTo(80.2, 6);
  expect(chart.ticks[2]?.value).toBeCloseTo(79.8, 6);
  expect(chart.points.map(point => point.y)).toEqual([0.5, 0.5]);
});

test('a one-day observation is centered without a division by zero', () => {
  expect(buildWeightChartGeometry([{ x: 0, y: 80 }], 1).points).toEqual([
    { x: 0.5, y: 0.5 },
  ]);
});

test('no observations produce no invented line or axis labels', () => {
  expect(buildWeightChartGeometry([], 7)).toEqual({ points: [], ticks: [] });
});
