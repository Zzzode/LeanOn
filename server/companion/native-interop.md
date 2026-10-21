# Native companion interoperability

English · [简体中文](native-interop.zh-CN.md)

This document supplements [the relay protocol](protocol.md) with client-only encrypted content contracts.
The relay never decrypts these envelopes.
Local QA uses fictional accounts and generated/public photographs only.

## Encrypted plaintext contracts

| Category | Plaintext | Record identity |
|---|---|---|
| `vault` | `{version:1,kind:"vault-snapshot",payload:BackupPayloadDto,clocks,tombstones:{customFoods:string[]}}` | `vault-snapshot-<deviceId>` |
| `vault-keyring` | `{version:1,kind:"account-keyring",familyKeys:{[activeFamilyId]:base64Raw32}}` | `keyring-<deviceId>` |
| Family health category | `{version:1,kind:"family-category",category,data,photoBytes?}` | `category-<category>` |
| `encouragement` | `{version:1,kind:"encouragement",text,createdAt}` | Random opaque ID |

Vault and keyring ciphertext use the account vault key; family categories and encouragement use the separate family key.
Photograph payloads contain actual canonical sanitized JPEG bytes with matching metadata.
Foreign canonical JPEG bytes are validated and preserved exactly, rather than recompressed.
The account keyring carries only the currently active family ID, and is encrypted inside the private account vault.
Clients refuse to reinstall keys for a family they have observed revoked.
On active-family relogin, pull the existing private keyring before publishing; an absent in-memory key must never overwrite the sole stored keyring with an empty value.

## Ownership and consent

Registration and login never attach, upload or merge saved health data.
`attachLocalData` requires explicit consent and CAS against both current records and personal revisions.
Endpoint/account ownership and account keys are separately namespaced, so another account or relay cannot inherit the previous data attachment.
An unattached paired device can process its private keyring; it skips health snapshot decryption and merging.
Each device starts with empty outgoing sharing choices.
Actual exports use the intersection of that device's persisted explicit choices and the relay's current directional grants.
Revocation is saved locally and pending exports are removed before attempting the network request.
HTTP failures therefore cannot resume a locally revoked export.
Encouragement requires both parties' opt-in; incoming grant categories remain visible even when no health category is shared.
Offline logout clears local authentication, family keys, cached peer data and pending exports before attempting server revocation.
An unsuccessful revocation remains pending, and is retried or expires with the short server session.
Read-only state refresh can observe device approval; it does not attach or upload health data.
Authentication rejection and session expiry purge the local session and peer cache.
Identity, peer keys and cached data are durably revoked before fallible preview-file cleanup.
Failed preview cleanup remains pending and retries without restoring authorization.

## Account deletion recovery

Before HTTP, persist encrypted `pendingAccountDeletion` with version, operationId, proof, endpoint, accountId, displayName, exact normalized login, deleteLocalData, both expected revisions, phase and localDataCleared.
Phases are `prepared`, `confirmed` and `local-complete`; older private state without this optional field remains readable.
Proof and login never enter runtime DTOs, events, health backups, logs or diagnostic reports.
First preparation rejects unapproved devices; an intent-save failure sends no deletion HTTP.
Prepared recovery probes the fixed realm before session expiry; unrelated Companion mutations remain blocked.
Only explicit password retry obtains a fresh session and verifies the original account, device ID and authorization before resubmitting the same operation.
Legacy sessions without exact login fail closed and require fresh authentication before first preparation.
A matching durable receipt changes the intent to confirmed and revokes local identity, account/family keys and peer caches.
Local health deletion requires dual-revision CAS and one native journal transaction for records, personal data, health ledger and encrypted localDataCleared marker.
The marker publishes before fallible key cleanup; failures cannot replace it with old state.
Restart retries key cleanup only after the marker, never another store wipe.
If new record, personal or ledger files appeared, preserve their bytes/keys and return `account-deletion-key-cleanup-conflict` with localDataChanged=true.
Explicit fresh-CAS keep-local(false) may complete without deleting those new files/keys; true cannot authorize another wipe after the marker.
Pre-wipe revision changes also require explicit reconfirmation or keep-local.
Persist local-complete before ACK; lost ACK responses can be retried without authentication or another wipe.
Public runtime exposes only phase, accountId, displayName, deleteLocalData and localDataChanged.

