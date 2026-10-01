- Start Date: 2026-10-02
- RFC Type: feature
- Status: Accepted
- Related: 0004, 0005, 0008, 0010, 0011

# RFC 0012: Offline food logging

## Summary

Add the intake side of the energy loop: an **offline, bilingual food database** that
ships inside the Lynx bundle, a pure local search and portion calculator in a new
`@zzzode/food-data` package, and a `health.writeIntake` write path that accumulates a
meal into the day's intake and reuses the existing `records.changed` event to refresh
Home. No network call and no native food search are required.

## Motivation

- Weight loss is driven by the energy deficit. The app already computes the goal, TDEE
  and remaining calories, and it logs weight and exercise, but the user cannot yet log
  what they actually ate — the largest and most error-prone input. Fast, low-friction food
  entry is what makes the daily number trustworthy.
- Food data changes far more often than native code, and the couple use both Android and
  iOS. Keeping the database and search in TypeScript, inside the bundle, gives free
  cross-platform support and lets the catalogue be updated dynamically (RFC 0007) without
  an app release.
- Privacy and reliability argue for an offline, bundled dataset over a runtime cloud
  search: logging works with no signal and no meal ever leaves the device.

## Guide-level explanation

- Open **Log food**, type a few characters (English or Chinese) of an ingredient or dish;
  matching foods appear immediately with calories per 100 g.
- Pick one, adjust the amount in grams (a sensible default portion is prefilled), review
  the meal's calories and macros, and save. The energy card updates at once: calories left,
  goal breakdown and macro progress.
- Several meals across the day add together. Everything is offline and local; the manual
  sheet and scale paths are unchanged.

## Reference-level explanation

### Data source and licensing

- The curated catalogue is derived from **USDA FoodData Central**, which is released into
  the public domain under **CC0 1.0**; attribution is provided in the package and here.
  Values are expressed per 100 g using the FDC nutrient IDs energy `1008`, protein `1003`,
  total lipid (fat) `1004`, carbohydrate by difference `1005`.
- Common local (Chinese) dishes and mixed meals that FDC does not cover are added as
  clearly-labelled curated/estimated entries. The dataset ships as deterministic JSON; a
  later tooling step can regenerate the bulk of the table from the downloadable FDC
  archives.
- Barcode/packaged-product data (e.g. Open Food Facts, ODbL) and online search are
  explicitly out of scope for this slice.

### `@zzzode/food-data` package

```ts
interface Macros { proteinG: number; carbsG: number; fatG: number; }
interface FoodItem {
  id: string;
  name: { en: string; 'zh-CN': string };
  /** Per 100 g. */
  kcal: number;
  macros: Macros;
  /** Default serving in grams; optional. */
  defaultGrams?: number;
  /** 'usda-fdc' | 'curated'. */
  source: 'usda-fdc' | 'curated';
}
```

- `searchFoods(database, query, locale, limit?)`: case-insensitive, whitespace-trimmed;
  matches against both locale names (prefix first, then substring) and falls back to the
  other locale, returning a relevance-sorted, capped list. An empty query returns a small
  set of common staples. Pure and synchronous.
- `portion(item, grams)`: returns `{ kcal, macros }` for the amount, scaling the per-100 g
  values and rounding to sensible precision; rejects non-positive amounts.
- All functions are pure and covered by unit tests (matching both languages, ranking,
  portion math, accumulation rounding).

### Why search is local (no `food.search` RPC)

- Search runs entirely in JS over the bundled JSON, so there is no bridge method and no
  round trip: results are instant and work offline on Android and iOS alike. The native
  side only handles persistence.

### `health.writeIntake` write path

- RPC `health.writeIntake` with request `{ date: string, kcal: number, macros: Macros }`
  and response `{ success: true, hostData: HostDataDto }` — the same one-round-trip shape
  as `writeWeight` (RFC 0010).
- Android `RecordsRepository.addIntake(date, kcal, macros)` **accumulates** into the
  existing sample for that date (multiple meals add calories and macros), creating it if
  absent, then returns the refreshed HostData.
- After the write the host emits `records.changed` with the new HostData (RFC 0011), so the
  global App subscription refreshes Home; the RPC response carries the same snapshot for
  callers that await it. Invalid (non-finite/non-positive) values return `invalid-request`.

### Food logging UI

- A bottom **FoodSheet**: a search field with live local results, a result row (name and
  kcal per 100 g), and on selection a grams field (prefilled from `defaultGrams`) with the
  computed meal calories and macros, plus Cancel/Save actions. It reuses the sheet styling
  and the existing `records.changed` refresh.
- The **Log food** quick action (currently inert) opens the sheet. All strings are added to
  the i18n catalogs in English and Simplified Chinese.

## Drawbacks

- A curated, bundled table is finite; uncommon or branded foods may be missing until added,
  and it grows the bundle modestly. Barcode lookup and custom/created foods are deferred.
- Curated dish values are estimates, not lab measurements; they are labelled as such.
- Accumulating intake by date assumes time-of-day detail is not needed for the Home view
  (it can be added to the model later).

## Rationale and alternatives

- **Runtime cloud food search (FDC API or a hosted service)**: always current but requires
  network, a server/API key, and sends every meal off-device — against the offline/private
  stance. A bundled table covers daily logging; online search can be added later as an
  augmentation, never a requirement.
- **Native food search per platform**: duplicates the dataset and parser on Android and iOS
  and blocks dynamic updates. Keeping it in TS yields one implementation, instant results,
  and dynamic catalogue updates.
- **Replace the whole day's intake on save**: breaks multi-meal logging; accumulation makes
  separate breakfast/lunch/dinner entries correct.
- **Bundle Open Food Facts for barcodes**: that dataset is very large and ODbL-licensed; it
  fits a future barcode slice, not the offline curated base.

## Unresolved questions

- User-created custom foods, favourites and recipes (multi-ingredient portions).
- Barcode scanning via Open Food Facts and packaging photos.
- Water, micronutrients and per-meal time labels.
- A reproducible importer that regenerates the curated table from the FDC download.
- Health Connect / HealthKit intake interoperability.

## Implementation plan

1. Add `@zzzode/food-data`: the curated bilingual JSON, types, `searchFoods`, `portion`,
   and unit tests; build it with Rslib like the other libraries.
2. Bridge: add the `health.writeIntake` method and DTO; extend the in-memory transport and
   tests; update the Android in-memory/preview bridge to simulate it.
3. Android: `RecordsRepository.addIntake` (accumulate), a `writeIntake` module path, emit
   `records.changed`; no new permissions.
4. Pages: FoodSheet with local search and portion, wire the Log food action, add i18n keys.
5. Rebuild the bundle and APK, verify the loop on the web preview, update the RFC index,
   commit and watch CI; iOS needs no new native code.
