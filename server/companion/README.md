# Companion local relay

English · [简体中文](README.zh-CN.md)

A real loopback HTTP service with persistent accounts, independently authorized devices, mutually confirmed two-person invitations, directional opt-in sharing and ciphertext sync.
Health, photos and encouragement remain client-encrypted; the relay never receives group/vault keys or invitation secrets.
This implementation extends the local portion of RFC 0034 while preserving RFC 0008's ciphertext-only boundary.

## Run locally

From the repository root, after the workspace install:

```sh
pnpm --filter @zzzode/companion-server build
LEANON_RELAY_FILE=/tmp/leanon-companion-qa/state.json pnpm --filter @zzzode/companion-server start
```

Default address is `http://127.0.0.1:8787`; `/health` reports protocol version 1.
Use isolated fictional QA accounts, never real health records.
Android emulator accesses the host through `http://10.0.2.2:8787`; iOS simulator uses loopback.
Native clients keep session tokens/deviceProof/E2EE keys in secure native storage; pages receive only decrypted UI DTOs.
See [the frozen protocol](protocol.md), [native encrypted-content and interoperability contracts](native-interop.md), and [TypeScript DTOs](src/types.ts).
New devices require an authorized existing device to confirm an invitation; a password alone cannot recover an E2EE key.
A lost device/key without another paired device has no implemented recovery path.

## Validation

```sh
pnpm --filter @zzzode/companion-server typecheck
pnpm --filter @zzzode/companion-server test
```

The Rstest suite uses real ephemeral TCP listeners, temporary durable files and fictional accounts; it does not mock network requests.
Thirty-two tests cover ciphertext-only persistence, restart/session invalidation, mutual family consent, maximum two members, client-side key wrapping, two-device vault exchange, unauthorized/cross-vault rejection, direction and recipient consent, prior-fetch ACK, idempotency, expired/cancelled invites, concurrent writes/tombstones, schema/cursor/epoch errors, unlink/account purge, device ID spoof rejection, pagination and metadata AAD tampering.
Deletion tests also cover durable no-session receipts, lost responses, restart, ACK, wrong proof/password/device, operation collision, receipt capacity before purge, old schema migration, re-registration identity and strict unknown-field rejection.
Actual Content-Length and chunked oversized HTTP requests verify limits and unchanged account state.
The failed-write test creates a real filesystem rename failure and checks memory/disk remain unchanged.
The post-commit directory-barrier test injects a directory fsync failure after a real atomic file rename and uses real HTTP to verify 503 plus safe idempotent recovery; it does not claim a physical storage failure was reproduced.
Build and TypeScript checks passed on Node 22.23.2 with TypeScript 7 and Rslib 1.0.3.
Native integration and actual photo UI are verified separately by their owners; server tests do not prove native clients persist before ACK or purge downloaded content.
New native intent/receipt deletion live-network acceptance is pending separately approved execution; completed earlier A/B/C stages exercised the previous algorithm.

## Boundaries

The state file is plaintext routing/auth metadata plus opaque ciphertext, mode 0600 in a newly created mode-0700 directory.
A PID lease prevents concurrent service processes from mutating the same file.
Sessions expire within 30 minutes and are never persisted.
Unlink revokes server access and purges server family content; downloaded copies cannot be remotely erased.
Capacity limits and uncertain-commit recovery are documented in the protocol.

This service accepts plaintext HTTP only on loopback for local QA.
Production HTTPS, identity verification/recovery, streaming, anti-abuse controls, independently reviewed security and deployment require separate decisions.
It does not contact paid providers or create production accounts.
