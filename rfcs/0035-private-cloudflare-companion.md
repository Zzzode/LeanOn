- Start Date: 2026-10-07
- RFC Type: architecture
- Status: Proposed — local implementation authorized, deployment not authorized
- Related: 0034

# Private Cloudflare companion relay

English · [简体中文](0035-private-cloudflare-companion.zh-CN.md)

## Summary

Add a separate Worker API backed by normalized D1 rows and a private R2 bucket for independently encrypted photos, limited to two explicitly admitted people.
Keep the local file relay for protocol regression and offline development.

## Motivation

The file relay's whole-state JSON, filesystem lease and in-memory sessions do not provide the Worker persistence or concurrency model.
Photo bytes inside aggregate ciphertext also exceed useful D1 row and request budgets.
The first deployment serves only the owner and their partner; public registration is forbidden by default.

## Guide-level explanation

An operator provisions two expiring, login-bound admission slots without storing raw admission tokens.
Registration atomically consumes one slot; ordinary family and device invitations still require creator confirmation and cannot admit another person.
Sessions survive Worker restarts, store only token hashes, expire after 30 minutes and stop working immediately after logout/account revocation.
Native clients negotiate the new photo protocol; the existing local relay keeps its original protocol.
No health key is supplied to the Worker.

## Reference-level explanation

- Use a new `server/companion-worker` package, compatibility date `2026-10-07`, official Wrangler/Miniflare local runtime and strict TypeScript.
- Normalize accounts, devices, sessions, two admission slots, groups/membership/grants, invites, current records, replay/nonce/delivery ledgers, photo reservations/references and deletion jobs in D1.
- Read the database revision before authorization/state reads; mutations use a guarded D1 batch whose failed compare-and-swap rolls back the entire batch.
- Offline imports use at most 32 data statements per transaction with a persisted checkpoint and an HTTP/cron maintenance gate.
  Interrupted restore resumes only from the same authenticated input.
- Bound control bodies, sync batches, individual small ciphertexts, object sizes and cleanup work; reject excess before writes.
- Use versioned scrypt verifiers with `N=16384,r=8,p=5`, 16-byte random salt and 64-byte output.
  Verify imported `p=1` only for compatibility and upgrade after successful authentication; never create new weak verifiers.
  A persisted expiring lease serializes password authentication across isolates; per-login and global attempt budgets also persist.
  The selected combination is listed by [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Native photos use separate HKDF-derived object keys, random 12-byte AES-GCM nonces and domain-separated AAD binding group, epoch, owner, device and opaque object ID.
  Authenticated small manifests bind all object references; upload replay permits only identical ciphertext/digest.
- R2 is private, accessed only through authenticated Worker routes, with no public URLs or cacheable responses.
- Reserve an opaque object ID in D1 before R2 upload, then commit its ready state; unreferenced reservations expire into durable cleanup tasks.
- Uploads create immutable R2 objects using a conditional put.
  Revocation replaces their ciphertext with a zero-byte fence at the same key, preventing an in-flight conditional upload from recreating removed bytes.
  Fences retain only opaque routing metadata and must not be removed by an object lifecycle rule.
- Account deletion first commits session/membership revocation and a proof-hash job in D1, then fences objects in bounded work.
  A receipt remains unavailable until every ciphertext cleanup has completed; only then return the existing strict `deleted` receipt and permit ACK.
  The same Worker's scheduled handler resumes jobs; failed R2/D1 operations retain recoverable work.
- Backup authenticates the D1/index/R2 inventory under an independent operator backup key.
  Restore requires an authoritative current deletion floor, preserves fences/revocations, rejects missing/tampered objects and never restores live sessions.
  Client-held E2EE keys remain in the native companion store/keyring; a server backup/password alone cannot recover them.
  The existing portable health backup restores its own snapshot without exporting companion keys; total device loss requires a chosen fresh-key/re-pairing reset policy or separately reviewed companion-key recovery before production.

- Stage legacy aggregate migration as identities/grants plus incremented epochs and pending jobs, leaving old ciphertext and source collections intact.
  Native clients reuse the existing encrypted health backup, rotate operation-bound keys and republish independent objects into a separate empty collection.
  Persist an encrypted phase journal, retry identical ciphertext and mark complete only after server reference checks.
  The local two-platform drill verifies full health recovery on a newly approved device after an interrupted photo-upload response.

## Authorized product migration entry

Expose native preview, prepare, resume, pause and rollback actions from Settings using the existing theme/workflow components.
Bind review consent to a persistent target service identity, authenticated retained account/device IDs, migration operation, local revisions and an expiring preview token.
Keep passwords ephemeral; retain the source snapshot in the existing encrypted backup and device-bound phase journal.
Republish in a separate encrypted target collection, then use the existing native transaction authority and per-entity merge to adopt the target companion state with local records.
The original service state stays in the encrypted journal; rollback retains current local health data and restores that source connection, without deleting the target.
Cancellation pauses at a safe checkpoint before activation; startup never automatically resumes uploads.
A dry-run operator tool validates legacy input and target identity and emits a configuration/operation plan; it has no remote-write or provider-login path.
This scope uses existing authorized devices/health backups and introduces no total-device-loss recovery policy.

## Drawbacks

D1 and R2 are not one transaction; durable reservations, fences and cleanup jobs add state and retention rules.
Zero-byte fences deliberately remain after ciphertext removal.
Password hashing is expected to exceed the Workers Free 10 ms CPU budget; local workerd timing cannot prove remote feasibility.
Deployment therefore needs a separately approved safe CPU budget or identity-provider design, not weakened password hashing.
The authoritative deletion floor must survive backup retention and restore decisions.

## Rationale and alternatives

Use guarded normalized batches rather than copying the file state into one D1 JSON row.
Keep one Worker and its scheduled handler rather than introducing an unrelated queue/service for a two-person product.
Simple R2 delete plus an expiring lease cannot prevent a delayed upload from recreating ciphertext; immutable uploads and persistent zero-byte fences provide the required ordering.
Public registration, public R2 access and silent fallback to a weaker verifier are rejected.
See [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [R2 conditional writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) and [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).

## Unresolved questions

Remote CPU/memory/latency, region, billing permission, operator backup destination and production admission provisioning require deployment decisions and remote acceptance.
This RFC does not authorize provider login, paid resources, real data, deployment, commit or push.

## Implementation plan

1. Schema, persistent authentication/admission and guarded concurrency, with regression against the file relay.
2. Private object protocol and bounded sync; update both native hosts, preserving explicit local-data attachment.
3. Durable deletion/revocation and scheduled recovery, fault/concurrency tests in official local workerd.
4. Synthetic migration and authenticated backup/restore drill; dual-native compatibility, measured local performance and scoped evidence.
