import type { ExerciseSample, IntakeSample, Macros, Micros, Profile } from '../types';
import type {
  DeletedRecord, IntakeEntry, LegacyIntakeRecord, OperationReceipt, RecordMutation, RecordsState, SafetyFlags, WaterRecord, WeightRecord,
} from './types';

const MACROS = ['proteinG', 'carbsG', 'fatG'] as const;
const MICROS = ['fiberG', 'sugarG', 'saturatedFatG', 'sodiumMg'] as const;
const ACTIVITIES = ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'];
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonnegative(value: unknown): value is number { return finite(value) && value >= 0; }
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0);
}

export function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && isIsoDate(value.slice(0, 10)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

export function isMacros(value: unknown): value is Macros {
  return isObject(value) && MACROS.every((key) => nonnegative(value[key]));
}
export function isMicros(value: unknown): value is Micros {
  return isObject(value) && MICROS.every((key) => nonnegative(value[key]));
}

export function isProfile(value: unknown): value is Profile {
  return isObject(value) && (value.sex === 'female' || value.sex === 'male') &&
    isIsoDate(value.birthDate) && finite(value.heightCm) && value.heightCm >= 80 && value.heightCm <= 250 &&
    typeof value.activityLevel === 'string' && ACTIVITIES.includes(value.activityLevel) &&
    (value.bodyFatPercent === undefined ||
      (finite(value.bodyFatPercent) && value.bodyFatPercent > 0 && value.bodyFatPercent < 1));
}

export function isSafetyFlags(value: unknown): value is SafetyFlags {
  return isObject(value) && ['pregnant', 'breastfeeding', 'eatingDisorderRisk'].every((key) =>
    value[key] === null || typeof value[key] === 'boolean');
}

function source(value: unknown): boolean {
  return value === undefined || value === 'leanon' || value === 'healthkit' || value === 'health_connect';
}
export function isOwnRecord(value: unknown): boolean {
  return isObject(value) && (value.source === undefined || value.source === 'leanon');
}

export function isWeightRecord(value: unknown): value is WeightRecord {
  return isObject(value) && id(value.id) && isIsoDate(value.date) && finite(value.weightKg) &&
    value.weightKg >= 20 && value.weightKg <= 300 && source(value.source);
}
export function isWaterRecord(value: unknown): value is WaterRecord {
  return isObject(value) && id(value.id) && isIsoDate(value.date) && nonnegative(value.amountMl);
}
export function isExerciseRecord(value: unknown): value is ExerciseSample {
  return isObject(value) && id(value.id) && isIsoDate(value.date) && id(value.typeId) &&
    finite(value.durationMin) && value.durationMin >= 1 && value.durationMin <= 1440 &&
    nonnegative(value.kcal) && source(value.source);
}
export function isIntakeEntry(value: unknown): value is IntakeEntry {
  return isObject(value) && id(value.id) && isIsoDate(value.date) &&
    typeof value.meal === 'string' && MEALS.includes(value.meal) &&
    typeof value.name === 'string' && value.name.trim().length > 0 && finite(value.grams) && value.grams > 0 &&
    nonnegative(value.kcal) && isMacros(value.macros) && isMicros(value.micros) &&
    (value.foodId === undefined || id(value.foodId));
}
export function isIntakeSample(value: unknown): value is IntakeSample {
  return isObject(value) && isIsoDate(value.date) && nonnegative(value.kcal) &&
    isMacros(value.macros) && isMicros(value.micros);
}

export function isLegacyIntakeRecord(value: unknown): value is LegacyIntakeRecord {
  return isIntakeSample(value) && isObject(value) && id(value.id);
}

export function isRecordMutation(value: unknown): value is RecordMutation {
  if (!isObject(value)) return false;
  switch (value.type) {
    case 'save-profile':
      return isProfile(value.profile) &&
        (value.goalWeightKg === null || (finite(value.goalWeightKg) && value.goalWeightKg >= 20 && value.goalWeightKg <= 300)) &&
        (value.weeklyLossKg === null || nonnegative(value.weeklyLossKg)) &&
        (value.guidanceMode === 'weight-loss' || value.guidanceMode === 'tracking-only') &&
        isSafetyFlags(value.safetyFlags) &&
        (value.initialWeightKg === undefined || (finite(value.initialWeightKg) && value.initialWeightKg >= 20 && value.initialWeightKg <= 300));
    case 'set-weight':
      return (value.id === undefined || id(value.id)) && isIsoDate(value.date) && finite(value.weightKg) && value.weightKg >= 20 && value.weightKg <= 300;
    case 'set-water': return (value.id === undefined || id(value.id)) && isIsoDate(value.date) && nonnegative(value.amountMl);
    case 'save-exercise': return isExerciseRecord(value.exercise);
    case 'save-intake': return isIntakeEntry(value.entry);
    case 'save-legacy-intake': return isLegacyIntakeRecord(value.sample);
    case 'delete-record':
      return ['weight', 'water', 'exercise', 'intake', 'legacy-intake'].includes(String(value.kind)) && id(value.id);
    case 'restore-record': return id(value.token);
    default: return false;
  }
}

export function isDeletedRecord(value: unknown): value is DeletedRecord {
  if (!isObject(value) || !id(value.token) || !Number.isSafeInteger(value.deletedRevision) ||
    typeof value.deletedRevision !== 'number' || value.deletedRevision < 1 ||
    !isIsoDateTime(value.deletedAt)) return false;
  switch (value.kind) {
    case 'weight': return isWeightRecord(value.record) && isOwnRecord(value.record);
    case 'water': return isWaterRecord(value.record);
    case 'exercise': return isExerciseRecord(value.record) && isOwnRecord(value.record);
    case 'intake': return isIntakeEntry(value.record);
    case 'legacy-intake': return isLegacyIntakeRecord(value.record);
    default: return false;
  }
}

function unique<T>(rows: T[], identity: (row: T) => string): boolean {
  return new Set(rows.map(identity)).size === rows.length;
}

/** Structural guard; unsafe current-weight changes are handled by eligibility, not data loss. */
export function isRecordsState(value: unknown): value is RecordsState {
  if (!isObject(value) || value.schemaVersion !== 2 || !Number.isSafeInteger(value.revision) ||
    typeof value.revision !== 'number' || value.revision < 0 || typeof value.setupCompleted !== 'boolean' ||
    !(value.profile === null || isProfile(value.profile)) || (value.setupCompleted && value.profile === null) ||
    !(value.goalWeightKg === null || (finite(value.goalWeightKg) && value.goalWeightKg >= 20 && value.goalWeightKg <= 300)) ||
    !(value.weeklyLossKg === null || nonnegative(value.weeklyLossKg)) ||
    !(value.guidanceMode === 'weight-loss' || value.guidanceMode === 'tracking-only') || !isSafetyFlags(value.safetyFlags)) return false;
  if (value.guidanceMode === 'weight-loss' &&
    (!value.setupCompleted || value.profile === null || value.goalWeightKg === null ||
      !finite(value.weeklyLossKg) || value.weeklyLossKg < 0.5 || value.weeklyLossKg > 1 ||
      Object.values(value.safetyFlags).some((flag) => flag !== false))) return false;
  if (!Array.isArray(value.weights) || !value.weights.every(isWeightRecord) ||
    !Array.isArray(value.water) || !value.water.every(isWaterRecord) ||
    !Array.isArray(value.exercises) || !value.exercises.every(isExerciseRecord) ||
    !Array.isArray(value.legacyIntake) || !value.legacyIntake.every(isLegacyIntakeRecord) ||
    !Array.isArray(value.intakeEntries) || !value.intakeEntries.every(isIntakeEntry) ||
    !Array.isArray(value.intake) || !value.intake.every(isIntakeSample) ||
    !Array.isArray(value.deletedRecords) || !value.deletedRecords.every(isDeletedRecord) ||
    !Array.isArray(value.processedOperations)) return false;
  const revision = value.revision;
  if (!value.processedOperations.every((receipt: unknown) => isObject(receipt) && id(receipt.operationId) &&
    isRecordMutation(receipt.mutation) && typeof receipt.appliedRevision === 'number' &&
    Number.isSafeInteger(receipt.appliedRevision) && receipt.appliedRevision > 0 && receipt.appliedRevision <= revision &&
    (receipt.mutation.type === 'delete-record'
      ? receipt.undoToken === `undo-${receipt.operationId}`
      : receipt.undoToken === undefined))) return false;
  const receipts = value.processedOperations as OperationReceipt[];
  const deletes = new Map(receipts.filter((receipt) => receipt.mutation.type === 'delete-record')
    .map((receipt) => [receipt.undoToken, receipt]));
  if (!value.deletedRecords.every((row) => {
    const receipt = deletes.get(row.token);
    return receipt?.mutation.type === 'delete-record' && receipt.appliedRevision === row.deletedRevision &&
      receipt.mutation.kind === row.kind && receipt.mutation.id === row.record.id;
  })) return false;
  return unique(value.weights, (row) => row.date) && unique(value.weights, (row) => row.id) &&
    unique(value.water, (row) => row.date) && unique(value.water, (row) => row.id) &&
    unique(value.legacyIntake, (row) => row.id) &&
    unique(value.exercises, (row) => row.id) && unique(value.intakeEntries, (row) => row.id) &&
    unique(value.deletedRecords, (row) => row.token) && value.deletedRecords.every((row) => row.deletedRevision <= revision) &&
    unique(receipts, (row) => row.operationId);
}

export interface GuidanceEligibility {
  eligible: boolean;
  reason: 'eligible' | 'missing-profile' | 'age' | 'unscreened-or-risk' | 'goal' | 'current-weight';
}

export function weightLossEligibility(input: {
  profile: Profile | null; safetyFlags: SafetyFlags; today: string;
  goalWeightKg: number | null; currentWeightKg: number | null;
}): GuidanceEligibility {
  const { profile, safetyFlags, today, goalWeightKg, currentWeightKg } = input;
  if (!isProfile(profile) || !isIsoDate(today) || profile.birthDate > today) return { eligible: false, reason: 'missing-profile' };
  let age = Number(today.slice(0, 4)) - Number(profile.birthDate.slice(0, 4));
  if (today.slice(5) < profile.birthDate.slice(5)) age -= 1;
  if (age < 20) return { eligible: false, reason: 'age' };
  if (!isSafetyFlags(safetyFlags) || Object.values(safetyFlags).some((flag) => flag !== false)) {
    return { eligible: false, reason: 'unscreened-or-risk' };
  }
  const heightM = profile.heightCm / 100;
  if (goalWeightKg === null || !finite(goalWeightKg) || goalWeightKg / (heightM * heightM) < 18.5) {
    return { eligible: false, reason: 'goal' };
  }
  if (currentWeightKg === null || !finite(currentWeightKg) || currentWeightKg < 20 || currentWeightKg > 300 ||
    currentWeightKg / (heightM * heightM) < 18.5) {
    return { eligible: false, reason: 'current-weight' };
  }
  return { eligible: true, reason: 'eligible' };
}
