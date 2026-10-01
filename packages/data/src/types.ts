/**
 * Data model for LeanOn: record envelopes, core entity payloads, encrypted
 * storage contracts and sync change batches. Merge, migration and sync planning
 * are pure functions; platform crypto and the network are ports.
 */

/** Discriminator for the kinds of entities stored. */
export type EntityKind =
  | 'profile'
  | 'weight_log'
  | 'meal_entry'
  | 'activity_entry'
  | 'menstrual_log'
  | 'goal_state'
  | 'settings'
  | 'family_group'
  | 'food_item';

/** Common metadata and tombstone wrapper for every stored record. */
export interface RecordEnvelope<T> {
  /** Stable UUID assigned at creation. */
  id: string;
  /** Id of the person who owns the record. */
  ownerId: string;
  /** Entity kind, for collection routing. */
  kind: EntityKind;
  /** Entity payload schema version. */
  schemaVersion: number;
  /** Creation timestamp (ISO 8601). */
  createdAt: string;
  /** Last update timestamp (ISO 8601); drives last-write-wins. */
  updatedAt: string;
  /** Device that last wrote; tie-breaks identical updatedAt. */
  deviceId: string;
  /** Tombstone: when true, the record is deleted. */
  deleted: boolean;
  /** Entity payload. */
  data: T;
}

/** Profile payload containing the inputs the core engine needs. */
export interface ProfileData {
  displayName: string;
  sex: 'male' | 'female';
  birthYear: number;
  heightCm: number;
  activityFactor: number;
  targetWeightKg: number;
}

/** An immutable body-weight measurement. */
export interface WeightLogData {
  measuredAt: string;
  weightKg: number;
  source: 'manual' | 'scale';
}

/** A data-encryption key wrapped by the hardware-backed key. */
export interface WrappedDataKey {
  keyId: string;
  /** Wrapped key bytes (platform-defined encoding). */
  wrapped: Uint8Array;
}

/** Crypto port implemented over Keychain/Keystore-backed primitives. */
export interface CipherPort {
  generateDataKey(): Promise<WrappedDataKey>;
  encrypt(key: WrappedDataKey, plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(key: WrappedDataKey, ciphertext: Uint8Array): Promise<Uint8Array>;
}

/** The peer's view of a record, used to compute outgoing changes. */
export interface PeerRecordState {
  updatedAt: string;
  deleted: boolean;
}

/** Map of record id to the state the peer already has. */
export type PeerVector = Record<string, PeerRecordState>;

/** An encrypted, idempotent batch of record changes. */
export interface ChangeBatch {
  /** Opaque continuation cursor. */
  cursor: string;
  records: Array<RecordEnvelope<unknown>>;
}
