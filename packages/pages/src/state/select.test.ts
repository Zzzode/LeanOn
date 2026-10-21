import { expect, test } from '@rstest/core';
import { selectToday } from './select';
import type { HostData } from './types';

function fixture(overrides: Partial<HostData> = {}): HostData {
  return {
    schemaVersion:2,revision:0,setupCompleted:true,guidanceMode:'weight-loss',
    safetyFlags:{pregnant:false,breastfeeding:false,eatingDisorderRisk:false},legacyIntake:[],intakeEntries:[],deletedRecords:[],processedOperations:[],
    today: '2026-10-01',
    profile: {
      sex: 'male',
      birthDate: '1996-05-20',
      heightCm: 175,
      activityLevel: 'sedentary',
    },
    goalWeightKg: 70,
    weeklyLossKg: 0.5,
    weights: [{ id:'weight-2026-10-01',date: '2026-10-01', weightKg: 80 }],
    intake: [],
    exercises: [],
    water: [],
    streak: 0,
    customFoods: [],
    favoriteFoodIds: [],
    recentFoodIds: [],
    ...overrides,
  };
}

test('a new journal without a weight returns an explicit unavailable estimate', () => {
  expect(selectToday(fixture({ weights: [] }))).toBeNull();
});

test('a sedentary male target is raised to BMR when the requested deficit is too large', () => {
  const today = selectToday(fixture());
  // Mifflin-St Jeor: 10×80 + 6.25×175 - 5×30 + 5 = 1748.75 kcal.
  expect(today?.energyGoalKcal).toBe(1749);
  expect(today?.safe).toBe(false);
});

test('a fractional BMR floor is rounded upward so the displayed target cannot undercut it', () => {
  const data = fixture();
  data.profile!.bodyFatPercent = 0.2;
  // Katch-McArdle: 370 + 21.6×(80×0.8) = 1752.4 kcal.
  expect(selectToday(data)?.energyGoalKcal).toBe(1753);
});

test('the sex-based floor still applies when it is higher than BMR', () => {
  const data = fixture({
    profile: {
      sex: 'female',
      birthDate: '1996-05-20',
      heightCm: 150,
      activityLevel: 'sedentary',
    },
    goalWeightKg: 45,
    weights: [{ id:'weight-2026-10-01',date: '2026-10-01', weightKg: 45 }],
  });
  // BMR is 1076.5 kcal; the existing female minimum is 1200 kcal.
  expect(selectToday(data)?.energyGoalKcal).toBe(1200);
  expect(selectToday(data)?.safe).toBe(false);
});

test('a requested target above both safety floors keeps its normal estimate', () => {
  const data = fixture();
  data.profile!.activityLevel = 'moderately_active';
  // 1748.75×1.55 - 550 = 2160.5625 kcal.
  expect(selectToday(data)?.energyGoalKcal).toBe(2161);
  expect(selectToday(data)?.safe).toBe(true);
});

test('all same-day intake entries contribute to the diary summary and budget', () => {
  const meal = {
    date: '2026-10-01',
    kcal: 590,
    macros: { proteinG: 30, carbsG: 70, fatG: 21 },
    micros: { fiberG: 5, sugarG: 10, saturatedFatG: 4, sodiumMg: 500 },
  };
  const today = selectToday(fixture({ intake: [meal, meal, { ...meal, date: '2026-09-30' }] }));
  expect(today?.foodKcal).toBe(1180);
  expect(today?.macros.protein.grams).toBe(60);
  expect(today?.remainingKcal).toBe(569);
});

test('tracking-only, incomplete setup and safety uncertainty never expose energy or macro targets', () => {
  expect(selectToday(fixture({guidanceMode:'tracking-only'}))).toBeNull();
  expect(selectToday(fixture({profile:null,setupCompleted:false}))).toBeNull();
  expect(selectToday(fixture({safetyFlags:{pregnant:null,breastfeeding:false,eatingDisorderRisk:false}}))).toBeNull();
  expect(selectToday(fixture({safetyFlags:{pregnant:false,breastfeeding:false,eatingDisorderRisk:true}}))).toBeNull();
});

test('a later low weight disables previous loss guidance and future imported weights do not become current', () => {
  expect(selectToday(fixture({weights:[{id:'low',date:'2026-10-01',weightKg:50}]}))).toBeNull();
  const state=selectToday(fixture({weights:[{id:'current',date:'2026-10-01',weightKg:80},{id:'future',date:'2026-10-02',weightKg:120}]}));
  expect(state?.currentWeightKg).toBe(80);
});
