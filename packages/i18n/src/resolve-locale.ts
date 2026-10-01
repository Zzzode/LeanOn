export type Locale = 'en' | 'zh-CN';
export const defaultLocale: Locale = 'en';

const SUPPORTED: readonly string[] = ['en', 'zh-CN'];

/** Map a BCP-47-ish system tag to a supported locale, with fallback. */
export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) {
    return defaultLocale;
  }
  const tag = input.toLowerCase().replace(/_/g, '-');
  if (tag === 'zh' || tag.startsWith('zh')) {
    // Traditional variants map to Simplified for now (see RFC 0009).
    return 'zh-CN';
  }
  if (tag === 'en' || tag.startsWith('en')) {
    return 'en';
  }
  return defaultLocale;
}

/** Type guard for an exact supported locale tag. */
export function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && SUPPORTED.includes(value);
}
