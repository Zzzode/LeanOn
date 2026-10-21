# Android parity audit — 2026-10-06

[简体中文](parity-audit-2026-10-06.zh-CN.md)

The Android host already implemented the broader food, water, scanner, reminder, Health Connect and BLE paths before this parity task.
The initial iOS registry advertised only weight, intake, exercise and app-shell methods; concurrent iOS work is now adding the missing equivalents.
Neither a registry entry nor a source implementation alone establishes device or hardware acceptance.
No implemented Android capability was removed to match an iOS placeholder.

## Capability and evidence matrix

All Android source references below are relative to `app/src/main/java/com/zzzode/leanon/`.

| Capability | Android implementation and persistence | Initial iOS difference / current integration | Verified boundary |
|---|---|---|---|
| Weight, aggregate intake, exercise CRUD | `modules/HealthModule.kt:36`, `:59`, `:255`; `data/RecordsRepository.kt:116`, `:148`, `:246` | These basics existed in iOS; validation now agrees on real dates, finite numbers, weight 20–300 kg and exercise 1–1440 min, including fractions | JVM validation/store tests; no manual save/Back claim |
| Water totals | `HealthModule.kt:106`; `RecordsRepository.kt:213` upserts the absolute total per date, including zero | Missing in initial iOS; iOS owner adds matching RPC and store path | Real Android cache fixture upsert/reopen passed; water controls visible in actual light/dark screenshots |
| Custom/scanned food CRUD | `HealthModule.kt:140`, `:168`, `:196`, `:213`; `RecordsRepository.kt:394`, `:472`, `:531` | Missing in initial iOS; owner adds matching methods | Real Android create/edit/reopen/delete passed; scanned identity preservation and bundled-food ownership guard JVM-tested |
| Favorites and recent | `HealthModule.kt:122`; `RecordsRepository.kt:563`, `:588`, `:602` | Missing in initial iOS; owner adds matching preferences | Idempotent favorites, unknown IDs, recent ordering/deduplication/cap 12, and delete cleanup tested; native fixture passed |
| Scanner and product lookup | `modules/ScannerModule.kt:27`; `scanner/BarcodeScanActivity.kt:36`; `net/OpenFoodFactsClient.kt:16` | Initial iOS lacked these implementations; separate owner adds AVFoundation/OFF equivalents | Camera permission/Back/error callback code audited; no real camera/barcode/network acceptance in this Android run |
| Daily reminders | `modules/NotificationModule.kt:39`, `:49`, `:78`; `data/SettingsRepository.kt:25`, `:43`; `reminders/ReminderScheduler.kt:26`, `:32` | Initial iOS notification module was TODO; root adds native reminders | WorkManager scheduling and POST_NOTIFICATIONS flow exist; decisions/time validation JVM-tested; actual notification delivery untested |
| Platform health integration | `modules/HealthConnectModule.kt:37`, `:59`, `:78`, `:106`; `healthconnect/HealthConnectManager.kt:52`, `:59`, `:87` | HealthKit is a platform equivalent, not a renamed Health Connect RPC; iOS owner adds native adapter | Permission/status/sync code audited; export failure, timestamp ordering and mirror echo suppression JVM-tested; no real Health Connect grant/sync here |
| Standard BLE scales | `modules/ScaleModule.kt:25`; `ble/BleScaleManager.kt:66`, `:264`; `ble/BlePermissions.kt:17` | Initial iOS scale methods were TODO; owner adds CoreBluetooth equivalent | Standard service/measurement implementation retained; parser, callback gate and current-connection CCCD acknowledgement policy tested; no physical scale acceptance |
| Generic storage/resources/health samples | `bridge/CapabilityRegistry.kt:10`; `modules/StorageModule.kt:13`; `modules/ResourceModule.kt:14`; `HealthModule.kt:22`, `:27` | These are unfinished on both platforms, distinct from native record persistence and actual platform adapters | False advertisement corrected: unimplemented methods omitted, direct calls explicitly return `unavailable` |

## Corrections made

- `modules/RecordRequest.kt:11` checks Lynx value types before getters, including SDK `Number`, `Int` and `Long`; empty IDs, impossible/noncanonical dates, null nutrients, booleans masquerading as numbers, nonfinite/negative values and fractional reminder times reject as `invalid-request`.
- `data/AtomicRecordsFile.kt:9` writes a same-directory temporary file, syncs its contents, then atomically replaces the record file; repository methods serialize read/modify/write operations.
- `RecordsRepository.kt:498` preserves a scanned food's source and barcode on editing; only custom/OFF records can be edited or deleted; delete cleans both indexes.
- `data/CurrentSnapshot.kt:10` derives local `today`, `todayHour` and streak without changing persisted metadata or health records.
  Streak uses positive weight/intake/exercise/water dates, including health mirrors; today starts the streak if logged, otherwise yesterday remains eligible until a gap.
