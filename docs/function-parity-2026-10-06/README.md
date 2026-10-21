# Platform capability parity

[简体中文](README.zh-CN.md)

Branch: `main`, HEAD: `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`.
This checkpoint includes pre-existing changes and authorized, uncommitted parity implementation.
No commit, push, deployment, account service or partner backend is part of this work.
Normal user records are not used; tests use isolated synthetic files, clocks and SDK clients.

## First batch

iOS now implements the existing water, custom-food create/update/delete, favorites and scanned-food storage contracts.
Recent-food ordering and its twelve-item limit remain durable.
The shared water controls are visible earlier, work without a weight sample and report pending/failure states.
Native capability lists must be well formed before pages enable writes.
Scanning requires the scanner, lookup and product-storage methods together.
Both hosts derive the current local date, hour and logging streak without changing historical records or profile data.
Android persistence is synchronized and atomic; invalid dates, wrong types and custom-food ownership are validated.
Only falsely advertised TODO methods were removed from the capability list; implemented Android features remain.
Those TODO calls now return explicit unavailable errors rather than remaining pending forever.

## Capability matrix

Source implementation and runtime acceptance are different columns.
The baseline matrix was read before and during concurrent implementation; final evidence must identify its own build.

| Capability / result | iOS source | Android source | UI / persistence / permission | Acceptance boundary |
|---|---|---|---|---|
| Weight | Daily upsert | Daily upsert | Shared input; durable local file | Previous UI verification is separate; no weight delete or historical editor |
| Intake | Daily accumulation | Daily accumulation | Food search/portion; kcal/macros/micros persisted | No meal identity, per-meal edit or delete |
| Exercise | Create/update/delete | Create/update/delete | Persistent ID; imported mirrors read only | Native validation uses 1–1440 minutes; real CRUD QA recorded separately |
| Water | Added absolute daily-total upsert | Existing upsert retained | Shared +/− 250 ml, pending guard and retry; atomic file | iOS Light/Dark save/relaunch/failure/recovery passed; Android isolated fixture persistence passed, buttons unverified |
| Custom foods | Added create/update/delete | Existing CRUD strengthened | Same form; default portion may be cleared; OFF identity preserved | iOS Light/Dark cancel/create/edit/delete/relaunch passed; Android native fixture and validation passed, form unverified |
| Favorites / recent | Persistent favorites added; recent retained | Both retained; recent deduplicated | Shared sections and toggles; twelve recent IDs | Shortcuts are not meal history |
| Product storage | Added `off-<barcode>` upsert | Existing upsert retained | Stored before portion entry | Does not establish camera or network readiness |
| Barcode / lookup | AVFoundation + URLSession added | CameraX/ML Kit + OFF retained | Explicit camera permission; timeout, cancellation and unavailable errors | Real recognition needs a camera device; network behavior uses fixtures |
| Reminders | UserNotifications + atomic preferences added | WorkManager + preferences retained | Explicit notification permission; smart silence and localized content | iOS uses a 28-day rolling horizon, refreshed on foreground/settings/records; delivery and OS background behavior need device QA |
| Health integration | HealthKit weight/workout mirror and eight daily nutrition exports added | Health Connect retained; export failure/echo/version handling fixed | Explicit enable/permission; read-only external records; per-type writes and unknown HealthKit read access separated | Injected SDK/ledger tests; no real health store or permission grant; nutrition is write-only |
| BLE | CoreBluetooth standard SIG scale added | Standard SIG implementation retained | Explicit scan/connect; pairing, timeout, status and durable successful reading | Physical discovery/indication/reconnect/permission acceptance required |
| Appearance | Existing persisted system/light/dark retained | Same | Same shared palette; native chrome/keyboard | Previous six-screen evidence is a distinct checkpoint; new parity screenshots identify the new bundle |
| Generic health/storage/resource | Not advertised as implemented | Placeholder claims corrected | Explicit unavailable callbacks | Not a substitute for platform health integration or encrypted record storage |

## Remaining shared product work

Profile and goal mutation/onboarding, historical-date selection, meal identities and correction/deletion are not implemented on either platform.
Daily weight upsert and daily intake accumulation must not be described as complete record CRUD.
Accounts and real partner linking, consent, delivery and cloud sync are absent on both platforms and require separate design.
No feature is considered hardware ready because its capability name, source or fake-client tests exist.
VoiceOver/TalkBack, enlarged type, small/physical devices and pending-save native Back remain separate acceptance work.

## Later reliability batches

Android settings now migrate on first successful write from legacy SharedPreferences to a synchronized atomic JSON file.
Corrupt settings retain their bytes and fail closed; app startup, foreground, worker and module callers report or contain those failures.
Enabling reminders and Health Connect validates native permission, not just UI availability.
Reminder success waits for WorkManager acknowledgement and durable settings, with best-effort rollback on scheduling failure.
Health Connect reserves durable versions before export: legacy version 1 is superseded by 2, unchanged retries keep their version, and edited/reverted content advances it.
Exports and provider deletions are serialized; failed provider work does not stamp a successful complete sync.
Rollback of an enable preference does not undo already completed provider writes or legitimate imported mirrors.

Scanning now distinguishes camera permission/unavailability, product lookup, missing energy and product-storage failure.
A simulator camera failure no longer displays an Open Food Facts network error.
Reminder loading/reading failure hides unknown slots and blocks Save, preserving Cancel and Retry.
The shared UI no longer substitutes guessed reminder defaults when native reading fails.

## Verification checkpoints

The first shared bundle is `fd1f1ceb7ff182eac340b798109fb42ee3139c99332a8e1525f96a43c4ee55b8`.
Its workspace build/typecheck and 235 tests, Android 88 unit/7 device fixture checks, and iOS 99 unit tests passed.
Two iOS basic UI cases passed in both Light and Dark, exporting 20 actual screenshots.
The basic checklist and dual-mode collages are saved separately to Library before later platform work.

The final shared bundle is `5e00a89740d78d17ce0dfcaad708a78396f50911725275f13e5afb338cb6a583`.
Workspace build/typecheck and 246 tests passed; final Android 119 unit and 15 device fixture checks passed.
The final iOS app passed 107 unit tests and five distinct UI cases: basic water/food, health status, camera-unavailable draft/cancel and reminder read-error/retry.
It exports 17 final screenshots; the first 20 Light/Dark basic screenshots remain versioned separately.
The isolated `com.zzzode.leanon.uiqa` notification experiment was stopped after updated permission instructions arrived.
It had already granted real OS notification permission and saved/relaunched synthetic settings without direct user approval.
This is a permission-boundary incident, not an approved acceptance run.
Only that isolated app was uninstalled at 15:01:42 UTC, before its 15:04 UTC deadline; no delivery was observed.
Normal-app records and permissions were not changed.
Any future actual OS notification, HealthKit, camera or Bluetooth permission acceptance requires explicit user approval, including isolated apps.
The unsigned simulator proves status/UI behavior, not actual HealthKit authorization; signed/provisioned device validation remains necessary.
The initial fresh Pod build exposed missing Lynx generated headers/sources; vendored official 3.9.0 outputs and Pod hooks restored reproducible builds.
An Android repack with stale assets was rejected before installation; the installed final APK's embedded bundle bytes were verified.
Earlier screenshots remain tagged with their own native and bundle hashes, and are not relabeled as the final build.

See [RFC 0031](../../rfcs/0031-platform-capability-parity.md) for platform decisions and [the appearance checkpoint](../theme-implementation-2026-10-06/README.md) for prior evidence.
