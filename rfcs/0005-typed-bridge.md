- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0001, 0003, 0004

# Typed Lynx ↔ Native Bridge

English · [简体中文](0005-typed-bridge.zh-CN.md)

## Summary

Design `@zzzode/bridge`, a thin, **type-safe** layer between Lynx (TypeScript) and the native
host (Swift / Kotlin). It exposes:

- A promise-based request channel for **JS → Native** calls
- A subscription channel for **Native → JS** push events
- Compile-time-checked RPC and event **contracts**
- A normalized error model and host capability/version negotiation

The runtime transport is injected, so the same typed client runs against the real host or an
in-memory implementation in tests.

## Motivation

- Lynx pages must reach native capabilities they cannot implement themselves: HealthKit /
  Health Connect, Bluetooth scales, encrypted storage, notifications and dynamic resources.
- Calling raw `NativeModules` with stringly-typed method names and untyped payloads gives no
  compile-time checking and pushes every integration error to runtime on a device.
- Native push data (a scale reading, an authorization change) needs a symmetric, leak-free
  subscription API.
- Two host platforms and dynamically delivered bundles must be able to detect which methods the
  installed host supports and degrade gracefully instead of crashing.

## Guide-level explanation

- App code depends only on a typed client: `client.invoke('health.readSamples', request)` and
  `client.subscribe('scale.reading', handler)`. The arguments and return types are inferred from
  the contracts, so a wrong method name or payload shape fails `tsc`.
- The client forwards a fully-qualified method name and a cloneable payload to an injected
  transport; the real transport maps that to Lynx NativeModules, while tests use an in-memory
  transport.
- Every failure — unknown method, missing permission, unavailable adapter — becomes a
  `BridgeError` with a stable code, regardless of platform.
- On startup the client asks `app.getCapabilities`; unsupported methods are hidden or disabled.

## Reference-level explanation

### The two underlying Lynx channels

- **JS → Native**: Lynx NativeModules. The host receives a module/method call with data
  (`onNativeModulesCall(name, data, moduleName)`) and returns data via callback. Invoking an
  unregistered method surfaces a native "function not found" error.
- **Native → JS**: the host calls `sendGlobalEvent(eventName, params)`; JS subscribes through
  `lynx.getJSModule('GlobalEventEmitter')` (`addListener` / `removeListener` /
  `removeAllListeners`). There is no bare `GlobalEventEmitter` global.

### Transport abstraction

```ts
interface BridgeTransport {
  call<Response>(method: string, request: unknown): Promise<Response>;
  on(event: string, handler: (payload: unknown) => void): () => void;
}
```

The bridge package does not import the `lynx` global. A platform adapter (added with the native
host, RFC 0006) implements this interface over NativeModules/GlobalEventEmitter;
`createMemoryBridge()` provides a controllable implementation for unit tests and as the reference
shape a native server must satisfy.

### Contracts are type-only

```ts
type RpcContractShape = Record<string, { request: unknown; response: unknown }>;
type EventContractShape = Record<string, { payload: unknown }>;
```

`LeanOnRpcContract` and `LeanOnEventContract` enumerate every method and event with its exact
types. A method with no argument uses `request: void`. Contracts exist only at the type level;
runtime code still sends a plain method string, so adding a contract member never ships logic.

### Typed client

```ts
interface TypedBridgeClient<C, E> {
  invoke<M extends keyof C>(method: M, ...args: InvokeArgs<C, M>): Promise<C[M]['response']>;
  subscribe<M extends keyof E>(event: M, handler: (payload: E[M]['payload']) => void): () => void;
}
```

`InvokeArgs` makes the request optional for `void`/`undefined` requests and required otherwise.
The client normalizes any rejected value through `normalizeError`.

### Error model

```ts
type RpcErrorCode =
  | 'method-not-found' | 'not-authorized' | 'unavailable'
  | 'invalid-request' | 'cancelled' | 'unknown';

class BridgeError extends Error { code; retriable?; details? }
```

Platform-specific native errors are mapped to these codes in the host adapter, so feature code
can branch on a small stable enum and decide whether an error is retriable.

### Capability negotiation

`app.getCapabilities` returns a `HostCapabilities`:

```ts
{ platform; hostVersion; bridgeVersion; supportedMethods: string[]; supportedEvents: string[] }
```

The client compares the contract members it wants against `supportedMethods`/`supportedEvents`
and hides unsupported features; `bridgeVersion` gates protocol-level changes.

### Capability domains

| Domain | Methods | Events |
|---|---|---|
| `health.*` | `authorize`, `readSamples`, `writeWeight` | `authorizationChanged` |
| `scale.*` | `scan`, `connect` | `discovered`, `reading` |
| `storage.*` | `get`, `set`, `remove` | — |
| `resource.*` | `fetch` (dynamic bundles, RFC 0007) | — |
| `app.*` | `getInfo`, `getCapabilities` | `lifecycle` |
| `notification.*` | `schedule` | — |

DTOs (`HealthSampleDto`, `ScaleDeviceDto`, `ScaleReadingDto`, `AppInfo`, `HostCapabilities`,
…) are flat JSON shapes defined in `contracts.ts`.

### Serialization and threading

- Only **cloneable structured data** may cross: JSON-compatible values, no functions, class
  instances, symbols or live handles. Types enforce this at the contract boundary.
- Native calls follow the Lynx dual-thread model: invoke from event/background contexts, not
  while rendering on the main thread.

## Drawbacks

- Maintaining contracts is extra bookkeeping; a method added on the host without a contract
  member is invisible to the typed client.
- A type-only contract cannot guarantee at runtime that the host honors the declared shape;
  capability negotiation and tests mitigate but do not eliminate this.
- Injecting a transport adds one indirection versus calling NativeModules directly.

## Rationale and alternatives

- **Raw NativeModules with hand-written wrappers per page**: no single source of truth and no
  end-to-end typing; rejected.
- **Auto-generated code from an IDL/schema**: stronger runtime guarantees but adds a codegen
  step and source-of-truth split; deferred until the surface stabilizes.
- **Generic `postMessage` string envelopes**: flexible but loses typing and centralization;
  rejected in favour of named methods with contracts.
- **Putting native calls inside core**: would break the pure/portable constraint of core; the
  bridge stays a separate package and feature code orchestrates the two.

## Unresolved questions

- Exact mapping of native HealthKit/Health Connect errors and BLE states to `RpcErrorCode`.
- Whether the host adapter should live in `packages/bridge` (ts) or per-platform under
  `apps/*`/`native/*` (leaning per-platform, RFC 0006).
- Whether to add request cancellation, timeouts and batching now or with the first heavy use
  case (bulk history import).
- Whether contracts should eventually drive codegen for the Swift/Kotlin host stubs.

## Implementation plan

- [x] Core types: transport, JSON/cloneable payloads, RPC error model
- [x] In-memory transport and reference server shape
- [x] Typed client (`invoke` / `subscribe`) with error normalization
- [x] LeanOn capability contracts, DTOs and method/event constants
- [ ] Real Lynx transport over NativeModules/GlobalEventEmitter (with RFC 0006)
- [ ] Native host handlers and capability registration
- [ ] Timeout/cancellation and bulk-call support if needed

The implemented areas are covered by 6 in-memory Rstest cases; the real transport and native
handlers arrive with the host RFC.

## References

- Lynx docs: NativeModules and `onNativeModulesCall` (integrate with existing apps).
- Lynx docs: GlobalEventEmitter via `lynx.getJSModule` and event handling.
- Lynx error codes (native module method not found).
- Lynx `<lynx-view>`: `sendGlobalEvent(eventName, params: Cloneable[])`.
