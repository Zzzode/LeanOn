import { expect, test } from '@rstest/core';
import type { WeightSample } from '../types';
import { classifyWeightStatus } from './plateau';

const date = (offset: number): string => {
  const d = new Date(Date.UTC(2026, 8, 3) + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const flat = (days: number): WeightSample[] =>
  Array.from({ length: days }, (_, i) => ({ date: date(i), weightKg: 80 }));

const losing: WeightSample[] = Array.from({ length: 28 }, (_, i) => ({
  date: date(i),
  weightKg: 80 - (2 * i) / 27,
}));

test('21 flat days with consistent logging is a plateau', () => {
  expect(classifyWeightStatus({ weights: flat(21), coverage: 1 }).status).toBe('plateau');
});

test('14 flat days are normal variation', () => {
  expect(classifyWeightStatus({ weights: flat(14), coverage: 1 }).status).toBe(
    'normal_variation',
  );
});

test('a clear downward trend is losing', () => {
  expect(classifyWeightStatus({ weights: losing }).status).toBe('losing');
});

test('a flat scale with a shrinking waist is body recomposition', () => {
  expect(
    classifyWeightStatus({ weights: flat(21), coverage: 1, waistSlopePerWeek: -0.5 }).status,
  ).toBe('body_recomposition');
});

test('a flat trend with poor logging coverage is not a plateau', () => {
  expect(classifyWeightStatus({ weights: flat(21), coverage: 0.3 }).status).toBe(
    'normal_variation',
  );
});

test('no data yields insufficient_data', () => {
  expect(classifyWeightStatus({ weights: [] }).status).toBe('insufficient_data');
});
