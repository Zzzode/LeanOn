import type {
  DeletedRecord, RecordMutation, RecordMutationResult, RecordsClock, RecordsMutationRequest,
  RecordsState, WaterRecord, WeightRecord,
} from './types';
import { projectIntake } from './projection';
import { isIsoDate, isIsoDateTime, isObject, isOwnRecord, isRecordMutation, isRecordsState, weightLossEligibility } from './validation';

export class RecordOperationError extends Error {
  constructor(readonly code: 'invalid-request' | 'conflict' | 'not-authorized' | 'unavailable', readonly reason: string) {
    super(reason);
    this.name = 'RecordOperationError';
  }
}

function fail(code: RecordOperationError['code'], reason: string): never {
  throw new RecordOperationError(code, reason);
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** Stable semantic encoding; object insertion order is irrelevant to retry identity. */
export function canonicalRecordMutation(value: RecordMutation): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical);
    if (isObject(input)) {
      const result = Object.create(null) as Record<string, unknown>;
      for (const key of Object.keys(input).sort()) {
        if (input[key] !== undefined) result[key] = canonical(input[key]);
      }
      return result;
    }
    return input;
  }
  return JSON.stringify(canonical(value));
}

function recordDate(date: string, today: string): void {
  if (!isIsoDate(date) || date > today) fail('invalid-request', 'future-or-invalid-date');
}

function own(record: unknown): void {
  if (!isOwnRecord(record)) fail('not-authorized', 'external-record-read-only');
}

