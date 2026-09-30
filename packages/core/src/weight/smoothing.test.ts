import { expect, test } from '@rstest/core';
import { mean, median, rollingMean } from './smoothing';

test('mean computes the arithmetic average', () => {
  expect(mean([1, 2, 3, 4])).toBeCloseTo(2.5);
});

test('mean throws on empty input', () => {
  expect(() => mean([])).toThrow();
});

test('rollingMean preserves length and averages the prefix at the leading edge', () => {
  expect(rollingMean([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
});

test('rollingMean rejects a non-positive window', () => {
  expect(() => rollingMean([1], 0)).toThrow();
});

test('median handles odd and even lengths', () => {
  expect(median([3, 1, 2])).toBeCloseTo(2);
  expect(median([4, 1, 3, 2])).toBeCloseTo(2.5);
  expect(() => median([])).toThrow();
});
