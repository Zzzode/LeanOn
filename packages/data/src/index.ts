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

export { createEmptyPersonalState, isDietaryPreferences, isMeasurement, isProgressPhoto, isPersonalMutation, isPersonalState, applyPersonalMutation, compareMeasurementTrend, MEASUREMENT_FIELDS, PersonalValidationError, PersonalConflictError } from './personal.js';
export type { DietaryPreferencesDto, MeasurementDto, MeasurementField, ProgressPhotoDto, PersonalMutationDto, PersonalOperationReceiptDto, PersonalStateDto, PersonalMutationRequestDto, PersonalMutationResultDto, MeasurementTrend, MeasurementTrendPoint } from './personal.js';
export { BACKUP_AAD, BACKUP_ITERATIONS, MAX_PHOTO_BYTES, MAX_PHOTOS_BYTES, MAX_BACKUP_BYTES, encodeBase64, decodeBase64, base64ByteLength, isBackupPayload, isBackupEnvelope, preflightRestore, checkRestoreRevision, encryptBackup, inspectEncryptedBackup, BackupValidationError, BackupAuthenticationError } from './backup.js';
export type { BackupPhotoDto, BackupPayloadDto, BackupEnvelopeDto, BackupPreviewDto, RestorePlan, BackupCryptoPort, BackupJsonPort } from './backup.js';
export { createSignedOutCompanionState, isShareSettings, isCompanionMessage, isCompanionPeerSnapshot, isCompanionState, isCompanionResponse, hasCurrentCompanionSession } from './companion.js';
export type { CompanionAccountDto, CompanionBindingDto, CompanionInvitationDto, CompanionMessageDto, CompanionPeerSnapshotDto, CompanionStateDto, CompanionAccountDeletionDto, CompanionRuntimeDto, CompanionResponseDto } from './companion.js';
export type { DataJsonValue } from './validation.js';
export { canonicalVaultJson, compareVaultClocks, isVaultSnapshot, mergeVaultSnapshots, VaultMergeError } from './vault-merge.js';
export type { VaultEntityClock, VaultSnapshotDto } from './vault-merge.js';
