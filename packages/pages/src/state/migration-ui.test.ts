import { describe, expect, it } from '@rstest/core';
import { migrationConfirmed, migrationRunning, readMigrationState } from './migration-ui.js';

const state = {
  phase: 'review' as const, sourceEndpoint: 'http://127.0.0.1:64041', targetEndpoint: 'http://127.0.0.1:64043',
  targetServiceId: 'a'.repeat(64), accountId: 'fictional-owner', accountName: 'migration-owner',
  operationId: 'PUBLIC-cutover', previewToken: 'review-01', errorCode: null,
  counts: { weights: 2, water: 1, exercises: 1, meals: 1, measurements: 1, photos: 1 },
};
describe('migration UI native authority', () => {
  it('accepts explicit native checkpoints without inventing missing state', () => {
    expect(readMigrationState({ migration: state })).toEqual(state);
    expect(readMigrationState({ migration: { ...state, phase: 'succeeded' } })).toBeNull();
    expect(readMigrationState({ migration: { ...state, accountId: null } })).toBeNull();
    expect(readMigrationState({ migration: { ...state, previewToken: null } })).toBeNull();
    expect(readMigrationState({ migration: { ...state, counts: { ...state.counts, photos: -1 } } })).toBeNull();
  });
  it('requires consent and both passwords again after a persisted pause', () => {
    const paused = { ...state, phase: 'paused' as const, previewToken: null };
    expect(migrationConfirmed(paused, false, 'public-passphrase', 'public-backup-passphrase')).toBe(false);
    expect(migrationConfirmed(paused, true, '', 'public-backup-passphrase')).toBe(false);
    expect(migrationConfirmed(paused, true, 'public-passphrase', 'short')).toBe(false);
    expect(migrationConfirmed(paused, true, 'public-passphrase', 'public-backup-passphrase')).toBe(true);
    expect(migrationConfirmed({ ...paused, phase: 'active' }, true, 'public-passphrase', 'public-backup-passphrase')).toBe(false);
  });
  it('polls only actual in-flight states', () => {
    expect(migrationRunning('restoring')).toBe(true);
    expect(migrationRunning('pausing')).toBe(true);
    expect(migrationRunning('paused')).toBe(false);
    expect(migrationRunning('active')).toBe(false);
  });
});
