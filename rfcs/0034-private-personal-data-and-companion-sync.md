- Start Date: 2026-10-07
- RFC Type: feature
- Status: Proposed
- Related: 0008, 0031, 0032, 0033

# Private personal data and companion sync

English · [简体中文](0034-private-personal-data-and-companion-sync.zh-CN.md)

## Decision

Complete the remaining personal and two-person workflows under explicit working-tree authorization.
This RFC remains Proposed; no commit, publication or production deployment is authorized.
Preserve the design language and approved bottom tabs.
Keep health data private by default with independent directional grants and no shared calorie budget.

## Storage and backup

Keep records schema 2 and a separate version-1 personal collection with revision checks and durable receipts.
Preferences are not allergy clearance; missing measurements stay unknown, without diagnostic inference.
Native imports explicitly selected images by redrawing sanitized JPEG derivatives, stored atomically with metadata in one authenticated collection.
AES-256-GCM protects records and personal data; Keychain/Keystore protect native keys.
Read legacy plaintext compatibly, then encrypt only on the next explicit write.
Do not inspect or migrate formal-app records during QA.

Backups contain records, custom foods, favorites/recent foods, personal data and actual stored photo derivatives, excluding all credentials and keys.
The flat version-1 envelope uses PBKDF2-HMAC-SHA256 (600000 iterations), random salt (16 bytes), AES-256-GCM nonce (12 bytes) and exact UTF-8 AAD `LeanOn backup v1`.
Passwords use exact unnormalized UTF-8 (12–1024 bytes).
Limits: serialized envelope file 64 MiB, single photo 20 MiB, total photo bytes 32 MiB, 1000 photos.
Authenticate before parsing and validate the whole snapshot before writing, preserving existing valid historical semantics.
Inspection issues a five-minute native token bound to both current revisions.
Restore checks revisions, uses a durable recovery/rollback journal and advances revisions beyond old and imported values.
Picker cancellation is distinct; opening a share interface is not proof of a completed file write.

### Native preview rendering

An image accessibility node or successful preview URI is not proof of displayed pixels.
The iOS host uses a dedicated Lynx image fetcher backed only by approved own/partner preview capabilities.
The Android host uses the matching Lynx3.9 image service and Fresco2.3 with native request authorization; the SDK image dependency is needed to render actual JPEG previews.
Do not expose a general network, content-provider or arbitrary-file image loader to page bundles.
Validate issued capability, canonical cache child, absence of symlinks, digest, foreground state and current scope generation before decoding or delivering.
Disable secondary disk caching and invalidate decoded memory on background, deletion, grant revocation and scope changes.
Revoke in-memory capabilities before fallible file cleanup; cleanup failure cannot preserve image authorization.
Actual native pixel checks must accompany metadata, encrypted-byte, URI and accessibility assertions.

## Accounts and encrypted sync

Use a real local Node HTTP/crypto/filesystem relay, without selecting a production provider.
Store scrypt password verifiers and encrypted payloads with routing metadata, never health plaintext/group keys.
Sessions expire after 30 minutes and are not persisted by the server.
Random native-only device possession proofs prevent a public device ID from authorizing access.
New devices require existing-device confirmation of the exact invitation recipient/proof.
Client-only invitation secrets use separate HKDF-SHA256 proof and wrapping contexts; the relay never receives the secret or wrapping key.
Acceptance is pending; creator confirmation establishes a family of at most two accounts.
All categories start disabled: goal, progress band, streak, meals, photos, menstrual data, exact weight, measurements and encouragement.
Health sharing is directional; encouragement requires both people to opt in.

