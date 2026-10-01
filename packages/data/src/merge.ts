import type { RecordEnvelope } from './types';

/** Raised when records that cannot be merged are combined. */
export class MergeError extends Error {}

/** True when `candidate` is a later write than `other`, using deviceId as tie-break. */
export function isNewerThan<T>(
  candidate: RecordEnvelope<T>,
  other: RecordEnvelope<T>,
): boolean {
  const c = Date.parse(candidate.updatedAt);
  const o = Date.parse(other.updatedAt);
  if (c !== o) {
    return c > o;
  }
  return candidate.deviceId > other.deviceId;
}

/**
 * Merge two versions of the same record.
 * - A tombstone always wins over a live record (deletion is authoritative).
 * - Otherwise the later `updatedAt` wins, with `deviceId` as stable tie-break.
 */
export function mergeEnvelope<T>(
  a: RecordEnvelope<T>,
  b: RecordEnvelope<T>,
): RecordEnvelope<T> {
  if (a.id !== b.id) {
    throw new MergeError('cannot merge records with different ids');
  }
  if (a.deleted !== b.deleted) {
    return a.deleted ? a : b;
  }
  return isNewerThan(a, b) ? a : b;
}

/** Merge two collections, resolving records grouped by id. */
export function mergeCollection<T>(
  local: Array<RecordEnvelope<T>>,
  remote: Array<RecordEnvelope<T>>,
): Array<RecordEnvelope<T>> {
  const byId = new Map<string, RecordEnvelope<T>>();
  for (const record of [...local, ...remote]) {
    const existing = byId.get(record.id);
    byId.set(record.id, existing === undefined ? record : mergeEnvelope(existing, record));
  }
  return [...byId.values()];
}
