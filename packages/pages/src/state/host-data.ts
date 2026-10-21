import { isRecordsState, isIsoDate as coreIsoDate, isMacros, isMicros } from '@zzzode/core';
import { sampleHostData } from './sample.js';
import type { HostData } from './types.js';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const positive = (value: unknown): value is number => finite(value) && value > 0;
const optional = (value: unknown, check: (value: unknown) => boolean): boolean => value === undefined || check(value);
const array = (value: unknown, check: (value: unknown) => boolean): boolean => Array.isArray(value) && value.every(check);
export const isIsoDate = coreIsoDate;

function food(value: unknown): boolean {
  return record(value) && typeof value.id === 'string' && value.id.length > 0 && record(value.name)
    && typeof value.name.en === 'string' && typeof value.name['zh-CN'] === 'string'
    && nonnegative(value.kcal) && isMacros(value.macros) && isMicros(value.micros)
    && typeof value.source === 'string' && ['usda-fdc', 'curated', 'custom', 'open-food-facts'].includes(value.source)
    && optional(value.defaultGrams, positive) && optional(value.barcode, candidate => typeof candidate === 'string');
}

/** Native JSON, RPC responses and pushed snapshots are untrusted at runtime. */
export function isHostData(value: unknown): value is HostData {
  return isRecordsState(value) && record(value) && isIsoDate(value.today)
    && optional(value.todayHour, hour => finite(hour) && Number.isInteger(hour) && hour >= 0 && hour < 24)
    && nonnegative(value.streak) && Number.isInteger(value.streak)
    && array(value.customFoods, food)
    && array(value.favoriteFoodIds, item => typeof item === 'string')
    && array(value.recentFoodIds, item => typeof item === 'string');
}
export function readHostData(value: unknown): HostData | null {
  return isHostData(value) ? value : null;
}
export function readHostDataEnvelope(value: unknown): HostData | null {
  return record(value) ? readHostData(value.hostData) : null;
}
/** Only the explicitly route-less developer shell may start with demo records. */
export function bootstrapHostData(value: unknown, preview: boolean): HostData | null {
  return value === undefined && preview ? sampleHostData : readHostData(value);
}
