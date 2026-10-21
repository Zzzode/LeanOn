import type { CompanionMigrationState } from '@zzzode/bridge';

export const MIGRATION_PHASES = ['idle','review','preparing','prepared','restoring','publishing','pausing','paused','activating','active','rolled-back'] as const;
export const MIGRATION_COUNT_FIELDS = ['weights','water','exercises','meals','measurements','photos'] as const;
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
/** Native state is authoritative; unknown phases and incomplete identity never become a successful migration. */
export function readMigrationState(response: unknown): CompanionMigrationState | null {
  if(!object(response) || !object(response.migration))return null;
  const v = response.migration;
  if(!MIGRATION_PHASES.some(phase=>phase===v.phase))return null;
  for(const field of ['sourceEndpoint','targetEndpoint','targetServiceId','accountId','accountName','operationId','previewToken','errorCode'])if(v[field]!==null && typeof v[field]!=='string')return null;
  if(!object(v.counts))return null;
  const counts=v.counts;
  if(MIGRATION_COUNT_FIELDS.some(field=>typeof counts[field]!=='number' || !Number.isSafeInteger(counts[field]) || (counts[field] as number)<0))return null;
  if(v.phase!=='idle' && ['sourceEndpoint','targetEndpoint','targetServiceId','accountId','accountName','operationId'].some(field=>typeof v[field]!=='string' || v[field]===''))return null;
  if(v.phase==='review' && (typeof v.previewToken!=='string' || v.previewToken===''))return null;
  return v as unknown as CompanionMigrationState;
}
export function migrationRunning(phase: CompanionMigrationState['phase']): boolean { return ['preparing','restoring','publishing','pausing','activating'].includes(phase); }
export function migrationConfirmed(state: CompanionMigrationState, consent: boolean, password: string, backupPassword: string): boolean {
  return consent && (state.phase==='review' || state.phase==='paused' || state.phase==='prepared') && state.accountId!==null && state.targetServiceId!==null && password.length>=12 && password.length<=256 && backupPassword.length>=12 && backupPassword.length<=256;
}
