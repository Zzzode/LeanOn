# Android Host (Kotlin)

English · [简体中文](README.zh-CN.md)

The Android native shell and Lynx runtime container.

## Responsibilities

- App shell: launch, single-activity navigation, lifecycle
- Lynx container: `LynxView` creation/reuse, bundle loading via an injected resource provider,
  routing and module security
- Bridge server: native modules for every capability domain (see `@zzzode/bridge` and RFC 0005)
- Native capabilities: Health Connect, background tasks (`WorkManager`), notifications, camera,
  Bluetooth
- System targets: App Widget / Quick Settings Tile, standalone Wear OS app

## Layout

```
app/src/main/java/com/zzzode/leanon/
├── LeanOnApplication.kt        # process init, host singletons
├── MainActivity.kt             # single-activity shell
├── container/                  # LynxContainer and BundleResourceProvider
├── bridge/                     # CapabilityRegistry, GlobalEventDispatcher, auth, bootstrap
└── modules/                    # Health, Scale, Storage, Resource, App, Notification modules
```

## Build

Requires the Android SDK (compile/target SDK 35, min SDK 26) and JDK 17.

```bash
./gradlew :app:assembleDebug
```

Lynx artifacts (`org.lynxsdk.lynx:*`) are pinned in `gradle/libs.versions.toml`.

## Appearance and isolated UI checks

Appearance defaults to system and persists separately from health records.
`app.getAppearance`, `app.setAppearance` and `app.appearanceChanged` share the preference and resolved mode with Lynx.
The host injects both values before bundle rendering and handles `uiMode` changes without replacing the current route or modal draft.
Android 12+ persists the platform application night mode to match launch backgrounds; older hosts use AppCompat.
The approved tab-bar geometry and motion stay intact, with night-qualified material and label colors.
Keyboard appearance is controlled by the installed IME and its system settings.

Build a disposable sandbox with `./gradlew :app:assembleDebug -PleanonUiQa=true`.
Only that debug `.uiqa` application accepts `leanon_qa_route` (`today`, `diary`, `progress`, `partner`, `me`, `settings`), `leanon_qa_appearance` (`system`, `light`, `dark`), and `leanon_qa_now` (ISO8601 with offset, or `system`) launch extras.
The normal application ignores these extras.
The extras change only QA navigation, appearance and an in-memory fixture clock, never health records.
The ordinary app derives local date/hour and check-in streak from the real clock; persisted seed metadata is not authoritative.
The QA clock does not persist across process restart.
For example, launch the real Settings screen in dark mode using the existing Android activity command:

```bash
adb shell am start -W --activity-single-top \
  -n com.zzzode.leanon.uiqa/com.zzzode.leanon.MainActivity \
  --es leanon_qa_route settings --es leanon_qa_appearance dark
```

Capture actual device pixels with `adb exec-out screencap -p`.
These captures validate rendering; they do not replace supported manual keyboard, cancellation, saving or Back checks.

An explicit demo clock is `--es leanon_qa_now '2026-10-01T19:00:00+08:00'`; reset with `--es leanon_qa_now system`.
Official cache-only native parity instrumentation requires no extra test dependencies:

```bash
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest -PleanonUiQa=true
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -r com.zzzode.leanon.uiqa.test/com.zzzode.leanon.qa.ParityInstrumentation
adb shell run-as com.zzzode.leanon.uiqa cat cache/parity-qa-report.json
```

The runner refuses other app IDs, writes record/settings/export-version fixtures only under cache, and compares the application's record-file hash before/after.
The earlier settings/export reliability run passed 119 JVM tests and 15 isolated device checks; this does not establish real provider, notification or UI save-button acceptance.
Native fixture checks are persistence evidence, not save-button acceptance.
Accessibility actions are logged individually; missing nodes and failed actions are not passing UI interactions.
See [the parity audit](parity-audit-2026-10-06.md) for source evidence and coverage limits.

## Daily journal transactions

