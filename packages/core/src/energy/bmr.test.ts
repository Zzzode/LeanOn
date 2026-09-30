import { expect, test } from '@rstest/core';
import type { Profile } from '../types';
import { estimateBmr, katchMcArdle, mifflinStJeor } from './bmr';

test('Mifflin-St Jeor for a male (80kg/175cm/30y) is 1748.75', () => {
  expect(
    mifflinStJeor({ weightKg: 80, heightCm: 175, age: 30, sex: 'male' }),
  ).toBeCloseTo(1748.75, 2);
});

test('Mifflin-St Jeor for a female (60kg/165cm/30y) is 1320.25', () => {
  expect(
    mifflinStJeor({ weightKg: 60, heightCm: 165, age: 30, sex: 'female' }),
  ).toBeCloseTo(1320.25, 2);
});

test('Katch-McArdle uses lean body mass (80kg at 20% -> 1752.4)', () => {
  expect(katchMcArdle(80, 0.2)).toBeCloseTo(1752.4, 2);
});

test('Katch-McArdle rejects body fat outside (0,1)', () => {
  expect(() => katchMcArdle(80, 0)).toThrow();
  expect(() => katchMcArdle(80, 1)).toThrow();
});

test('estimateBmr prefers Katch when body fat is known', () => {
  const withFat: Profile = {
    sex: 'male',
    birthDate: '1996-05-20',
    heightCm: 175,
    activityLevel: 'sedentary',
    bodyFatPercent: 0.2,
  };
  expect(estimateBmr(withFat, { weightKg: 80, onDate: '2026-10-01' })).toBeCloseTo(
    1752.4,
    2,
  );

  const withoutFat: Profile = {
    sex: 'male',
    birthDate: '1996-05-20',
    heightCm: 175,
    activityLevel: 'sedentary',
  };
  expect(estimateBmr(withoutFat, { weightKg: 80, onDate: '2026-10-01' })).toBeCloseTo(
    1748.75,
    2,
  );
});

test('estimateBmr rejects non-positive weight', () => {
  const profile: Profile = {
    sex: 'male',
    birthDate: '1996-05-20',
    heightCm: 175,
    activityLevel: 'sedentary',
  };
  expect(() => estimateBmr(profile, { weightKg: 0, onDate: '2026-10-01' })).toThrow();
});
