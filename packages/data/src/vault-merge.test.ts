import { expect, test } from '@rstest/core';
import { applyRecordMutation, createEmptyRecordsState } from '@zzzode/core';
import { createEmptyPersonalState } from './personal.js';
import type { BackupPayloadDto } from './backup.js';
import { isBackupPayload } from './backup.js';
import { canonicalVaultJson, mergeVaultSnapshots } from './vault-merge.js';
import type { VaultSnapshotDto } from './vault-merge.js';
import publicBackup from './fixtures/public-backup-v1.json';

function snapshot(deviceId: string, updatedAt = 100): VaultSnapshotDto {
  const payload: BackupPayloadDto = {formatVersion:1,createdAt:'2026-10-07T00:00:00Z',records:createEmptyRecordsState(),customFoods:[],favoriteFoodIds:[],recentFoodIds:[],personal:createEmptyPersonalState(),photos:[]};
  return {version:1,kind:'vault-snapshot',payload,clocks:Object.fromEntries(['profile','preferences','favorites','recent'].map(key => [key,{updatedAt,deviceId,id:`${deviceId}-${key}`}])) ,tombstones:{customFoods:[]}};
}
function stamp(value: VaultSnapshotDto, key: string, updatedAt = 100): void {value.clocks[key]={updatedAt,deviceId:value.clocks.profile!.deviceId,id:key.replace(':','-')};}

test('offline additions from two devices survive in either merge direction and retry is idempotent', () => {
  const a=snapshot('a'), b=snapshot('b');
  a.payload.records.weights=[{id:'wa',date:'2026-10-01',weightKg:80}];stamp(a,'weight:wa');
  b.payload.records.weights=[{id:'wb',date:'2026-10-02',weightKg:79}];stamp(b,'weight:wb');
  const ab=mergeVaultSnapshots(a,[b]), ba=mergeVaultSnapshots(b,[a]);
  expect(ab.payload.records.weights).toEqual(ba.payload.records.weights);
  expect(ab.payload.records.weights.map(row => row.id)).toEqual(['wa','wb']);
  expect(mergeVaultSnapshots(ab,[b])).toEqual(ab);
  expect(isBackupPayload(ab.payload)).toBe(true);
});

test('same-day weight/water identities retain one actual domain value with stable clock ordering', () => {
  const a=snapshot('a'), b=snapshot('b');
  a.payload.records.weights=[{id:'wa',date:'2026-10-01',weightKg:80}];stamp(a,'weight:wa',100);
  b.payload.records.weights=[{id:'wb',date:'2026-10-01',weightKg:79}];stamp(b,'weight:wb',101);
  a.payload.records.water=[{id:'water-a',date:'2026-10-01',amountMl:1000}];stamp(a,'water:water-a',100);
  b.payload.records.water=[{id:'water-b',date:'2026-10-01',amountMl:1500}];stamp(b,'water:water-b',101);
  const result=mergeVaultSnapshots(a,[b]);
  expect(result.payload.records.weights).toEqual(b.payload.records.weights);
  expect(result.payload.records.water).toEqual(b.payload.records.water);
});

test('unrelated new measurements cannot overwrite a more recent preference entity', () => {
  const a=snapshot('a'), b=snapshot('b');
  a.payload.personal.dietaryPreferences.pattern='vegetarian';stamp(a,'preferences',200);
  b.payload.personal.measurements=[{id:'mb',date:'2026-10-02',waistCm:85}];stamp(b,'measurement:mb',300);
  const result=mergeVaultSnapshots(a,[b]);
  expect(result.payload.personal.dietaryPreferences.pattern).toBe('vegetarian');
  expect(result.payload.personal.measurements).toEqual(b.payload.personal.measurements);
});