A normal fresh installation starts with an empty schema-2 journal and no profile or copied demo records.
`records.getSnapshot` and `records.mutate` own profile setup and historical weight, water, exercise and meal entries.
Mutations atomically persist a revision, unbounded operation receipts and full deletion tombstones; exact retries return the current snapshot, while stale drafts and occupied restore targets fail with `conflict`.
External health mirrors remain read-only when addressed explicitly.
Legacy aggregate intake stays identifiable rather than becoming invented meals, and reading its migration does not rewrite the file.
Malformed or unsupported files fail closed.
Lynx uses a private JSON request envelope for this RPC so explicit nullable fields survive its native map conversion; native validation still distinguishes missing fields from null.
Foreground minute refresh and date/time/time-zone broadcasts update derived local dates without changing a draft's selected date.

The debug `.uiqa` Instrumentation runner can install a disposable cache-only repository with `-e scenario daily-interactive -e reset true`.
It captures actual device pixels and accessibility hierarchy after official gestures; reviewed screenshot coordinates are used where Lynx does not expose button nodes.
This repository override is guarded by both a debug build and the `.uiqa` application ID, and is not exposed as a product RPC.
The same fixture can be reopened with `reset false` after force-stopping the QA process to check persistence.
Native unit/conformance tests are separate from these actual button checks.

The final daily-journal native run passes 154 JVM tests and release Kotlin compilation.
The shared worked conformance fixture covers ten successful operations and three expected failures, separately from official UI sessions.
Actual final-bundle UI evidence and its device, clock, process and namespace boundaries are recorded in [the parity audit](parity-audit-2026-10-06.md).

## Private personal data, backup and companion sync

`personal.*` owns versioned dietary preferences, body measurements and sanitized JPEG photos with durable operation receipts.
Records, personal collections, photo bytes, companion credentials and export revisions use AES-GCM documents with Android Keystore wrapping a random data key.
Existing plaintext journals and export ledgers remain readable without a write; their next successful explicit mutation encrypts them.
Photo previews are bounded, cleared on background/close/revocation, and recreated with a new URI generation after foregrounding.
User-selected photo/document pickers do not require broad media or camera permission.

Encrypted backups use exact UTF-8 passwords, PBKDF2-HMAC-SHA256 with 600,000 iterations and authenticated AES-256-GCM.
Import inspection is read-only and expires after five minutes; explicit restoration checks both store revisions and uses a recoverable private transaction journal.
Companion account, device authorization, invitation confirmation, granular sharing, ciphertext sync and durable encouragement acknowledgement use a user-configured HTTPS relay.
Login does not attach local health data: a separate account-named consent checks both local revisions before exporting.
Debug `.uiqa` alone accepts a loopback HTTP relay for isolated acceptance.
Deleting local data cancels old health sync work, disables automatic Health Connect import and clears local export metadata without deleting system health records.

The native Lynx container applies Android font scale and updates it without recreating the current draft.
Official instrumentation distinguishes generated-image/native checks, actual UI actions, and real local-relay interoperability.
OS picker, camera, provider permission, hardware and full TalkBack acceptance require separate explicit device verification.
Current checkpoints and limitations are tracked in [the private-data acceptance record](full-product-acceptance-2026-10-07.md).

## Status

Build the native host with Android Studio or Gradle; it is not compiled in the project's Linux CI.
Local record persistence, scanners, reminders, Health Connect and standard BLE have implemented paths with separate device acceptance boundaries.
Reminder and Health Connect preferences use an atomic private `settings.json` snapshot; the first successful write imports legacy SharedPreferences without deleting them.
Corrupt or failed writes are reported, and startup/foreground/worker paths preserve the original file.
Reminder updates await WorkManager acknowledgement and attempt to restore previous preferences/work on scheduling failure.
Health Connect enabling requires full permissions and an initial successful sync.
Exports durably reserve a content revision in `health-connect-export-versions.json` before insertion: initial revision 2, identical retries unchanged, edits incremented.
Provider calls are serialized; a failed sync does not acknowledge a new completion timestamp.
Reminder/connection settings remain atomic private preferences; health collections and derived export metadata are encrypted.
Generic resource delivery (RFC 0007) and the separate generic `storage.*` RPC remain unavailable and are not advertised.

## Related RFCs

- RFC 0005 bridge protocol
- RFC 0006 native host and Lynx container
- RFC 0007 dynamic-delivery channel
- RFC 0008 data model, encrypted storage and sync
