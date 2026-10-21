# Synthetic local operator commands

English · [简体中文](local-admin.zh-CN.md)

This CLI completes the local operator handoff around the existing `admin.ts` functions.
It never logs into Cloudflare, reads provider credentials or connects to a remote target.
Use PUBLIC fictional data only; this is not a production administration runner.
No new recovery policy, native migration UI or backend cryptography is introduced.

## Setup and commands

Build the existing workspace dependency and this package with the repository's pinned pnpm11.
From this package directory, copy `templates/local-admin.example.json` to a private parameter file.
Choose a fresh absolute workspace directly under the system temporary directory or `/tmp`, named `leanon-admin-synthetic-<unique-suffix>`.
The template's zero service ID is a placeholder; replace it with the initialized target's returned public service ID before staging.

```sh
node scripts/local-admin.mjs init --config /tmp/local-admin-parameters.json
node scripts/local-admin.mjs init --config /tmp/local-admin-parameters.json --local-execute
```

All commands default to dry-run; `--dry-run` is also accepted explicitly.
`--execute`, `--remote`, provider/account options, extra arguments and unknown configuration fields fail closed.
`init --local-execute` creates a fresh mode0700 synthetic workspace and two empty local D1/R2 stores, prints their public service identities and disposes both runtimes.
It never generates an operator encryption key, admission token, account or production credential.
Populate only that owned workspace with a PUBLIC 32-byte binary fixture key (mode0600) and a fictional old-relay JSON fixture if migration is needed.
The key, snapshot and floor must live in independent directories; the template uses `keys/`, `backups/` and `floors/`.
State directories and input/output files cannot overlap; traversal, absolute file paths, symlinks and oversized inputs are refused.

| Command | Default preview | Explicit `--local-execute` |
|---|---|---|
| `init` | Validates a fresh temporary workspace; no writes | Initializes local source/target stores and returns public identities |
| `backup` | Validates scope, quiescence assertion, key length/permissions and unused output | Exports the source's authenticated encrypted snapshot plus client ciphertext objects |
| `deletion-floor` | Validates scope/key and unused independent output | Exports the current source's authenticated deletion/revocation floor |
| `restore` | Validates bounded envelope/object encoding and paths; explicitly reports authentication and DB checks not performed | Authenticates using the existing core, requires an empty target or identical interrupted import, and preserves deletion/revocation fences |
| `migration-plan` | Validates the real old-relay schema and returns only counts | Refused; this command is always a preview |
| `migration-stage` | Validates source/operation/local-origin fields and returns only counts | Checks the actual local target's persisted service ID, then stages identities/grants and republication jobs |

No preview creates an emulator, opens D1/R2 or writes files, including lock files.
A successful restore preview does not authenticate ciphertext, establish the latest authoritative floor or prove that the database target is empty.
Those checks happen in the explicit local execution; this distinction is present in the JSON result.
The origin is a loopback planning label, not an HTTP destination this CLI contacts; execution is bound to the configured temporary store and its checked service ID.
The local workerd runtime disables telemetry, public routes and outbound requests; each opened runtime is disposed in `finally`.

## Retention and failure handling

Set `quiesced: true` only after stopping your synthetic clients and cron.
Execution takes one exclusive workspace lock; run operations serially.
Exports atomically publish complete mode0600 files and never overwrite an existing output.
Choose a new floor filename for each capture and update the restore parameters to the independently retained latest floor.
Retaining an old floor with an old snapshot cannot prove that newer deletion did not occur.
An operation failure releases its invocation lock; an interrupted D1 restore remains behind the existing HTTP/cron maintenance gate and retries only the same authenticated input.
R2 failures before import can leave inaccessible objects in the isolated target; source and permission rows are not adopted, and the same authenticated restore can retry.
A hard process kill can retain `.local-admin.lock`; further execution refuses it.
After verifying the recorded process has ended, inspect the synthetic checkpoint and remove only that owned stale lock before retrying; there is no automatic lock stealing.
Initialization failures remove only the fresh workspace created by that invocation.
All CLI stdout/stderr is bounded JSON: public identities/counts/status or fixed error codes, never raw exceptions, keys, verifiers, tokens, account names, manifests or ciphertext.

The operator files are bounded to64 MiB per backup,24 MiB per floor and16 MiB per legacy input; at most64 snapshot objects are supported.
Export also refuses more than48 MiB of raw object bytes or a manifest beyond16 MiB before serializing the snapshot.
Larger collections are explicitly rejected and still need a separate streaming/chunked design.
Keep the existing collection/relay until both people finish native migration; CLI staging does not constitute native republication or production cutover.

## Validation and cleanup

`pnpm --filter @zzzode/companion-worker test` exercises real isolated Miniflare/workerd D1/R2 through the same command core.
Tests cover dry-run file fingerprints/no bindings, template/remote/path rejection, redacted failures, target identity mismatch, encrypted object restoration, latest floors after deletion ACK, stale/tampered/missing inputs and interrupted D1 import/resume.
They close runtimes and remove only their freshly created synthetic directories.
Stop all test clients before removing your own workspace after inspection; keep review logs outside it.
The existing Settings and native migration acceptance is separate and was not rerun for this operator-only change.
Production accounts, billing/CPU budget, data-location preferences, independent backup/floor/key retention and total-device-loss recovery policy remain user decisions before remote implementation and acceptance.