## Merge and commit

The canonical algorithm is [`packages/data/src/vault-merge.ts`](../../packages/data/src/vault-merge.ts).
Entity clock keys are `profile`, `preferences`, `favorites`, `recent`, and `weight:`, `water:`, `exercise:`, `legacy-intake:`, `intake:`, `measurement:`, `photo:`, `custom-food:` followed by the entity ID.
Only a changed entity receives a new monotonic clock; first untouched empty defaults receive clock zero.
Rows merge independently; weight and water rows additionally resolve date identity after filtering deletion tombstones.
Delete tokens dominate live rows unless an exact causal restore receipt reverses that token.
Operation receipt collisions and conflicting content under one clock are rejected.
Photo metadata and bytes follow the same winning photo clock.
Both store revisions advance once when the merged payload changes.
Received payloads, clocks, cursors and pending ACKs commit through the native multi-store transaction authority before an ACK is sent.
A failed CAS or write cannot acknowledge delivery.
Sender delivery status comes from a matching recipient receipt; sender and recipient clocks may differ.

## Public evidence and boundaries

The shared [eight-case merge fixture](../../packages/data/src/fixtures/public-vault-merge-v1.json) covers offline additions, date identity, unrelated edits, deletion, causal undo, exact JPEG bytes, custom-food deletion and reused-clock rejection.
The [public crypto fixture](../../apps/android/app/src/test/resources/companion/public-companion-crypto-v1.json) uses synthetic keys to compare Node HKDF/AES-GCM output, raw-key wrapping, full metadata AAD and invitation encoding against Kotlin.
Never use its published keys for actual data.
The Android opt-in JVM HTTP integration requires a separately approved random-port loopback relay and disposable fictional accounts, with encrypted temporary files and a fixture host port.
That integration establishes real HTTP and crypto behavior, but does not establish Android Keystore, Bitmap decoding or production multi-store journal behavior.
The staged Android instrumentation separately uses real Keystore, Bitmap, RecordsRepository, PersonalRepository and BackupCoordinator in a cache-only fixture.
Its phases are `accept`, `sync`, `verify`, `revoked` and isolated `cleanup`, coordinated with iOS native tests.
Separate `deletion-fail` and `deletion-recover` phases test a real remote deletion followed by injected local cleanup failure and process-restart recovery.
Completed original A/B/C stages used the earlier post-response intent algorithm and do not establish execution coverage for the new pre-request intent/receipt protocol.
The new protocol has relay real-TCP and native pure fault/schema evidence; new native live deletion/restart acceptance remains pending separate execution approval.
Android's twelve scoped pure tests include eight Repository recovery cases using an injected memory transport and encrypted temporary files: committed DELETE response loss, expired-session reopening, ACK loss, confirmed-state write failure, changed-revision CAS, marker/key-cleanup retry, recreated ledger preservation, absent/mismatched receipts and incorrect-password rejection.
These tests execute the real Repository state machine, while fixture transactions and modeled relay responses do not establish HTTP, Android Keystore, real process death or the production three-store journal.
Separate BackupCoordinator authority tests cover stale CAS, committed marker before key failure, retry and preservation of recreated records/keys.
The restart check requires a force-stop and a different target process ID; reopening only a repository is insufficient evidence.
Staged checks count as passed only when their resulting device reports confirm success; compilation alone is not execution evidence.
Private credential handoff files have mode 0600 and must never enter logs, reports, screenshots or Library artifacts.
Native UI buttons, actual document/image pickers, health permissions and production identity/deployment require their own verification.

The relay remains bounded local QA: 64 MiB decoded ciphertext, 96 MiB HTTP and 128 MiB persisted state.
Native state and HTTP batches are also bounded, with explicit capacity failure rather than success-only metadata.
Multiple maximum-size photos across every device/family combination are not promised to fit these local limits.
