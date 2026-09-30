- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0001, 0005, 0007, 0008

# Native Host and Lynx Container

English · [简体中文](0006-native-host-and-container.zh-CN.md)

## Summary

Design the iOS (Swift) and Android (Kotlin) **native hosts** that embed Lynx and act as the
**server side of the bridge**:

- App shell: launch, single-container navigation, lifecycle
- Lynx container: `LynxView` creation/reuse, bundle loading via an injected resource provider,
  routing and module security
- Native modules implementing every capability domain from RFC 0005, including callbacks and
  native → JS global events
- A capability registry that answers `app.getCapabilities`

The TypeScript packages remain the source of the contracts; the hosts implement them.

## Motivation

- Lynx has no built-in resource loading and no access to platform APIs; the host must supply a
  bundle loader and native capabilities before any page can run.
- RFC 0005 defines a typed client and an injected transport, but the real transport and the
  request handlers only exist natively. This RFC connects them.
- Two independently versioned hosts must register exactly the methods/events they implement so
  dynamic bundles can negotiate support safely.
- Native calls need a security boundary (which page may call which method) and must follow the
  platform lifecycle and background constraints.

## Guide-level explanation

- Each platform is a thin shell hosting one reusable Lynx container. The container loads a named
  route's bundle through a host-provided resource provider (local cache first, then the network;
  see RFC 0007).
- The host registers one native module per capability domain. JS requests arrive as exported
  methods; results return through callbacks/promises, and the host pushes events through the
  global event emitter.
- A capability registry maps the same fully-qualified method names used by the TS contracts, so
  `app.getCapabilities` reports the live surface.
- A module-auth validator gates calls per container, and platform health/BLE/storage code lives
  under `native/*` and is injected into the modules.

## Reference-level explanation

### App shell

- **Android**: a single `Activity` (no fragment-per-screen); `Application` initializes Lynx once
  and registers modules. Navigation is route-driven inside the container.
- **iOS**: `AppDelegate`/`SceneDelegate` initialize Lynx and present one container view
  controller. Routing is likewise route-driven.
- Both keep native UI to the minimum (splash, permissions, rare full-screen flows).

### Lynx container

- Owns a `LynxView` (Android) / `LynxView : UIView` (iOS), with view reuse/pooling across routes.
- Loads bundles through a **resource provider** the host injects (Lynx itself does not fetch):
  local signed cache → network, with integrity verification (RFC 0007).
- Binds the global event emitter and installs the module-auth validator before loading a page.
- Exposes route operations: open route, replace, back; init data is passed per route.

### Native modules are the bridge server

- **Android**: a class extends `com.lynx.jsbridge.LynxModule`; exported methods carry
  `@LynxMethod`; results use `com.lynx.react.bridge.Callback` or promises. Modules are registered
  once with `LynxEnv.inst().registerModule(name, class)`; the annotation processor
  (`lynx-processor`) is wired via kapt.
- **iOS**: a class implements the `LynxModule` protocol, with static `name` and `methodLookup`
  mapping JS method names to selectors; results use callback blocks. Modules are registered during
  Lynx environment setup.
- **Native → JS events**: the host calls the global event sender
  (`sendGlobalEvent(eventName, params)` with cloneable params); JS subscribes via
  GlobalEventEmitter.
- Only cloneable structured data crosses; native code converts platform types to the flat DTOs
  declared in the TS contracts.

### Capability registry and negotiation

A host-side registry enumerates supported fully-qualified methods and events plus the bridge
protocol version. `app.getCapabilities` returns it directly, and `app.getInfo` returns platform,
host version, device model and OS version. Feature code hides anything not listed.

### Module security

- The container installs an auth validator that receives (module, method, params) per call and
  returns allow/deny; denied calls produce a JS error rather than executing.
- This enforces least privilege for dynamically delivered bundles and provides a single audit
  point, independent of the capability check.

### Capability domain modules

| Module | Backed by (native/*) | Pushed events |
|---|---|---|
| Health | `native/health-adapter` (HealthKit / Health Connect) | `health.authorizationChanged` |
| Scale | `native/ble-scale` | `scale.discovered`, `scale.reading` |
| Storage | encrypted store (RFC 0008) | — |
| Resource | bundle provider/cache (RFC 0007) | — |
| App | host info/capabilities/lifecycle | `app.lifecycle` |
| Notification | platform notifications + background scheduling | — |

Modules are thin adapters; substantive logic (auth flows, BLE state machine, encryption) stays in
reusable native components under `native/*`, keeping modules testable and consistent across
platforms.

### Lifecycle and background

- Background work uses platform schedulers (Android `WorkManager`; iOS background tasks).
- Foreground/background transitions emit `app.lifecycle`; long operations and sync (RFC 0008) do
  not block the UI and respect battery policies.

### Project layout

- **Android**: Gradle Kotlin DSL with a version catalog (`gradle/libs.versions.toml`), `app/`
  containing the shell, container, modules and registry.
- **iOS**: Swift sources plus an **XcodeGen** `project.yml`; the `.xcodeproj` is generated on
  demand rather than committed, avoiding merge conflicts and UUID churn.

## Build and verification

- Android requires the Android SDK + Gradle; iOS requires macOS + Xcode. Neither can be compiled
  in the current Linux/CI environment, so the native sources are delivered as reviewed skeletons
  and must be built in their platform toolchains. CI currently verifies the TypeScript workspace
  (typecheck/build/test); native CI (emulator/device or at least Gradle/Xcode builds) is added when
  a platform runner is available.

## Drawbacks

- Maintaining two native implementations doubles the surface; skeletons cannot be compiled here,
  so platform errors surface only in the native IDE.
- Generating the iOS project adds a XcodeGen dependency; committing it would trade that for merge
  conflicts.
- The module-auth validator and capability registry are extra host bookkeeping.

## Rationale and alternatives

- **Cross-platform native framework (Flutter/KMP for the shell)**: would replace Lynx and lose
  dynamic UI; rejected.
- **Commit generated Xcode/Gradle projects only**: convenient for iOS but conflict-prone and
  opaque; XcodeGen keeps the definition declarative. Gradle files are already text and are kept.
- **Implement logic directly inside modules**: couples transport to platform code; rejected in
  favour of reusable `native/*` components injected into thin modules.
- **No auth validator**: simpler but gives every dynamic bundle full native access; rejected.

## Unresolved questions

- Concrete HealthKit/Health Connect and BLE error → `RpcErrorCode` mapping.
- Whether to publish native modules as autolink libraries (`lynx.lib.json`) now or keep them
  in-app until the surface stabilizes.
- CI strategy for native builds (hosted macOS/Android runners, required secrets).
- Shared native C/C++ via Node-API for any logic that must be identical across platforms.

## Implementation plan

- [x] Container and host design (this RFC)
- [ ] Android Gradle skeleton, shell, container, modules, registry
- [ ] iOS Swift skeleton and XcodeGen project definition
- [ ] Real resource provider wiring (RFC 0007)
- [ ] Encrypted storage backing the storage module (RFC 0008)
- [ ] Native build/CI in platform toolchains

## References

- Lynx: integrate with existing apps (Android Gradle artifacts; iOS LynxView and bundle loader).
- Lynx: native modules (Android `LynxModule`/`@LynxMethod`/`registerModule`; iOS `LynxModule`,
  `name`/`methodLookup`).
- Lynx: native module permission validator; global events (`sendGlobalEvent`).
