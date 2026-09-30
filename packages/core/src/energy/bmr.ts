import type { Profile, Sex } from '../types';
import { ageOn } from '../util/date';

/** Mifflin-St Jeor sex constant. */
const SEX_CONSTANT: Record<Sex, number> = {
  male: 5,
  female: -161,
};

export interface MifflinInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}

/**
 * Mifflin-St Jeor BMR, the default estimate when body composition is unknown.
 * `BMR = 10*kg + 6.25*cm - 5*age + s` (`s` = +5 male, -161 female).
 */
export function mifflinStJeor(input: MifflinInput): number {
  const { weightKg, heightCm, age, sex } = input;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_CONSTANT[sex];
}

/**
 * Katch-McArdle BMR, preferred when body fat is known:
 * `LBM = kg * (1 - bf%)`, `BMR = 370 + 21.6 * LBM`.
 */
export function katchMcArdle(weightKg: number, bodyFatPercent: number): number {
  if (bodyFatPercent <= 0 || bodyFatPercent >= 1) {
    throw new RangeError('bodyFatPercent must be a fraction strictly between 0 and 1');
  }
  const leanMassKg = weightKg * (1 - bodyFatPercent);
  return 370 + 21.6 * leanMassKg;
}

export interface BmrContext {
  /** Current body weight in kilograms. */
  weightKg: number;
  /** ISO date on which age is evaluated (the engine has no clock). */
  onDate: string;
}

/** Best-available BMR for a profile: Katch-McArdle when body fat is known, else Mifflin. */
export function estimateBmr(profile: Profile, context: BmrContext): number {
  const { weightKg, onDate } = context;
  if (weightKg <= 0) {
    throw new RangeError('weightKg must be positive');
  }
  if (profile.bodyFatPercent !== undefined) {
    return katchMcArdle(weightKg, profile.bodyFatPercent);
  }
  return mifflinStJeor({
    weightKg,
    heightCm: profile.heightCm,
    age: ageOn(profile.birthDate, onDate),
    sex: profile.sex,
  });
}
