/**
 * Granular, opt-in sharing for the two-person family group. All data is private
 * by default; there is no shared budget or blame-oriented leaderboard.
 */
export type ShareCategory =
  | 'goal'
  | 'progress_band'
  | 'checkin_streak'
  | 'meals'
  | 'photos'
  | 'menstrual'
  | 'exact_weight';

/** Categories that are safe and useful to suggest sharing. */
export const SUGGESTED_SHARED: readonly ShareCategory[] = [
  'goal',
  'progress_band',
  'checkin_streak',
];

/** Sensitive categories that remain private unless explicitly enabled. */
export const PRIVATE_BY_DEFAULT: readonly ShareCategory[] = [
  'meals',
  'photos',
  'menstrual',
  'exact_weight',
];

/** A person's sharing configuration. */
export interface ShareSettings {
  /** Whether sharing is mutual or one-directional. */
  mutual: boolean;
  /** Categories currently shared; empty means everything is private. */
  categories: ShareCategory[];
}

/** Default settings: mutual channel, but no categories shared. */
export function defaultShareSettings(): ShareSettings {
  return { mutual: true, categories: [] };
}

/** True when a category is shared under these settings. */
export function isShared(settings: ShareSettings, category: ShareCategory): boolean {
  return settings.categories.includes(category);
}
