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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A non-negative, finite macro in grams, defaulting to 0. */
function macro(value: unknown): number {
  const n = finiteNumber(value);
  return n !== undefined && n >= 0 ? n : 0;
}

/**
 * Convert an Open Food Facts product (RFC 0016) into a FoodItem. Energy uses
 * kcal/100 g and falls back to kJ/100 g; the name falls back from product_name
 * to generic_name to the barcode; and serving_quantity becomes the default
 * portion. Throws RangeError when no usable energy is available, since a food
 * with unknown calories cannot drive the energy budget.
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
      proteinG: macro(nutriments.proteins_100g),
      carbsG: macro(nutriments.carbohydrates_100g),
      fatG: macro(nutriments.fat_100g),
    },
    source: 'open-food-facts',
    barcode,
  };
  if (serving !== undefined && serving > 0) {
    item.defaultGrams = serving;
  }
  return item;
}
