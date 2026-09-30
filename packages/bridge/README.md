# @zzzode/bridge

English · [简体中文](README.zh-CN.md)

The single communication entry point between Lynx and the native host.

## Responsibilities

- Wrap `NativeModules` calls (health data, Bluetooth, camera, notifications, storage)
- Wrap native → Lynx global event subscriptions (weight, steps, sync complete)
- Maintain interface types and native capability-version negotiation

## Boundaries

- Pages and cards may access native capabilities only through this package; no scattered direct
  calls.
- Native calls may only be initiated on a Lynx background thread.

Design docs: `rfcs/0001` (baseline), `rfcs/0002` (naming & governance), RFC 0005 (planned).
