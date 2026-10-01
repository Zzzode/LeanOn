/**
 * Data model for dynamic Lynx bundle delivery. All update decisions are pure
 * functions over these types; network, filesystem and crypto are host ports.
 */

/** A versioned, signed Lynx bundle artifact listed in the manifest. */
export interface BundleArtifact {
  /** Monotonic integer version for this bundle id. */
  version: number;
  /** Download URL (absolute or relative to the manifest base URL). */
  url: string;
  /** SHA-256 lowercase hex digest of the bundle bytes. */
  sha256: string;
  /** Detached signature over the bundle bytes (encoding is host-defined). */
  signature: string;
  /** Minimum host (app) semver that can load this bundle. */
  minHostVersion: string;
  /** Capability methods the bundle requires the host to implement. */
  requiredCapabilities: string[];
  /** Bundle size in bytes, for download and disk planning. */
  size: number;
  /** Rollout percentage 0..100; absent means 100. */
  rolloutPercentage?: number;
  /** If true, this version is withdrawn and clients must move off it. */
  yanked?: boolean;
}

/** A signed manifest enumerating the current bundle artifacts. */
export interface BundleManifest {
  /** Manifest schema version. */
  schemaVersion: 1;
  /** ISO 8601 timestamp the manifest was generated. */
  generatedAt: string;
  /** Bundles keyed by bundle id (route or card name). */
  bundles: Record<string, BundleArtifact>;
}

/** Persisted local state for one bundle id. */
export interface LocalBundleState {
  /** Currently cached version. */
  version: number;
  /** Last version known to load successfully; used for rollback. */
  lastGoodVersion: number | null;
  /** True if the current version failed to load and should be rolled back. */
  broken: boolean;
}

/** Persisted local state keyed by bundle id. */
export type LocalState = Record<string, LocalBundleState>;

/** Device/user context used for compatibility and rollout evaluation. */
export interface DeliveryContext {
  /** Host (app) semver. */
  hostVersion: string;
  /** Stable per-user identifier for deterministic rollout bucketing. */
  userId: string;
  /** Capability methods this host actually implements. */
  hostCapabilities: string[];
  /** Operating system platform. */
  platform: 'ios' | 'android';
}

/** Why an update was skipped. */
export type SkipReason =
  | 'up_to_date'
  | 'incompatible_host'
  | 'missing_capability'
  | 'not_in_rollout'
  | 'yanked_no_alternative'
  | 'not_listed';

/** The decision for a single bundle id. */
export type UpdateAction =
  | { kind: 'download'; id: string; artifact: BundleArtifact }
  | { kind: 'rollback'; id: string; toVersion: number }
  | { kind: 'skip'; id: string; reason: SkipReason };

/** Result of verifying a downloaded artifact. */
export type IntegrityResult =
  | { ok: true }
  | { ok: false; reason: 'checksum_mismatch' | 'bad_signature' };
