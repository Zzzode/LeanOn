# Android Host (Kotlin)

English · [简体中文](README.zh-CN.md)

The Android native shell and Lynx runtime container.

## Planned responsibilities

- App shell: launch, navigation/tabs, authentication
- Lynx container: `LynxView` creation and pooling, lifecycle, `LynxResourceProvider` injection
- Android bridge implementation (see `@zzzode/bridge` and RFC 0005)
- Native capabilities: Health Connect, background tasks (`WorkManager`), notifications, camera,
  Bluetooth
- System targets: App Widget / Quick Settings Tile, standalone Wear OS app

## Related RFCs

- RFC 0005 bridge protocol
- RFC 0006 native host and Lynx container integration
- RFC 0007 dynamic-delivery channel
