import type { FoodDatabase, FoodItem, FoodLocale } from './types.js';

const DEFAULT_LIMIT = 8;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Staples offered before the user starts typing. */
const COMMON_IDS: readonly string[] = [
  'usda-white-rice',
  'usda-chicken-breast',
  'usda-egg',
  'curated-egg-fried-rice',
  'usda-broccoli',
  'usda-banana',
];

/**
 * Relevance rank for [item] against query [q]. Lower is better; -1 is no match.
 * The active locale is preferred (prefix then substring), the other locale is a
 * fallback so an English query can find a Chinese-named dish and vice versa.
 */
function rank(item: FoodItem, q: string, locale: FoodLocale): number {
  const primary = normalize(item.name[locale]);
  const fallbackLocale: FoodLocale = locale === 'en' ? 'zh-CN' : 'en';
  const fallback = normalize(item.name[fallbackLocale]);

  if (primary.startsWith(q)) return 0;
  if (primary.includes(q)) return 1;
  if (fallback.startsWith(q)) return 2;
  if (fallback.includes(q)) return 3;
  return -1;
}

/**
 * Pure, synchronous local search. An empty query returns common staples;
 * otherwise results are relevance-sorted and capped to [limit].
 */
export function searchFoods(
  database: FoodDatabase,
  query: string,
  locale: FoodLocale,
  limit: number = DEFAULT_LIMIT,
): FoodItem[] {
  const q = normalize(query);
  if (q === '') {
    return COMMON_IDS
      .map((id) => database.find((item) => item.id === id))
      .filter((item): item is FoodItem => item !== undefined)
      .slice(0, limit);
  }

  return database
    .map((item) => ({ item, rank: rank(item, q, locale) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) =>
      a.rank !== b.rank
        ? a.rank - b.rank
        : a.item.name.en.localeCompare(b.item.name.en),
    )
    .slice(0, limit)
    .map((entry) => entry.item);
}
