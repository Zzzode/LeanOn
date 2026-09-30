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

## Status

The native sources are reviewed skeletons and are not compiled in the project's Linux CI. Build
them in Android Studio; the resource provider (RFC 0007) and encrypted storage (RFC 0008) are
wired in later RFCs.

## Related RFCs

- RFC 0005 bridge protocol
- RFC 0006 native host and Lynx container
- RFC 0007 dynamic-delivery channel
- RFC 0008 data model, encrypted storage and sync
