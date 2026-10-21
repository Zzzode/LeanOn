import { expect, test } from '@rstest/core';
import type { Profile } from '../types';
import type { IntakeEntry, RecordMutation, RecordsState } from './types';
import { createEmptyRecordsState, projectIntake } from './projection';
import { applyRecordMutation, canonicalRecordMutation, RecordOperationError } from './transaction';
import { isIsoDate, isRecordsState, weightLossEligibility } from './validation';

const CLOCK = { today: '2026-10-06', deletedAt: '2026-10-06T12:00:00Z' };
const PROFILE: Profile = { sex: 'male', birthDate: '1993-05-12', heightCm: 178, activityLevel: 'lightly_active' };
const CLEAR = { pregnant: false, breastfeeding: false, eatingDisorderRisk: false };

function food(id = 'meal-one', kcal = 100): IntakeEntry {
  return { id, date: '2026-10-01', meal: 'breakfast', name: 'Synthetic breakfast', grams: kcal,
    kcal, macros: { proteinG: kcal / 10, carbsG: kcal / 10, fatG: kcal / 50 },
    micros: { fiberG: kcal / 50, sugarG: kcal * 0.03, saturatedFatG: kcal / 100, sodiumMg: kcal } };
}

function write(state: RecordsState, mutation: RecordMutation, operationId = `operation-${state.revision}`) {
  return applyRecordMutation(state, { operationId, expectedRevision: state.revision, mutation }, CLOCK);
}

function rejects(operation: () => unknown, code: RecordOperationError['code']): void {
  try { operation(); throw new Error('Expected rejection'); }
  catch (error: unknown) {
    expect(error).toBeInstanceOf(RecordOperationError);
    expect((error as RecordOperationError).code).toBe(code);
  }
}

test('fresh records contain no fabricated profile and support factual logging before setup', () => {
  let state = createEmptyRecordsState();
  expect(state.profile).toBeNull(); expect(state.setupCompleted).toBe(false);
  state = write(state, { type: 'set-weight', date: CLOCK.today, weightKg: 80 }).state;
  state = write(state, { type: 'set-water', date: CLOCK.today, amountMl: 250 }).state;
  state = write(state, { type: 'save-intake', entry: food() }).state;
  state = write(state, { type: 'save-exercise', exercise: {
    id: 'exercise-one', date: CLOCK.today, typeId: 'walking', durationMin: 20, kcal: 67,
  } }).state;
  expect(state.profile).toBeNull(); expect(state.setupCompleted).toBe(false);
  expect(state.revision).toBe(4); expect(state.intake[0]?.kcal).toBe(100);
});

test('portion edit replaces its nutrients and totals preserve other meal identities', () => {
  let state = write(createEmptyRecordsState(), { type: 'save-intake', entry: food() }, 'original').state;
  state = write(state, { type: 'save-intake', entry: { ...food('meal-two', 200), meal: 'lunch' } }).state;
  state = write(state, { type: 'save-intake', entry: food('meal-one', 150) }).state;
  expect(state.intakeEntries).toHaveLength(2);
  expect(state.intake[0]?.kcal).toBe(350);
  expect(state.intake[0]?.macros.proteinG).toBe(35);
  expect(state.intake[0]?.micros.fiberG).toBe(7);
  expect(state.intake[0]?.micros.sodiumMg).toBe(350);
});

test('zero-energy factual food remains a meal entry', () => {
  const result = write(createEmptyRecordsState(), { type: 'save-intake', entry: { ...food('tea', 0), grams: 250, name: 'Tea' } });
  expect(result.state.intakeEntries).toHaveLength(1);
  expect(result.state.intake[0]?.kcal).toBe(0);
});

