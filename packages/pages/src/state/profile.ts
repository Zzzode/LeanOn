import { isIsoDate } from '@zzzode/core';
import type { ActivityLevel, Profile, Sex } from '@zzzode/core';

export type GuidanceMode = 'weight-loss' | 'tracking-only';

export interface ProfileSafetyFlags {
  pregnant: boolean | null;
  breastfeeding: boolean | null;
  eatingDisorderRisk: boolean | null;
}

export interface ProfileSavePayload {
  profile: Profile;
  goalWeightKg: number | null;
  weeklyLossKg: number | null;
  guidanceMode: GuidanceMode;
  safetyFlags: ProfileSafetyFlags;
  initialWeightKg?: number;
}

export interface ProfileDraft {
  sex: Sex | null;
  birthDate: string;
  heightCm: string;
  activityLevel: ActivityLevel | null;
  bodyFatPercent: string;
  goalWeightKg: string;
  weeklyLossKg: string;
  initialWeightKg: string;
  guidanceMode: GuidanceMode;
  safetyFlags: ProfileSafetyFlags;
}

export type ProfileValidationError = 'invalid-profile' | 'invalid-goal' | 'safety-required'
  | 'tracking-required' | 'age-safety' | 'bmi-safety' | 'initial-weight-required';

export type ProfileValidation = { valid: true; payload: ProfileSavePayload }
  | { valid: false; error: ProfileValidationError };

/** Calendar-only validation; the host supplies today, including its time zone. */
export const isProfileDate = isIsoDate;

function numeric(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function inRange(value: number | null, minimum: number, maximum: number): value is number {
  return value !== null && value >= minimum && value <= maximum;
}

/** Builds one complete mutation payload; it never persists a partial draft. */
export function validateProfileDraft(
  draft: ProfileDraft,
  context: { today: string; editing: boolean; currentWeightKg?: number },
): ProfileValidation {
  const heightCm = numeric(draft.heightCm);
  const bodyFat = draft.bodyFatPercent.trim() === '' ? undefined : numeric(draft.bodyFatPercent);
  const activities: ReadonlyArray<ActivityLevel> = ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'];
  if ((draft.sex !== 'female' && draft.sex !== 'male') || !isProfileDate(context.today)
    || !isProfileDate(draft.birthDate) || draft.birthDate > context.today
    || !inRange(heightCm, 80, 250) || draft.activityLevel === null || !activities.includes(draft.activityLevel)
    || (bodyFat !== undefined && (bodyFat === null || bodyFat <= 0 || bodyFat >= 100))) {
    return { valid: false, error: 'invalid-profile' };
  }
  const initialWeight = !context.editing && draft.initialWeightKg.trim() !== '' ? numeric(draft.initialWeightKg) : undefined;
  if (initialWeight !== undefined && !inRange(initialWeight, 20, 300)) {
    return { valid: false, error: 'invalid-profile' };
  }
  const goalWeightKg = draft.goalWeightKg.trim() === '' ? null : numeric(draft.goalWeightKg);
  if (draft.goalWeightKg.trim() !== '' && !inRange(goalWeightKg, 20, 300)) {
    return { valid: false, error: 'invalid-goal' };
  }
  let weeklyLossKg: number | null = null;
  if (draft.guidanceMode === 'weight-loss') {
    const year = Number(context.today.slice(0, 4)) - Number(draft.birthDate.slice(0, 4));
    const age = year - (context.today.slice(5) < draft.birthDate.slice(5) ? 1 : 0);
    if (age < 20) return { valid: false, error: 'age-safety' };
    const flags = Object.values(draft.safetyFlags);
    if (flags.some(flag => flag === null)) return { valid: false, error: 'safety-required' };
    if (flags.some(flag => flag !== false)) return { valid: false, error: 'tracking-required' };
    weeklyLossKg = numeric(draft.weeklyLossKg);
    if (!inRange(goalWeightKg, 20, 300) || !inRange(weeklyLossKg, 0.5, 1)) {
      return { valid: false, error: 'invalid-goal' };
    }
    const currentWeight = initialWeight ?? context.currentWeightKg;
    if (currentWeight === undefined || !inRange(currentWeight, 20, 300)) {
      return { valid: false, error: 'initial-weight-required' };
    }
    const heightM = heightCm / 100;
    if (currentWeight / (heightM * heightM) < 18.5 || goalWeightKg / (heightM * heightM) < 18.5) {
      return { valid: false, error: 'bmi-safety' };
    }
  } else if (draft.guidanceMode !== 'tracking-only') {
    return { valid: false, error: 'invalid-profile' };
  }
  const profile: Profile = {
    sex: draft.sex, birthDate: draft.birthDate, heightCm, activityLevel: draft.activityLevel,
    ...(bodyFat === undefined ? {} : { bodyFatPercent: bodyFat / 100 }),
  };
  return { valid: true, payload: {
    profile, goalWeightKg, weeklyLossKg, guidanceMode: draft.guidanceMode,
    safetyFlags: { ...draft.safetyFlags },
    ...(initialWeight === undefined ? {} : { initialWeightKg: initialWeight }),
  } };
}
