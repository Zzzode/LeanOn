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

The native sources are reviewed skeletons and are not compiled in the project's Linux CI. Build
them in Xcode; the resource provider (RFC 0007) and encrypted storage (RFC 0008) are wired in
later RFCs.

## Related RFCs

- RFC 0005 bridge protocol
- RFC 0006 native host and Lynx container
- RFC 0007 dynamic-delivery channel
- RFC 0008 data model, encrypted storage and sync
