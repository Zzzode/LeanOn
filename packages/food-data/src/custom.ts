import type { CreateCustomFoodInput, FoodItem } from './types.js';

/**
 * Build a user-created custom food (RFC 0013). The typed name is mirrored across
 * locales (there is no offline translation), omitted macros default to 0, and the
 * source is marked `custom`. Throws on an empty name or invalid nutrition so the
 * persisted entry is always well-formed.
 */
export function createCustomFood(input: CreateCustomFoodInput): FoodItem {
  const name = input.name.trim();
  const proteinG = input.proteinG ?? 0;
  const carbsG = input.carbsG ?? 0;
  const fatG = input.fatG ?? 0;

  if (name.length === 0) {
    throw new RangeError('A custom food requires a name');
  }
  if (!Number.isFinite(input.kcal) || input.kcal <= 0) {
    throw new RangeError('Calories per 100 g must be greater than zero');
  }
  for (const value of [proteinG, carbsG, fatG]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('Macros must be finite and non-negative');
    }
  }
  if (
    input.defaultGrams !== undefined &&
    (!Number.isFinite(input.defaultGrams) || input.defaultGrams <= 0)
  ) {
    throw new RangeError('Default grams must be greater than zero');
  }

  return {
    id: input.id,
    name: { en: name, 'zh-CN': name },
    kcal: input.kcal,
    macros: { proteinG, carbsG, fatG },
    ...(input.defaultGrams === undefined
      ? {}
      : { defaultGrams: input.defaultGrams }),
    source: 'custom',
  };
}
