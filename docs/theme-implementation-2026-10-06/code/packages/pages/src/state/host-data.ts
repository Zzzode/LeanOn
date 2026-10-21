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
const source = (value: unknown): boolean => value === 'leanon' || value === 'health_connect';

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nutrients(value: unknown, keys: readonly string[]): boolean {
  return record(value) && keys.every(key => nonnegative(value[key]));
}
const macros = (value: unknown): boolean => nutrients(value, ['proteinG', 'carbsG', 'fatG']);
const micros = (value: unknown): boolean => nutrients(value, ['fiberG', 'sugarG', 'saturatedFatG', 'sodiumMg']);

function profile(value: unknown): boolean {
  return record(value) && (value.sex === 'female' || value.sex === 'male')
    && date(value.birthDate) && positive(value.heightCm)
    && typeof value.activityLevel === 'string' && ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'].includes(value.activityLevel)
    && optional(value.bodyFatPercent, candidate => positive(candidate) && candidate < 1);
}

function food(value: unknown): boolean {
  return record(value) && typeof value.id === 'string' && record(value.name)
    && typeof value.name.en === 'string' && typeof value.name['zh-CN'] === 'string'
    && nonnegative(value.kcal) && macros(value.macros) && micros(value.micros)
    && typeof value.source === 'string' && ['usda-fdc', 'curated', 'custom', 'open-food-facts'].includes(value.source)
    && optional(value.defaultGrams, positive) && optional(value.barcode, candidate => typeof candidate === 'string');
}

/** Native JSON, RPC responses and pushed snapshots are untrusted at runtime. */
export function isHostData(value: unknown): value is HostData {
  return record(value) && date(value.today) && profile(value.profile)
    && optional(value.todayHour, hour => finite(hour) && Number.isInteger(hour) && hour >= 0 && hour < 24)
    && positive(value.goalWeightKg) && nonnegative(value.weeklyLossKg)
    && nonnegative(value.streak) && Number.isInteger(value.streak)
    && array(value.weights, item => record(item) && date(item.date) && positive(item.weightKg) && optional(item.source, source))
    && array(value.intake, item => record(item) && date(item.date) && nonnegative(item.kcal) && macros(item.macros) && micros(item.micros))
    && array(value.exercises, item => record(item) && typeof item.id === 'string' && typeof item.typeId === 'string'
      && date(item.date) && positive(item.durationMin) && nonnegative(item.kcal) && optional(item.source, source))
    && array(value.water, item => record(item) && date(item.date) && nonnegative(item.amountMl))
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
