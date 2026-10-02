import { expect, test } from '@rstest/core';
import {
  recommendWaterGoalMl,
  waterForDate,
} from './hydration';
import type { WaterSample } from './types';

test('derives a 35 ml/kg goal', () => {
  expect(recommendWaterGoalMl(60)).toBe(2100);
  expect(recommendWaterGoalMl(80)).toBe(2800);
  expect(recommendWaterGoalMl(100)).toBe(3500);
});

test('rounds the goal to the nearest 50 ml', () => {
  expect(recommendWaterGoalMl(71)).toBe(2500); // 2485
  expect(recommendWaterGoalMl(61)).toBe(2150); // 2135
});

test('clamps the goal to the supported range', () => {
  expect(recommendWaterGoalMl(120)).toBe(4000); // 4200 -> clamp
  expect(recommendWaterGoalMl(30)).toBe(1500); // 1050 -> clamp
});

test('rejects non-finite or non-positive weight', () => {
  expect(() => recommendWaterGoalMl(0)).toThrow(RangeError);
  expect(() => recommendWaterGoalMl(-5)).toThrow(RangeError);
  expect(() => recommendWaterGoalMl(Number.NaN)).toThrow(RangeError);
  expect(() => recommendWaterGoalMl(Number.POSITIVE_INFINITY)).toThrow(RangeError);
});

test('returns the day total or zero', () => {
  const water: WaterSample[] = [
    { date: '2026-10-01', amountMl: 1750 },
  ];
  expect(waterForDate(water, '2026-10-01')).toBe(1750);
  expect(waterForDate(water, '2026-10-02')).toBe(0);
  expect(waterForDate([], '2026-10-01')).toBe(0);
});
