import type { FoodItem, Macros, Portion } from './types.js';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Scale a food's per-100 g values to [grams]. Calories round to whole units and
 * macros to one decimal. A non-positive or non-finite amount is invalid.
 */
export function portion(item: FoodItem, grams: number): Portion {
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new Error('portion grams must be a positive number');
  }
  const factor = grams / 100;
  const macros: Macros = {
    proteinG: round1(item.macros.proteinG * factor),
    carbsG: round1(item.macros.carbsG * factor),
    fatG: round1(item.macros.fatG * factor),
  };
  return {
    kcal: Math.round(item.kcal * factor),
    macros,
  };
}
