- Start Date: 2026-10-03
- RFC Type: architecture
- Status: Accepted
- Related: 0005, 0006, 0007, 0008, 0009, 0021, 0025

# iOS Host Landing

## Summary

Bring the iOS native host from reviewed skeleton to a fully working application by integrating
the Lynx iOS engine, hosting the shared Lynx bundle, porting the Android data and capability
layers to Swift, and adding HealthKit, notifications and Bluetooth, so the same screens and
domain logic run on both Android and iOS.

## Motivation

The Android host is feature complete through RFC 0025, but the iOS sources under `apps/ios` are
uncompiled skeletons: `LynxRuntime.initialize()`, the container's `viewDidLoad()` and the bundle
provider are empty or `fatalError`, and the Lynx engine is not integrated. The project's Linux CI
cannot build iOS, so this work was deferred until a Mac was available. Without it the app only
ships on Android, even though the product promises both platforms and the two-person use case
relies on whichever phone each partner carries.

## Guide-level explanation

A user installs LeanOn on an iPhone and gets the same Home, sheets and flows as on Android:
log weight, meals, exercise and water; see energy, macros, micronutrients and insights; grant
Health access; pair a Bluetooth scale; and receive smart reminders. The TypeScript packages
(`core`, `pages`, `i18n`, data packages) are shared unchanged; only the platform shell and
platform capabilities are rewritten in Swift. Health data on iOS is stored in HealthKit rather
than Health Connect, but the behavior, scope and mirror model are identical.

## Reference-level explanation

### Dependency management and toolchain

- Lynx is integrated with **CocoaPods**, the distribution channel the Lynx team supports for the
  pinned 3.9.x line:

  ```ruby
  source 'https://cdn.cocoapods.org/'
  platform :ios, '15.0'
  use_modular_headers!
  target 'LeanOn' do
    pod 'Lynx', '3.9.0', :subspecs => ['Framework']
    pod 'PrimJS', '3.8.0-alpha.6', :subspecs => ['quickjs', 'napi']
  end
  ```

- Workflow: `xcodegen generate` produces `LeanOn.xcodeproj`, `pod install` produces
  `LeanOn.xcworkspace`; all builds target the workspace. The generated project, Pods and
  workspace are git-ignored.
- Swift 5, iOS deployment target 15.0, no development team (the simulator does not code-sign).

### Process and container

- `LynxRuntime` performs one-time `LynxEnv` setup and registers native modules; it is called from
  `AppDelegate.didFinishLaunching`.
- `LynxContainerViewController` owns a single `LynxView`, pins it to the view with Auto Layout,
  loads `main.lynx.bundle`, and injects the initial data. It also binds the event dispatcher and
  the module registry. The exact `LynxView` construction and template-loading API for 3.9 is
  validated against the official iOS integration guide during implementation.
- `BundleResourceProvider` reads `main.lynx.bundle` from `Bundle.main` for v1. The signed cache
  and network fallback from RFC 0007 are layered on later and do not change the container API.
- The Lynx bundle is bundled as a resource. `project.yml` references
  `../../packages/pages/dist/main.lynx.bundle`; building requires `pnpm --filter @zzzode/pages
  build` first, mirroring Android's `prepareLynxAssets`.

### Bridge and data layer

- Native modules expose the same method and event names as `packages/bridge/src/contracts.ts`;
  `CapabilityRegistry` is updated to the full method set and kept in lockstep with the contract.
- A Swift `RecordsStore` ports `RecordsRepository`: a JSON file in the Documents directory,
  copied from a bundled seed on first launch, with the same add/update/delete and external-mirror
  operations. Domain calculations stay in the shared TypeScript `core`; Swift only persists and
  provides data, matching the Android division of responsibility.
- Modules: `AppModule` (info/capabilities), `HealthModule` (HealthKit), `ScaleModule`
  (CoreBluetooth), `StorageModule`, `ResourceModule`, `NotificationModule` (UserNotifications).

### HealthKit mapping and scope

- Body mass maps to `HKQuantityTypeIdentifier.bodyMass` (kilograms); workouts map to
  `HKWorkout` with an activity-type mapping equivalent to `ExerciseTypeMapping`. Workout energy
  is recomputed in Swift with the same `MET x kg x h` formula, never taken from an external total.
- Scope matches RFC 0025: two-way sync covers **weight and workouts only**; nutrition and water
  reads stay out until a meal-fingerprint design exists. External HealthKit samples are shown as
  read-only mirrors using the rebuild model, with echo suppression for records LeanOn wrote.
- `DataSource` is extended to `'leanon' | 'health_connect' | 'healthkit'`. The mirror badge label
  is localized and shows "HealthKit" on iOS and "Health Connect" on Android.

### Continuous integration

- A separate `ios.yml` workflow on a macOS runner runs `xcodegen generate`, `pod install`, then
  `xcodebuild` for the simulator SDK. Because macOS runners are slower and billed differently,
  the workflow can be limited to `main` and manual dispatch initially.

## Drawbacks

- CocoaPods adds a Ruby toolchain and makes first-time install and compilation slow; the workspace
  and Pods must be regenerated when the project spec changes.
- The shell and platform capabilities are written twice (Kotlin and Swift), so contracts and
  mappings must be synchronized manually; drift is a real risk.
- A macOS CI job is slower and more expensive than the Linux jobs.

## Rationale and alternatives

- CocoaPods over Swift Package Manager because Lynx ships stable 3.9.x binaries through
  CocoaPods; Swift Package Manager support is not the supported path for this pin.
- Reusing the single Lynx bundle and TypeScript packages means UI, i18n and domain logic have one
  source of truth; only thin platform shells differ, which is the core reason for the Lynx x Native
  architecture. A second native UI implementation (e.g. SwiftUI screens) would duplicate every
  screen and was rejected.

## Unresolved questions

- The precise Lynx iOS 3.9 API for creating a `LynxView` and loading a template/initial data is
  confirmed against the official guide during the first slice.
- The complete HealthKit workout activity-type mapping and the resource layout for the bundle are
  finalized while porting the exercise slice.

## Implementation plan

Landed as vertical slices, each compiling and running on the iOS simulator:

1. Base: Podfile, `LynxRuntime`, container, bundle packaging, seed initial data, `AppModule`; the
   Home renders from the seed.
2. `RecordsStore` plus the weight write path.
3. Food logging: search, custom foods, barcode (camera + Open Food Facts).
4. Exercise, water and micronutrients.
5. Insights (shared `core`, no native change).
6. HealthKit two-way sync for weight and workouts.
7. Notifications and smart reminders.
8. Bluetooth scale via CoreBluetooth.
9. iOS CI workflow and full simulator verification.

Follow-up RFCs cover dynamic bundle delivery (RFC 0007 on iOS), encrypted storage and sync
(RFC 0008), and watchOS, widgets and Live Activities, all of which remain non-goals here.
