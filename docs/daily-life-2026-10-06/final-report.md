# Personal daily-life closure report

[简体中文](final-report.zh-CN.md)

Candidate: 2026-10-06 · `main` · HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9` plus the documented uncommitted source checkpoint.
The recognized native bottom bar is preserved.
No commit, push or deployment was performed.

## Result

The personal journal now supports empty first setup, optional tracking before setup, profile/goal edits, dated backfill and history, individual meal snapshots, weight/water/exercise corrections, deletion confirmation, Undo and restoration after restarting the app.
Partner synchronization and login remain unavailable placeholders; this work does not claim they are implemented.

**The core personal journal loop passed actual native acceptance on both platforms.**
The complete loop is anchored to bundle `23593dc3…`; the subsequently requested P1 save-error feedback fix on `ae747dd3…` is qualified separately below.
See [the detailed acceptance matrix](acceptance.md) for independently verified source anchors, exact logs and case-level boundaries.

## Storage and date rules

A new formal store starts empty; packaged demonstrations require an explicit isolated QA route.
Legacy migration preserves legitimate records, unknown metadata and old aggregate nutrition without inventing meal names or portions.
Reads never persist an upgrade; a successful requested mutation commits migration, revision, receipts and trash atomically before acknowledgement.
Corrupt established files fail closed, retain their bytes and never become empty journals.
Live deleted records must match their original delete receipt; restoration retains that receipt and operation identity.
Idempotent retry checks the original operation before revision conflicts, while reuse with a changed payload rejects.
Imported health records remain read-only in local history.

Native local dates drive Today; historical dates remain calendar labels when the time zone changes.
An open draft retains its chosen date, and equal-revision delayed responses preserve a newer accepted native clock update.
A new exercise requires a real weight on or before its date, rather than storing an invented zero-calorie estimate.
Unknown safety answers remain unknown and keep guidance in tracking-only mode.

## Verification

| Evidence | Result | Boundary |
|---|---|---|
| Workspace typecheck/build | New P1 source passed | `/tmp/leanon-daily-p1-workspace-{typecheck,build}.log`; no release. |
| TypeScript regression tests | New P1 source: 307 passed | Core 83, bridge 45, pages 81; `/tmp/leanon-daily-p1-workspace-tests.log`. |
| iOS native units | 138 passed | Native binary `57d73ccd…`; strict migration and receipt corruption fixtures included. |
| Android JVM units | 154 passed | 26 suites, zero failures/errors/skips; Release Kotlin compilation passed. |
| Cross-host worked example | Passed | 10 successful operations and 3 rejected operations; all 16 schema fields, receipts and tombstones agree. |
| iOS actual native UI | Baseline 235: 11 unique cases passed | Targeted harness corrections and prior failures are retained separately. |
| iOS P1 feedback regression | New ae747: 2 cases passed | English/light and Chinese/dark legacy-error/cancel/retry; keyboard closed; 14 official originals. |
| Android actual native UI | Baseline 235: core flow passed | Baseline 235 APK: setup, historical edits, Delete/Undo, restart/restore and same-modal failure recovery. |
| Android P1 feedback regression | New ae747: four viewport combinations passed | Light/dark, keyboard closed/docked; same-modal retry and byte-exact Cancel passed. |

Native product, core and bridge source did not change in this P1 update; the 138/154 native-unit and cross-host results are retained from their executed baseline runs rather than claimed as new runs.

Complete core acceptance baseline bundle SHA-256: `23593dc3f5eecd295b451d9068aa33d5a3f550d62dceb1961e2b7dc071b636e1`.
Native binary/APK identities, simulator UUIDs, original capture timestamps and synthetic fixture paths are retained in the platform manifests.
iOS native binary: `57d73ccdacea1f078fe88cbae8fb8161446022d5d08745b6843d7a3b0e507a09`; Android baseline APK: `35dd007aff2e99630a1dd23995ea25c9911cb144570bd495cdc588d26986399f`.
P1 shared bundle SHA-256: `ae747dd3bbe6ddac6cf56a5ac4172522784ab2bbc61bfa9ea363c41954443497`.
P1 Android APK: `eac3243490dbe725a83da2595d34130917db88efda8ebdf39f5bad255fc4a74c`; the iOS native binary remains `57d73ccd…`.
HEAD alone cannot identify an uncommitted executable; [the current P1 source checkpoint](source-checkpoint.json) and [the preserved pre-fix checkpoint](source-checkpoint-pre-p1.json) retain individual hashes for both versions.

Actual intermediate bundle `366dc775…` proved both first setup saves, iOS meal CRUD/Undo/restart restoration, and Android dated meal, weight, water and exercise correction followed by a real process restart and restoration.
These intermediate passes are not silently promoted to the final bundle.
Real execution caught Lynx null-field loss in first setup; a private JSON boundary now preserves explicit null while missing required fields still reject.
It also exposed an invisible food date badge and misleading empty-trash copy; both were corrected before final acceptance.

## Actual recovery and P1 feedback fix

Both hosts on baseline 235 kept the original draft open while the isolated file was corrupt for at least 65 seconds, restored the exact valid backup, and saved directly without leaving the sheet.
iOS recovered the original legacy aggregate ID/date to 400 kcal; Android recovered the same Oct 5 dinner entry to 175 g / 227.5 kcal.
The modal hides the background error notice from accessibility inspection, so the internal periodic-read flag is inferred from foreground duration rather than directly observed; strict recovery-branch and request-identity tests passed separately.
Baseline Android feedback initially sat below the viewport and required scrolling, so the explicitly requested P1 fix continued after the original delivery.
The new `SheetFeedback` sits outside the scrolling fields, above Save/Cancel, and occupies normal layout space with explanatory text and an accessibility label, without covering fields or relying only on color.
The six feedback nodes are profile, weight, exercise, meal edit, value-record edit and legacy aggregate edit; the separate `FoodSheet` new-food/catalog workflow is outside this change.
Transactions, drafts, operation identity and retry behavior are unchanged.
**P1 is fixed and passed bounded native verification.**
Android checked light/dark with the keyboard closed and with a visibly docked numeric keyboard reducing the app viewport: the error, original draft and Save/Cancel remain visible without scrolling to locate the error.
Save dismisses the IME; the docked-error captures re-focus the unchanged failed field, and dark mode uses that same failed draft.
Exact repair followed by same-modal retry saves the same Oct 5 dinner entry from 180 g / revision 15 to 195 g / revision 16; the separate 190 g Cancel leaves the valid revision-15 bytes unchanged.
iOS English/light and Chinese/dark legacy-error cases pass: pre-scroll feedback/action visibility, byte-exact Cancel, same-draft save recovery and corrupt-relaunch read Retry; their error captures have the keyboard closed.
An official Android test-gesture correction sets explicit FINGER metadata; earlier stylus/compact/floating-keyboard diagnostics are retained separately and are not promoted to docked passes.
Temporary simulator keyboard settings were restored to their exact original values, with no IME data clearing, default-provider change or OS permission/time change.
The other feedback nodes, all iOS keyboard-open variants and the full baseline 11/7 matrix were not separately rerun on ae747.

## Boundaries and deliverables

Verification uses disposable `.uiqa` namespaces and synthetic stores only.
No normal health records were inspected or changed, and no OS health, camera, Bluetooth or notification permission was requested or granted during this work.
The existing iOS normal file was checked by hash only for preservation; Android checks refer to the original synthetic QA file, with no normal-store inspection.
Controlled fixture clock changes verify date/foreground behavior without changing the OS clock; natural midnight and physical devices remain unverified.
Full VoiceOver/TalkBack interaction, physical BLE scales, camera scanning, health-provider sessions and real notification delivery require separate device acceptance.
Trash and operation receipts currently remain durable without automatic eviction; a later retention policy needs a separate decision because it affects recovery, privacy and retry guarantees.

The evidence archive contains original native screenshots, platform manifests, executed logs, the paired RFC/acceptance report, synthetic conformance exports and a reproducible comparison script.
Screenshots are original pixels; annotated overviews only scale them proportionally and put captions outside the captures.
Updated P1 feedback overview Library ID: `libfile_4642d1e562688191a512d3998c98e9e4`.
Complete core acceptance baseline overview Library ID: `libfile_8afdcad7744c819198fcc09596aad501`.
The delivery index records successfully saved reports and archive IDs.
Large raw UI xcresult bundles and videos remain local; the archive contains original PNGs, logs, exported summaries and manifests, with this exclusion explicit.
