# iOS Host (Swift)

English · [简体中文](README.zh-CN.md)

The iOS native shell and Lynx runtime container.

## Responsibilities

- App shell: launch, single-container navigation, lifecycle
- Lynx container: `LynxView` hosting, bundle loading via an injected resource provider, routing and
  module security
- Bridge server: native modules for every capability domain (see `@zzzode/bridge` and RFC 0005)
- Native capabilities: HealthKit, background tasks, notifications, camera, Bluetooth
- System targets: Widget / Live Activity / App Shortcuts, standalone watchOS app

## Layout

```
LeanOn/
├── App/                        # AppDelegate, SceneDelegate
├── Container/                  # LynxContainerViewController, BundleResourceProvider
├── Bridge/                     # CapabilityRegistry, GlobalEventDispatcher, LynxRuntime
└── Modules/                    # App, Health, Scale, Storage, Resource, Notification modules
```

## Build

The Xcode project is generated with [XcodeGen](https://github.com/yonaskolb/XcodeGen) rather than
committed. Requires macOS, Xcode and iOS 15+.

```bash
brew install xcodegen
xcodegen generate
open LeanOn.xcodeproj
```

Lynx is integrated via CocoaPods or the Swift package using the pinned 3.9.x distribution (see
`project.yml`).

## Status

The host implements local weight/intake/exercise/water records, custom/scanned food CRUD, favorites and recent shortcuts.
Formal first launch has no demonstration profile or records; profile and goals remain unset until saved.
`records.getSnapshot` and `records.mutate` expose schema 2 snapshots and atomic, revision-checked transactions.
The Lynx transport uses a private JSON envelope for mutations because the SDK's object conversion drops null-valued request properties; native decoding preserves explicit nulls and retains strict validation of missing fields.
Operation receipts make retries idempotent; deletion tombstones support Undo and restoration after restart without overwriting newer records.
Legacy daily intake remains identifiable aggregate history alongside individual meal entries; daily totals are derived from both.
Reading an established legacy file does not commit migration, and malformed files retain their bytes.
Only explicitly injected test seeds can initialize a QA file during a read.
Local midnight, time-zone changes and foreground activation refresh runtime calendar metadata.
AVFoundation barcode scanning, Open Food Facts lookup, HealthKit and standard SIG Bluetooth scales are integrated through the bridge.
HealthKit reads weight/workouts and exports LeanOn weight, workouts and eight daily nutrition quantities with per-type write authorization.
Read authorization remains unknown; injected-client tests do not establish physical-device readiness.
UserNotifications reminders persist only after scheduling succeeds, using a 28-day rolling horizon refreshed on foreground/settings/records.
The native sources build and run XCTest on macOS, but are not compiled in the project's Linux CI.
The resource-delivery provider and encrypted storage remain separate RFC work; current record files are not described as encrypted.
Widget, Live Activity, App Shortcuts and watchOS are planned targets, not completed capabilities.

The pinned Lynx 3.9.0 Pod archive omits generated headers and error-code sources.
`Podfile` stages the vendored, official generated outputs and iOS build configuration for a reproducible fresh installation.
See [support provenance](support/README.md).

## Appearance and isolated UI checks

Settings persists `system` (default), `light`, or `dark` through `app.setAppearance`.
The window override and shared-page bootstrap are set before the first Lynx mount.
`app.appearanceChanged` updates every mounted route alongside native chrome and input keyboards.
The native tab bar keeps its geometry and motion; its selected tint adapts for dark backgrounds.
The named launch background follows the OS appearance.
An explicit app preference opposite to the OS can still produce a launch-screen-to-app color transition.

Build the page bundle, regenerate the project, and install the local Pods before running `LeanOnTests` or `LeanOnUITests`.
UI tests use `LEANON_RECORDS_PATH` and the separate QA preferences suite, leaving normal records and preferences untouched.
Daily-life UI QA also requires the separate `com.zzzode.leanon.uiqa` app build override; never install or launch the normal app for these tests.
Permissionless record QA leaves notification approval flags unset and aborts on any unexpected OS permission alert.
Debug-only `LEANON_QA_NOW` and `LEANON_QA_TIME_ZONE` are honored only with an isolated records path.
The disposable `com.zzzode.leanon.uiqa` app additionally accepts a paired `LEANON_QA_CLOCK_PATH` equal to `LEANON_RECORDS_PATH + ".clock.json"`, only for `/tmp/leanon-daily-ui-*` fixtures.
The JSON fixture requires an ISO timestamp `now` and a known `timeZone`; malformed fixtures fall back to the actual system clock and calendar.
This supports controlled foreground/date-change tests, without changing the OS clock or claiming naturally observed midnight behavior.
Basic-record tests cover real form cancel/create/edit/delete/relaunch and water write-failure recovery.
Health-status UI tests query status only and do not request authorization, enable sync or read system samples.
Use `test-without-building` with an isolated `.xctestrun` environment for app-hosted unit tests as well.
The foreground system-switch test is opt-in with runner environment `LEANON_SYSTEM_UI_TESTS=1`.
An external simulator controller reads `/tmp/leanon-theme-ios-system-step.txt`, switches appearance on each `await-*` marker, and acknowledges keyboard phases with `keyboard-dark-sent` or `keyboard-light-sent`.
Without that controller, leave the opt-in unset so the test skips.

Actual OS permission grants require direct user approval, including in an isolated `.uiqa` app.
Notification permission QA must use an app-only build override `LEANON_APP_BUNDLE_IDENTIFIER=com.zzzode.leanon.uiqa` and a separate DerivedData directory.
Only after that approval may the runner set both `LEANON_NOTIFICATION_QA=1` and `LEANON_NOTIFICATION_QA_APPROVED=1`; otherwise the test skips before launching or requesting permission.
Never grant permissions in the normal app for QA, and uninstall only `.uiqa` after an approved experiment to clear its pending notifications and permissions.

## Related RFCs

- RFC 0005 bridge protocol
- RFC 0006 native host and Lynx container
- RFC 0007 dynamic-delivery channel
- RFC 0008 data model, encrypted storage and sync
- RFC 0031 platform capability parity
