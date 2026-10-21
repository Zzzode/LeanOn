import { isIsoDate, isIsoDateTime } from '@zzzode/core';
import { cloneJson, exactKeys, finiteRange, isJsonValue, isPlainObject, safeId, safeRevision, uniqueIds, utf8ByteLength, withoutCredentials } from './validation.js';
import type { DataJsonValue } from './validation.js';

export interface DietaryPreferencesDto {
  pattern: 'none' | 'vegetarian' | 'vegan';
  excludedFoodIds: string[];
  notes: string;
  /** Preserve future JSON preferences; these are not an allergy safety system. */
  [attribute: string]: DataJsonValue;
}
export const MEASUREMENT_FIELDS = ['waistCm', 'hipCm', 'chestCm', 'armCm', 'thighCm', 'neckCm'] as const;
export type MeasurementField = typeof MEASUREMENT_FIELDS[number];
export interface MeasurementDto {
  id: string; date: string; waistCm?: number; hipCm?: number; chestCm?: number;
  armCm?: number; thighCm?: number; neckCm?: number; note?: string;
}
export interface ProgressPhotoDto {
  id: string; date: string; view: 'front' | 'side' | 'back' | 'other'; note?: string;
  createdAt: string; mime: 'image/jpeg'; width: number; height: number;
}
export type PersonalMutationDto =
  | { type: 'set-dietary-preferences'; preferences: DietaryPreferencesDto }
  | { type: 'save-measurement'; measurement: MeasurementDto }
  | { type: 'delete-measurement'; id: string }
  | { type: 'add-photo'; photo: ProgressPhotoDto }
  | { type: 'update-photo'; photo: ProgressPhotoDto }
  | { type: 'delete-photo'; id: string };
export interface PersonalOperationReceiptDto {
  operationId: string; mutation: PersonalMutationDto; appliedRevision: number;
}
export interface PersonalStateDto {
  version: 1; revision: number; dietaryPreferences: DietaryPreferencesDto;
  measurements: MeasurementDto[]; photos: ProgressPhotoDto[]; processedOperations: PersonalOperationReceiptDto[];
}
export interface PersonalMutationRequestDto {
  operationId: string; expectedRevision: number; mutation: PersonalMutationDto;
}
export interface PersonalMutationResultDto {
  personal: PersonalStateDto; appliedRevision: number; replayed: boolean;
}
export class PersonalValidationError extends Error {}
export class PersonalConflictError extends Error {}

