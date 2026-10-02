# RFC 0025 — Health Connect two-way sync (read weight & exercise, mirror & delete)

- Status: Accepted
- Created: 2026-10-03
- Related: RFC 0021 (Health Connect export), RFC 0017 (exercise), RFC 0010 (logging write path)

## Summary

Extend the Health Connect integration from one-way export to a controlled
**two-way sync**. LeanOn continues to publish its own records (tagged with a
`leanon-` `clientRecordId`), and now also **reads weight and exercise sessions
written by other apps and devices** and surfaces them as read-only **mirror
records** (id prefix `hc-`, `source: 'health_connect'`). On every sync the
mirror set is rebuilt from Health Connect, while LeanOn's own records are the
authority and are never touched by a read. Deleting a LeanOn exercise now also
deletes the previously exported session via `deleteRecords`, fixing the v1
"deleted in LeanOn but left behind in Health Connect" limitation. Nutrition is
still export-only in this version.

## Motivation

- The user's weight may be captured by a smart scale / partner app that writes
  to Health Connect, and workouts are frequently logged in other apps (Strava,
  Samsung Health, Keep, gym equipment). Re-entering them in LeanOn is friction
  that undermines the very habit the app is trying to build.
- Imported weight should flow into trend/current-weight math, and imported
  workouts should earn the same calorie "eat-back" as a workout logged in
  LeanOn — otherwise the energy budget is wrong on days the user exercises
  elsewhere.
- v1 export has no delete path: removing an exercise in LeanOn leaves an orphan
  session in Health Connect. A trustworthy two-way integration must reconcile
  deletions, not just inserts.

## Why weight and exercise first (and not nutrition)

- **Weight** is naturally de-duplicated by day and is low-risk to mirror.
- **Exercise sessions** are point-in-time events with a type and duration; each
  maps cleanly to one LeanOn exercise sample and earns eat-back.
- **Nutrition** import risks *double counting energy*. External meals are
  granular, typed by `mealType`, and cannot be reliably matched to the meals a
  user already logged in LeanOn — importing them would silently inflate (or
  deflate) the day's calories. Meal-fingerprint matching warrants its own RFC.
  Hydration has the same "multiple apps log the same glass" ambiguity. Both
  stay export-only / out of scope here.

## Goals

1. Request Health Connect **read** permissions for weight and exercise on top
   of the existing write permissions.
2. Read external weight (last 90 days) and exercise sessions (last 30 days),
   ignoring records LeanOn itself exported.
3. Mirror external records into HostData with stable ids and a `source`
   marker, rebuilding the mirror set idempotently on each sync.
4. Attribute imported exercise calories via LeanOn's own MET table so eat-back
   is consistent with manually logged workouts.
5. Delete the Health Connect session when its LeanOn exercise is deleted.
6. Keep the whole feature best-effort and off the logging write path; Health
   Connect must never block or fail an entry.

## Non-goals

- Reading **nutrition** or **hydration** (double-counting risk; separate RFC).
- Editing or deleting mirror records inside LeanOn — the source app owns them;
  a mirror deleted locally would simply return on the next sync.
- Matching an imported workout against a workout the user also logged in
  LeanOn (no conflict UI; mirrors carry a visible source badge instead).
- Reading `TotalCaloriesBurnedRecord` / active-energy; calories are derived
  from LeanOn's MET table for determinism.
- Periodic background sync via WorkManager; sync runs on app foreground, on
  enable, and via a manual "Sync now". A scheduled job can come later.
- Selective import by `DataOrigin` (per-app allow/block list).
- Bulk-deleting already-exported data when the feature is switched off.
- iOS (HealthKit) — a parallel design implemented on macOS.

## Design

### Data model (core)

```ts
export type DataSource = 'leanon' | 'health_connect';
```

- `WeightSample` and `ExerciseSample` gain an optional
  `source?: DataSource`. Absence is treated as `'leanon'`, so existing records
  and fixtures need no migration for the field itself.
- Mirror ids are namespaced:
  - Weight mirror: `"hc-weight-${date}"` (one per day, see below).
  - Exercise mirror: `"hc-<health-connect-record-id>"`.
- All non-mirror records keep their existing ids and remain the user's
  authority; read code only ever adds/removes `hc-` records.

### Permissions

Add read scopes alongside the existing write scopes:

- `android.permission.health.READ_WEIGHT`
- `android.permission.health.READ_EXERCISE`

`HealthConnectPermission.PERMISSIONS` becomes the union of
`getReadPermission` / `getWritePermission` for weight and exercise plus the
existing write-only nutrition scope. Because the requested set changes, a
user who granted v1 permissions is re-prompted for the new read scopes;
`permissionsGranted()` requires the full set. The manifest already declares
the Health Connect queries/rationale entries and gains the two read
permissions.

### Reading external records

Reads use `readRecords(ReadRecordsRequest<T>)` with a `TimeRangeFilter`:

- Weight: between `now - 90 days` and `now`.
- Exercise: between `now - 30 days` and `now`.

**Echo suppression** — LeanOn skips any record whose
`metadata.clientRecordId` starts with `"leanon-"`. Those are its own exports
coming back and must never be mirrored. Only records without such an id (i.e.
authored by other apps) are imported.

### Weight mirroring (per-day, LeanOn wins)

LeanOn models at most one weight per day. External `WeightRecord`s are
therefore aggregated:

- Group external records by local date; for each date keep the **latest**
  time-point (a weigh-in later in the day is the most representative).
- If LeanOn already has its own (`source !== 'health_connect'`) weight on that
  date, **do not mirror** an external value for it — an explicit LeanOn entry
  wins and there is no same-day conflict.
- Otherwise upsert mirror `"hc-weight-${date}"` with the external kilograms.

