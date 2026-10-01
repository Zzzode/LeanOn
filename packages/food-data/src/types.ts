/** Macronutrient amounts in grams; structurally compatible with core's Macros. */
export interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** A food's energy and macros for a chosen amount. */
export interface Portion {
  kcal: number;
  macros: Macros;
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
  /** A sensible default serving in grams. */
  defaultGrams?: number;
  source: 'usda-fdc' | 'curated';
}

/** Read-only catalogue. */
export type FoodDatabase = readonly FoodItem[];

/** Locales used for name matching; English is the canonical fallback. */
export type FoodLocale = 'en' | 'zh-CN';
