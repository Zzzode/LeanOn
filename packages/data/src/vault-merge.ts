import { projectIntake } from '@zzzode/core';
import type { RecordsState } from '@zzzode/core';
import { isBackupPayload } from './backup.js';
import type { BackupPayloadDto } from './backup.js';
import { cloneJson, exactKeys, isPlainObject, safeId, safeRevision } from './validation.js';

/** Clocks belong to individual entities; unrelated edits cannot advance them. */
export interface VaultEntityClock { updatedAt: number; deviceId: string; id: string }
export interface VaultSnapshotDto {
  version: 1;
  kind: 'vault-snapshot';
  payload: BackupPayloadDto;
  clocks: Record<string, VaultEntityClock>;
  tombstones: { customFoods: string[] };
}
export class VaultMergeError extends Error {}

export function canonicalVaultJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalVaultJson).join(',')}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalVaultJson(value[key])}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new VaultMergeError('Non-JSON vault value');
  return encoded;
}
function clock(value: unknown): value is VaultEntityClock {
  return isPlainObject(value) && exactKeys(value, ['updatedAt','deviceId','id']) && safeRevision(value.updatedAt) && safeId(value.deviceId) && safeId(value.id);
}
export function isVaultSnapshot(value: unknown): value is VaultSnapshotDto {
  return isPlainObject(value) && exactKeys(value, ['version','kind','payload','clocks','tombstones']) && value.version === 1 && value.kind === 'vault-snapshot' &&
    isBackupPayload(value.payload) && isPlainObject(value.clocks) && Object.entries(value.clocks).every(([key,item]) => key.length > 0 && key.length <= 256 && clock(item)) &&
    isPlainObject(value.tombstones) && exactKeys(value.tombstones,['customFoods']) && Array.isArray(value.tombstones.customFoods) &&
    value.tombstones.customFoods.length <= 10000 && value.tombstones.customFoods.every(safeId) && new Set(value.tombstones.customFoods).size === value.tombstones.customFoods.length;
}
export function compareVaultClocks(a: VaultEntityClock, b: VaultEntityClock): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 1 : -1;
  if (a.deviceId !== b.deviceId) return a.deviceId > b.deviceId ? 1 : -1;
  return a.id === b.id ? 0 : a.id > b.id ? 1 : -1;
}
function entityClock(snapshot: VaultSnapshotDto, key: string): VaultEntityClock {
  const value = snapshot.clocks[key];
  if (!value) throw new VaultMergeError(`Missing entity clock: ${key}`);
  return value;
}
function select<T>(snapshots: readonly VaultSnapshotDto[], key: string, read: (payload: BackupPayloadDto) => T): T {
  let winner = snapshots[0];
  if (!winner) throw new VaultMergeError('No snapshots');
  for (const candidate of snapshots.slice(1)) {
    const order = compareVaultClocks(entityClock(candidate,key),entityClock(winner,key));
    if (order === 0 && canonicalVaultJson(read(candidate.payload)) !== canonicalVaultJson(read(winner.payload))) throw new VaultMergeError('Conflicting content under one entity clock');
    if (order > 0) winner = candidate;
  }
  return cloneJson(read(winner.payload));
}
function rows<T extends { id: string }>(snapshots: readonly VaultSnapshotDto[], scope: string, read: (payload: BackupPayloadDto) => readonly T[], deleted: ReadonlySet<string> = new Set(), identity: (row: T) => string = row => row.id): T[] {
  const chosen = new Map<string,{ value:T; clock:VaultEntityClock }>();
  for (const snapshot of snapshots) for (const value of read(snapshot.payload)) {
    if (deleted.has(value.id)) continue;
    const stamp = entityClock(snapshot,`${scope}:${value.id}`);
    const key = identity(value);
    const previous = chosen.get(key);
    const order = previous ? compareVaultClocks(stamp,previous.clock) : 1;
    if (previous && order === 0 && canonicalVaultJson(value) !== canonicalVaultJson(previous.value)) throw new VaultMergeError('Conflicting content under one entity clock');
    if (order > 0) chosen.set(key,{value:cloneJson(value),clock:stamp});
  }
  return [...chosen.values()].map(row => row.value).sort((a,b) => a.id === b.id ? 0 : a.id > b.id ? 1 : -1);
}
function receipts<T extends { operationId: string }>(collections: readonly (readonly T[])[]): T[] {
  const selected = new Map<string,T>();
  for (const collection of collections) for (const receipt of collection) {
    const previous = selected.get(receipt.operationId);
    if (previous && canonicalVaultJson(previous) !== canonicalVaultJson(receipt)) throw new VaultMergeError('Operation receipt identity collision');
    selected.set(receipt.operationId,cloneJson(receipt));
  }
  return [...selected.values()].sort((a,b) => a.operationId === b.operationId ? 0 : a.operationId > b.operationId ? 1 : -1);
}
function comparable(payload: BackupPayloadDto): unknown {
  const copy = cloneJson(payload);
  copy.createdAt = '2000-01-01T00:00:00Z';
  copy.records.revision = 0;
  copy.personal.revision = 0;
  return copy;
}
/** Reference algorithm for both native mirrors. It never performs I/O. */
export function mergeVaultSnapshots(local: VaultSnapshotDto, incoming: readonly VaultSnapshotDto[]): VaultSnapshotDto {
  const snapshots = [local,...incoming];
  if (!snapshots.every(isVaultSnapshot)) throw new VaultMergeError('Invalid vault snapshot');
  const merged = cloneJson(local);
  const payload = merged.payload;
  const operations = receipts(snapshots.map(snapshot => snapshot.payload.records.processedOperations));
  const restored = new Set(operations.flatMap(receipt => receipt.mutation.type === 'restore-record' ? [receipt.mutation.token] : []));
  const deleted = new Map<string,RecordsState['deletedRecords'][number]>();
  for (const snapshot of snapshots) for (const row of snapshot.payload.records.deletedRecords) {
    if (restored.has(row.token)) continue;
    const previous = deleted.get(row.token);
    if (previous && canonicalVaultJson(previous) !== canonicalVaultJson(row)) throw new VaultMergeError('Deletion identity collision');
    deleted.set(row.token,cloneJson(row));
  }
  payload.records.deletedRecords = [...deleted.values()].sort((a,b) => a.token > b.token ? 1 : a.token === b.token ? 0 : -1);
  const deletedOf = (kind: string): Set<string> => new Set(payload.records.deletedRecords.filter(row => row.kind === kind).map(row => row.record.id));
  payload.records.weights = rows(snapshots,'weight',p => p.records.weights,deletedOf('weight'),row => row.date);
  payload.records.water = rows(snapshots,'water',p => p.records.water,deletedOf('water'),row => row.date);
  payload.records.exercises = rows(snapshots,'exercise',p => p.records.exercises,deletedOf('exercise'));
  payload.records.legacyIntake = rows(snapshots,'legacy-intake',p => p.records.legacyIntake,deletedOf('legacy-intake'));
  payload.records.intakeEntries = rows(snapshots,'intake',p => p.records.intakeEntries,deletedOf('intake'));
  payload.records.intake = projectIntake(payload.records.legacyIntake,payload.records.intakeEntries);
  const profile = select(snapshots,'profile',p => ({ profile:p.records.profile,goalWeightKg:p.records.goalWeightKg,weeklyLossKg:p.records.weeklyLossKg,
    guidanceMode:p.records.guidanceMode,safetyFlags:p.records.safetyFlags,setupCompleted:p.records.setupCompleted }));
  Object.assign(payload.records,profile);
  payload.records.processedOperations = operations;
  payload.personal.processedOperations = receipts(snapshots.map(snapshot => snapshot.payload.personal.processedOperations));
  const deletedMeasurements = new Set(payload.personal.processedOperations.flatMap(receipt => receipt.mutation.type === 'delete-measurement' ? [receipt.mutation.id] : []));
  const deletedPhotos = new Set(payload.personal.processedOperations.flatMap(receipt => receipt.mutation.type === 'delete-photo' ? [receipt.mutation.id] : []));
  payload.personal.measurements = rows(snapshots,'measurement',p => p.personal.measurements,deletedMeasurements);
  payload.personal.photos = rows(snapshots,'photo',p => p.personal.photos,deletedPhotos);
  payload.personal.dietaryPreferences = select(snapshots,'preferences',p => p.personal.dietaryPreferences);
  merged.tombstones.customFoods = [...new Set(snapshots.flatMap(snapshot => snapshot.tombstones.customFoods))].sort();
  payload.customFoods = rows(snapshots,'custom-food',p => p.customFoods,new Set(merged.tombstones.customFoods));
  payload.favoriteFoodIds = select(snapshots,'favorites',p => p.favoriteFoodIds);
  payload.recentFoodIds = select(snapshots,'recent',p => p.recentFoodIds);
  payload.photos = payload.personal.photos.map(photo => {
    let winner: VaultSnapshotDto | undefined;
    for (const candidate of snapshots) if (candidate.payload.personal.photos.some(row => row.id === photo.id)) {
      const order = winner ? compareVaultClocks(entityClock(candidate,`photo:${photo.id}`),entityClock(winner,`photo:${photo.id}`)) : 1;
      if (winner && order === 0 && canonicalVaultJson(candidate.payload.photos.find(row => row.id === photo.id)) !== canonicalVaultJson(winner.payload.photos.find(row => row.id === photo.id))) throw new VaultMergeError('Conflicting bytes under one photo clock');
      if (order > 0) winner = candidate;
    }
    const bytes = winner?.payload.photos.find(row => row.id === photo.id);
    if (!bytes) throw new VaultMergeError('Photo bytes missing');
    return cloneJson(bytes);
  });
  for (const snapshot of snapshots) for (const [key,stamp] of Object.entries(snapshot.clocks)) {
    const previous = merged.clocks[key];
    if (!previous || compareVaultClocks(stamp,previous) > 0) merged.clocks[key] = cloneJson(stamp);
  }
  const changed = canonicalVaultJson(comparable(payload)) !== canonicalVaultJson(comparable(local.payload));
  if (changed) {
    const recordRevision = Math.max(...snapshots.map(snapshot => snapshot.payload.records.revision));
    const personalRevision = Math.max(...snapshots.map(snapshot => snapshot.payload.personal.revision));
    if (recordRevision === Number.MAX_SAFE_INTEGER || personalRevision === Number.MAX_SAFE_INTEGER) throw new VaultMergeError('Revision limit');
    payload.records.revision = recordRevision + 1;
    payload.personal.revision = personalRevision + 1;
  }
  if (!isBackupPayload(payload)) throw new VaultMergeError('Merged payload fails canonical validation');
  return merged;
}
