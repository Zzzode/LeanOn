import { expect, test } from '@rstest/core';
import { createLeanOnBridgeClient, createMemoryBridge } from '@zzzode/bridge';
import { DEFAULT_REMINDER_SETTINGS } from '@zzzode/core';
import { fetchReminderSettings, permissionDenied, persistReminders, readReminderSettings } from './reminders.js';

test('notification denial leaves newly enabled reminders unpersisted', async () => {
  const memory = createMemoryBridge();
  let writes = 0;
  memory.handle('notification.requestPermission', () => ({ granted: false }));
  memory.handle('notification.updateSettings', () => { writes += 1; return { success: true, settings: DEFAULT_REMINDER_SETTINGS }; });
  const settings = { ...DEFAULT_REMINDER_SETTINGS, weight: { ...DEFAULT_REMINDER_SETTINGS.weight, enabled: true } };
  await expect(persistReminders(createLeanOnBridgeClient(memory.transport), settings)).rejects.toMatchObject({ code: 'not-authorized' });
  expect(writes).toBe(0);
  expect(permissionDenied({ code: 'permission-denied', message: 'Denied' })).toBe(true);
});

test('turning all reminders off saves without requiring notification permission', async () => {
  const memory = createMemoryBridge();
  const disabled = { weight: { ...DEFAULT_REMINDER_SETTINGS.weight, enabled: false }, meals: { ...DEFAULT_REMINDER_SETTINGS.meals, enabled: false } };
  memory.handle('notification.updateSettings', () => ({ success: true, settings: disabled }));
  expect(await persistReminders(createLeanOnBridgeClient(memory.transport), disabled)).toBe(disabled);
});

test('allowed notification permission precedes the persisted settings response', async () => {
  const memory = createMemoryBridge();
  const order: string[] = [];
  const settings = { ...DEFAULT_REMINDER_SETTINGS, meals: { ...DEFAULT_REMINDER_SETTINGS.meals, enabled: true } };
  memory.handle('notification.requestPermission', () => { order.push('permission'); return { granted: true }; });
  memory.handle('notification.updateSettings', () => { order.push('save'); return { success: true, settings }; });
  expect(await persistReminders(createLeanOnBridgeClient(memory.transport), settings)).toBe(settings);
  expect(order).toEqual(['permission', 'save']);
});

test('a failed read exposes no defaults, and retry returns the actual native settings', async () => {
  const memory = createMemoryBridge();
  let reads = 0;
  let writes = 0;
  const settings = {
    weight: { enabled: false, hour: 9, minute: 15 },
    meals: { enabled: true, hour: 22, minute: 45 },
  };
  memory.handle('notification.getSettings', () => {
    reads += 1;
    if (reads === 1) throw new Error('Corrupt local settings');
    return { settings };
  });
  memory.handle('notification.updateSettings', () => { writes += 1; return { success: true, settings }; });
  const bridge = createLeanOnBridgeClient(memory.transport);
  await expect(fetchReminderSettings(bridge)).rejects.toThrow('Corrupt local settings');
  expect(await fetchReminderSettings(bridge)).toBe(settings);
  expect(reads).toBe(2);
  expect(writes).toBe(0);
});

test('native first-install defaults are accepted only when returned as valid settings', async () => {
  const memory = createMemoryBridge();
  memory.handle('notification.getSettings', () => ({ settings: DEFAULT_REMINDER_SETTINGS }));
  const bridge = createLeanOnBridgeClient(memory.transport);
  expect(await fetchReminderSettings(bridge)).toBe(DEFAULT_REMINDER_SETTINGS);
  memory.handle('notification.getSettings', () => ({ settings: {} }));
  await expect(fetchReminderSettings(bridge)).rejects.toThrow('Invalid reminder settings');
});

test('reminder DTO validation rejects missing slots, coerced booleans and invalid clock values', () => {
  const base = { weight: { enabled: false, hour: 0, minute: 0 }, meals: { enabled: true, hour: 23, minute: 59 } };
  expect(readReminderSettings(base)).toBe(base);
  for (const value of [undefined, null, {}, [], { ...base, weight: null },
    { ...base, weight: { ...base.weight, enabled: 1 } },
    ...[-1, 24, 12.5, '7'].map(hour => ({ ...base, weight: { ...base.weight, hour } })),
    ...[-1, 60, 30.5, '0'].map(minute => ({ ...base, meals: { ...base.meals, minute } })),
  ]) expect(readReminderSettings(value)).toBeNull();
});
