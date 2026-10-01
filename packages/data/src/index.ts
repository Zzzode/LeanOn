// Public API for the LeanOn data model, encrypted storage contracts and sync.
export type {
  ChangeBatch,
  CipherPort,
  EntityKind,
  PeerRecordState,
  PeerVector,
  ProfileData,
  RecordEnvelope,
  WeightLogData,
  WrappedDataKey,
} from './types';

export {
  MigrationError,
  Migrator,
  migrateEnvelope,
} from './migration';
export type { MigrateFn, Migration } from './migration';

export {
  MergeError,
  isNewerThan,
  mergeCollection,
  mergeEnvelope,
} from './merge';

export { applyBatch, selectOutgoing } from './sync';

export {
  PRIVATE_BY_DEFAULT,
  SUGGESTED_SHARED,
  defaultShareSettings,
  isShared,
} from './privacy';
export type { ShareCategory, ShareSettings } from './privacy';
