import type { IntegrityResult } from './types';

const HEX_SHA256 = /^[0-9a-f]{64}$/;

/** True for a lowercase 64-character hex SHA-256 string. */
export function isHexSha256(value: string): boolean {
  return HEX_SHA256.test(value);
}

/** Normalize a hex digest for comparison (trim, lowercase). */
export function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Compare an expected digest with the actual computed digest. Hashing itself is
 * performed by the host (platform crypto); this only compares two values.
 */
export function verifyChecksum(expectedSha: string, actualSha: string): boolean {
  return normalizeDigest(expectedSha) === normalizeDigest(actualSha);
}

/**
 * Combine checksum and signature outcomes. Signature verification is a host
 * port; pass its result in.
 */
export function evaluateIntegrity(checksumOk: boolean, signatureOk: boolean): IntegrityResult {
  if (!checksumOk) {
    return { ok: false, reason: 'checksum_mismatch' };
  }
  if (!signatureOk) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}
