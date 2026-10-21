import type { LeanOnBridgeClient } from '@zzzode/bridge';
import { isPersonalState } from '@zzzode/data';
import { readHostDataEnvelope } from './host-data.js';
import { backupPasswordValid, readBackupInspection, type BackupInspection } from './backup-ui.js';

export async function inspectBackup(bridge:LeanOnBridgeClient,password:string):Promise<BackupInspection|null> {
  if(!backupPasswordValid(password))throw new Error('Invalid backup password');
  const response=await bridge.invoke('backup.inspectImport',{password});
  if(response.cancelled===true)return null;
  const preview=readBackupInspection(response);if(preview===null)throw new Error('Invalid backup preview');return preview;
}
/** Inspecting or cancelling a preview cannot write. Replacement requires separate explicit consent. */
export async function restoreBackup(bridge:LeanOnBridgeClient,preview:BackupInspection,consent:boolean) {
  if(!consent)throw new Error('Backup replacement not confirmed');
  const response=await bridge.invoke('backup.restore',{token:preview.token,expectedRecordsRevision:preview.expectedRecordsRevision,expectedPersonalRevision:preview.expectedPersonalRevision});
  const hostData=readHostDataEnvelope(response);
  if(response.success!==true||hostData===null||!isPersonalState(response.personal))throw new Error('Invalid restored data');
  return {hostData,personal:response.personal};
}
