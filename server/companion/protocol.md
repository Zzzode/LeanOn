# Companion local relay protocol v1

English · [简体中文](protocol.zh-CN.md)

This is a real local HTTP relay, not a production identity provider.
Default bind is `127.0.0.1:8787`; Android emulator uses `http://10.0.2.2:8787`, iOS simulator uses `http://127.0.0.1:8787`.
Use HTTPS and an independently reviewed deployment before any nonlocal use.
All request/response bodies are JSON; errors are `{error:{code,message}}` with appropriate HTTP status.
Authenticated routes use `Authorization: Bearer <token>`.
Live sessions are capped at 1,000 total and 32 per account (429 `session_capacity`); expiration is pruned before issuing each new token.
Tokens expire after 30 minutes, live only in server memory and are invalid after restart/logout/delete.

## Frozen DTOs and endpoints

`Ciphertext = {algorithm:"AES-256-GCM",nonce:string,ciphertext:string,tag:string}`; all three binary fields are canonical base64 (12-byte nonce, 16-byte tag).
A single ciphertext payload is limited to 64 MiB decoded; a HTTP request body is limited to 96 MiB (base64 overhead included).
Photo blobs must be actually encrypted, not replaced with success-only metadata; large-batch clients must respect these limits.
Only routing metadata is plaintext; health, photos, profile content and encouragement are ciphertext.
Do not put names, health values or message text into record IDs/categories.
IDs are ASCII `[A-Za-z0-9_-]{1,128}`.

| Request | JSON body | Response |
|---|---|---|
| POST /v1/accounts | `{login,password,deviceId,deviceProof}` | `{accountId,deviceId,token,expiresAt,vaultId,deviceAuthorized:true}` |
| POST /v1/sessions | `{login,password,deviceId,deviceProof}` | same session DTO; a new device is unauthorized for vault/family until paired |
| DELETE /v1/sessions/current | none | `{ok:true}` |
| GET /v1/me | none | `{accountId,deviceId,deviceAuthorized,vaultId,family:Group|null,invites:Invite[]}` |
| DELETE /v1/accounts/current | `{password,operationId,proof}` | `AccountDeletionReceipt`; authorized device/password; atomic purge plus durable receipt |
| POST /v1/account-deletions/:operationId/receipt | `{proof}` | `AccountDeletionReceipt`; no session; durable transaction barrier |
| POST /v1/account-deletions/:operationId/ack | `{proof}` | `{version:1,operationId,status:"acknowledged"}`; removes receipt after native completion |
| POST /v1/invites | `{id,kind:"family"|"device",proofHash,wrappedKey:Ciphertext,expiresInSeconds?}` | `Invite`; max lifetime 600 seconds |
| GET /v1/invites/:id | none | `Invite`; visible only creator or after correct acceptance proof |
| POST /v1/invites/:id/accept | `{proof}` | `Invite` with status `pending`; no content access yet |
| POST /v1/invites/:id/confirm | none | `{invite:Invite,group:Group}`; creator explicitly approves recipient/device |
| DELETE /v1/invites/:id | none | `{ok:true}`; creator or pending recipient cancels |
| PUT /v1/groups/:id/grants | `{epoch,recipientId,categories:string[]}` | `Group`; only caller's directional grant changes; empty default |
| DELETE /v1/groups/:id | `{epoch}` | `{ok:true,epoch}`; unlink revokes access and purges all group ciphertext/invites |
| POST /v1/groups/:id/sync | `{epoch,cursor:number,changes:Change[],acks:string[]}` | `{epoch,cursor,group:Group,changes:StoredChange[],receipts:Receipt[]}` |

`Group = {id,kind:"vault"|"family",members:string[],epoch:number,grants:Record<senderId,Record<recipientId,string[]>>}`.
`Invite = {id,kind,creatorId,creatorDeviceId,recipientId:string|null,recipientDeviceId:string|null,status:"open"|"pending"|"accepted"|"cancelled",expiresAt:number,wrappedKey:Ciphertext,groupId:string}`.
`Change = {id,recordId,category,kind:"record"|"encouragement",updatedAt:number,deleted:boolean,payload:Ciphertext}`.
`StoredChange = Change & {ownerId,deviceId,sequence:number}`.
`Receipt = {id,recipientId,acknowledgedAt:number}`.
`group` in each sync response is the same transaction snapshot used to filter changes; clients must apply its grants to purge cached revoked peer categories before showing the response.
Results paginate at 100 records or 95 MiB encoded, whichever comes first; continue with the returned cursor until it stops advancing.
`cursor` is the highest scanned server sequence; clients MUST persist received changes before ACK, and persist the returned cursor in the same local transaction.
The receiving device must have fetched an encouragement in an earlier request before its ACK is accepted.
For encouragement, UI may show "delivered" ONLY after recipient's explicit ACK appears in receipts; HTTP enqueue success means queued.
Server cannot prove the client persisted before ACK; native implementation must enforce that order.

## Key exchange and privacy

