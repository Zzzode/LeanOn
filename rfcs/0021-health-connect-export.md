# RFC 0021 — Health Connect export

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0010 (logging write path), RFC 0017 (exercise), RFC 0020 (reminders)

## Summary

Add an optional, one-way integration with Android **Health Connect** that
exports LeanOn's weight, nutrition and exercise records to the system health
data store. The user enables it from an in-app entry, grants the Health Connect
permissions, and LeanOn performs a one-time historical backfill and then keeps
new entries in sync. Every exported record carries a stable `clientRecordId`
so re-export is idempotent. The feature is fully additive: when Health Connect
is unavailable or disabled, LeanOn behaves exactly as before. No data is read
back in this version.

## Motivation

- Health Connect is the system-wide health data layer on Android (built in
  from Android 14; an installable app on earlier versions). A serious health
  app should not be a silo — users expect their weight, meals and workouts to
  appear alongside other apps and wearables.
- Exporting makes LeanOn data visible in the Health Connect UI and in partner
  apps (Samsung Health, Google Fit-style surfaces, etc.), increasing trust and
  lock-out portability.
- LeanOn already persists every write natively, so it is the natural authority
  to publish from.

## Goals

1. Detect Health Connect availability and surface a clear connect/enable entry.
2. Request the Health Connect write permissions through the platform contract.
3. Export **weight**, **nutrition** (energy + protein/carbs/fat) and
   **exercise** records, with a historical backfill on enable and incremental
   sync thereafter.
4. Make export idempotent: re-running backfill or re-exporting the same day
   must not create duplicates.
5. Stay fully offline and never block the logging write path on Health Connect.

## Non-goals

- Reading / importing data from Health Connect in this version (merge,
  de-duplication and conflict handling warrant a separate RFC).
- Two-way sync, per-field conflict resolution, and sync of water/micronutrients
  beyond protein/carbs/fat.
- iOS (HealthKit) — a parallel design, implemented on macOS.
- Background sync independent of user writes; export happens on enable
  (backfill) and at the moment each record is logged. Incremental changes made
  while disabled are reconciled by a re-backfill on re-enable.

## Design

### Availability

- Dependency: `androidx.health.connect:connect-client:1.1.0` (stable).
- `HealthConnectClient.getSdkStatus(context)` reports availability without
  requiring a running client; `SDK_AVAILABLE` means the platform/app is ready.
  The status drives `supported` in the UI.

### Bridge contracts

- `healthConnect.getStatus`: `void` →
  `{ supported: boolean; enabled: boolean; permissionsGranted: boolean }`
- `healthConnect.requestPermission`: `void` → `{ granted: boolean }`
- `healthConnect.setEnabled`: `{ enabled: boolean }` →
  `{ success: boolean }`

`enabled` is persisted in the existing settings prefs (`leanon_settings`),
not in HostData.

### Permissions

Write-only scopes for this version:

- `android.permission.health.WRITE_WEIGHT`
- `android.permission.health.WRITE_NUTRITION`
- `android.permission.health.WRITE_EXERCISE`

Permissions are requested with
`PermissionController.createRequestPermissionResultContract()` launched from
`MainActivity`; the result flows back through a holder (the same command-to-
activity bridge used for notifications), keyed by a dedicated request path.
The manifest declares the permissions, a `<queries>` entry for the Health
Connect package, and the permissions rationale activity / Android-14 alias the
platform expects.

### Record mapping and idempotency

Each exported record is built by a pure mapper and carries:

```kotlin
Metadata(
  clientRecordId = ...,
  clientRecordVersion = 1,
)
```

Stable ids make a repeated `insertRecords` resolve to the same logical record
rather than a duplicate:

- Weight: one `WeightRecord` per logged date —
  `clientRecordId = "leanon-weight-$date"`, `weight = Mass.kilograms(kg)`,
  time = the date at a fixed local instant.
- Nutrition: one `NutritionRecord` per logged date (meals already accumulate
  into a daily total) — `clientRecordId = "leanon-nutrition-$date"`,
  `energy = Energy.kilocalorie(kcal)`,
  `protein/carbsTotalFat = Mass.grams(...)`.
- Exercise: one `ExerciseSessionRecord` per exercise sample —
  `clientRecordId = "leanon-exercise-${sample.id}"`, title from the localized
  exercise name, `exerciseType` mapped from the type id where a Health Connect
  `ExerciseType` constant exists (otherwise `EXERCISE_TYPE_OTHER_WORKOUT`),
  start/end derived from duration at a fixed daily instant.

The mappers are pure Kotlin over LeanOn's JSON data and are JVM unit tested;
only the `insertRecords` call touches the running client.

### Sync timing

- On enable (after permissions are granted): build all weight/nutrition/exercise
  records from `RecordsRepository.loadHostData()` and insert in one batch.
- After each successful native write (`writeWeight`, `writeIntake`,
  `writeExercise`, and the edit/delete paths), enqueue a best-effort
  re-export of the affected record on an application-scoped coroutine. Failures
  are logged and swallowed — Health Connect must never block or fail logging.
- Disabling stops incremental sync and flips the pref; re-enabling runs a full
  idempotent backfill that reconciles anything missed.

### UI (pages)

An entry (a card on Today or a row opened from the header) shows the Health
Connect state: unavailable, or "Connect" / connected with the granted scopes.
Connecting requests permission, then enables and backfills; the UI reflects
the resulting status. The preview bridge simulates `supported: true`,
`granted: true` and an in-memory enabled flag.

## Alternatives

- **Two-way sync immediately**: more useful, but import requires identity,
  de-duplication and conflict rules we have not designed; export first is a
  strict subset and can be extended without breaking it.
- **Read weight from Health Connect instead of BLE/manual**: convenient, but
  merges external scales and apps into LeanOn's authority before we can
  attribute or reconcile; deferred.
- **Periodic background sync via WorkManager**: eventually useful for catching
  edits made while disabled, but the idempotent re-backfill on enable covers
  v1 without an extra scheduled job.
- **Custom per-vendor integrations (Samsung Health, Fit)**: Health Connect is
  the vendor-neutral hub these already support; integrating once is less work
  and more portable.

## Open questions

- When should we add read/import, and how do we identify and de-duplicate
  records originating from LeanOn vs other apps?
- Should water and micronutrients (fiber, sugar, sodium) be exported once food
  records carry them?
- Should we export active-energy (`TotalCaloriesBurnedRecord`) in addition to
  exercise sessions?
- HealthKit parity for iOS, including the same idempotent id scheme?
