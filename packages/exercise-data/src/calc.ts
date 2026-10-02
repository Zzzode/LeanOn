import type { ExerciseType } from './types';

/**
 * Estimate gross kilocalories burned for a session: MET x body mass (kg) x
 * duration (hours). Rounded to whole kilocalories. Throws RangeError when the
 * duration, body weight, or MET is not a finite positive number.
 */
export function calculateExerciseKcal(
  type: ExerciseType,
  durationMin: number,
  bodyWeightKg: number,
): number {
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    throw new RangeError('durationMin must be a finite positive number');
  }
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) {
    throw new RangeError('bodyWeightKg must be a finite positive number');
  }
  if (!Number.isFinite(type.met) || type.met <= 0) {
    throw new RangeError('Exercise type must have a finite positive MET');
  }
  return Math.round(type.met * bodyWeightKg * (durationMin / 60));
}
