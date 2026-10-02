- Start Date: 2026-10-02
- RFC Type: feature
- Status: Accepted
- Related: 0004, 0005, 0008, 0010, 0011, 0012

# RFC 0013: Custom foods

## Summary

Let the user create their own food entries when the bundled catalogue does not
cover what they ate. Custom foods are **persisted by the native host**, exposed on
`HostData.customFoods`, and merged into the same offline search as the bundled
`@zzzode/food-data` catalogue. A new `health.writeCustomFood` write path stores the
entry and returns the refreshed HostData; after creating a food the sheet jumps
straight to logging today's portion of it. No network and no account are required.

## Motivation

- RFC 0012 ships a finite curated table (~48 entries). Real eating includes takeout,
  branded products, restaurant dishes and family recipes that the table will never
  fully cover. When search returns nothing, logging must not dead-end — otherwise the
  daily calorie total has gaps and the deficit number cannot be trusted.
- A food the user eats repeatedly should be entered once and found again forever,
  including across app restarts. That requires native persistence (the host is the
  persistence authority, RFC 0010), not in-memory page state.
- Keeping creation and search in the TypeScript layer preserves the instant, offline,
  cross-platform experience; only storage is native.

## Guide-level explanation

- Open **Log food** and search as usual. If nothing matches, tap **Create custom food**.
- Enter a name and the calories per 100 g (protein/carbs/fat and a default serving are
  optional), then save. The sheet opens the new food with the portion field ready; log
  today's amount exactly as for a bundled food.
- From then on the custom food appears in search results (English and Chinese), is
  stored on the device, and survives restarts. Several custom foods accumulate with
  every other meal.

## Reference-level explanation

### Model changes

- `FoodItem.source` gains a third variant: `'usda-fdc' | 'curated' | 'custom'`.
- `HostDataDto` gains `customFoods: FoodItem[]` (empty on a fresh install). The page's
  `HostData` inherits it automatically.
- A custom food stores the name the user typed in **both** locale fields
  (`{ en: name, 'zh-CN': name }`): there is no offline translation, and mirroring the
  string keeps it searchable and visible regardless of the active language. A later
  slice can add real translations.

### `createCustomFood` factory

`@zzzode/food-data` exposes a pure factory used by the preview transport and tests:

```ts
interface CreateCustomFoodInput {
  id: string;
  name: string;
  /** Per 100 g; must be finite and > 0. */
  kcal: number;
  proteinG?: number; // per 100 g, default 0, non-negative
  carbsG?: number;
  fatG?: number;
  defaultGrams?: number;
}
function createCustomFood(input: CreateCustomFoodInput): FoodItem;
```

It mirrors the name across locales, fills omitted macros with 0, sets `source:
'custom'`, and rejects invalid (non-finite/negative) nutrition. The native host
constructs the same shape itself (it owns persistence and id generation).

### `health.writeCustomFood` write path

- RPC `health.writeCustomFood` with request
  `{ name: string, kcal: number, proteinG?: number, carbsG?: number, fatG?: number,
  defaultGrams?: number }` and response `{ success: true, hostData: HostDataDto }` —
  the same one-round-trip shape as `writeWeight`/`writeIntake`.
- The host generates a unique id (e.g. `custom-<uuid>`), builds the `FoodItem`, appends
  it to `customFoods`, persists, and returns the refreshed HostData. After the write it
  emits `records.changed` (RFC 0011), like every other repository write.
- Validation: a non-empty name and finite `kcal > 0`; optional macros finite and
  non-negative; `defaultGrams`, when given, positive. Failures return `invalid-request`.

### Android persistence

- `RecordsRepository.addCustomFood(...)` appends to the `customFoods` array and writes
  the file; reads use `optJSONArray("customFoods")` so records created before this slice
  (which lack the field) are treated as an empty list.
- The packaged seed gains `"customFoods": []`. `HealthModule.writeCustomFood` performs
  validation and delegates to the repository; no new permissions are needed. The
  generic JSON-to-map conversion already handles the nested food objects.

### UI

- FoodSheet builds its search database as `[...bundledFoods, ...hostData.customFoods]`,
  so custom foods rank and match through the existing `searchFoods` with no new search
  code.
- When a non-empty search has no matches, a **Create custom food** row appears; a
  creation form collects name, kcal per 100 g, optional macros and default grams. On
  save the page calls `writeCustomFood`, applies the returned HostData, and selects the
  newly created food so its portion can be logged immediately.
- All new strings are added to the English and Simplified Chinese catalogs.

## Drawbacks

- User-entered nutrition values can be inaccurate; the app cannot verify them. They are
  clearly presented as user-created, and per-100 g entry keeps portion scaling honest.
- Mirroring one typed name across locales means no real translation until a later slice.
- This slice creates and lists custom foods but does not yet edit or delete them.

## Rationale and alternatives

- **Keep custom foods only in page state**: they vanish on restart and cannot be reused;
  native persistence is required for a food the user expects to keep.
- **Sync custom foods through a cloud account**: enables multi-device sharing but
  requires accounts, a backend and sending food data off-device, against the offline
  stance. Local persistence first; sync follows the RFC 0008 model later.
- **Force the user to enter totals for the whole meal**: loses per-100 g scaling, so the
  same food at a different portion must be re-entered. Per-100 g custom foods reuse the
  existing portion calculator.
- **Edit/delete, favourites and recipes in the same slice**: each adds surface area;
  creation first closes the logging gap, with management deferred.

## Unresolved questions

- Editing and deleting custom foods, and favourites/recent foods for fast entry.
- Recipes (a portion built from multiple ingredients).
- Real name translation instead of mirroring, and per-locale names.
- Creating a custom food automatically from a barcode scan (depends on the barcode slice).
- Syncing custom foods across devices under the RFC 0008 encryption model.

## Implementation plan

1. Food-data: add `'custom'` to the source union, the `createCustomFood` factory, and
   unit tests.
2. Bridge: add `customFoods` to `HostDataDto`, the `health.writeCustomFood` contract, and
   tests; add the workspace type dependency on food-data.
3. Android: `RecordsRepository.addCustomFood` (with `optJSONArray` compatibility),
   `HealthModule.writeCustomFood`, seed `customFoods: []`, emit `records.changed`.
4. Pages: merge custom foods into search, add the empty-results Create row and creation
   form, wire App and the preview bridge, add i18n keys.
5. Rebuild the bundle and APK, verify creation + logging on the web preview, update the
   RFC index, commit and watch CI; iOS needs no new native code.
