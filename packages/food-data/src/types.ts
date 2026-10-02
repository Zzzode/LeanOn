/** Macronutrient amounts in grams; structurally compatible with core's Macros. */
export interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Diet-quality micronutrients; structurally compatible with core's Micros. */
export interface Micros {
  fiberG: number;
  sugarG: number;
  saturatedFatG: number;
  sodiumMg: number;
}

/** A food's energy, macros and micros for a chosen amount. */
export interface Portion {
  kcal: number;
  macros: Macros;
  micros: Micros;
}

/**
 * A single catalogue entry. Nutrient values are expressed per 100 g. Entries
 * derived from USDA FoodData Central (CC0) are marked `usda-fdc`; local dishes
 * not covered there are marked `curated` (estimated).
 */
export interface FoodItem {
  id: string;
  /** Bilingual display name. */
  name: {
    en: string;
    'zh-CN': string;
  };
  /** Energy per 100 g (kcal). */
  kcal: number;
  /** Macros per 100 g. */
  macros: Macros;
  /** Micronutrients per 100 g (RFC 0024). */
  micros: Micros;
  /** A sensible default serving in grams. */
  defaultGrams?: number;
  source: 'usda-fdc' | 'curated' | 'custom' | 'open-food-facts';
  /** Package barcode for a food imported from Open Food Facts (RFC 0016). */
  barcode?: string;
}

/** Input for creating a user-owned custom food (values per 100 g). */
export interface CreateCustomFoodInput {
  id: string;
  name: string;
  /** Energy per 100 g (kcal), must be finite and greater than zero. */
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number;
  saturatedFatG?: number;
  sodiumMg?: number;
  defaultGrams?: number;
}

/**
 * Full desired state when editing a user-owned food (RFC 0014). `id` is supplied
 * separately. A positive `defaultGrams` sets it; `null` explicitly clears it.
 */
export interface EditCustomFoodInput {
  name: string;
  /** Energy per 100 g (kcal), must be finite and greater than zero. */
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number;
  saturatedFatG?: number;
  sodiumMg?: number;
  defaultGrams?: number | null;
}

/** Read-only catalogue. */
export type FoodDatabase = readonly FoodItem[];

/** Locales used for name matching; English is the canonical fallback. */
export type FoodLocale = 'en' | 'zh-CN';