test('retry ignores object key order and stale revision without overwriting later edits', () => {
  let state = write(createEmptyRecordsState(), { type: 'save-intake', entry: food() }, 'first').state;
  state = write(state, { type: 'save-intake', entry: food('meal-one', 150) }, 'edit').state;
  const mutation: RecordMutation = { entry: { ...food(), macros: { fatG: 2, carbsG: 10, proteinG: 10 } }, type: 'save-intake' };
  const replay = applyRecordMutation(state, { operationId: 'first', expectedRevision: 0, mutation }, CLOCK);
  expect(replay.replayed).toBe(true); expect(replay.appliedRevision).toBe(1);
  expect(replay.state.revision).toBe(2); expect(replay.state.intake[0]?.kcal).toBe(150);
  rejects(() => applyRecordMutation(state, { operationId: 'first', expectedRevision: 0,
    mutation: { type: 'save-intake', entry: food('meal-one', 200) } }, CLOCK), 'invalid-request');
});

test('stale writes and invalid future dates preserve the input state', () => {
  const state = write(createEmptyRecordsState(), { type: 'set-water', date: '2026-10-01', amountMl: 500 }).state;
  const before = JSON.stringify(state);
  rejects(() => applyRecordMutation(state, { operationId: 'stale', expectedRevision: 0,
    mutation: { type: 'set-water', date: '2026-10-01', amountMl: 750 } }, CLOCK), 'conflict');
  rejects(() => write(state, { type: 'set-water', date: '2026-10-07', amountMl: 250 }), 'invalid-request');
  expect(JSON.stringify(state)).toBe(before);
});

test('delete and restart restore exact recorded nutrients with durable retry receipt', () => {
  const initial = write(createEmptyRecordsState(), { type: 'save-intake', entry: food() }).state;
  const deleted = write(initial, { type: 'delete-record', kind: 'intake', id: 'meal-one' }, 'delete');
  expect(deleted.undoToken).toBe('undo-delete'); expect(deleted.state.intake).toHaveLength(0);
  const restarted = JSON.parse(JSON.stringify(deleted.state)) as RecordsState;
  const restored = write(restarted, { type: 'restore-record', token: 'undo-delete' }, 'restore');
  expect(restored.state.intakeEntries[0]).toEqual(food());
  expect(restored.state.deletedRecords).toHaveLength(0);
  const replay = applyRecordMutation(restored.state, { operationId: 'delete', expectedRevision: 1,
    mutation: { type: 'delete-record', kind: 'intake', id: 'meal-one' } }, CLOCK);
  expect(replay.replayed).toBe(true); expect(replay.state.intakeEntries).toHaveLength(1);
});

test('a deleted record without its originating receipt is unavailable without changing input', () => {
  const initial = write(createEmptyRecordsState(), { type: 'save-intake', entry: food() }, 'create').state;
  const deleted = write(initial, { type: 'delete-record', kind: 'intake', id: 'meal-one' }, 'delete').state;
  expect(isRecordsState(deleted)).toBe(true);
  const corrupted = { ...deleted, processedOperations: deleted.processedOperations.filter((receipt) => receipt.operationId !== 'delete') };
  const before = JSON.stringify(corrupted);
  expect(isRecordsState(corrupted)).toBe(false);
  rejects(() => write(corrupted, { type: 'restore-record', token: 'undo-delete' }), 'unavailable');
  expect(JSON.stringify(corrupted)).toBe(before);
});

test('live deleted records require matching receipt token, revision, kind and record identity', () => {
  const initial = write(createEmptyRecordsState(), { type: 'save-intake', entry: food() }, 'create').state;
  const deleted = write(initial, { type: 'delete-record', kind: 'intake', id: 'meal-one' }, 'delete').state;
  const tombstone = deleted.deletedRecords[0]!;
  for (const changed of [
    { ...tombstone, token: 'undo-other' },
    { ...tombstone, deletedRevision: 1 },
    { ...tombstone, record: { ...tombstone.record, id: 'other-meal' } },
  ]) expect(isRecordsState({ ...deleted, deletedRecords: [changed] })).toBe(false);
  const wrongKind = deleted.processedOperations.map((receipt) => receipt.operationId === 'delete'
    ? { ...receipt, mutation: { type: 'delete-record' as const, kind: 'exercise' as const, id: 'meal-one' } }
    : receipt);
  expect(isRecordsState({ ...deleted, processedOperations: wrongKind })).toBe(false);
});