export function createEmptyPersonalState(): PersonalStateDto {
  return { version: 1, revision: 0, dietaryPreferences: { pattern: 'none', excludedFoodIds: [], notes: '' }, measurements: [], photos: [], processedOperations: [] };
}
export function isDietaryPreferences(value: unknown): value is DietaryPreferencesDto {
  return isPlainObject(value) && ['none','vegetarian','vegan'].includes(String(value.pattern)) &&
    Array.isArray(value.excludedFoodIds) && value.excludedFoodIds.length <= 1000 && value.excludedFoodIds.every(safeId) &&
    new Set(value.excludedFoodIds).size === value.excludedFoodIds.length && typeof value.notes === 'string' && value.notes.length <= 2000 &&
    isJsonValue(value) && utf8ByteLength(JSON.stringify(value)) <= 32768 && withoutCredentials(value);
}
export function isMeasurement(value: unknown): value is MeasurementDto {
  return isPlainObject(value) && exactKeys(value, ['id','date',...MEASUREMENT_FIELDS,'note']) && safeId(value.id) && isIsoDate(value.date) &&
    (value.note === undefined || (typeof value.note === 'string' && value.note.length <= 2000)) &&
    MEASUREMENT_FIELDS.some(key => value[key] !== undefined) && MEASUREMENT_FIELDS.every(key => value[key] === undefined || finiteRange(value[key],20,300));
}
export function isProgressPhoto(value: unknown): value is ProgressPhotoDto {
  return isPlainObject(value) && exactKeys(value,['id','date','view','note','createdAt','mime','width','height']) && safeId(value.id) && isIsoDate(value.date) &&
    ['front','side','back','other'].includes(String(value.view)) && isIsoDateTime(value.createdAt) &&
    value.mime === 'image/jpeg' &&
    finiteRange(value.width,1,20000) && Number.isInteger(value.width) && finiteRange(value.height,1,20000) && Number.isInteger(value.height) &&
    (value.note === undefined || (typeof value.note === 'string' && value.note.length <= 2000));
}
export function isPersonalMutation(value: unknown): value is PersonalMutationDto {
  if (!isPlainObject(value)) return false;
  switch (value.type) {
    case 'set-dietary-preferences': return exactKeys(value,['type','preferences']) && isDietaryPreferences(value.preferences);
    case 'save-measurement': return exactKeys(value,['type','measurement']) && isMeasurement(value.measurement);
    case 'delete-measurement': case 'delete-photo': return exactKeys(value,['type','id']) && safeId(value.id);
    case 'add-photo': case 'update-photo': return exactKeys(value,['type','photo']) && isProgressPhoto(value.photo);
    default: return false;
  }
}
export function isPersonalState(value: unknown): value is PersonalStateDto {
  if (!isPlainObject(value) || !exactKeys(value,['version','revision','dietaryPreferences','measurements','photos','processedOperations']) ||
      value.version !== 1 || !safeRevision(value.revision) || !isDietaryPreferences(value.dietaryPreferences) ||
      !Array.isArray(value.measurements) || value.measurements.length > 100000 || !value.measurements.every(isMeasurement) || !uniqueIds(value.measurements) ||
      !Array.isArray(value.photos) || value.photos.length > 1000 || !value.photos.every(isProgressPhoto) || !uniqueIds(value.photos) ||
      !Array.isArray(value.processedOperations) || value.processedOperations.length > 100000) return false;
  const revision = value.revision;
  return value.processedOperations.every((receipt: unknown) => isPlainObject(receipt) && exactKeys(receipt,['operationId','mutation','appliedRevision']) &&
    safeId(receipt.operationId) && isPersonalMutation(receipt.mutation) && safeRevision(receipt.appliedRevision) && receipt.appliedRevision > 0 && receipt.appliedRevision <= revision) &&
    new Set(value.processedOperations.map(receipt => (receipt as PersonalOperationReceiptDto).operationId)).size === value.processedOperations.length;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function applyPersonalMutation(state: PersonalStateDto, request: PersonalMutationRequestDto): PersonalMutationResultDto {
  if (!isPersonalState(state) || !isPlainObject(request) || !exactKeys(request,['operationId','expectedRevision','mutation']) ||
      !safeId(request.operationId) || !safeRevision(request.expectedRevision) || !isPersonalMutation(request.mutation)) throw new PersonalValidationError('Invalid personal operation');
  const receipt = state.processedOperations.find(row => row.operationId === request.operationId);
  if (receipt) {
    if (canonical(receipt.mutation) !== canonical(request.mutation)) throw new PersonalConflictError('Operation identity was reused');
    return { personal: cloneJson(state), appliedRevision: receipt.appliedRevision, replayed: true };
  }
  if (request.expectedRevision !== state.revision) throw new PersonalConflictError('Personal revision changed');
  if (state.revision === Number.MAX_SAFE_INTEGER) throw new PersonalValidationError('Revision limit reached');
  const personal = cloneJson(state);
  const mutation = cloneJson(request.mutation);
  switch (mutation.type) {
    case 'set-dietary-preferences': personal.dietaryPreferences = { ...personal.dietaryPreferences, ...mutation.preferences }; break;
    case 'save-measurement': {
      const index = personal.measurements.findIndex(row => row.id === mutation.measurement.id);
      if (index < 0) personal.measurements.push(mutation.measurement); else personal.measurements[index] = mutation.measurement;
      personal.measurements.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)); break;
    }
    case 'add-photo':
      if (personal.photos.some(row => row.id === mutation.photo.id)) throw new PersonalConflictError('Photo identity already exists');
      personal.photos.push(mutation.photo); break;
    case 'update-photo': {
      const index = personal.photos.findIndex(row => row.id === mutation.photo.id);
      const existing = personal.photos[index];
      if (!existing) throw new PersonalConflictError('Photo no longer exists');
      if (['mime','width','height','createdAt'].some(key => existing[key as keyof ProgressPhotoDto] !== mutation.photo[key as keyof ProgressPhotoDto])) throw new PersonalValidationError('Photo bytes metadata cannot change');
      personal.photos[index] = mutation.photo; break;
    }
    case 'delete-photo': case 'delete-measurement': {
      const collection = mutation.type === 'delete-photo' ? personal.photos : personal.measurements;
      const index = collection.findIndex(row => row.id === mutation.id);
      if (index < 0) throw new PersonalConflictError('Record no longer exists');
      collection.splice(index,1); break;
    }
  }
  personal.revision += 1;
  personal.processedOperations.push({ operationId: request.operationId, mutation, appliedRevision: personal.revision });
  if (!isPersonalState(personal)) throw new PersonalValidationError('Personal state exceeds supported limits');
  return { personal, appliedRevision: personal.revision, replayed: false };
}
export interface MeasurementTrendPoint { id: string; date: string; valueCm: number }
export interface MeasurementTrend { points: MeasurementTrendPoint[]; changeCm: number | null }
/** Missing measurements stay unknown; neither missing values nor missing days become zero. */
export function compareMeasurementTrend(rows: readonly MeasurementDto[], field: MeasurementField): MeasurementTrend {
  const points = rows.filter(row => row[field] !== undefined).map(row => ({ id:row.id,date:row.date,valueCm:row[field]! }))
    .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const first = points[0]; const last = points[points.length-1];
  return { points, changeCm: points.length < 2 || !first || !last ? null : last.valueCm-first.valueCm };
}
