// Public API for the LeanOn dynamic delivery decision engine.
export type {
  BundleArtifact,
  BundleManifest,
  DeliveryContext,
  IntegrityResult,
  LocalBundleState,
  LocalState,
  SkipReason,
  UpdateAction,
} from './types';

export { compareSemver, meetsMinVersion, parseSemver } from './version';
export type { SemverTuple } from './version';

export {
  fnv1aHash,
  isInRollout,
  normalizePercentage,
  rolloutBucket,
} from './rollout';

export { checkCompatibility, findArtifact } from './manifest';
export type { CompatibilityResult } from './manifest';

export {
  evaluateIntegrity,
  isHexSha256,
  normalizeDigest,
  verifyChecksum,
} from './integrity';

export { decideAll, decideUpdate } from './decision';