test('delete receipts retain Undo identity after restore and tolerate native revision gaps', () => {
  const initial = write(createEmptyRecordsState(), { type: 'save-intake', entry: food() }, 'create').state;
  const deleted = write(initial, { type: 'delete-record', kind: 'intake', id: 'meal-one' }, 'delete').state;
  const restored = write(deleted, { type: 'restore-record', token: 'undo-delete' }, 'restore').state;
  expect(restored.deletedRecords).toHaveLength(0);
  expect(isRecordsState({ ...restored, revision: restored.revision + 4 })).toBe(true);
  const missingToken = restored.processedOperations.map((receipt) => {
    if (receipt.operationId !== 'delete') return receipt;
    const { undoToken: _undoToken, ...withoutToken } = receipt;
    return withoutToken;
  });
  expect(isRecordsState({ ...restored, processedOperations: missingToken })).toBe(false);
  const unrelatedToken = restored.processedOperations.map((receipt) => receipt.operationId === 'restore'
    ? { ...receipt, undoToken: 'undo-restore' } : receipt);
  expect(isRecordsState({ ...restored, processedOperations: unrelatedToken })).toBe(false);
});

test('daily restore refuses a new occupied day and retains the tombstone', () => {
  let state = write(createEmptyRecordsState(), { type: 'set-weight', date: '2026-10-01', weightKg: 80 }).state;
  state = write(state, { type: 'delete-record', kind: 'weight', id: 'weight-2026-10-01' }, 'remove').state;
  state = write(state, { type: 'set-weight', date: '2026-10-01', weightKg: 79 }).state;
  rejects(() => write(state, { type: 'restore-record', token: 'undo-remove' }), 'conflict');
  expect(state.weights[0]?.weightKg).toBe(79); expect(state.deletedRecords).toHaveLength(1);
});

test('daily date correction preserves identity and rejects occupied destination', () => {
  let state = write(createEmptyRecordsState(), { type: 'set-weight', date: CLOCK.today, weightKg: 80 }).state;
  state = write(state, { type: 'set-weight', id: `weight-${CLOCK.today}`, date: '2026-10-05', weightKg: 80.2 }).state;
  state = write(state, { type: 'set-weight', date: CLOCK.today, weightKg: 81 }, 'new').state;
  expect(state.weights.map((row) => row.id)).toEqual(['weight-2026-10-06', 'weight-2026-10-06-new']);
  rejects(() => write(state, { type: 'set-weight', id: 'weight-2026-10-06', date: CLOCK.today, weightKg: 80 }), 'conflict');
  expect(state.weights[0]?.date).toBe('2026-10-05');
});

test('water correction preserves moved identity and reuses no occupied id', () => {
  let state = write(createEmptyRecordsState(), { type: 'set-water', date: CLOCK.today, amountMl: 500 }).state;
  state = write(state, { type: 'set-water', id: `water-${CLOCK.today}`, date: '2026-10-05', amountMl: 750 }).state;
  state = write(state, { type: 'set-water', date: CLOCK.today, amountMl: 250 }, 'new-water').state;
  expect(state.water[0]?.id).toBe('water-2026-10-06');
  expect(state.water[1]?.id).toBe('water-2026-10-06-new-water');
});

