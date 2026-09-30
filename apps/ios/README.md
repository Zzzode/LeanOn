# iOS Host (Swift)

English · [简体中文](README.zh-CN.md)

The iOS native shell and Lynx runtime container.

## Planned responsibilities

- App shell: launch, navigation/tabs, authentication
- Lynx container: `LynxView` creation and pooling, lifecycle, `LynxResourceProvider` injection
- iOS bridge implementation (see `@zzzode/bridge` and RFC 0005)
- Native capabilities: HealthKit, background tasks (`BGTaskScheduler`), notifications, camera,
  Bluetooth
- System targets: Widget / Live Activity / App Shortcuts, standalone watchOS app

## Related RFCs

- RFC 0005 bridge protocol
- RFC 0006 native host and Lynx container integration
- RFC 0007 dynamic-delivery channel