- `navigation/LynxContainerFragment.kt:107` bootstraps the current snapshot and `platform: android`; `MainActivity.kt:221` publishes current metadata on foreground/QA-clock changes; BLE and the reminder worker use current dates.
- `HealthConnectManager.kt:53` reports export failure; `:92` advances the complete-sync timestamp only after successful import and export; reads page through all records; external mirrors are not exported as LeanOn records.
- `bridge/PendingRequest.kt:4` prevents replacing pending permission/scanner/RPC callbacks; native events from background health work are dispatched on the main thread.
- BLE RPC ownership is held by the process manager, so a later Lynx module event sink can complete the original caller; pairing/readiness waits for the matching successful CCCD acknowledgement.
- Scanner permission denial is `not-authorized`, camera/start failures are `unavailable`, and genuine user cancellation is `cancelled`.

## First-batch validation and exact runtime artifact

`JAVA_HOME=temurin17 ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:assembleDebugAndroidTest -PleanonUiQa=true -x :app:prepareLynxAssets` passed.
There are 88 JVM tests, with zero failures/errors/skips.
The log is `/tmp/leanon-android-parity-build.log`.
`git diff --check -- apps/android` passed.

Official platform instrumentation ran on Android 15 `sdk_gphone64_arm64`, `emulator-5554`, 1080 × 2400, exclusively in `com.zzzode.leanon.uiqa`.
Seven native fixture checks passed: water replacement/reopen, custom edit/default clearing/reopen, favorite idempotency, recent ordering/deduplication/cap, delete cleanup, clock rollover without rewriting records, and unchanged application records.
Writes used a cache-only fixture and packaged demo seed; the existing QA application's `files/records.json` hash remained `bf2eb866a8d4011f4329d5f50eee9b587c8821c969606172cae4dd8b208c088b`.

