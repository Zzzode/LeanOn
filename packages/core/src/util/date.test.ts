import { expect, test } from '@rstest/core';
import { ageOn, dayIndex, daysBetween, isoFromDayIndex } from './date';

test('dayIndex counts UTC days since the epoch', () => {
  expect(dayIndex('1970-01-01')).toBe(0);
  expect(dayIndex('1970-01-02')).toBe(1);
});

test('daysBetween returns a signed day count', () => {
  expect(daysBetween('2026-09-03', '2026-09-04')).toBe(1);
  expect(daysBetween('2026-09-04', '2026-09-03')).toBe(-1);
});

test('ageOn accounts for whether the birthday occurred that year', () => {
  const birth = '1996-05-20';
  expect(ageOn(birth, '2026-05-19')).toBe(29);
  expect(ageOn(birth, '2026-05-20')).toBe(30);
  expect(ageOn(birth, '2026-10-01')).toBe(30);
});

test('isoFromDayIndex inverts dayIndex across month boundaries', () => {
  expect(isoFromDayIndex(0)).toBe('1970-01-01');
  expect(isoFromDayIndex(dayIndex('2026-10-01'))).toBe('2026-10-01');
  expect(isoFromDayIndex(dayIndex('2026-03-01'))).toBe('2026-03-01');
  expect(() => isoFromDayIndex(1.5)).toThrow(RangeError);
});

test('date helpers reject malformed input', () => {
  expect(() => dayIndex('09/03/2026')).toThrow();
  expect(() => ageOn('bad', '2026-10-01')).toThrow();
});
