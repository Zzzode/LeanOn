import { mergeCollection } from './merge';
import type { ChangeBatch, PeerVector, RecordEnvelope } from './types';

/**
 * Select local records the peer is missing or has at an older state. Used to
 * build an outgoing change set; idempotent and safe to recompute.
 */
export function selectOutgoing<T>(
  local: Array<RecordEnvelope<T>>,
  peer: PeerVector,
): Array<RecordEnvelope<T>> {
  return local.filter((record) => {
    const known = peer[record.id];
    if (known === undefined) {
      return true; // peer has never seen this record
    }
    const peerIsCurrent =
      known.deleted === record.deleted &&
      Date.parse(known.updatedAt) >= Date.parse(record.updatedAt);
    return !peerIsCurrent;
  });
}

/** Merge an incoming change batch into a local collection. */
export function applyBatch<T>(
  local: Array<RecordEnvelope<T>>,
  batch: ChangeBatch,
): Array<RecordEnvelope<T>> {
  return mergeCollection(local, batch.records as Array<RecordEnvelope<T>>);
}