Vault sync includes real encrypted photo bytes; partner images require current relationship/grants and native encrypted cache.
Payload AAD is exact compact UTF-8 JSON of `["leanon-change-v1",groupId,epoch,ownerId,deviceId,id,recordId,category,kind,updatedAt,deleted]`.
Use idempotency, tombstones, deterministic conflicts and durable cursors.
Native persists received data/cursor before ACK; only recipient ACK means delivered.
Merge snapshots by entity identity and individual clocks, retaining concurrent additions and recomputing derived nutrition.
An exact recorded undo causally restores its deletion token; other tombstones remain authoritative.
Logging in never attaches device-local records: a named-account preview and explicit revision-checked import consent are required.
Bind local attachment and retained vault keys to endpoint realm plus account; changing endpoint requires fresh consent.
Intersect relay grants with this device's durable explicit consent before exporting health content.
Default empty values on a new device must not erase already configured account data.
Refresh grants and purge revoked caches; unlink clears server ciphertext, peer caches and family keys.
Revocation cannot erase previously retained copies.
Account deletion requires password and an explicit retain/delete-local choice; always remove auth material and peer caches.

### Recoverable account deletion

Persist an encrypted deletion intent before issuing HTTP, retaining the exact endpoint/account, local-data choice and both initial revisions.
Do not persist the password or expose the independent 32-byte deletion proof to Lynx, events or backups.
The relay atomically purges the account and creates a bounded receipt authenticated by a domain-separated hash of operation ID, account ID and proof.
Receipt lookup works after session revocation and repeats the file durability barrier before returning success.
A missing receipt, expired session, HTTP failure or unknown result never confirms deletion.
An explicit password retry preserves the same operation and checks the account identity after fresh authentication.

After a matching durable receipt, clear auth and peer state before fallible cleanup.
Commit records/personal deletion and the companion localDataCleared marker through the existing multi-store journal with both initial revisions.
Changed local data requires a new explicit choice and current-revision consent; it cannot be silently erased during recovery.
Once localDataCleared is durable, retries never repeat the wipe.
If new files exist after a wrapping-key cleanup failure, preserve them and their keys, fail closed and keep recovery pending.
Persist local-complete before acknowledging the relay receipt; a lost acknowledgment response then cannot repeat deletion.
Unresolved deletion intents block other companion operations.

### Bounded photo pages

Mount at most four own or shared photos per page, with localized navigation and page count.
Unmount old readers on page changes and reject their late results.
The 1000-photo storage quota is independent from the mounted-image memory budget; actual native resource acceptance remains required.

## Acceptance

Verify shared contracts, native encryption/tamper rejection, atomic recovery, actual HTTP authorization and isolated two-native exchange.
Record source/bundle hashes and actual native screenshots with device, locale and appearance.
Small screens, text scaling, screen readers, midnight/timezone and lifecycle have separate results.
Do not approve OS camera, Health, Bluetooth, notification or photo-library permissions in QA.
Physical hardware, actual permission-dependent delivery, signed device releases and production deployment remain separate acceptance.
Provider choice, recovery, external abuse protection and streaming large payloads remain operational decisions.
See [protocol](../server/companion/protocol.md) and [execution checklist](../docs/full-product-2026-10-07/plan.md).

## Native store keys across container relocation

Native role identities are stable logical Keychain accounts, independent of absolute sandbox paths.
An established ciphertext authenticates its exact stable key, or exactly one bounded legacy alias under the same app service and role.
Migration copies the same32-byte DEK with insert-if-absent semantics; it does not re-encrypt data, overwrite a stable alias, discard ciphertext or remove the old alias.
Startup and foreground recovery authenticate all current files and journal before-images, require the same DEK for each role, promote authenticated keys, then mutate recovery files.
Missing/plaintext files do not provision credentials during reads; locked, corrupt, ambiguous or copy-failed states remain unavailable with their data intact.
Local-complete deletion verifies absent role files have no unresolved key residue before ACK; recreated files and keys are preserved without another wipe.
An orphan legacy key without authenticating ciphertext remains recovery-required; the application does not guess its ownership or silently discard the intent.
Debug fixture-path overrides remain isolated and retain their explicit path-scoped identities.
