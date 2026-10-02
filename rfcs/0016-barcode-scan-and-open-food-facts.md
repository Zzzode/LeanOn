# RFC 0016 — Barcode scanning and Open Food Facts lookup

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0012 (food logging), RFC 0013 (custom foods), RFC 0014 (manage custom foods), RFC 0015 (favorites and recent)

## Summary

Add a barcode scanner to the food logger. The user points the camera at a
packaged product's barcode; the app looks the product up in the **Open Food
Facts** (OFF) database over the network, converts the result into the same
`FoodItem` shape used everywhere else, persists it as a user-owned food, and
opens the portion sheet ready to log. When the product is unknown, the device is
offline, or the user cancels, the flow degrades gracefully to manual creation.

## Motivation

Packaged foods (protein bars, yoghurt, frozen meals, snacks) are tedious to log
by hand: the user must read the small nutrition table, create a custom food, and
only then log it. That friction is highest for the ultra-processed, calorie-dense
items that matter most for weight control, so they are the ones most often
skipped. A barcode scan turns "read table → create food → log" into "scan →
confirm portion → log".

This also grows the personal food library quickly, which is why RFC 0015
(favorites/recent) landed first: scanned foods become reusable through the same
fast surfaces rather than cluttering search.

## Design

### Flow overview

```text
FoodSheet (scan button)
  └─ scanner.scanBarcode            native CameraX + ML Kit, returns barcode
       ├─ cancelled ───────────────► stay on FoodSheet
       └─ barcode
            ├─ already in library? ─► open its detail directly
            └─ food.lookupProduct   native HTTP GET OFF v2
                 ├─ offline/error ─► show error, offer manual create
                 ├─ found: false ──► offer manual create
                 └─ found: product
                      └─ createFoodFromBarcode(barcode, product)   (TS, pure)
                           ├─ invalid (no energy) ─► offer manual create
                           └─ health.writeScannedFood  (upsert, returns hostData)
                                └─ open the new food's detail
```

The scan and the network call are separate RPCs. Scanning is a device capability
and the lookup is a network capability; keeping them apart makes each testable
and lets the UI decide what to do at every step (reuse, retry, or fall back).

### Bridge contracts

Three RPCs are added.

**`scanner.scanBarcode`** — request `{}`; response is one of:

```ts
{ barcode: string }   // a barcode was scanned
{ cancelled: true }   // the user backed out without scanning
```

Missing the camera permission is handled inside the native scanner (it requests
the permission); a permanent denial rejects with code `unavailable`.

**`food.lookupProduct`** — request `{ barcode: string }`; response:

```ts
{ found: true; product: OffProduct }  // raw OFF "product" object, passed through
{ found: false }                      // OFF reports status 0 / HTTP 404
```

Network failures (no connectivity, timeout, malformed response body) reject with
code `unavailable`. The host does **not** parse nutrition: it returns the raw
product object and the TypeScript parser owns the conversion, so the nutrition
logic is unit-tested off-device.

**`health.writeScannedFood`** — request:

```ts
{
  barcode: string;
  name: string;
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  defaultGrams?: number;
}
```

response `{ success: true, hostData }`. The host builds the id as
`off-<barcode>`, marks `source: 'open-food-facts'`, and **upserts** by id (a
re-scan replaces the stored copy rather than duplicating it). Validation matches
custom foods (non-empty name, finite positive energy, finite non-negative
macros); invalid requests reject with `invalid-request`.

### Open Food Facts parser (food-data)

`FoodItem.source` gains `'open-food-facts'` and `FoodItem` gains an optional
`barcode?: string`. A new pure factory is added:

```ts
createFoodFromBarcode(barcode: string, product: OffProduct): FoodItem
```

Mapping rules:

- **id**: `off-<barcode>`; **source**: `'open-food-facts'`; **barcode**: stored.
- **name**: `product_name`, else `generic_name`, else the barcode itself. It is
  mirrored across locales (OFF is multilingual but the v2 call requests a single
  display name; true localization is a future item).
- **energy per 100 g**: `nutriments['energy-kcal_100g']`; if absent, fall back to
  `nutriments['energy_100g']` (kilojoules) divided by 4.184. If no usable energy
  exists, the factory throws `RangeError` — a food with unknown calories cannot
  support the energy budget and the UI falls back to manual creation.
