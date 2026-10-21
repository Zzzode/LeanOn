import { expect, test } from '@rstest/core';
import { canEnableHealth, canSyncHealth, healthProvider, readHealthConnection } from './health-connection.js';

test('health UI routes only to the provider actually advertised by the host', () => {
  expect(healthProvider(['healthKit.getStatus'])).toBe('health-kit');
  expect(healthProvider(['healthConnect.getStatus'])).toBe('health-connect');
  expect(healthProvider(undefined)).toBeNull();
  expect(healthProvider(['health.writeWeight'])).toBeNull();
});

test('HealthKit read-only sync does not infer read authorization from write access', () => {
  const connection = readHealthConnection('health-kit', {
    supported: true, enabled: true, authorizationRequested: true,
    writeAuthorized: false, readAccess: 'unknown', lastSyncEpochMs: 0,
  });
  expect(connection).not.toBeNull();
  if (connection === null) throw new Error('Fixture rejected');
  expect(canEnableHealth(connection)).toBe(true);
  expect(canSyncHealth(connection)).toBe(true);
  expect(connection.status).not.toHaveProperty('permissionsGranted');
  expect(readHealthConnection('health-kit', { ...connection.status, readAccess: 'granted' })).toBeNull();
  expect(canSyncHealth({ provider: 'health-kit', status: { supported: true, enabled: false,
    authorizationRequested: true, writeAuthorized: true, readAccess: 'unknown', lastSyncEpochMs: 0 } })).toBe(false);
});

test('missing permissions and malformed native status do not enable synchronization', () => {
  expect(readHealthConnection('health-kit', { supported: true, enabled: true, lastSyncEpochMs: 0 })).toBeNull();
  expect(readHealthConnection('health-connect', { supported: true, enabled: true, permissionsGranted: 'yes', lastSyncEpochMs: 0 })).toBeNull();
  const connection = readHealthConnection('health-connect', { supported: true, enabled: true, permissionsGranted: false, lastSyncEpochMs: 0 });
  expect(connection === null ? true : canSyncHealth(connection)).toBe(false);
});

test('optional nutrition permission status preserves true and false without inferring all writes stopped', () => {
  const status = { supported: true, enabled: true, authorizationRequested: true,
    writeAuthorized: false, readAccess: 'unknown', lastSyncEpochMs: 0 };
  for (const nutritionWriteAuthorized of [true, false]) {
    const connection = readHealthConnection('health-kit', { ...status, nutritionWriteAuthorized });
    expect(connection?.status).toHaveProperty('nutritionWriteAuthorized', nutritionWriteAuthorized);
    if (connection === null) throw new Error('Fixture rejected');
    expect(canSyncHealth(connection)).toBe(true);
  }
  const legacy = readHealthConnection('health-kit', status);
  expect(legacy).not.toBeNull();
  expect(legacy?.status).not.toHaveProperty('nutritionWriteAuthorized');
});

test('malformed optional nutrition permission flags reject a native status instead of being coerced', () => {
  const status = { supported: true, enabled: true, authorizationRequested: true,
    writeAuthorized: true, readAccess: 'unknown', lastSyncEpochMs: 0 };
  for (const nutritionWriteAuthorized of [null, 0, 1, 'true', 'false', {}, []]) {
    expect(readHealthConnection('health-kit', { ...status, nutritionWriteAuthorized })).toBeNull();
  }
});
