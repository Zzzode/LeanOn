- Start Date: 2026-10-02
- RFC Type: feature
- Status: Accepted
- Related: 0005, 0006, 0008, 0009

# RFC 0010: Interactive logging write path

## Summary

Establish the first write path: the native side is the persistence authority, the page
bootstraps from `initData`, and logging today's weight flows Lynx → typed bridge → native
repository and **returns the updated HostData**, so the UI refreshes in one round trip.

## Motivation

- Home is currently read-only and renders a bundled sample; the app cannot capture the daily
  weight that drives every feedback loop (trend, adaptive energy, distance to goal). Without a
  write path it is a preview, not a tool that supports the weight-loss goal.
- We want to prove the bidirectional channel end to end with the simplest possible command
  (one number), so richer commands (food logging) later reuse a proven shape instead of
  inventing a new one.

## Guide-level explanation

- Tap **Log weight** and a bottom sheet appears prefilled with the current weight; adjust it
  and press **Save**. The sheet closes and current weight, trend and distance-to-goal update
  immediately.
- Invalid input is blocked inline; if a save fails, a message is shown and the sheet stays so
  no entry is lost.
- The flow works fully offline; data lives on the device.

## Reference-level explanation

### Bootstrap via initData

- The host renders with `renderTemplateUrl(url, initDataJson)` where `initData` is
  `{ hostData: HostDataDto, locale: string }`.
- ReactLynx reads it with `useInitData()`; `App` seeds its state from it and falls back to the
  bundled sample when it is absent (web preview and tests).
- `HostDataDto` is the cross-boundary shape declared in `contracts.ts`, composed of core's
  `Profile`, `WeightSample` and `IntakeSample` plus goal/streak fields; it is structurally
  identical to the page's `HostData`.

### Command and response

```ts
'health.writeWeight': {
  request: { date: string; weightKg: number };
  response: { success: true; hostData: HostDataDto };
};
```

- The host validates the input (finite, sane range, e.g. 20–300 kg), upserts the sample for
  the date in the repository, persists, and returns the freshly resolved `HostData`.
- Returning the aggregate view in the response avoids a second fetch and guarantees a single
  consistent snapshot owned by the host.
- Validation failure maps to `RpcError` code `invalid-request` (details carry the reason); a
  storage problem maps to `unavailable`. The JS client normalizes these into `BridgeError`.

### Lynx transport

`createLynxTransport()` implements `BridgeTransport`:

- `call` maps `"<domain>.<action>"` to `NativeModules[domain][action](request, callback)`,
  wrapped in a Promise. The native callback is invoked with a result map; an error map
  `{ code, message }` rejects the Promise.
- `on(event, handler)` uses
  `lynx.getJSModule('GlobalEventEmitter').addListener(event, handler)` and returns the
  matching `removeListener`.
- Pages select the transport: the real Lynx transport when `NativeModules` is present,
  otherwise an in-memory transport seeded with the sample, so the identical flow is runnable
  in the web preview and in tests off-device.

### Repository (Android first)

- `RecordsRepository` stores one JSON document in app-private storage. On first launch it
  copies a seed asset `seed/hostData.json`, which is generated from the TypeScript sample so
  the two stay aligned. `addWeight(date, kg)` upserts and returns the resolved `HostData`.
- This slice uses plain app-private JSON. Encryption and the envelope/sync model remain RFC
  0008 work; they are not regressed, only deferred.
- iOS follows the same contract; its implementation requires macOS and lands later.

### i18n

New keys `weightSheet.title`, `weightSheet.save`, `weightSheet.cancel`, `weightSheet.hint` are
localized in English and Simplified Chinese; `kg` stays an international symbol (see RFC
0009).

## Drawbacks

- `writeWeight` returns an aggregate, which is a slightly larger response and loosely couples
  one command to the view shape — in exchange for a single round trip and host-owned
  consistency.
- The seed exists both as TypeScript and as an Android asset; generating the asset from the
  sample mitigates drift.
- Local JSON is unencrypted until RFC 0008 lands; acceptable for an early slice, but a public
  release must not ship that way.
- iOS is not implemented in this slice.

## Rationale and alternatives

- **Emit `records.changed`, then re-fetch through a `records.getToday` method**: the clean
  pub/sub model and it supports external writes (BLE scale, multi-device), but it needs an
  extra method and event ordering. It is deferred to the scale/sync slice where it is actually
  required; the contract is shaped so it can be added without breaking `writeWeight`.
- **Optimistic JS update**: feels fast but can desync from host validation and aggregation.
  The host response stays authoritative; the local sheet interaction is already fast.
- **Keep the repository in TypeScript via `storage.set` JSON**: pushes persistence into JS,
  but the host must own storage for encryption, HealthKit and the scale. Rejected.
- **Use the generic `storage.set` KV for weight**: loses typed validation, upsert semantics
  and entity meaning. `health.writeWeight` is the typed domain command.

## Unresolved questions

- Timing of the `records.changed` event plus `records.getToday` (scale slice).
- The food-logging command shape (meal DTO, food search) — the next write slice.
- How the repository migrates into the encrypted/envelope model (RFC 0008 sequencing).
- Persistence of the locale override (a small settings slice).

## Implementation plan

1. Bridge: add `HostDataDto`, extend `writeWeight` response, add the Lynx transport and tests.
2. Pages: initData bootstrap, `WeightSheet`, i18n keys, transport selection.
3. Android: seed asset, `RecordsRepository`, `writeWeight`, initData injection.
4. Verify, rebuild the APK, update the RFC index, watch CI; iOS follows when macOS is
   available.
