import type { LeanOnBridgeClient } from '@zzzode/bridge';
import type { ReminderSettings } from '@zzzode/core';

function slot(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.enabled === 'boolean'
    && typeof candidate.hour === 'number' && Number.isInteger(candidate.hour) && candidate.hour >= 0 && candidate.hour < 24
    && typeof candidate.minute === 'number' && Number.isInteger(candidate.minute) && candidate.minute >= 0 && candidate.minute < 60;
}

/** Native settings are authoritative; missing and malformed slots cannot become guessed defaults. */
export function readReminderSettings(value: unknown): ReminderSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return slot(candidate.weight) && slot(candidate.meals) ? value as ReminderSettings : null;
}

export async function fetchReminderSettings(bridge: LeanOnBridgeClient): Promise<ReminderSettings> {
  const response = await bridge.invoke('notification.getSettings');
  const settings = readReminderSettings(response?.settings);
  if (settings === null) throw new Error('Invalid reminder settings');
  return settings;
}

/** A rejected permission request must not persist newly enabled reminders. */
export async function persistReminders(bridge: LeanOnBridgeClient, settings: ReminderSettings): Promise<ReminderSettings> {
  if (readReminderSettings(settings) === null) throw new Error('Invalid reminder settings');
  if (settings.weight.enabled || settings.meals.enabled) {
    const permission = await bridge.invoke('notification.requestPermission');
    if (permission.granted !== true) throw { code: 'not-authorized', message: 'Notifications were not authorized' };
  }
  const response = await bridge.invoke('notification.updateSettings', { settings });
  if (response.success !== true) throw new Error('Reminder settings were not saved');
  const saved = readReminderSettings(response.settings);
  if (saved === null) throw new Error('Invalid saved reminder settings');
  return saved;
}

export function permissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error.code === 'permission-denied' || error.code === 'not-authorized');
}
