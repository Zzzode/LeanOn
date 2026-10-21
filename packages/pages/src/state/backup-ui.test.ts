import {expect,test} from '@rstest/core';
import {createLeanOnBridgeClient,createMemoryBridge} from '@zzzode/bridge';
import {createEmptyPersonalState} from '@zzzode/data';
import {backupPasswordValid,readBackupInspection,type BackupInspection} from './backup-ui.js';
import {inspectBackup,restoreBackup} from './backup-client.js';
import {sampleHostData} from './sample.js';

const preview:BackupInspection={token:'preview-1',expiresAt:'2026-10-07T10:05:00Z',expectedRecordsRevision:4,expectedPersonalRevision:3,summary:{createdAt:'2026-10-07T10:00:00Z',recordRevision:2,personalRevision:1,photoBytes:0,hasProfile:false,includesPhotos:false,counts:{weights:1,water:0,exercises:0,intakeEntries:1,legacyIntake:0,customFoods:0,measurements:1,photos:0}}};
test('backup password limits use UTF-8 bytes and reject malformed Unicode without native encoders',()=>{
  expect(backupPasswordValid('12345678901')).toBe(false);expect(backupPasswordValid('减重健康')).toBe(true);
  expect(backupPasswordValid('🟣🟣🟣')).toBe(true);expect(backupPasswordValid('a'.repeat(1024))).toBe(true);
  expect(backupPasswordValid('a'.repeat(1025))).toBe(false);expect(backupPasswordValid('a'.repeat(12)+'\ud800')).toBe(false);
});
test('incomplete, negative, or false type previews never reach replacement confirmation',()=>{
  expect(readBackupInspection(preview)).toEqual(preview);
  expect(readBackupInspection({...preview,summary:{...preview.summary,hasProfile:'false'}})).toBeNull();
  expect(readBackupInspection({...preview,summary:{...preview.summary,counts:{...preview.summary.counts,photos:-1}}})).toBeNull();
  expect(readBackupInspection({...preview,expectedRecordsRevision:0.5})).toBeNull();
});
test('inspection and refusal are read-only; confirmed restore sends exact native preview token and both CAS revisions',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);const writes:unknown[]=[];
  memory.handle('backup.inspectImport',()=>({cancelled:false,...preview}));
  memory.handle('backup.restore',request=>{writes.push(request);return {success:true,hostData:sampleHostData,personal:createEmptyPersonalState()};});
  const result=await inspectBackup(bridge,'123456789012');expect(result).toEqual(preview);expect(writes).toEqual([]);
  await expect(restoreBackup(bridge,preview,false)).rejects.toThrow();expect(writes).toEqual([]);
  const restored=await restoreBackup(bridge,preview,true);expect(restored.hostData).toEqual(sampleHostData);
  expect(writes).toEqual([{token:'preview-1',expectedRecordsRevision:4,expectedPersonalRevision:3}]);
});
test('cancelled import and expired/revision-conflicting restore cannot synthesize success',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);
  memory.handle('backup.inspectImport',()=>({cancelled:true}));expect(await inspectBackup(bridge,'123456789012')).toBeNull();
  memory.handle('backup.restore',()=>{throw {code:'conflict',message:'Expired preview'};});
  await expect(restoreBackup(bridge,preview,true)).rejects.toMatchObject({code:'conflict'});
});
