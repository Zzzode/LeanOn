import type { FoodItem } from './types.js';

/** Subset of the Open Food Facts nutriments object that the parser reads. */
export interface OffNutriments {
  /** Energy in kilocalories per 100 g (preferred). */
  'energy-kcal_100g'?: number;
  /** Energy in kilojoules per 100 g (fallback). */
  energy_100g?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  'saturated-fat_100g'?: number;
  /** Sodium in grams per 100 g (OFF reports sodium in grams). */
  sodium_100g?: number;
  /** Salt in grams per 100 g, used to derive sodium when absent. */
  salt_100g?: number;
}

/** Subset of the Open Food Facts v2 product object that the parser reads. */
export interface OffProduct {
  product_name?: string;
  generic_name?: string;
  nutriments?: OffNutriments;
  serving_quantity?: number;
  serving_size?: string;
}

const KJ_PER_KCAL = 4.184;
/** Sodium makes up roughly this fraction of table salt by mass. */
const SODIUM_FRACTION_OF_SALT = 1 / 2.5;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A finite, non-negative number, or undefined when missing/invalid. */
function nonNegative(value: unknown): number | undefined {
  const n = finiteNumber(value);
  return n !== undefined && n >= 0 ? n : undefined;
}

/** A non-negative, finite value in grams, defaulting to 0. */
function grams(value: unknown): number {
  return nonNegative(value) ?? 0;
}

/** Sodium in mg per 100 g: prefer OFF sodium (g), else derive from salt. */
function sodiumMilligrams(nutriments: OffNutriments): number {
  const sodiumG = nonNegative(nutriments.sodium_100g);
  if (sodiumG !== undefined) return Math.round(sodiumG * 1000);
  const saltG = nonNegative(nutriments.salt_100g);
  if (saltG !== undefined) {
    return Math.round(saltG * SODIUM_FRACTION_OF_SALT * 1000);
  }
  return 0;
}

/**
 * Convert an Open Food Facts product (RFC 0016) into a FoodItem. Energy uses
 * kcal/100 g and falls back to kJ/100 g; the name falls back from product_name
 * to generic_name to the barcode; micronutrients (RFC 0024) are read in the
 * same pass; and serving_quantity becomes the default portion. Throws
 * RangeError when no usable energy is available, since a food with unknown
 * calories cannot drive the energy budget.
 */
export function createFoodFromBarcode(
  barcode: string,
  product: OffProduct,
): FoodItem {
  const nutriments = product.nutriments ?? {};
  const kcalDirect = finiteNumber(nutriments['energy-kcal_100g']);
  const kj = finiteNumber(nutriments.energy_100g);

  let kcal: number | undefined;
  if (kcalDirect !== undefined && kcalDirect > 0) {
    kcal = kcalDirect;
  } else if (kj !== undefined && kj > 0) {
    kcal = kj / KJ_PER_KCAL;
  }
  if (kcal === undefined || kcal <= 0) {
    throw new RangeError('Open Food Facts product has no usable energy value');
  }

  const name =
    product.product_name?.trim() ||
    product.generic_name?.trim() ||
    barcode;
  const serving = finiteNumber(product.serving_quantity);

  const item: FoodItem = {
    id: `off-${barcode}`,
    name: { en: name, 'zh-CN': name },
    kcal,
    macros: {
      proteinG: grams(nutriments.proteins_100g),
      carbsG: grams(nutriments.carbohydrates_100g),
      fatG: grams(nutriments.fat_100g),
    },
    micros: {
      fiberG: grams(nutriments.fiber_100g),
      sugarG: grams(nutriments.sugars_100g),
      saturatedFatG: grams(nutriments['saturated-fat_100g']),
      sodiumMg: sodiumMilligrams(nutriments),
    },
    source: 'open-food-facts',
    barcode,
  };
  if (serving !== undefined && serving > 0) {
    item.defaultGrams = serving;
  }
  return item;
}
