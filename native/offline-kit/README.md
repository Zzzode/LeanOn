# offline-kit

English · [简体中文](README.zh-CN.md)

The host-side resource channel for Lynx dynamic delivery — the `LynxResourceProvider`
implementation.

## Planned responsibilities

- Fetch the manifest (version list) and compare it with local state
- Full / differential bundle downloads
- Signature verification, on-disk caching and cleanup
- Load order: verified latest cache → built-in fallback package
- Rollout, rollback and `minNativeVersion` negotiation

See RFC 0007 for details.
