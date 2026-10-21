import type { LeanOnRpcContract } from '@zzzode/bridge';
import { supportsMethod } from './capabilities.js';

export type HealthProvider = 'health-connect' | 'health-kit';
export type HealthConnection =
  | { provider: 'health-connect'; status: LeanOnRpcContract['healthConnect.getStatus']['response'] }
  | { provider: 'health-kit'; status: LeanOnRpcContract['healthKit.getStatus']['response'] };

export function healthProvider(methods: unknown, preview = false): HealthProvider | null {
  if (supportsMethod('healthConnect.getStatus', methods, preview)) return 'health-connect';
  return supportsMethod('healthKit.getStatus', methods) ? 'health-kit' : null;
}

/** HealthKit intentionally keeps read authorization undisclosed. */
export function readHealthConnection(provider: HealthProvider, value: unknown): HealthConnection | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.supported !== 'boolean' || typeof data.enabled !== 'boolean'
    || typeof data.lastSyncEpochMs !== 'number' || !Number.isFinite(data.lastSyncEpochMs) || data.lastSyncEpochMs < 0) return null;
  const common = { supported: data.supported, enabled: data.enabled, lastSyncEpochMs: data.lastSyncEpochMs };
  if (provider === 'health-connect') return typeof data.permissionsGranted === 'boolean'
    ? { provider, status: { ...common, permissionsGranted: data.permissionsGranted } } : null;
  if (data.nutritionWriteAuthorized !== undefined && typeof data.nutritionWriteAuthorized !== 'boolean') return null;
  const nutrition = data.nutritionWriteAuthorized === undefined ? {} : { nutritionWriteAuthorized: data.nutritionWriteAuthorized };
  return typeof data.writeAuthorized === 'boolean' && data.readAccess === 'unknown' && typeof data.authorizationRequested === 'boolean'
    ? { provider, status: { ...common, ...nutrition, writeAuthorized: data.writeAuthorized, readAccess: 'unknown', authorizationRequested: data.authorizationRequested } } : null;
}

export function canEnableHealth(connection: HealthConnection): boolean {
  return connection.status.supported && (connection.provider === 'health-kit'
    ? connection.status.authorizationRequested : connection.status.permissionsGranted);
}

export function canSyncHealth(connection: HealthConnection): boolean {
  return canEnableHealth(connection) && (connection.provider === 'health-connect' || connection.status.enabled);
}
