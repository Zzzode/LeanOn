- Start Date: 2026-10-06
- RFC Type: feature
- Status: Proposed
- Related: 0004, 0008, 0010, 0012, 0018, 0031

# Personal setup and recoverable daily records

English · [简体中文](0032-personal-daily-records.zh-CN.md)

## Summary

Provide a complete local personal loop: create a profile, log a selected day, correct historical records, recover deletions and reopen the app without losing data.
The user authorized implementation in the current dirty workspace; this proposal remains unmerged and does not authorize a commit or release.

## Motivation

Missing stores currently copy demonstration health data.
Intake is irreversibly aggregated by day, profile changes are absent, and input dates follow whichever day the host reports when Save is pressed.
These behaviors prevent reliable everyday use and historical correction.

## Guide-level explanation

A new installation starts empty and asks for the user's own profile; no example profile or health records substitute for their answers.
Cancelled or interrupted setup does not complete or partially persist a profile.
Diary selects a local calendar day for viewing and backfilling weight, food, exercise and water.
An opened draft retains its selected date through midnight, foreground refresh and time-zone changes.
Food records show actual saved portions and meal categories; older intake remains clearly identified as a legacy daily total.
Deletion requires confirmation and offers Undo, including a persistent recently-deleted view after relaunch.
Restore refuses to overwrite a newer record occupying the same ID or daily slot.

## Reference-level explanation

### Schema and migration

Schema 2 adds `revision`, `setupCompleted`, nullable profile/goals, guidance mode and explicit nullable safety flags.
It retains existing food catalogs, favorites, recent IDs, source ownership and health-platform projections.
`intakeEntries` contains stable IDs, local date, meal, saved food name, portion and nutritional values.
`legacyIntake` preserves the old per-day totals without fabricating constituent meals.
The existing `intake` view is rebuilt from active entries plus legacy totals, so current charts and health exports receive the same daily contract without double counting.
Weight/water identities are stable; external mirrors remain read only.
Unknown or malformed established files fail closed and keep their bytes.
Legacy projections may be read without committing migration; migration and a requested mutation are persisted together in one atomic record-file replacement.
Existing local records, including any old demonstrations, are preserved because the app cannot safely infer which rows the user considers real.
Formal empty initialization and explicit disposable QA fixtures are separate paths.

### Transactions and recovery

`records.getSnapshot` returns the native-owned current calendar date and full snapshot.
`records.mutate` accepts an operation ID, expected revision and a discriminated mutation: save profile, set weight/water, save exercise/intake, delete or restore.
The Lynx transport uses a private JSON-string envelope for this method because actual native argument conversion drops explicit null map values.
The native adapter decodes the original request before validation; missing fields remain distinct from explicit null, and the public typed RPC contract stays unchanged.
The hosts validate equivalent dates, numbers, identity ownership and setup safety rules before committing.
New dated writes reject future calendar dates; migration preserves existing future rows.
A successful transaction persists the new revision, operation receipt, record changes and deletion tombstone together before acknowledging success or emitting events.
An identical repeated operation returns the current snapshot and original receipt without duplicating its effects, including after process restart.
Reuse of an operation ID for different content and stale expected revisions fail explicitly.
Operation receipts are retained without eviction in this version.
Tombstones preserve the actual record, source, deletion revision and native timestamp; restoring removes the tombstone only after conflict checks pass.
No permanent-delete or automatic trash-pruning behavior is added here.
Existing RPCs remain compatible while shared user-facing writes use the new transaction path.

### Calendar and guidance

Native current time and system time zone remain authoritative.
Hosts publish on foreground, next local midnight, significant clock/day changes and time-zone changes; the shared page can request a fresh snapshot.
Local date keys are calendar labels, not UTC instants, and historical days are not rewritten when travelling.
Draft dates are pinned independently from Today; stale data refresh never silently moves a user's record to another day.
Profile edits never implicitly rewrite a weight; optional initial weight is permitted only during first completed setup.
Automated weight-loss guidance requires age at least 20, all screening flags explicitly false, a supported current/goal weight and no low-BMI goal.
Pregnancy, breastfeeding, eating-disorder risk or unknown screening responses retain tracking without deficit targets and direct the user to professional support where appropriate.
The age-20 eligibility is a conservative product choice, not a diagnosis or a claim that all adults need a weight-loss plan.
[NIDDK's planner](https://www.niddk.nih.gov/bwp) excludes younger people and pregnancy/breastfeeding; [CDC's adult BMI categories](https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html) apply from age 20 and describe BMI as screening rather than diagnosis.
Existing calorie equations and the basal-metabolic floor are preserved; low intake is not rewarded or interpreted as successful adherence.

## Drawbacks

Persistent operation receipts and recoverable deletions grow the local JSON file and retain deleted health data until a future explicit permanent-delete design.
Legacy daily totals cannot recover missing meal identities; they can be corrected as aggregates but not split into invented foods.
Strict revision checks may require a user to refresh and retry after concurrent native changes.
The current local file remains unencrypted, as disclosed in RFC 0031; this work adds no cloud service.

## Rationale and alternatives

Keeping only daily aggregates cannot support reliable individual editing.
Replacing old totals with guessed meals would manufacture health history.
Optimistic revision checks and durable operation IDs provide deterministic retry behavior without introducing a database or sync backend.
Durable tombstones support interruption/relaunch recovery more reliably than an in-memory toast alone.

## Unresolved questions

Physical-device accessibility, very large local histories and future encrypted storage require separate validation.
Real system notification, camera, HealthKit and Bluetooth permission acceptance requires explicit user approval and is not part of this QA run.

## Implementation plan

Freeze the shared schema and acceptance matrix, then implement equivalent iOS/Android transactions and shared setup/history UI.
Verify fresh setup cancellation, legacy migration, corrupt and failed writes, duplicate saves, stale revisions, restore conflicts, date backfill, time zones and midnight refresh with isolated fixtures.
Run supported actual native UI loops in both languages/appearances and clearly separate button acceptance from store/SDK tests.
Save build identities, original captures, source references and passed/unverified results to Library; do not commit, push or publish.