function upsertDay<T extends WeightRecord | WaterRecord>(rows: T[], id: string | undefined,
  date: string, operationId: string, prefix: string, create: (identity: string, existing?: T) => T): T[] {
  const existing = id === undefined ? rows.find((row) => row.date === date) : rows.find((row) => row.id === id);
  if (id !== undefined) {
    if (!existing) fail('invalid-request', 'record-not-found');
    own(existing);
    if (rows.some((row) => row.date === date && row.id !== existing.id)) fail('conflict', 'date-occupied');
  }
  const preserve = existing && isOwnRecord(existing) ? existing : undefined;
  const defaultId = `${prefix}-${date}`;
  const identity = preserve?.id ?? (rows.some((row) => row.id === defaultId && row !== existing)
    ? `${defaultId}-${operationId}` : defaultId);
  const result = rows.filter((row) => row !== existing);
  if (result.some((row) => row.id === identity)) fail('conflict', 'record-id-occupied');
  result.push(create(identity, preserve));
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function saveProfile(state: RecordsState, mutation: Extract<RecordMutation, { type: 'save-profile' }>, today: string): void {
  if (mutation.profile.birthDate > today) fail('invalid-request', 'future-birth-date');
  if (state.setupCompleted && mutation.initialWeightKg !== undefined) fail('invalid-request', 'initial-weight-first-setup-only');
  if (mutation.guidanceMode === 'tracking-only') {
    if (mutation.weeklyLossKg !== null && mutation.weeklyLossKg !== 0) fail('invalid-request', 'tracking-only-has-no-deficit');
  } else {
    if (mutation.weeklyLossKg === null || mutation.weeklyLossKg < 0.5 || mutation.weeklyLossKg > 1) {
      fail('invalid-request', 'invalid-loss-rate');
    }
    const pastWeights = [...state.weights].filter((row) => row.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const current = mutation.initialWeightKg ?? pastWeights[pastWeights.length - 1]?.weightKg ?? null;
    if (!weightLossEligibility({ profile: mutation.profile, safetyFlags: mutation.safetyFlags,
      today, goalWeightKg: mutation.goalWeightKg, currentWeightKg: current }).eligible) {
      fail('invalid-request', 'guidance-ineligible');
    }
  }
  state.profile = clone(mutation.profile);
  state.goalWeightKg = mutation.goalWeightKg;
  state.weeklyLossKg = mutation.weeklyLossKg;
  state.guidanceMode = mutation.guidanceMode;
  state.safetyFlags = clone(mutation.safetyFlags);
  state.setupCompleted = true;
}

function deleteRecord(state: RecordsState, mutation: Extract<RecordMutation, { type: 'delete-record' }>,
  clock: RecordsClock, token: string, revision: number): void {
  const metadata = { token, deletedAt: clock.deletedAt, deletedRevision: revision };
  let tombstone: DeletedRecord;
  switch (mutation.kind) {
    case 'weight': {
      const record = state.weights.find((row) => row.id === mutation.id);
      if (!record) fail('invalid-request', 'record-not-found');
      own(record); state.weights = state.weights.filter((row) => row.id !== mutation.id);
      tombstone = { ...metadata, kind: 'weight', record }; break;
    }
    case 'water': {
      const record = state.water.find((row) => row.id === mutation.id);
      if (!record) fail('invalid-request', 'record-not-found');
      state.water = state.water.filter((row) => row.id !== mutation.id);
      tombstone = { ...metadata, kind: 'water', record }; break;
    }
    case 'exercise': {
      const record = state.exercises.find((row) => row.id === mutation.id);
      if (!record) fail('invalid-request', 'record-not-found');
      own(record); state.exercises = state.exercises.filter((row) => row.id !== mutation.id);
      tombstone = { ...metadata, kind: 'exercise', record }; break;
    }
    case 'intake': {
      const record = state.intakeEntries.find((row) => row.id === mutation.id);
      if (!record) fail('invalid-request', 'record-not-found');
      state.intakeEntries = state.intakeEntries.filter((row) => row.id !== mutation.id);
      tombstone = { ...metadata, kind: 'intake', record }; break;
    }
    case 'legacy-intake': {
      const record = state.legacyIntake.find((row) => row.id === mutation.id);
      if (!record) fail('invalid-request', 'record-not-found');
      state.legacyIntake = state.legacyIntake.filter((row) => row.id !== mutation.id);
      tombstone = { ...metadata, kind: 'legacy-intake', record }; break;
    }
  }
  if (state.deletedRecords.some((row) => row.token === token)) fail('conflict', 'restore-token-occupied');
  state.deletedRecords.push(tombstone);
}

function restoreRecord(state: RecordsState, token: string): void {
  const deleted = state.deletedRecords.find((row) => row.token === token);
  if (!deleted) fail('invalid-request', 'restore-token-not-found');
  switch (deleted.kind) {
    case 'weight':
      if (state.weights.some((row) => row.id === deleted.record.id || row.date === deleted.record.date)) fail('conflict', 'restore-target-occupied');
      state.weights.push(deleted.record); state.weights.sort((a, b) => a.date.localeCompare(b.date)); break;
    case 'water':
      if (state.water.some((row) => row.id === deleted.record.id || row.date === deleted.record.date)) fail('conflict', 'restore-target-occupied');
      state.water.push(deleted.record); state.water.sort((a, b) => a.date.localeCompare(b.date)); break;
    case 'exercise':
      if (state.exercises.some((row) => row.id === deleted.record.id)) fail('conflict', 'restore-target-occupied');
      state.exercises.push(deleted.record); break;
    case 'intake':
      if (state.intakeEntries.some((row) => row.id === deleted.record.id)) fail('conflict', 'restore-target-occupied');
      state.intakeEntries.push(deleted.record); break;
    case 'legacy-intake':
      if (state.legacyIntake.some((row) => row.id === deleted.record.id)) fail('conflict', 'restore-target-occupied');
      state.legacyIntake.push(deleted.record); break;
  }
  state.deletedRecords = state.deletedRecords.filter((row) => row.token !== token);
}

/** Reference transaction. Native hosts commit the returned state atomically or not at all. */
export function applyRecordMutation(state: RecordsState, request: RecordsMutationRequest, clock: RecordsClock): RecordMutationResult {
  if (!isRecordsState(state)) fail('unavailable', 'invalid-records-state');
  if (!isIsoDate(clock.today) || !isIsoDateTime(clock.deletedAt)) fail('invalid-request', 'invalid-native-clock');
  if (state.profile !== null && state.profile.birthDate > clock.today) fail('unavailable', 'invalid-records-state');
  if (!isObject(request) || typeof request.operationId !== 'string' || !request.operationId || request.operationId.trim() !== request.operationId ||
    !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0 || !isRecordMutation(request.mutation)) {
    fail('invalid-request', 'invalid-mutation-envelope');
  }
  const receipt = state.processedOperations.find((row) => row.operationId === request.operationId);
  if (receipt) {
    if (canonicalRecordMutation(receipt.mutation) !== canonicalRecordMutation(request.mutation)) fail('invalid-request', 'operation-id-reused');
    return { state: clone(state), appliedRevision: receipt.appliedRevision, replayed: true,
      ...(receipt.undoToken === undefined ? {} : { undoToken: receipt.undoToken }) };
  }
  if (request.expectedRevision !== state.revision) fail('conflict', 'stale-revision');
  if (state.revision === Number.MAX_SAFE_INTEGER) fail('unavailable', 'revision-overflow');
  const next = clone(state);
  const mutation = request.mutation;
  const revision = state.revision + 1;
  let undoToken: string | undefined;
  switch (mutation.type) {
    case 'save-profile':
      saveProfile(next, mutation, clock.today);
      if (mutation.initialWeightKg !== undefined) {
        next.weights = upsertDay(next.weights, undefined, clock.today, request.operationId, 'weight',
          (id, existing) => ({ ...existing, id, date: clock.today, weightKg: mutation.initialWeightKg as number }));
      }
      break;
    case 'set-weight':
      recordDate(mutation.date, clock.today);
      next.weights = upsertDay(next.weights, mutation.id, mutation.date, request.operationId, 'weight',
        (id, existing) => ({ ...existing, id, date: mutation.date, weightKg: mutation.weightKg })); break;
    case 'set-water':
      recordDate(mutation.date, clock.today);
      next.water = upsertDay(next.water, mutation.id, mutation.date, request.operationId, 'water',
        (id, existing) => ({ ...existing, id, date: mutation.date, amountMl: mutation.amountMl })); break;
    case 'save-exercise': {
      recordDate(mutation.exercise.date, clock.today); own(mutation.exercise);
      const existing = next.exercises.find((row) => row.id === mutation.exercise.id);
      if (existing) own(existing);
      if (next.deletedRecords.some((row) => row.kind === 'exercise' && row.record.id === mutation.exercise.id)) fail('conflict', 'record-is-deleted');
      next.exercises = next.exercises.filter((row) => row.id !== mutation.exercise.id);
      next.exercises.push({ ...existing, ...clone(mutation.exercise) }); break;
    }
    case 'save-intake': {
      recordDate(mutation.entry.date, clock.today);
      if (next.deletedRecords.some((row) => row.kind === 'intake' && row.record.id === mutation.entry.id)) fail('conflict', 'record-is-deleted');
      const existing = next.intakeEntries.find((row) => row.id === mutation.entry.id);
      next.intakeEntries = next.intakeEntries.filter((row) => row.id !== mutation.entry.id);
      next.intakeEntries.push({ ...existing, ...clone(mutation.entry) }); break;
    }
    case 'save-legacy-intake': {
      recordDate(mutation.sample.date, clock.today);
      const existing = next.legacyIntake.find((row) => row.id === mutation.sample.id);
      if (!existing) fail('invalid-request', 'legacy-aggregate-not-found');
      if (existing.date !== mutation.sample.date && next.legacyIntake.some((row) => row.id !== existing.id && row.date === mutation.sample.date)) {
        fail('conflict', 'date-occupied');
      }
      next.legacyIntake = next.legacyIntake.map((row) => row.id === existing.id ? { ...row, ...clone(mutation.sample) } : row); break;
    }
    case 'delete-record':
      undoToken = `undo-${request.operationId}`;
      deleteRecord(next, mutation, clock, undoToken, revision); break;
    case 'restore-record': restoreRecord(next, mutation.token); break;
  }
  next.intake = projectIntake(next.legacyIntake, next.intakeEntries);
  next.revision = revision;
  next.processedOperations.push({ operationId: request.operationId, mutation: clone(mutation), appliedRevision: revision,
    ...(undoToken === undefined ? {} : { undoToken }) });
  if (!isRecordsState(next)) fail('unavailable', 'invalid-resulting-records-state');
  return { state: next, appliedRevision: revision, replayed: false, ...(undoToken === undefined ? {} : { undoToken }) };
}
