import type { MessageKey } from './locales/en.js';
import type { Translator } from './translate.js';

export interface DateParts {
  /** Day of week, 0 = Sunday. */
  weekday: number;
  /** Month, 0 = January. */
  month: number;
  day: number;
}

function dateKey(prefix: 'date.weekday' | 'date.month', index: number): MessageKey {
  return `${prefix}.${index}` as MessageKey;
}

/** Format date parts using the localized weekday/month names and order. */
export function formatDate(t: Translator, parts: DateParts): string {
  const weekday = t(dateKey('date.weekday', parts.weekday));
  const month = t(dateKey('date.month', parts.month));
  return t('date.format', { weekday, month, day: parts.day });
}
