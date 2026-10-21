# RFC 0031: Platform capability parity

[简体中文](0031-platform-capability-parity.zh-CN.md)

- Status: Proposed
- Date: 2026-10-06
- Builds on: RFCs 0011, 0013–0016, 0020, 0025 and 0027

## Decision

Bring existing local Android capabilities to iOS without removing working Android features.
Keep the shared bridge as the only native entry point and advertise only implemented methods.
Local water, custom-food CRUD, favorites and recent shortcuts retain their existing contracts.
The native host supplies the current local date, hour and derived logging streak rather than packaged demonstration values.
Tests and simulator QA use an explicit isolated clock and store.

HealthKit uses a separate `healthKit.*` domain behind the same shared health-settings flow.
Its status distinguishes write authorization from unknown read access because HealthKit intentionally conceals read denial.
Sync covers weight and exercise with stable export identity, external read-only mirrors, echo suppression and truthful failure reporting.
Daily energy, protein, carbohydrate, fat, fiber, sugar, saturated fat and sodium export as write-only HealthKit quantities, matching Android's existing daily nutrition export.
Each type is reconciled separately; denied types do not block other authorized writes, and updates/deletions retain stable identities and durable versions.
Permission summaries mean all requested types are allowed, so a false summary may describe partial access.
Imported indoor cycling retains its stationary activity mapping, and the local day is recomputed using the runtime time zone.
Enabling sync and requesting permission are explicit user actions; initialization does not request permission or access health records.

iOS uses AVFoundation for camera scanning, URLSession for the existing Open Food Facts lookup, CoreBluetooth for standard SIG scales and UserNotifications for reminders.
These are platform frameworks, with no new service account or backend.
Camera, Bluetooth and health behavior require physical-device acceptance before hardware readiness is claimed.

For reminder smart silence, iOS schedules a bounded rolling calendar horizon and rebuilds it on foreground, settings and record changes.
This preserves local wall-clock slots and cancels completed tasks without claiming an unrestricted iOS background worker.
The horizon and its refresh requirement are disclosed in settings and in the capability matrix.
Permission denial and scheduling failures are reported, not converted to success.

Android reminder and Health Connect settings migrate lazily from legacy SharedPreferences into an atomic app-private JSON file.
Reads preserve existing preferences; failed writes retain the authoritative settings and return an unavailable error.
Native enable operations validate permission as well as the shared UI.
WorkManager completion and preference failures have explicit callbacks and best-effort rollback.
Health Connect exports reserve durable, monotonically increasing versions per stable record ID before provider insertion.
Version 2 supersedes the legacy fixed version 1; unchanged retries retain their reserved version, while changed content advances it.
Serialized exports prevent an older snapshot from receiving a newer revision.

## Boundaries

The worktree implementation is authorized but remains uncommitted; this RFC is not marked Accepted or Implemented.
No account backend, partner cloud synchronization, profile onboarding or meal-level history schema is added here.
Weight daily upsert and intake daily accumulation do not constitute complete record CRUD.
Builds and injected SDK tests establish source behavior; simulator screenshots establish only the states actually exercised.

## References

[Apple HealthKit authorization privacy](https://developer.apple.com/documentation/healthkit/hkauthorizationstatus) documents why read access is unknown.
[Apple local notification scheduling](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app) describes system delivery and cancellation of pending requests.
[Android Health Connect insertion](https://developer.android.com/reference/androidx/health/connect/client/HealthConnectClient#insertRecords(java.util.List)) defines stable client IDs and higher-version precedence.
