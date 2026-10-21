# Private Cloudflare relay — local implementation

English · [简体中文](README.zh-CN.md)

This separate backend runs in official local workerd with normalized D1 rows and a private R2 photo bucket.
Only two expiring, login-bound admission slots can create accounts; no public registration is enabled.
The existing `server/companion` file relay remains available for regression.
See [RFC 0035](../../rfcs/0035-private-cloudflare-companion.md) and the [verification report](../../docs/cloudflare-local-2026-10-07/report.md).

## Local commands

Use the repository's pinned pnpm 11.7.0 and Node >=22.13.
Run from the repository root:

```sh
pnpm --filter @zzzode/companion-worker build
pnpm --filter @zzzode/companion-worker typecheck
pnpm --filter @zzzode/companion-worker test
```

Run the following from this package directory:

```sh
node scripts/local-fixture.mjs 64036
node scripts/local-profile.mjs
```

The fixture contains PUBLIC synthetic credentials and two short-lived synthetic admission tickets.
Its persistence lives in `.tmp-tool-results/cloudflare-fixture-<port>` and must be fresh.
Stop it with SIGINT/SIGTERM; it removes its synthetic persistence.
The profiler creates and removes its own temporary official emulator instance and records process CPU/RSS in the verification directory.
Neither command logs into Cloudflare or creates remote resources.
`wrangler.jsonc` contains dummy local IDs, disables public preview routes and uses only local bindings.
Do not run remote migration/deployment commands against this configuration.

## Contracts and bounded work

New sessions store SHA-256 token hashes, expire after 30 minutes and bind device proof; logout/revocation persist.
New password verifiers use scrypt `N=16384,r=8,p=5`, a random 16-byte salt and 64-byte output.
Legacy `p=1` verification upgrades after a successful login.
Global/per-login attempt budgets and a one-minute persisted authentication lease bound simultaneous password hashing across isolates.
Mutations read the revision before permission reads and commit a guarded compare-and-swap D1 transaction.
Bodies/responses are limited to 512 KiB, sync/ACK/reservation batches to four, small ciphertexts to 128 KiB, and manifests to 64 photos.
Photos are at most 20 MiB plus the 28-byte AES-GCM packet header.
These are explicit rejection limits; larger existing collections require an additional chunked-manifest design before adoption.

Both native hosts negotiate `protocol: 2` through `/v1/me` and preserve explicit local-data attachment.
Photos use separate HKDF keys and routing-bound AES-GCM AAD; only small authenticated manifests enter D1.
Private binary PUTs are immutable conditional creates, and retries reuse the persisted exact ciphertext packet.
Revocation replaces ciphertext with a permanent zero-byte fence; never configure a lifecycle policy to delete those fences.
A deletion receipt/ACK is available only after all referenced ciphertext has been fenced and verified.
The same Worker's scheduled handler resumes cleanup in batches of four.
Downloaded peer copies cannot be remotely erased; native grant refresh clears this application's peer cache.

## Backup and migration

The Node-only admin module exports authenticated encrypted manifests, ciphertext object inventories and a separately retained latest deletion floor under an independent 32-byte operator key.
It is not a public Worker endpoint or a production remote backup runner.
Authenticate all object bytes and the current floor before restore; quiesce clients and cron while exporting.
Restore clears sessions and protects account/grant revocations and zero-byte fences.
D1 import transactions contain at most 32 data statements plus guards/checkpoint; HTTP and cron stay closed while import is incomplete.
Retry an interrupted restore with the exact same authenticated input.
Retain the latest floor independently of historical backups; an old floor cannot establish that newer deletion did not occur.
The local tests exercise interrupted restore, tampering, missing objects and old-snapshot restoration after deletion ACK.

