/**
 * Deterministic staged rollout using FNV-1a hashing. The same (user, bundle)
 * pair always maps to the same 0..99 bucket; different pairs spread across the
 * range, so a percentage rollout selects a stable subset of users.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const BUCKETS = 100;

/** 32-bit FNV-1a hash of a UTF-16 string. */
export function fnv1aHash(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Convert to unsigned 32-bit.
  return hash >>> 0;
}

/** Stable bucket in the range 0..99 for a user and bundle id. */
export function rolloutBucket(userId: string, bundleId: string): number {
  return fnv1aHash(`${userId}::${bundleId}`) % BUCKETS;
}

/** Clamp a rollout percentage to the valid 0..100 range. */
export function normalizePercentage(percentage: number | undefined): number {
  if (percentage === undefined) {
    return 100;
  }
  if (percentage <= 0) {
    return 0;
  }
  if (percentage >= 100) {
    return 100;
  }
  return Math.floor(percentage);
}

/** True when the user is within the rollout for the bundle. */
export function isInRollout(userId: string, bundleId: string, percentage: number | undefined): boolean {
  return rolloutBucket(userId, bundleId) < normalizePercentage(percentage);
}
