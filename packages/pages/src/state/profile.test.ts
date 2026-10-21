import { expect, test } from '@rstest/core';
import { isProfileDate, validateProfileDraft, type ProfileDraft } from './profile.js';

const draft: ProfileDraft = {
  sex: 'female', birthDate: '1990-10-06', heightCm: '170', activityLevel: 'lightly_active',
  bodyFatPercent: '', goalWeightKg: '65', weeklyLossKg: '0.5', initialWeightKg: '75',
  guidanceMode: 'weight-loss', safetyFlags: { pregnant: false, breastfeeding: false, eatingDisorderRisk: false },
};
const context = { today: '2026-10-06', editing: false };

test('first setup produces one complete payload, including the optional initial weight and fractional body fat', () => {
  const result = validateProfileDraft({ ...draft, bodyFatPercent: '22.5' }, context);
  expect(result).toEqual({ valid: true, payload: {
    profile: { sex: 'female', birthDate: '1990-10-06', heightCm: 170, activityLevel: 'lightly_active', bodyFatPercent: 0.225 },
    goalWeightKg: 65, weeklyLossKg: 0.5, initialWeightKg: 75, guidanceMode: 'weight-loss',
    safetyFlags: { pregnant: false, breastfeeding: false, eatingDisorderRisk: false },
  } });
  expect(draft.bodyFatPercent).toBe('');
});

test('calendar validation rejects rolled dates and the age threshold uses the native day, including birthday boundaries', () => {
  expect(isProfileDate('2024-02-29')).toBe(true);
  expect(isProfileDate('2025-02-29')).toBe(false);
  expect(isProfileDate('0000-01-01')).toBe(false);
  expect(validateProfileDraft({ ...draft, birthDate: '2006-10-07' }, context)).toEqual({ valid: false, error: 'age-safety' });
  expect(validateProfileDraft({ ...draft, birthDate: '2006-10-06' }, context).valid).toBe(true);
  expect(validateProfileDraft({ ...draft, birthDate: '2026-10-07' }, context)).toEqual({ valid: false, error: 'invalid-profile' });
});

test('tracking-only accepts unanswered safety screening without producing a deficit target', () => {
  const result = validateProfileDraft({ ...draft, birthDate: '2010-01-01', guidanceMode: 'tracking-only',
    goalWeightKg: '', weeklyLossKg: '1', initialWeightKg: '',
    safetyFlags: { pregnant: null, breastfeeding: true, eatingDisorderRisk: null },
  }, context);
  expect(result.valid).toBe(true);
  if (result.valid) {
    expect(result.payload.weeklyLossKg).toBeNull();
    expect(result.payload.goalWeightKg).toBeNull();
    expect(result.payload).not.toHaveProperty('initialWeightKg');
  }
});

test('weight-loss requires every safety answer and rejects risk, missing weight and a low current or goal BMI', () => {
  expect(validateProfileDraft({ ...draft, safetyFlags: { ...draft.safetyFlags, pregnant: null } }, context))
    .toEqual({ valid: false, error: 'safety-required' });
  expect(validateProfileDraft({ ...draft, safetyFlags: { ...draft.safetyFlags, eatingDisorderRisk: true } }, context))
    .toEqual({ valid: false, error: 'tracking-required' });
  expect(validateProfileDraft({ ...draft, initialWeightKg: '' }, context))
    .toEqual({ valid: false, error: 'initial-weight-required' });
  expect(validateProfileDraft({ ...draft, initialWeightKg: '50' }, context))
    .toEqual({ valid: false, error: 'bmi-safety' });
  expect(validateProfileDraft({ ...draft, goalWeightKg: '50' }, context))
    .toEqual({ valid: false, error: 'bmi-safety' });
});

test('editing never writes an initial weight, and reads the existing current weight for guidance safety', () => {
  const result = validateProfileDraft({ ...draft, initialWeightKg: '24' }, { ...context, editing: true, currentWeightKg: 75 });
  expect(result.valid).toBe(true);
  if (result.valid) expect(result.payload).not.toHaveProperty('initialWeightKg');
  expect(validateProfileDraft(draft, { ...context, editing: true, currentWeightKg: 50 }))
    .toEqual({ valid: false, error: 'bmi-safety' });
});

test('incomplete basics, out-of-range goals, nondecimal numbers and body-fat boundaries cannot produce save payloads', () => {
  for (const patch of [{ sex: null }, { activityLevel: null }, { heightCm: '79' }, { heightCm: '251' },
    { heightCm: '0xAA' }, { heightCm: '' }, { birthDate: '2025-02-29' }, { bodyFatPercent: '0' }, { bodyFatPercent: '100' },
    { initialWeightKg: '301' }, { initialWeightKg: '19' }]) {
    expect(validateProfileDraft({ ...draft, ...patch }, context)).toEqual({ valid: false, error: 'invalid-profile' });
  }
  for (const patch of [{ goalWeightKg: '' }, { goalWeightKg: '301' }, { weeklyLossKg: '0.49' }, { weeklyLossKg: '1.01' }]) {
    expect(validateProfileDraft({ ...draft, ...patch }, context)).toEqual({ valid: false, error: 'invalid-goal' });
  }
});
