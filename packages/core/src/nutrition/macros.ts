import type { Macros } from '../types';

/** Protein target per kg of goal/reference weight on a standard deficit. */
export const PROTEIN_G_PER_KG = 1.6;
/** Protein target per kg on an aggressive deficit. */
export const PROTEIN_AGGRESSIVE_G_PER_KG = 2.0;
/** Minimum dietary fat per kg of current body weight (hormonal health floor). */
export const FAT_MIN_G_PER_KG = 0.5;
/** Minimum fraction of calories from fat. */
export const FAT_MIN_CALORIE_FRACTION = 0.2;

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARBS = 4;
const KCAL_PER_G_FAT = 9;

export interface MacroTargetInput {
  targetKcal: number;
  /** Goal/reference weight used to anchor protein. */
  goalWeightKg: number;
  /** Current weight used for the fat floor. */
  currentWeightKg: number;
  /** Raise protein toward 2.0 g/kg on an aggressive deficit. */
  aggressive?: boolean;
}

export interface MacroTargets extends Macros {
  proteinKcal: number;
  carbsKcal: number;
  fatKcal: number;
}

/**
 * Protein-anchored macro targets. Protein is set against goal weight, fat is
 * floored for hormonal health, and carbs fill the remaining calories.
 *
 * Throws when the calorie target is too low to accommodate protein plus the fat
 * floor — that target is unsafe and the caller must raise it.
 */
export function macroTargets(input: MacroTargetInput): MacroTargets {
  const { targetKcal, goalWeightKg, currentWeightKg, aggressive = false } = input;
  if (targetKcal <= 0 || goalWeightKg <= 0 || currentWeightKg <= 0) {
    throw new RangeError('macroTargets() requires positive inputs');
  }

  const proteinPerKg = aggressive
    ? PROTEIN_AGGRESSIVE_G_PER_KG
    : PROTEIN_G_PER_KG;
  const proteinG = goalWeightKg * proteinPerKg;
  const fatG = Math.max(
    FAT_MIN_G_PER_KG * currentWeightKg,
    (FAT_MIN_CALORIE_FRACTION * targetKcal) / KCAL_PER_G_FAT,
  );

  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const fatKcal = fatG * KCAL_PER_G_FAT;
  const remainingKcal = targetKcal - proteinKcal - fatKcal;
  if (remainingKcal < 0) {
    throw new RangeError(
      'targetKcal is too low to meet the protein and fat floors; raise the calorie target',
    );
  }
  const carbsG = remainingKcal / KCAL_PER_G_CARBS;

  return {
    proteinG,
    carbsG,
    fatG,
    proteinKcal,
    carbsKcal: carbsG * KCAL_PER_G_CARBS,
    fatKcal,
  };
}
