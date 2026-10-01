# @zzzode/data

English · [简体中文](README.zh-CN.md)

Versioned schema, deterministic merge/sync and encrypted-storage contracts for LeanOn. It is pure
TypeScript with no crypto, network or filesystem code; platform Keychain/Keystore and the sync
relay are injected ports.

## Pieces

- **Envelope & entities** — every record carries id, owner, kind, schema version, timestamps,
  device id and a deletion flag; logs are immutable, derived values are recomputed by core.
- **Migrations** — `Migrator` applies a pure version-to-version chain; `migrateEnvelope` updates a
  record.
- **Merge** — tombstones win, otherwise last-write-wins by `updatedAt` with `deviceId`
  tie-break; `mergeCollection` resolves grouped records.
- **Sync** — `selectOutgoing` computes changes from a peer vector; `applyBatch` merges an
  end-to-end encrypted change batch.
- **Privacy** — data is private by default; sharing is per category and opt-in.
- **CipherPort** — encrypt/decrypt and wrapped data-key contracts implemented by the hosts.

## Usage

```ts
import {
  applyBatch,
  defaultShareSettings,
  mergeCollection,
  Migrator,
  selectOutgoing,
  type RecordEnvelope,
} from '@zzzode/data';

// Schema upgrades
const migrator = new Migrator().add({
  from: 1,
  to: 2,
  migrate: (d) => ({ ...(d as Record<string, unknown>), upgraded: true }),
});

// Merge remote state and compute what to send back
const merged = mergeCollection(localRecords, remoteRecords);
const outgoing = selectOutgoing(merged, peerVector);

// Sharing is off unless a category is explicitly enabled
const sharing = defaultShareSettings();
```

## Related

- RFC 0008 data model, encrypted storage and sync; RFC 0005 bridge (`storage.*`); RFC 0006 native
  secure hardware; RFC 0004 core recomputation.