test('mirrors cannot be edited or deleted but explicit manual daily logging establishes own precedence', () => {
  const state = createEmptyRecordsState();
  state.weights = [{ id: 'hk-weight-2026-10-01', date: '2026-10-01', weightKg: 80, source: 'healthkit' }];
  rejects(() => write(state, { type: 'set-weight', id: 'hk-weight-2026-10-01', date: '2026-10-01', weightKg: 79 }), 'not-authorized');
  rejects(() => write(state, { type: 'delete-record', kind: 'weight', id: 'hk-weight-2026-10-01' }), 'not-authorized');
  const own = write(state, { type: 'set-weight', date: '2026-10-01', weightKg: 79 }).state;
  expect(own.weights[0]).toEqual({ id: 'weight-2026-10-01', date: '2026-10-01', weightKg: 79 });
  expect(state.weights[0]?.source).toBe('healthkit');
});

test('duplicate legacy aggregates survive correction, delete and Undo without invented meals', () => {
  const first = { ...food('ignored', 500), id: 'legacy-intake-2026-10-01' };
  const second = { ...food('ignored-again', 700), id: 'legacy-intake-2026-10-01-1' };
  let state = createEmptyRecordsState();
  state.legacyIntake = [first, second]; state.intake = projectIntake(state.legacyIntake, []);
  expect(isRecordsState(state)).toBe(true); expect(state.intake[0]?.kcal).toBe(1200);
  state = write(state, { type: 'delete-record', kind: 'legacy-intake', id: first.id }, 'legacy-delete').state;
  expect(state.intake[0]?.kcal).toBe(700);
  state = write(state, { type: 'restore-record', token: 'undo-legacy-delete' }).state;
  expect(state.intake[0]?.kcal).toBe(1200); expect(state.intakeEntries).toHaveLength(0);
  state = write(state, { type: 'save-legacy-intake', sample: { ...first, kcal: 550 } }).state;
  expect(state.intake[0]?.kcal).toBe(1250);
});

test('legacy correction cannot create a fictitious aggregate or move into another occupied legacy day', () => {
  const state = createEmptyRecordsState();
  state.legacyIntake = [{ ...food(), id: 'old-one' }, { ...food(), id: 'old-two', date: '2026-10-02' }];
  state.intake = projectIntake(state.legacyIntake, []);
  rejects(() => write(state, { type: 'save-legacy-intake', sample: { ...state.legacyIntake[0]!, id: 'missing' } }), 'invalid-request');
  rejects(() => write(state, { type: 'save-legacy-intake', sample: { ...state.legacyIntake[0]!, date: '2026-10-02' } }), 'conflict');
});

test('first setup is atomic and later profile edits do not rewrite weight', () => {
  const fresh = createEmptyRecordsState();
  const mutation: RecordMutation = { type: 'save-profile', profile: PROFILE, goalWeightKg: null,
    weeklyLossKg: 0, guidanceMode: 'tracking-only', safetyFlags: { pregnant: null, breastfeeding: null, eatingDisorderRisk: null },
    initialWeightKg: 80 };
  const setup = write(fresh, mutation).state;
  expect(setup.setupCompleted).toBe(true); expect(setup.weights[0]?.date).toBe(CLOCK.today);
  expect(fresh.profile).toBeNull(); expect(fresh.weights).toHaveLength(0);
  rejects(() => write(setup, mutation), 'invalid-request');
  const { initialWeightKg: _initial, ...edit } = mutation;
  const edited = write(setup, { ...edit, profile: { ...PROFILE, heightCm: 180 } }).state;
  expect(edited.weights).toEqual(setup.weights);
});

