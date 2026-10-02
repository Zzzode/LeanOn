import type {
  CreateCustomFoodInput,
  EditCustomFoodInput,
  FoodItem,
} from './types.js';

interface ValidatedFields {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  defaultGrams?: number;
}

/**
 * Validate and normalise the editable content of a user-owned food. The typed
 * name is trimmed, omitted macros default to 0, and `defaultGrams` of `null`
 * clears a stored default. Throws on an empty name or invalid nutrition so a
 * persisted entry is always well-formed.
 */
function validateCustomFields(raw: {
  name: string;
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  defaultGrams?: number | null;
}): ValidatedFields {
  const name = raw.name.trim();
  const proteinG = raw.proteinG ?? 0;
  const carbsG = raw.carbsG ?? 0;
  const fatG = raw.fatG ?? 0;

  if (name.length === 0) {
    throw new RangeError('A custom food requires a name');
  }
  if (!Number.isFinite(raw.kcal) || raw.kcal <= 0) {
    throw new RangeError('Calories per 100 g must be greater than zero');
  }
  for (const value of [proteinG, carbsG, fatG]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('Macros must be finite and non-negative');
    }
  }
  const hasDefault =
    raw.defaultGrams !== undefined && raw.defaultGrams !== null;
  if (hasDefault && (!Number.isFinite(raw.defaultGrams) || raw.defaultGrams! <= 0)) {
    throw new RangeError('Default grams must be greater than zero');
  }

  const fields: ValidatedFields = { name, kcal: raw.kcal, proteinG, carbsG, fatG };
  if (hasDefault) fields.defaultGrams = raw.defaultGrams!;
  return fields;
}

/** Assemble a FoodItem, mirroring the name across locales. */
function assemble(
  id: string,
  source: FoodItem['source'],
  fields: ValidatedFields,
): FoodItem {
  return {
    id,
    name: { en: fields.name, 'zh-CN': fields.name },
    kcal: fields.kcal,
    macros: {
      proteinG: fields.proteinG,
      carbsG: fields.carbsG,
      fatG: fields.fatG,
    },
    ...(fields.defaultGrams === undefined
      ? {}
      : { defaultGrams: fields.defaultGrams }),
    source,
  };
}

/**
 * Build a user-created custom food (RFC 0013). The name is mirrored across
 * locales (no offline translation), omitted macros default to 0, and the source
 * is marked `custom`.
 */
export function createCustomFood(input: CreateCustomFoodInput): FoodItem {
  return assemble(input.id, 'custom', validateCustomFields(input));
}

/**
 * Return an updated copy of a user-owned food (RFC 0014), preserving its `id`
 * and `source`. Bundled catalogue foods are read-only and reject the edit.
 */
export function updateCustomFood(
  item: FoodItem,
  changes: EditCustomFoodInput,
): FoodItem {
  if (item.source === 'usda-fdc' || item.source === 'curated') {
    throw new RangeError('Bundled catalogue foods are read-only');
  }
  // Omitting defaultGrams keeps the stored value; null clears it; a number sets it.
  const withDefault: EditCustomFoodInput =
    changes.defaultGrams === undefined
      ? { ...changes, defaultGrams: item.defaultGrams ?? null }
      : changes;
  return assemble(item.id, item.source, validateCustomFields(withDefault));
}
