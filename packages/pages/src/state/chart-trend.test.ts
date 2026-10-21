import { expect, test } from '@rstest/core';
import { fitChartTrend } from './chart-trend.js';

test('a known linear decline fits its observations at their calendar positions', () => {
  const trend = fitChartTrend([{ x: 0, y: 0.2 }, { x: 1 / 6, y: 0.3 }, { x: 1, y: 0.8 }]);
  expect(trend.map(point => point.x)).toEqual([0, 1]);
  expect(trend[0]?.y).toBeCloseTo(0.2, 8);
  expect(trend[1]?.y).toBeCloseTo(0.8, 8);
});
test('an uneven observed series uses elapsed calendar positions instead of sample index', () => {
  const trend = fitChartTrend([{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 1, y: 1 }]);
  expect(trend[0]?.y).toBeCloseTo(-2 / 21, 8);
  expect(trend[1]?.y).toBeCloseTo(41 / 42, 8);
});
test('insufficient or identical calendar positions cannot invent a trend', () => {
  expect(fitChartTrend([])).toEqual([]);
  expect(fitChartTrend([{ x: 1, y: 0.5 }])).toEqual([]);
  expect(fitChartTrend([{ x: 1, y: 0.5 }, { x: 1, y: 0.8 }])).toEqual([]);
});
