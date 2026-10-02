/**
 * Reminder preferences and their validation (RFC 0020).
 *
 * This module is pure: it owns the settings shape, defaults and a normalizer.
 * It has no clock — computing the next trigger instant is host responsibility.
 */

export type ReminderKind = 'weight' | 'meals';

export interface ReminderSlot {
  enabled: boolean;
  /** Local hour, integer 0-23. */
  hour: number;
  /** Local minute, integer 0-59. */
  minute: number;
}

export interface ReminderSettings {
  /** Morning weigh-in reminder. */
  weight: ReminderSlot;
  /** Evening "log your meals" reminder. */
  meals: ReminderSlot;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  weight: { enabled: true, hour: 7, minute: 30 },
  meals: { enabled: true, hour: 21, minute: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asEnabled(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'boolean') {
    throw new RangeError('reminder enabled must be a boolean');
  }
  return raw;
}

function asHour(raw: unknown, fallback: number): number {
  if (raw === undefined) return fallback;
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > 23
  ) {
    throw new RangeError('reminder hour must be an integer 0-23');
  }
  return raw;
}

function asMinute(raw: unknown, fallback: number): number {
  if (raw === undefined) return fallback;
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > 59
  ) {
    throw new RangeError('reminder minute must be an integer 0-59');
  }
  return raw;
}

function normalizeSlot(raw: unknown, fallback: ReminderSlot): ReminderSlot {
  if (!isRecord(raw)) return { ...fallback };
  return {
    enabled: asEnabled(raw.enabled, fallback.enabled),
    hour: asHour(raw.hour, fallback.hour),
    minute: asMinute(raw.minute, fallback.minute),
  };
}

/**
 * Return a complete, validated ReminderSettings. Missing fields fall back to
 * defaults; invalid fields throw RangeError. A non-object input yields a fresh
 * copy of the defaults.
 */
export function normalizeReminderSettings(input: unknown): ReminderSettings {
  if (!isRecord(input)) {
    return {
      weight: { ...DEFAULT_REMINDER_SETTINGS.weight },
      meals: { ...DEFAULT_REMINDER_SETTINGS.meals },
    };
  }
  return {
    weight: normalizeSlot(input.weight, DEFAULT_REMINDER_SETTINGS.weight),
    meals: normalizeSlot(input.meals, DEFAULT_REMINDER_SETTINGS.meals),
  };
}