Creator generates a random 32-byte group/vault key and a separate random 32-byte inviteSecret locally.
The shareable invitation contains `{id,inviteSecret}` and is never sent to the relay.
Derive 32-byte proof via HKDF-SHA256(secret, salt=UTF8(id), info=UTF8("leanon-invite-proof-v1")); send SHA256(proof) hex as proofHash at creation.
Derive 32-byte wrapping key via HKDF-SHA256(secret, salt=UTF8(id), info=UTF8("leanon-invite-wrap-v1")); AES-256-GCM wrap the raw 32-byte group key with AAD UTF8(id), not its base64 textual encoding.
Accept sends base64 proof, not inviteSecret; its disclosure cannot derive the separate wrapping key.
The creator must verify the intended recipient/device before confirmation; invite possession alone is insufficient to activate membership.
Family creator's create action and explicit confirmation plus recipient acceptance provide mutual consent.
Each native device generates and securely stores its own random 32-byte deviceProof (base64), independent of all E2EE keys.
Register/login sends deviceProof; the relay stores only SHA256(deviceProof), and a known device ID with a wrong proof is rejected 401.
Pending sessions bind their exact proof hash; device invite acceptance captures that hash and confirmation authorizes both ID and hash, so public IDs and passwords alone cannot impersonate an existing device.
Device invitations accept only the same account on a distinct currently unauthorized device; confirmation authorizes that device.
Payload AES-GCM AAD is UTF8 canonical JSON array `["leanon-change-v1",groupId,epoch,ownerId,deviceId,id,recordId,category,kind,updatedAt,deleted]` in precisely that order, no whitespace, standard JSON escaping, integer millisecond updatedAt and boolean deleted.
Server sequence is not part of AAD; clients verify metadata authenticity when decrypting.
Vault payloads use the vault key; family payloads must be separately encrypted under the family key.
Family grant categories are exactly `goal`, `progress_band`, `checkin_streak`, `meals`, `photos`, `menstrual`, `exact_weight`, `body_measurements`, `encouragement`.
Encouragement requires BOTH directional grants to include `encouragement`, protecting recipient opt-in; revoking either side purges stored encouragement ciphertext.
Other family categories are opt-in and directional; revoked categories purge the sender/category ciphertext so old cursors cannot recover it from this relay.
Unlink purges group ciphertext, increments revocation epoch and requires a fresh invitation/key for any new family.
Already downloaded ciphertext/plaintext cannot be remotely erased; clients must delete cached family keys/content on revocation.

## Recoverable account deletion

`AccountDeletionReceipt = {version:1,operationId,accountId,status:"deleted",deletedAt:number}`; deletedAt is an integer millisecond timestamp within the JavaScript safe range.
Before deletion HTTP, native clients persist an encrypted prepared intent with a random operation ID and independent random 32-byte canonical base64 proof.
The relay retains only SHA256 of UTF8 compact JSON `["leanon-account-deletion-v1",operationId,accountId,proof]`, never the capability proof itself.
Account purge and receipt creation commit together; the session, device proof and password verifier are revalidated inside that transaction.
Receipt probes use the serialized durability barrier, including after post-rename directory-fsync failure.
An absent receipt or incorrect proof returns generic 404 `deletion_not_found`; 401, 404 and network errors never prove deletion.
Operation collisions return 409; receipt capacity is 10,000 with no TTL, and capacity rejection precedes purge.
Re-registering the same login creates a new account ID without changing an earlier receipt.
Clients strictly verify receipt fields against the persisted intent and preserve the same operation/proof across explicit password retries.
Prepared intents without confirmation remain pending; passwords are neither persisted nor automatically resubmitted.
ACK retry returning `deletion_not_found` is accepted only after durable native `local-complete`, never as authorization for another local wipe.
See [native recovery and CAS rules](native-interop.md#account-deletion-recovery).

## Conflict and durability rules

Changes are idempotent by globally unique `(group, id)`; an exact replay returns success, differing content under the same id returns 409.
Record conflict order: tombstones dominate live records; otherwise larger updatedAt wins, then lexicographically larger deviceId, then change id.
The relay only compares metadata, never decrypts content or performs nutrition calculations.
Sync requires current epoch; stale epoch returns 409; removed membership returns 403/404.
A single serialized transaction queue atomically persists state using fsync + rename before returning success.
A failure before rename leaves live state unchanged; rename is the commit point, after which memory follows disk.
If directory fsync fails after commit, the service returns 503 `durability_uncertain_retry_same_ids`; retry the same IDs, never invent a replacement operation.
Only latest winning record payload is retained, while change IDs retain digests for replay protection.
One process owns each state file through a PID lease; active-process collisions are rejected, and stale crash leases are reclaimed.
Malformed nested persisted schemas are rejected before listening.
The state file uses mode 0600 and directory 0700; no logs include passwords, tokens, secrets or payloads.

## Local QA capacity

The relay accepts at most 8 simultaneous requests, with at most one body larger than 1 MiB or chunked request; slots remain held through processing and response completion even if the client disconnects.
Requests are capped at 96 MiB, persisted state at 128 MiB, accounts at 100, invitations at 500, devices at 32/account, live records at 1,000/group and replay IDs at 10,000/group.
Capacity failures are explicit 413/409/429, never fake successes; sync responses paginate so a bounded batch does not skip visible records.
These local limits bound accepted workloads; production streaming, abuse defense, audit and deployment remain separate work.

## Crypto references and scope

Use platform crypto rather than custom primitives: [Node crypto (scrypt, timingSafeEqual, AES-GCM)](https://nodejs.org/download/release/v22.15.0/docs/api/crypto.html), [HKDF RFC 5869](https://www.rfc-editor.org/rfc/rfc5869).
The local password flow has no email verification, recovery, production abuse protection or cloud deployment.
Those are separate production decisions, not fake completed features.