test('guidance eligibility requires age20, explicit negative flags and current/goal screening bounds', () => {
  const base = { profile: PROFILE, safetyFlags: CLEAR, today: CLOCK.today, goalWeightKg: 75, currentWeightKg: 80 };
  expect(weightLossEligibility(base).eligible).toBe(true);
  for (const birthDate of ['2006-10-07', '2007-10-06']) {
    expect(weightLossEligibility({ ...base, profile: { ...PROFILE, birthDate } }).reason).toBe('age');
  }
  expect(weightLossEligibility({ ...base, profile: { ...PROFILE, birthDate: '2006-10-06' } }).eligible).toBe(true);
  expect(weightLossEligibility({ ...base, safetyFlags: { ...CLEAR, pregnant: null } }).eligible).toBe(false);
  expect(weightLossEligibility({ ...base, safetyFlags: { ...CLEAR, breastfeeding: true } }).eligible).toBe(false);
  expect(weightLossEligibility({ ...base, safetyFlags: { ...CLEAR, eatingDisorderRisk: true } }).eligible).toBe(false);
  expect(weightLossEligibility({ ...base, goalWeightKg: 50 }).reason).toBe('goal');
  expect(weightLossEligibility({ ...base, currentWeightKg: 50 }).reason).toBe('current-weight');
  expect(weightLossEligibility({ ...base, currentWeightKg: null }).reason).toBe('current-weight');
  rejects(() => write(createEmptyRecordsState(), { type: 'save-profile', profile: PROFILE, goalWeightKg: 75,
    weeklyLossKg: 0.5, guidanceMode: 'weight-loss', safetyFlags: CLEAR }), 'invalid-request');
});

test('low factual weight remains loggable and future legacy weight is excluded from eligibility', () => {
  const fresh = createEmptyRecordsState();
  fresh.weights = [{ id: 'old-future', date: '2027-01-01', weightKg: 30 }];
  const setup = write(fresh, { type: 'save-profile', profile: PROFILE, goalWeightKg: 75,
    weeklyLossKg: 0.5, guidanceMode: 'weight-loss', safetyFlags: CLEAR, initialWeightKg: 80 }).state;
  const changed = write(setup, { type: 'set-weight', date: CLOCK.today, weightKg: 50 }).state;
  expect(changed.weights.find((row) => row.date === CLOCK.today)?.weightKg).toBe(50);
  expect(changed.guidanceMode).toBe('weight-loss');
  expect(weightLossEligibility({ profile: changed.profile, safetyFlags: changed.safetyFlags,
    today: CLOCK.today, goalWeightKg: changed.goalWeightKg, currentWeightKg: 50 }).eligible).toBe(false);
});

test('tracking-only migrated rate is retained but an explicit profile save requires zero or null', () => {
  const legacy = { ...createEmptyRecordsState(), profile: PROFILE, setupCompleted: true, goalWeightKg: 75, weeklyLossKg: 0.6 };
  expect(isRecordsState(legacy)).toBe(true);
  rejects(() => write(legacy, { type: 'save-profile', profile: PROFILE, goalWeightKg: 75, weeklyLossKg: 0.6,
    guidanceMode: 'tracking-only', safetyFlags: CLEAR }), 'invalid-request');
});

test('unknown schema versions and corrupt durable metadata fail without mutation', () => {
  const future = { ...createEmptyRecordsState(), schemaVersion: 3 } as unknown as RecordsState;
  rejects(() => write(future, { type: 'set-water', date: CLOCK.today, amountMl: 250 }), 'unavailable');
  const corrupted = createEmptyRecordsState();
  corrupted.deletedRecords = [{ token: 'undo-bad', kind: 'intake', record: food(), deletedRevision: 1, deletedAt: '2026-02-30T12:00:00Z' }];
  expect(isRecordsState(corrupted)).toBe(false);
  expect(isIsoDate('2024-02-29')).toBe(true); expect(isIsoDate('2026-02-29')).toBe(false);
});

test('projection rejects overflow and preserves canonical semantic fields', () => {
  expect(() => projectIntake([], [food('huge-one', Number.MAX_VALUE), food('huge-two', Number.MAX_VALUE)])).toThrow(RangeError);
  expect(canonicalRecordMutation({ type: 'save-intake', entry: food() })).not.toBe(
    canonicalRecordMutation({ type: 'save-intake', entry: { ...food(), meal: 'lunch' } }));
});
