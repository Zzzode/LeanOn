- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0005, 0006, 0007

# Data Model, Encrypted Storage and Sync

English · [简体中文](0008-data-model-encrypted-storage-sync.zh-CN.md)

## Summary

Define how LeanOn data is structured, protected and shared:

- A versioned entity model with a common record envelope (identity, timestamps, tombstones)
- At-rest encryption backed by iOS Keychain / Android Keystore, behind the `storage.*` module
- End-to-end encrypted sync for a two-person family group; the server sees only ciphertext
- Deterministic conflict resolution (append-only logs, last-write-wins for mutable state,
  union + tombstones for sets)
- Granular, opt-in privacy boundaries: each person's data is private by default

Schema, migrations and merge/sync decisions are pure TypeScript in a new `@zzzode/data` package;
platform crypto and the network are injected ports.

## Motivation

- Health data (weight, meals, photos, menstrual data) is highly sensitive; it must be encrypted on
  disk and never exposed to the server or a partner without an explicit choice.
- Two people on multiple devices need consistent data without a trusted server.
- Conflicts are inevitable offline; resolution must be deterministic and testable, and deletions
  must replicate (tombstones).
- Couples' health products must avoid blame/pressure: sharing is a per-category choice, never a
  shared "calorie pool" or accountability by guilt.

## Guide-level explanation

- Every record is an envelope with a stable id, owner, timestamps, schema version and a deletion
  flag. Logs are append-only; mutable state is small and versioned.
- The device stores encrypted collections. A key in the secure hardware protects a data key that
  encrypts records.
- A family group is an end-to-end encrypted channel. Members exchange ciphertext; the server only
  relays it and tracks per-device cursors.
- On sync, immutable entries merge by id, mutable fields take the latest write, and sets union
  with tombstones. Day totals are always recomputed from entries, never merged as values.
- Each person chooses what to share (e.g. goal and check-in streak) per category; meals, photos,
  menstrual data and exact weight are private unless explicitly shared.

## Reference-level explanation

### Record envelope and identity

```ts
interface RecordEnvelope<T> {
  id: string;            // stable UUID, assigned at creation
  ownerId: string;       // person who owns the record
  schemaVersion: number; // entity schema version
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601; drives last-write-wins
  deviceId: string;      // tie-breaker for identical updatedAt
  deleted: boolean;      // tombstone
  data: T;               // entity payload
}
```

### Entities and schema versioning

Core entities: `Profile`, `WeightLog`, `MealEntry` (with `FoodItem`s and an AI-guess state),
`ActivityEntry`, `MenstrualLog`, `GoalState`, `Settings`, `FamilyGroup`.

- Each entity has an integer schema version. A migration chain maps each version to the next;
  databases record the current version and migrations are pure, total functions.
- Logs (`WeightLog`, `MealEntry`, `ActivityEntry`, `MenstrualLog`) are immutable after creation
  except for soft delete; derived values (day totals, trends) are recomputed by `@zzzode/core`, never
  stored as authoritative.

### Local encrypted storage and key hierarchy

- Collections are stored encrypted at rest behind `storage.get/set/remove`.
- Key hierarchy: a hardware-backed key (Keychain/Keystore) wraps a random data-encryption key
  (DEK); the DEK encrypts record bytes. The wrapped DEK is stored with the data; the unwrapping key
  never leaves the secure boundary.
- Crypto is a `CipherPort` (encrypt/decrypt, key generation/wrap); implementations use platform
  APIs. The data package defines the types and the envelope serialization, not the primitives.
- Encrypted, user-controlled export/import is supported; local data can be fully erased.

### End-to-end encrypted family sync

- A family group has a group key known only to member devices; adding/removing members rotates or
  re-wraps the key. Per-member or sender keys allow future members to be added without trusting the
  server.
- The sync protocol exchanges encrypted change batches with a per-device cursor; operations are
  idempotent by record id and tombstones replicate deletions.
- The server is untrusted and dumb: store ciphertext, deliver batches, track cursors. It cannot read
  records or metadata beyond what is needed to route.

### Conflict resolution (deterministic)

- Immutable logs: union by `id`; identical id keeps one copy; a tombstone wins over a live entry.
- Mutable state (`Profile`, `GoalState`, `Settings`): last-write-wins comparing `updatedAt`, with
  `deviceId` as a stable tie-breaker.
- Sets (custom `FoodItem` library): union members, apply tombstones.
- Never merge derived aggregates; recompute them from merged entries via `@zzzode/core`.
- `mergeRecord` and `mergeCollection` are pure functions and are unit-tested.

### Privacy boundaries

- Data is private by default. Sharing is per category and direction (one-way or mutual): suggested
  shared items are goal, progress band and check-in streak.
- Suggested private-by-default: individual meals, photos, menstrual data, exact weight, AI guesses.
- No shared budget that deducts one person's eating from another, no leaderboard that shames;
  encouragement is opt-in and non-numeric where requested.

### Export, retention and deletion

- Users can export their own data (machine-readable) and delete their account, which replicates
  tombstones and removes server ciphertext.
- Retention is minimal; photos and AI payloads follow separate, disclosed policies.

## Drawbacks

- E2EE complicates backup, key recovery and adding new devices; a lost key can mean lost data.
- Tombstones and keeping last-good copies add storage; LWW can lose concurrent edits to mutable
  state (acceptable for this domain).
- The dumb server cannot provide server-side analytics or web recovery of plaintext.

## Rationale and alternatives

- **Trust the server with plaintext (e.g. plain Firebase/Supabase)**: easier but exposes health
  data and weakens partner-privacy guarantees; rejected in favour of E2EE.
- **Full CRDTs**: powerful but heavy for append-only logs plus a few mutable documents; targeted
  rules (union/LWW/tombstone) suffice and are auditable.
- **SQLCipher-style encrypted SQL versus encrypted document collections**: either can back the
  CipherPort; the data package stays agnostic, chosen per platform.
- **Default-on shared data for "accountability"**: increases pressure and risks disorder; rejected;
  sharing is granular and opt-in.

## Unresolved questions

- Concrete sync backend (self-hosted relay vs managed service) and its auth model.
- Key backup/recovery and group-key rotation UX; what happens when a device is lost.
- Exact encryption algorithms, AEAD and metadata-padding choices per platform.
- Whether photos sync at all, or remain device-local with only references.
- Migration of the native storage modules onto this schema.

## Implementation plan

- [x] Data model, storage and sync design (this RFC)
- [x] `@zzzode/data` package: envelope/entity types, migration framework, merge/collection
      resolution, sync change-set planning, cipher port types, Rstest suite
- [ ] Platform CipherPort implementations (Keychain/Keystore) and encrypted collections
- [ ] Sync relay and end-to-end key exchange
- [ ] Privacy/share settings UI and account export/delete

## References

- RFC 0005 (`storage.*`), RFC 0006 native modules and secure hardware, RFC 0007 delivery.
- End-to-end encryption patterns (group/sender keys), tombstone-based sync, last-write-wins and
  set-union conflict resolution.