The actual APK contains bundle SHA256 `fd1f1ceb7ff182eac340b798109fb42ee3139c99332a8e1525f96a43c4ee55b8`.
APK SHA256 is `6aa9c863864d6ca00f23c151a5e02c11c6d4daa713236a4b5746363440f45995`.
The build is dirty `main` at HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`, not a clean-HEAD build.
Actual UI captures are `today-light.png` (13:54:01 UTC) and `today-dark.png` (13:54:05 UTC), with the explicit QA clock `2026-10-01T19:00:00+08:00`.
A subsequent cold launch with the real clock shows October 6, no intake logged and water 0; `today-real-clock.png` was captured at 13:58:58 UTC.
The QA clock and appearance were restored to `system`, with the record-file hash still unchanged.
Full evidence, screenshot hashes and the native fixture snapshot are in `/tmp/leanon-android-parity-qa/evidence-manifest.json`.

The legitimate accessibility attempt to find/click `记录饮食` found no node and returned false.
Therefore custom-form opening, text entry, save/cancel/Back, keyboard behavior and actual water button writes are **not** accepted by this run.
The visible water controls and persistence checks are separate evidence.
Real barcode, notifications, Health Connect and BLE permission/device workflows also remain device acceptance work.
At this first-batch artifact, reminder/Health Connect preferences still used asynchronous SharedPreferences `apply`; the subsequent reliability batch below replaces that path.
No simulator input workaround, production record/profile mutation, service deployment, commit or push was performed.

## Final reliability batch

The prior artifact hashes and 88/7 results above remain historical evidence, not relabeled final results.
The final frozen native source passes **119 JVM tests** with no failures/errors/skips and **15 official device fixture checks** on the same isolated Android 15 application.
Logs/results are `/tmp/leanon-android-durability-qa/native-unit-results.json`, `native-unit-build.log` and `native-instrumentation.json`.

- `data/SettingsRepository.kt:17` atomically persists a private settings snapshot, imports legacy preferences only on successful write, and preserves corrupt files; read/write errors propagate explicitly.
- `modules/NotificationModule.kt:49` checks authorization before enabling and distinguishes `invalid-request`, `not-authorized` and `unavailable`; `reminders/ReminderScheduler.kt:32` waits for both WorkManager acknowledgements.
  `reminders/ReminderSettingsUpdate.kt:4` attempts restoration of old preferences and work after partial scheduling failure, without returning success.
- `modules/HealthConnectModule.kt:78` requires platform support/full permissions, durable settings and successful initial sync; status/sync/snapshot IO errors deliver one failure callback.
  Preference restoration after failed enabling does not undo legitimate imports or exports already performed by the provider.
- `healthconnect/HealthConnectManager.kt:59` serializes snapshot/reservation/insert and durably reserves mapper fingerprints through `HealthConnectExportLedger.kt:18` before provider insertion.
  Legacy version 1 is superseded by initial version 2; identical content retries retain the version and each edit increments it, including returning to old content.
  `HealthConnectMappers.kt:156` fingerprints explicit exported fields, not unrelated JSON ordering or metadata.
- `LeanOnApplication.kt:80`, `MainActivity.kt:249`, `reminders/ReminderWorker.kt:24` and `HealthConnectManager.kt:78` handle settings IO failures without replacing corrupt files or turning a successful local record write into an adapter failure.

The final embedded bundle SHA256 is `5e00a89740d78d17ce0dfcaad708a78396f50911725275f13e5afb338cb6a583`.
APK SHA256 is `056b4d8d327ec771252e35b2a27ce59a0f6e412dc704b1d6f022c42f20f2e0bc`.
A stale Gradle asset merge was detected by ZIP-byte verification and repaired before installation; `asset-cache-repair.log` records the fix.
Actual final Today light/dark captures were taken at 14:39:14/14:39:19 UTC; the real-clock capture at 14:40:08 UTC shows October 6, unrecorded intake and water 0.
All three were personally viewed; QA appearance and clock were restored to system.
Application records retain the original `bf2eb866...208c088b` hash, and application settings/export-ledger/legacy preference files were absent before and after; all mutation tests wrote disposable cache fixtures.
Full exact hashes, timestamps, checks and paths are in `/tmp/leanon-android-durability-qa/evidence-manifest.json`.
The 15 checks establish atomic settings migration/reopen/error retention, durable export version/retry/error gating and real SDK metadata construction, alongside the seven prior native fixture scenarios.
They do not perform actual provider inserts, permission grants, notification delivery or BLE hardware operations.
The accessibility action still found no food button node and performed no click; form/save/keyboard/Back acceptance remains unverified.

## Daily-life closure — final native and shared bundle

The final daily-journal native source passes 154 JVM tests across 26 suites, with zero failures, errors or skips, and release Kotlin compilation.
The shared worked fixture independently passes ten successful operations and three expected failures; these are repository conformance checks, not UI gestures.
Normal fresh installation is empty and does not copy demo health records.
Read-only legacy migration, atomic revisions/receipts/tombstones, strict nullable RPC transport and corruption guards are implemented in `data/DailyRecordsSchema.kt`, `data/DailyRecordsMutation.kt`, `data/RecordsRepository.kt` and `modules/RecordsModule.kt`.

Final actual-device evidence is `/tmp/leanon-android-daily-recovery-qa/evidence-manifest.json`, on emulator-5554 / Android 15 API 35 / 1080×2400 / zh-CN / Asia/Shanghai.
Embedded bundle SHA-256 is `23593dc3f5eecd295b451d9068aa33d5a3f550d62dceb1961e2b7dc071b636e1`; immutable QA APK SHA-256 is `35dd007aff2e99630a1dd23995ea25c9911cb144570bd495cdc588d26986399f`.
Official Instrumentation/UiAutomation gestures operated a disposable `cache/daily-ui/records.json` repository in `com.zzzode.leanon.uiqa`.
Actual setup cancel/save, October 5 meal backfill/edit/delete-cancel/delete/Undo, weight 71→72 kg, water 750→500 ml and walking 30→45 minutes passed.
The October 5 draft stayed pinned across the injected app clock changing to October 7 and a light-to-dark appearance event.
After explicit force-stop, a new PID reopened revision 13 and restored the same deleted exercise ID through the actual Restore button at revision 14.

A controlled corrupt-cache read failure kept a 175 g meal draft open for 88.13 seconds of continuous foreground time.
Restoring the exact original bytes and pressing Save in that same modal succeeded without Home navigation or an automatic revision rebase.
A bounded second failure confirmed visible red save feedback after scrolling the sheet body; initial feedback visibility is a remaining P1 discoverability limitation.
The hidden global refresh notice is not claimed as visually observed.

Original isolated `files/records.json` remained byte-identical (`bf2eb866a8d4011f4329d5f50eee9b587c8821c969606172cae4dd8b208c088b`); production records were never accessed or mutated.
Cleanup restored only the app's QA appearance preference and internal clock override to system behavior, then stopped the QA app; no OS clock, time-zone or permission was changed.
Natural active midnight, real health providers/hardware/notifications, and separate final-bundle weight/water delete gestures remain outside this UI acceptance.
Legacy/conflict/eligibility edge cases have native/conformance coverage, not a blanket actual-UI claim.
Earlier 98f failure diagnostics, 366 successful checkpoints and 827 checkpoints retain their own hashes and are not relabeled as final 235 evidence.