Legacy migration validates the actual file-relay schema and preserves eligible identities/device proofs and compatibility verifiers.
The default opaque aggregate import rejects before writing.
An operator explicitly stages migration with `migrateLegacy(db, legacyState, {operationId})`.
This stages identity/grants only, raises every group epoch and creates per-account migration jobs without copying old records, receipts, cursors or nonce history.
An authorized native client decrypts the old aggregate, makes the existing encrypted health backup and uses `CompanionCloudflareMigration.prepare/publish` to restore into a separate empty local collection and republish with fresh operation-derived keys.
The device-encrypted phase journal survives an interrupted upload and reuses identical ciphertext packets.
`POST /v2/migrations/complete` verifies the expected manifest/photo references before completion.
Keep the old collection/relay until both accounts finish; subsequent target edits require reconciliation before rollback.
No real account or record was migrated.
Settings exposes native preview, explicit confirmation, progress, safe pause/resume and rollback through six bridge actions.
The approved source device and local revisions are bound to an expiring preview; activation uses the existing native transaction authority.
The separate target and encrypted source checkpoint are retained, and restart does not automatically resume uploads.
The offline-only management entry is `node scripts/migration-plan.mjs --dry-run --source FILE --target ORIGIN --service-id VERIFIED_ID --operation ID`.
It validates the legacy schema and supplied identity format and prints a plan without credentials or ciphertext; the actual target identity is authenticated by the native preview.
That standalone planning script has no execute mode or remote admin runner.
The newer unified synthetic operator CLI adds explicit local execution only; see [local admin guide](local-admin.md) and its [independent parameter template](templates/local-admin.example.json).
Its six commands default to dry-run, reject remote origins/flags, and use only marked temporary Miniflare D1/R2 directories.
It reuses this admin module for backup, separately retained deletion floors, restore and migration staging; it supplies no production credentials or device-loss policy.
The supported bounds remain explicit and fail-closed, including 64 photos and the small-manifest limit.

The isolated reproducible drill is `node scripts/local-migration-fixture.mjs` (legacy localhost 64041, synthetic control 64042, target workerd 64043).
It creates/removes its own temporary directory and refuses unsafe import before staging.
The control route belongs only to the local test process and is not exposed by the Worker.
Run only the `.uiqa` native harness: Android endpoint `http://10.0.2.2:64043`; iOS test environment `LEANON_CLOUDFLARE_MIGRATION_QA=isolated-64041-64043` with simulator ad-hoc signing for actual Keychain access.
Start a fresh fixture for each platform and stop it with SIGINT/SIGTERM.
Both actual native drills passed old-source preservation, lost-response retry and full health recovery on a newly approved device.

The Settings-specific drill uses `node scripts/local-migration-entry-fixture.mjs` with a fresh `.uiqa` simulator/emulator.
Its loopback control may hold completion to exercise pause and process interruption; the target proxy strips decoded transport headers.
Use the opt-in `MigrationEntryUITests`/native checkpoint tests on iOS and `-e scenario migration-entry-ui` Android instrumentation only on dedicated disposable devices.
These tests use the public backup plus fictional weight, water, exercise and meal records; they never install fake migration states.
See the migration-entry evidence and report for actual UI coverage and remaining production boundaries.

Server snapshots contain no client E2EE keys.
Existing portable password-encrypted health backups restore records/photos as of their snapshot but do not export companion keys; the device-bound migration journal is not a portable key backup.
After all approved devices are lost, password/server backup alone cannot decrypt old cloud contents.
A usable health backup can restore its own data; resuming cloud service needs an approved fresh-key/device-reset and re-pairing policy, or a separately reviewed portable companion-key recovery design.
Neither reset workflow nor portable key export is implemented by this local migration helper.

## Deployment decision

Local checks do not establish remote Free-plan feasibility.
Measured authentication uses about 81 ms of actual local workerd process CPU per successful login; see the report for methodology and limits.
Do not lower password hashing to fit a Free CPU budget.
A paid CPU budget or a separately reviewed identity provider is needed before remote acceptance, along with backup destination/floor retention, key recovery, collection capacity and private object memory/load tests.
No deployment, paid plan activation, provider login, commit or push is authorized by this local workflow.

## Actual native cross-platform QA

One iOS owner and a distinct Android partner passed bidirectional weight/photo/message/ACK and sharing-revocation tests through the same localhost workerd on port64045.
See the report and `cross-platform-checks.json` for exact coverage; independent platform tests alone were not this acceptance.
The opt-in iOS method is `testStagedCloudflareCrossPlatformPartnerInteroperability`, using `LEANON_CLOUDFLARE_CROSS_STAGE` and a private `/tmp/leanon-cloudflare-cross-*` directory supplied by `LEANON_CLOUDFLARE_CROSS_DIR`.
Android instrumentation uses `-e scenario cloudflare-interop -e stage <stage>` in `.uiqa`; it never routes production repositories.
Physical devices, production HTTPS, real mobile networks and remote capacity/fault acceptance remain outstanding.