test('deletion beats an older live value, while a receipt of the exact undo token causally restores it', () => {
  const original=snapshot('a');
  const clock={today:'2026-10-07',deletedAt:'2026-10-07T00:00:00Z'};
  original.payload.records=applyRecordMutation(original.payload.records,{operationId:'add',expectedRevision:0,mutation:{type:'set-weight',date:'2026-10-07',weightKg:80}},clock).state;
  stamp(original,`weight:${original.payload.records.weights[0]!.id}`);
  const deleted=structuredClone(original);
  deleted.payload.records=applyRecordMutation(deleted.payload.records,{operationId:'remove',expectedRevision:1,mutation:{type:'delete-record',kind:'weight',id:deleted.payload.records.weights[0]!.id}},clock).state;
  expect(mergeVaultSnapshots(original,[deleted]).payload.records.weights).toEqual([]);
  const restored=structuredClone(deleted);
  restored.payload.records=applyRecordMutation(restored.payload.records,{operationId:'undo',expectedRevision:2,mutation:{type:'restore-record',token:'undo-remove'}},clock).state;
  stamp(restored,`weight:${restored.payload.records.weights[0]!.id}`,200);
  const result=mergeVaultSnapshots(deleted,[restored]);
  expect(result.payload.records.weights[0]?.weightKg).toBe(80);
  expect(result.payload.records.deletedRecords).toEqual([]);
  expect(isBackupPayload(result.payload)).toBe(true);
});

test('different content under one operation or clock identity rejects without mutating either side', () => {
  const a=snapshot('a'), b=structuredClone(a);
  b.payload.personal.dietaryPreferences.notes='Different value under reused stamp';
  const before=canonicalVaultJson([a,b]);
  expect(()=>mergeVaultSnapshots(a,[b])).toThrow();
  expect(canonicalVaultJson([a,b])).toBe(before);
  b.payload.personal.dietaryPreferences.notes='';
  a.payload.records=applyRecordMutation(a.payload.records,{operationId:'collision',expectedRevision:0,mutation:{type:'set-water',date:'2026-10-07',amountMl:1000}},{today:'2026-10-07',deletedAt:a.payload.createdAt}).state;
  b.payload.records=applyRecordMutation(b.payload.records,{operationId:'collision',expectedRevision:0,mutation:{type:'set-water',date:'2026-10-07',amountMl:1500}},{today:'2026-10-07',deletedAt:b.payload.createdAt}).state;
  stamp(a,`water:${a.payload.records.water[0]!.id}`);stamp(b,`water:${b.payload.records.water[0]!.id}`);
  expect(()=>mergeVaultSnapshots(a,[b])).toThrow('Operation receipt');
});

test('invalid or clockless incoming data fails closed', () => {
  const a=snapshot('a'), b=snapshot('b');
  delete b.clocks.preferences;
  expect(()=>mergeVaultSnapshots(a,[b])).toThrow('Missing entity clock');
  const invalid=structuredClone(a);invalid.payload.records.schemaVersion=3 as 2;
  expect(()=>mergeVaultSnapshots(a,[invalid])).toThrow('Invalid vault snapshot');
});

test('photo metadata edits retain exact persisted JPEG bytes and a reused clock cannot substitute bytes', () => {
  const candidate: unknown=publicBackup.payload;
  if (!isBackupPayload(candidate)) throw new Error('Invalid public backup fixture');
  const a=snapshot('a'); a.payload=structuredClone(candidate);
  for (const key of ['profile','preferences','favorites','recent']) stamp(a,key);
  for (const row of a.payload.personal.photos) stamp(a,`photo:${row.id}`);
  for (const row of a.payload.personal.measurements) stamp(a,`measurement:${row.id}`);
  for (const row of a.payload.customFoods) stamp(a,`custom-food:${row.id}`);
  for (const [field,scope] of [['weights','weight'],['water','water'],['exercises','exercise'],['legacyIntake','legacy-intake'],['intakeEntries','intake']] as const)
    for (const row of a.payload.records[field]) stamp(a,`${scope}:${row.id}`);
  const b=structuredClone(a);
  const photo=b.payload.personal.photos[0]!;
  photo.note='Edited metadata';stamp(b,`photo:${photo.id}`,200);
  expect(mergeVaultSnapshots(a,[b]).payload.photos).toEqual(a.payload.photos);
  const reused=structuredClone(a);reused.payload.photos[0]!.bytesBase64='AA==';
  expect(()=>mergeVaultSnapshots(a,[reused])).toThrow('Conflicting bytes');
});
