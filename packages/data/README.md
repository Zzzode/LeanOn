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

## Local personal data and portable backups

`PersonalStateDto` version 1 stores dietary preferences, body measurements and photo metadata independently of core's unchanged schema 2 records.
Personal writes use revision checks and durable operation receipts; identical retries replay before the revision check.
Dietary preferences preserve unknown JSON attributes, exclude credentials, and do not promise allergy safety or classify catalogue foods automatically.
Measurements require at least one value from 20–300 cm; trends sort by calendar date and leave missing measurements unknown.
Photo metadata describes an explicitly imported, sanitized JPEG derivative; file locations and encryption keys stay with the host.
Photo metadata edits retain the persisted image identity, MIME, dimensions and creation time.

`BackupPayloadDto` includes complete schema 2 records, custom foods, favorite/recent food IDs, personal state and the exact persisted JPEG bytes encoded as base64.
It never includes accounts, sessions, authentication tokens, device keys or operating-system permission state.
Existing same-day legacy nutrition aggregates remain separate and the derived daily totals are checked against their projection.
`preflightRestore` creates a detached validated restore plan and counts; it does not write any data.
The native host must recheck both current revisions, authenticate first, obtain explicit confirmation and atomically commit every store and photo file.
A pure preflight is not a substitute for native transaction/restart recovery.

Backup format 1 uses AES-256-GCM, a 12-byte nonce, 16-byte salt and PBKDF2-HMAC-SHA256 with exactly 600,000 iterations.
The ciphertext contains its 16-byte authentication tag, and the associated data is the exact UTF-8 string `LeanOn backup v1`.
Passphrases use their exact UTF-8 bytes without Unicode normalization, with a 12–1,024 byte limit.
The serialized envelope is limited to 64 MiB; individual JPEGs to 20 MiB, total JPEG bytes to 32 MiB and photo metadata to 1,000 entries.
Cryptography, secure randomness and JSON/UTF-8 codecs are injected ports; this package imports no platform or Node APIs.
`backup-crypto.test.ts` exercises the shared orchestration with actual Node PBKDF2 and AES-GCM, including authentication-before-decode failures.
The [PUBLIC interoperability fixture](src/fixtures/public-backup-v1.json) contains a generated, metadata-free 4×4 JPEG, exact plaintext bytes, fixed password/salt/nonce, expected derived key and SHA-256 hashes.
Its sibling [portable envelope](src/fixtures/public-backup-v1.envelope.json) is the exact backup file bytes for native import tests.
All fixture inputs are intentionally public and must never be reused for production encryption.
Regenerate after building data with `node packages/data/scripts/generate-public-backup-fixture.mjs` from the repository root (requires the root development dependency `sharp`).
The passphrase includes decomposed `e` + U+0301; use `passwordUtf8Hex` as the exact cross-platform input anchor rather than normalizing text.
Native tests must still exercise platform cryptography and confirm restore persistence independently.

## Companion contracts

`CompanionResponseDto` contains a credential-free UI state and explicit runtime state, including the trusted native clock and device authorization.
Invitations remain pending until the creator confirms the real recipient account and device IDs.
Messages become delivered only after the recipient has persisted them and returned a receipt.
Every sharing category, including body measurements and encouragement, is private by default.
Peer snapshot fields require their corresponding category grant; native and relay implementations enforce recipient grants and require mutual encouragement opt-in.
Encrypted photo bytes and own-device vault replication belong to native transport and storage; metadata alone does not constitute photo synchronization.

## Deterministic vault merging

`VaultSnapshotDto` carries the portable payload, per-entity clocks and custom-food tombstones.
`mergeVaultSnapshots` merges independent offline additions and resolves competing versions by timestamp, device ID and change ID.
Weights and water retain one winner per calendar date; record kinds have separate identity namespaces.
A matching restore receipt cancels its own deletion token without cancelling later deletions.
Reused clocks with different content fail validation instead of silently selecting a payload.
Photo metadata and exact JPEG bytes come from the same winning entity.
The [PUBLIC merge fixture](src/fixtures/public-vault-merge-v1.json) provides eight common native/TypeScript cases, including scalar clocks, causal undo and exact photo bytes.
Native adapters must additionally validate revisions and atomically persist all stores before advancing the sync cursor or acknowledging receipt.
