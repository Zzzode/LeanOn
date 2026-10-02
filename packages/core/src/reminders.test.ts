import { expect, test } from '@rstest/core';
import {
  DEFAULT_REMINDER_SETTINGS,
  normalizeReminderSettings,
} from './reminders';

test('defaults are morning weight and evening meals', () => {
  expect(DEFAULT_REMINDER_SETTINGS.weight).toEqual({
    enabled: true,
    hour: 7,
    minute: 30,
  });
  expect(DEFAULT_REMINDER_SETTINGS.meals).toEqual({
    enabled: true,
    hour: 21,
    minute: 0,
  });
});

test('accepts a fully specified settings object', () => {
  const settings = normalizeReminderSettings({
    weight: { enabled: false, hour: 8, minute: 0 },
    meals: { enabled: true, hour: 22, minute: 30 },
  });
  expect(settings.weight.enabled).toBe(false);
  expect(settings.meals.hour).toBe(22);
  expect(settings.meals.minute).toBe(30);
});

test('fills missing fields with defaults', () => {
  const settings = normalizeReminderSettings({
    weight: { enabled: false },
  });
  expect(settings.weight).toEqual({ enabled: false, hour: 7, minute: 30 });
  expect(settings.meals).toEqual(DEFAULT_REMINDER_SETTINGS.meals);
});

test('returns an independent default copy for non-object input', () => {
  const settings = normalizeReminderSettings(undefined);
  expect(settings).toEqual(DEFAULT_REMINDER_SETTINGS);
  expect(settings.weight).not.toBe(DEFAULT_REMINDER_SETTINGS.weight);
});

test('rejects invalid hours', () => {
  for (const hour of [-1, 24, 1.5, '7']) {
    expect(() =>
      normalizeReminderSettings({ weight: { hour } }),
    ).toThrow(RangeError);
  }
});

test('rejects invalid minutes', () => {
  for (const minute of [-1, 60, 0.5, '0']) {
    expect(() =>
      normalizeReminderSettings({ meals: { minute } }),
    ).toThrow(RangeError);
  }
});

test('rejects non-boolean enabled', () => {
  expect(() =>
    normalizeReminderSettings({ weight: { enabled: 'yes' } }),
  ).toThrow(RangeError);
});
