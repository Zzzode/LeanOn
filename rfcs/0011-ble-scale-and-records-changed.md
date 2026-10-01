- Start Date: 2026-10-02
- RFC Type: feature
- Status: Accepted
- Related: 0005, 0006, 0008, 0010

# RFC 0011: BLE weight scale and `records.changed`

## Summary

Add a Bluetooth Low Energy weight-scale path: discover and connect to a standard
**Weight Scale Service** scale, parse its weight measurement, and persist the reading
through the existing repository. Introduce a `records.changed` event as the single
channel the host emits after **any** record write, carrying the refreshed HostData so the
page updates without a second request.

## Motivation

- Manual entry is friction the user can skip, and self-reported numbers are easy to round
  in a flattering direction. A scale that logs automatically removes that friction and
  raises data honesty, both essential to the weight-loss goal.
- A scale write does not originate from the page command that owns the UI (the reading
  arrives asynchronously from hardware). We therefore need a host → page "records
  changed" channel. The same channel later serves sync, multi-device and Health Connect
  writes, so it is worth establishing correctly now rather than special-casing the scale.

## Guide-level explanation

- First time: open **Pair scale**, grant the Bluetooth permission, pick the scale from the
  live device list, and stand on it. The reading appears, is saved automatically, and Home
  refreshes (current weight, trend, distance to goal).
- Afterwards the paired scale is remembered; opening the scale view reconnects and a new
  weighing is logged the same way.
- The flow is offline and local. If Bluetooth is off, permission is denied, or the scale
  does not expose the standard service, the UI explains the situation and offers the manual
  sheet as a fallback.

## Reference-level explanation

### Standard GATT profile

- Service **Weight Scale** `0x181D`; characteristic **Weight Measurement** `0x2A9D`,
  delivered as an *indication* (enable the CCC descriptor `0x2902`).
- Weight Measurement layout (Bluetooth SIG):
  - Flags byte: bit 0 unit (0 = SI, 1 = Imperial); bit 1 timestamp present; bit 2 user ID
    present; bit 3 BMI + height present.
  - SI: weight as `uint16` × **0.005 kg**. Imperial: `uint16` × **0.01 lb**, converted to
    kg. Optional timestamp (year/month/day/hour/minute/second), user ID, and BMI
    (`uint16` × 0.1) with height.
- Scans filter to the `0x181D` service UUID; results are de-duplicated by device address
  and reported with name and RSSI.
- Scales generally indicate Weight Measurement only once the reading has stabilised, so
  the host persists each indicated measurement directly; the page does not implement
  stability detection.

### Permissions and capability handling (Android)

- Android 12+ (API 31): runtime `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`.
- Android 6–11 (API 23–30): `ACCESS_FINE_LOCATION` is required to receive scan results.
- No adapter or Bluetooth disabled: return `unavailable` (`retriable: true`) and guide the
  user to enable Bluetooth. A connected scale that exposes no `0x181D` returns
  `unavailable` with details `unsupported-scale`. Connect/service-discovery timeout maps to
  `unavailable`; a missing or denied permission maps to `not-authorized`.
- The scale view requests permissions up front; the manual Log-weight sheet remains
  available without Bluetooth.

### `records.changed` event

```ts
'records.changed': { payload: { hostData: HostDataDto } };
```

- The event carries the freshly resolved HostData (the same host-owned snapshot shape the
  `writeWeight` response uses), so the page replaces its state directly — no re-fetch and no
  duplicate consistency logic.
- Emission is owned by the host after every successful repository write: manual
  `writeWeight`, a persisted scale reading, and later `writeIntake`/sync. The repository is
  the single place that produces the snapshot, keeping ordering predictable.
- `scale.reading` is still emitted for pairing/live feedback; persistence and Home refresh
  are authoritative through `records.changed`.

### Scale contract additions

- Keep `scale.scan` (no args → `{ scanning }`) and `scale.connect` (`{ deviceId }` →
  `{ connected }`). Add `scale.disconnect` (→ `{ connected: false }`) and
  `scale.getStatus` (→ `{ state: 'idle' | 'scanning' | 'connecting' | 'connected',
  pairedDeviceId: string | null }`) to drive reconnect and UI.
- The paired device address is a device setting, persisted via native preferences (not as a
  health record); it is used to auto-reconnect.
- `scale.discovered` and `scale.reading` payloads stay as already declared
  (`ScaleDeviceDto`, `ScaleReadingDto`).

### Testing without hardware

- The Weight Measurement parser is a pure Kotlin function over a byte array, covered by
  JVM unit tests: SI and Imperial decoding, flag combinations, rounding, and malformed
  input. The BLE scan/GATT layer is a thin Android wrapper verified by compilation and,
  later, on-device testing.
- The Android CI job additionally runs `testDebugUnitTest` so the parser is exercised in CI
  even though no Bluetooth hardware is available.

## Drawbacks

- Only the standard SIG service is supported. Many low-cost body-composition scales (and
  most vendor apps) use proprietary services (e.g. Xiaomi); those need a later RFC.
- The full BLE flow cannot be exercised in the cloud environment or CI (no Bluetooth
  adapter). Parser unit tests and compilation cover the logic; the end-to-end path is
  confirmed on a real device.
- Runtime permissions and their version differences add complexity.

## Rationale and alternatives

- **Let the page detect a stable reading and confirm the save**: pushes unreliable timing
  and extra UI into JS. Scales already indicate a stable measurement, so the host persists
  it directly.
- **Emit only a "dirty" signal and re-fetch via `records.getToday`**: a clean pub/sub shape
  but adds a round trip and another method. Carrying the HostData on `records.changed`
  matches the write response and keeps one snapshot source of truth. `records.getToday`
  remains unneeded and is not added.
- **Read scales indirectly through Health Connect**: some vendors sync scales into Health
  Connect, but that depends on a third-party app and account. Direct BLE is self-contained;
  Health Connect integration is a separate slice and can coexist.
- **Manual entry only**: simplest, but keeps the friction and honesty gap this removes.

## Unresolved questions

- Proprietary scale protocols and body-impedance/composition mapping (impedance is already
  an optional field, but body-fat derivation is not defined).
- Multiple users sharing one scale via the Weight Measurement user-ID byte (the couple use
  separate devices/accounts for now).
- iOS CoreBluetooth implementation (requires macOS).
- Whether paired-device preferences live behind the `storage` module or native
  SharedPreferences; behaviour is identical and the choice is an implementation detail.

## Implementation plan

1. Bridge: add `scale.disconnect`/`scale.getStatus`, the `records.changed` event, BLE error
   mapping; update the in-memory transport and tests.
2. Android: BLE scanner and GATT client, the Weight Measurement parser plus JVM unit
   tests, `ScaleModule`, runtime permissions, persist readings through the repository,
   dispatch `records.changed`, remember the paired device.
3. Pages: pair/scale view (scan, device list, live reading), subscribe to `records.changed`
   to refresh Home, i18n keys (English + Simplified Chinese).
4. CI: run `testDebugUnitTest` in the Android job; rebuild the APK, update the RFC index,
   commit and watch CI; iOS follows when macOS is available.