- **macros per 100 g**: `proteins_100g`, `carbohydrates_100g`, `fat_100g`, each
  defaulting to 0 when missing or non-finite.
- **defaultGrams**: `serving_quantity` when it is a finite positive number,
  otherwise omitted.

The OFF endpoint is
`https://world.openfoodfacts.org/api/v2/product/<barcode>.json` with a `fields`
parameter limited to what the parser needs
(`product_name,generic_name,nutriments,serving_quantity,serving_size`), and a
custom User-Agent identifying the app.

### Android

- **Dependencies**: CameraX (`camera-core`, `camera-camera2`,
  `camera-lifecycle`, `camera-view`) and ML Kit `barcode-scanning`; the `INTERNET`
  permission already exists, and `CAMERA` is added with a non-required
  `android.hardware.camera` feature so camera-less devices can still install.
- **BarcodeScanActivity**: a full-screen CameraX preview with an `ImageAnalysis`
  analyzer that feeds frames to ML Kit's `BarcodeScanning` client. On the first
  recognized barcode it sets the result and finishes; a back/cancel action
  returns cancelled.
- **ScannerModule.scanBarcode**: launches the activity via the Activity Result
  API and resolves with `{barcode}` or `{cancelled}`, requesting the camera
  permission first when needed.
- **OpenFoodFactsClient**: a small client over `HttpURLConnection` (no new
  networking dependency) performing the v2 GET, returning the product
  `JSONObject` for `status == 1`, `null` for status 0 / 404, and throwing on
  transport errors.
- **FoodModule.lookupProduct**: thin wrapper that runs the client off the main
  thread and maps results/errors to the contract above.
- **RecordsRepository.upsertUserFood(item)**: inserts or replaces by id in the
  user foods array. **HealthModule.writeScannedFood** parses and validates the
  request, builds the `off-<barcode>` item, and persists it via the upsert, then
  emits `records.changed` like other writes.

Scanned foods live in the same user-foods array as custom foods, so they inherit
edit/delete (RFC 0014), favorites/recent (RFC 0015), and search for free.

### Pages

- A scan affordance is added to the FoodSheet search row. Tapping it calls the
  App-level scan handler.
- `App.tsx` orchestrates the flow above: scan → reuse-if-present → lookup →
  `createFoodFromBarcode` → `writeScannedFood` → update host data and open the
  new food's detail. FoodSheet accepts an `initialSelectedId` so the orchestrator
  can land directly on the scanned item.
- Failure states are surfaced inline: product not found / no energy data offer a
  "create manually" action (opening the create form); offline/transport errors
  show a retryable error; cancel returns to the sheet unchanged.

### Privacy, licensing and attribution

- A scan triggers a network request that sends **only the barcode** to Open Food
  Facts; no personal data is included. The feature is clearly user-initiated.
- Open Food Facts data is © contributors and licensed under the ODbL; the app
  provides attribution and a link to the database and its license.
- OFF nutrition data is crowd-sourced and may be wrong; the UI keeps the food
  editable and the Home disclaimer ("not medical advice") is unchanged.

## Alternatives considered

- **Embed a local product database**: OFF is millions of products and changes
  constantly; bundling it is far too large and goes stale. Online lookup keeps
  the app small; the personal library (the tiny set actually scanned) is what is
  stored offline.
- **Do scanning/HTTP/parsing in one native RPC**: less chatty, but it burries
  nutrition conversion in Kotlin where it cannot share the TS food model or be
  unit-tested with the rest of food-data. Splitting scan from lookup and parsing
  in TS keeps the domain logic in one place.
- **Store scanned foods separately from custom foods**: duplicates edit/delete,
  favorites/recent, and search. A single user-foods array with a distinct
  `source` reuses all of it.
- **Parse nutrition on the host and return a FoodItem**: rejected for the same
  reason as the combined RPC — the conversion belongs in TypeScript and is
  covered by shared tests.
- **Use a commercial barcode/nutrition API**: adds cost, an API key, and stricter
  terms for an open-source personal project. OFF is open (ODbL), free, and has
  broad global coverage.

## Unresolved / future

- True multilingual product names (request the OFF product in the active locale
  rather than mirroring one name).
- Saving products back to OFF (contribute) and richer fields (sugars, fibre,
  saturated fat, Nutri-Score, brands, image).
- Barcode entry fallback (type the code manually when the camera is unavailable)
  and QR/other code handling.
- Caching lookups and a queued retry for scans made while offline.