This fills gaps in days the user did not log in LeanOn while never overriding
a value they entered.

### Exercise mirroring (events, MET-derived calories)

Each external `ExerciseSessionRecord` maps to one mirror exercise:

- id = `"hc-${metadata.id}"` (stable across syncs).
- date = local date of the session start.
- `durationMin` = session end − start, in whole minutes.
- `exerciseTypeId` from a **reverse** map of Health Connect `ExerciseType` →
  LeanOn type id (see below); unknown types fall back to a generic workout.
- `kcal` is computed with LeanOn's existing MET calculator
  (`@zzzode/exercise-data`) from the mapped type and duration — the same
  formula used for a manually logged workout — rather than trusting an
  associated energy record. Zero/negative durations are skipped.

Imported sessions therefore extend the exercise list like any workout and
their calories flow into the day's eat-back and insights.

`ExerciseTypeMapping` gains `typeIdFor(hcExerciseType: Int): String`. Where
several LeanOn ids share one Health Connect type (e.g. jogging/running both
map to running), the reverse map returns a single representative id.

### Mirror reconciliation

Mirrors are a read-only projection, so each sync **rebuilds** them rather than
patching:

- `RecordsRepository.replaceExternalWeights(byDate: Map<String, Double>)`:
  remove all weight samples with id prefix `hc-weight-`, then insert the
  aggregated mirrors (skipping dates LeanOn logged).
- `RecordsRepository.replaceExternalExercises(items: List<ExerciseSample>)`:
  remove all exercise samples with id prefix `hc-`, then insert the mapped
  mirrors.

Rebuilding automatically reflects external edits and deletions: a record that
disappears in Health Connect disappears from the mirror set on the next sync,
with no tombstone bookkeeping. LeanOn-owned records are never removed by these
methods. The merged HostData is persisted to `records.json` as usual.

### Deletion reconciliation (deleteRecords)

When a LeanOn exercise is deleted, Health Connect must drop the session v1
exported:

```kotlin
client.deleteRecords(
  ExerciseSessionRecord::class,
  recordIds = emptyList(),
  clientRecordIds = listOf("leanon-exercise-${id}"),
)
```

- Invoked best-effort on the application-scoped IO coroutine alongside the
  local delete; failures are logged and swallowed so deletion in LeanOn always
  succeeds.
- Weight and daily nutrition have no single-record delete path in LeanOn
  today, so only exercise deletion is wired in this version.
- External (`hc-`) mirrors are reconciled by the rebuild above, not by
  `deleteRecords`.

### Sync orchestration

`HealthConnectManager.sync()` (suspend), guarded by support + the full
permission set:

1. Read external weight and exercise with echo suppression.
2. `replaceExternalWeights` / `replaceExternalExercises` and persist.
3. Run the existing idempotent `backfill()` to publish LeanOn records.
4. Record `lastSyncEpochMs`.

Triggers:

- **Manual**: new bridge RPC `healthConnect.sync` (`void` →
  `{ success: boolean; hostData: HostDataDto }`) backed by a `@LynxMethod`;
  the UI refreshes from the returned HostData.
- **Foreground / enable**: when enabled and permitted, sync runs once
  asynchronously on app foreground and after enable (replacing the
  backfill-only enable path).
- **After writes**: the existing `onRecordsChanged()` export still fires;
  exercise deletion additionally calls `deleteRecords`.

`healthConnect.getStatus` gains `lastSyncEpochMs: number | null`, persisted in
the existing `leanon_settings` prefs so it survives restarts.

### Bridge contracts

- `healthConnect.sync`: `void` →
  `{ success: boolean; hostData: HostDataDto }`.
- `healthConnect.getStatus` response adds `lastSyncEpochMs: number | null`.
- `getStatus` / `requestPermission` / `setEnabled` are otherwise unchanged.

### UI (pages)

- **HealthConnectSheet**: when connected, show a "Sync now" control with a
  busy state and the last-sync time; on success the whole screen refreshes
  from the returned HostData. Failure shows a neutral retryable message.
- **ExerciseCard / Today's exercise**: mirror workouts render like other
  workouts but carry a small "Health Connect" source badge and hide the
  Edit / Delete actions (they are read-only projections).
- **Weight** needs no dedicated UI: mirrored weights already drive current
  weight and the weekly trend, which is the intended effect.
- The preview bridge simulates a set of external records and a working
  `healthConnect.sync` that merges them deterministically.

## Alternatives

- **Read nutrition too**: maximally complete, but the same meal logged in two
  apps cannot be reliably matched, so energy would double count; defer until a
  meal-fingerprint design exists.
- **Trust external session calories / read TotalCaloriesBurnedRecord**: avoids
  recomputation but couples LeanOn to inconsistent vendor energy estimates and
  to correlating separate records; MET-derived calories are deterministic and
  match LeanOn's own logged workouts.
- **Patch mirrors incrementally by HC id**: less work per sync, but requires
  tombstones to catch external deletions; a full rebuild of the small mirror
  set is simpler and self-healing.
- **Last-write-wins merge into LeanOn's own ids**: would let external data
  overwrite user entries; the mirror model keeps LeanOn authoritative and
  external data clearly attributable.
- **Scheduled WorkManager sync**: catches changes while the app is closed, but
  foreground + manual sync covers the daily-use loop without an extra job.

## Open questions

- What fingerprint (time window + items + energy) would let us import nutrition
  without double counting a meal the user also logged in LeanOn?
- Should we add periodic WorkManager sync (e.g. a few times a day)?
- Should disabling the feature offer "delete the data I exported to Health
  Connect"?
- Do we need per-app `DataOrigin` allow/block filters for noisy sources?
- How should the mirror model map to iOS HealthKit for feature parity?
