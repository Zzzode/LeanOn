import { expect, test } from '@rstest/core';
import { bootstrapHostData, isHostData, readHostData, readHostDataEnvelope } from './host-data.js';
import { selectToday } from './select.js';
import { sampleHostData } from './sample.js';
import type { HostData } from './types.js';

const empty: HostData = {
  today: '2026-10-06',
  profile: { sex: 'female', birthDate: '1995-04-10', heightCm: 165, activityLevel: 'sedentary' },
  goalWeightKg: 60, weeklyLossKg: 0.5, streak: 0,
  weights: [], intake: [], exercises: [], water: [], customFoods: [], favoriteFoodIds: [], recentFoodIds: [],
};

test('a valid empty native journal stays empty and has no estimated weight or calories', () => {
  const data = bootstrapHostData(empty, false);
  expect(data).toBe(empty);
  expect(isHostData(sampleHostData)).toBe(true);
  expect(data?.weights).toEqual([]);
  expect(data === null ? undefined : selectToday(data)).toBeNull();
});

test('missing or corrupt native startup records never become preview samples', () => {
  for (const value of [undefined, null, {}, [], { ...empty, weights: undefined }, { ...empty, profile: null }]) {
    expect(bootstrapHostData(value, false)).toBeNull();
  }
  expect(bootstrapHostData(undefined, true)).toBe(sampleHostData);
  expect(bootstrapHostData({}, true)).toBeNull();
});

test('record events and refresh responses accept complete snapshots and reject malformed envelopes', () => {
  expect(readHostDataEnvelope({ hostData: empty })).toBe(empty);
  for (const value of [undefined, null, {}, { hostData: {} }, { hostData: { ...empty, intake: [null] } }]) {
    expect(readHostDataEnvelope(value)).toBeNull();
  }
});

test('nested records must contain finite quantities, valid dates and complete nutrient values', () => {
  const broken = [
    { ...empty, today: '2026-02-30' },
    { ...empty, profile: { ...empty.profile, activityLevel: ['sedentary'] } },
    { ...empty, profile: { ...empty.profile, bodyFatPercent: 1 } },
    { ...empty, goalWeightKg: NaN },
    { ...empty, weights: [{ date: empty.today, weightKg: Infinity }] },
    { ...empty, intake: [{ date: empty.today, kcal: 0, macros: {}, micros: {} }] },
    { ...empty, exercises: [{ id: 'ex', typeId: 'walking', date: empty.today, durationMin: 10, kcal: 20, source: 'unknown' }] },
    { ...empty, water: [{ date: empty.today, amountMl: -1 }] },
    { ...empty, customFoods: [{ id: 'custom', name: { en: 'Test' }, kcal: 100 }] },
    { ...empty, favoriteFoodIds: [12] },
  ];
  for (const value of broken) expect(readHostData(value)).toBeNull();
  expect(isHostData({ ...empty, intake: [{ date: empty.today, kcal: 0,
    macros: { proteinG: 0, carbsG: 0, fatG: 0 },
    micros: { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0 } }] })).toBe(true);
});
