- Start Date: 2026-10-02
- RFC Type: feature
- Status: Accepted
- Related: 0005, 0008, 0010, 0011, 0013

# RFC 0014: Manage custom foods (edit and delete)

## Summary

Let the user maintain the custom foods they created in RFC 0013. Two new write
paths, `health.updateCustomFood` and `health.deleteCustomFood`, replace or remove
a stored food by id and return the refreshed HostData. Editing reuses the same
full-entry form as creation (the id and source never change); deleting requires a
two-step confirmation. Bundled catalogue foods remain read-only. No network and
no account are required.

## Motivation

- A custom food is often entered quickly while eating and later turns out to be
  wrong — a misread label, a typo in calories, or a better value on the package.
  Without editing, the only fix is to delete the food and recreate it, and RFC
  0013 cannot delete it at all, so an incorrect food pollutes search forever.
- Branded products and recipes change over time; the user must be able to correct
  or retire an entry so the daily calorie total stays trustworthy.
- Management completes the local custom-food lifecycle (create → use → edit →
  delete) before barcode-created foods (a later slice) make the list grow faster.

## Guide-level explanation

- Open **Log food**, find a custom food, and open it. Custom foods show **Edit**
  and **Delete** actions; bundled foods do not.
- **Edit** opens the same form as creation with every field prefilled. Change any
  value and save; the food keeps its identity, search still finds it, and meals
  logged afterwards use the new nutrition.
- **Delete** first asks for confirmation (the button becomes a confirm action);
  confirming removes the food. Deleting a food does not change meals already
  logged — past days keep their totals.

## Reference-level explanation

### Model changes

- No new fields are required. An update replaces the editable content of an
  existing `FoodItem` while preserving `id` and `source`; a delete removes the
  item from `HostDataDto.customFoods`.
- Historical `IntakeSample`s intentionally do **not** reference a food id and are
  therefore left untouched by edit/delete. Past totals are immutable records; the
  change affects future logging only.

### `updateCustomFood` factory

`@zzzode/food-data` exposes a pure helper so the TypeScript layer and the preview
transport apply and validate edits consistently:

```ts
interface EditCustomFoodInput {
  name: string;
  kcal: number;          // per 100 g, finite and > 0
  proteinG?: number;     // per 100 g, default 0, non-negative
  carbsG?: number;
  fatG?: number;
  /** Positive value sets it; null explicitly clears a stored default. */
  defaultGrams?: number | null;
}
function updateCustomFood(item: FoodItem, changes: EditCustomFoodInput): FoodItem;
```

It returns a new item with the same `id`/`source`, the name re-mirrored across
locales, and the same validation as `createCustomFood`. It is only meaningful for
user-owned foods (`source !== 'usda-fdc'` and `'curated'`); applying it to a
bundled food is rejected.

### Write paths

- RPC `health.updateCustomFood` with request
  `{ id: string, name: string, kcal: number, proteinG?: number, carbsG?: number,
  fatG?: number, defaultGrams?: number | null }` and response
  `{ success: true, hostData: HostDataDto }`.
- RPC `health.deleteCustomFood` with request `{ id: string }` and response
  `{ success: true, hostData: HostDataDto }`.
- Both are one round trip like the other writes. The host finds the food by id;
  an unknown id returns `not-found`, and nutrition validation failures return
  `invalid-request`. After a successful change the host emits `records.changed`
  (RFC 0011). Full-entry replacement (rather than partial field patches) keeps the
  semantics unambiguous: the form always submits the complete desired state.

### Android persistence

- `RecordsRepository.updateCustomFood(id, name, kcal, proteinG, carbsG, fatG,
  defaultGrams?)` walks `customFoods`, replaces the matching entry in place
  (keeping its id and `source`), and throws when the id is absent.
- `RecordsRepository.deleteCustomFood(id)` rebuilds the array without the matching
  entry and writes the file; an absent id is an error.
- `HealthModule` gains `updateCustomFood` and `deleteCustomFood`, sharing the
  nutrition validation already used by `writeCustomFood`. The generic JSON-to-map
  conversion needs no change.

### UI

- FoodSheet's food form is reused for both create and edit modes; in edit mode it
  is prefilled imperatively (controlled `value` is unavailable on Lynx 3.9) and
  the submit action calls `updateCustomFood`.
- The detail view for a custom food shows **Edit** and **Delete**. Delete uses an
  inline confirming state rather than a second sheet, so the destructive action
  never fires from a single tap.
- App provides the two handlers; the preview bridge simulates them against the
  in-memory sample. All strings are added to the English and Simplified Chinese
  catalogs.

## Drawbacks

- Editing a food does not retroactively fix meals already logged; a value corrected
  today leaves earlier days on the old number. This is deliberate — logged totals
  are point-in-time records, and silently rewriting history would make trends
  inconsistent.
- Delete is permanent in the local store (no trash/undo). The confirmation step is
  the safeguard; a later slice can add undo or sync-backed recovery.

## Rationale and alternatives

- **Partial field patching (`PATCH`-style with optional fields)**: cannot
  distinguish "unchanged" from "clear this value" (notably `defaultGrams`) and
  spreads validation across the host. Full replacement from a prefilled form is
  simpler and matches how the user thinks about the food.
- **Edit bundled foods too**: the curated/USDA table is generated data and should
  stay reproducible; corrections belong in a user-owned copy, not by mutating the
  shipped table.
- **Cascade edits/deletes into past intake**: requires food ids on intake and
  rewrites history; rejected to keep past totals stable.
- **A separate management screen**: foods are already reached through search;
  inline actions avoid a second place to maintain the same list.

## Unresolved questions

- Favourites and recently-used foods for fast entry.
- Undo/soft-delete and per-food edit history.
- Recipes combining multiple ingredients.
- Real per-locale names instead of mirroring one typed name.
- Syncing edits/deletes across devices under the RFC 0008 encryption model.

## Implementation plan

1. Food-data: add the `updateCustomFood` factory and unit tests.
2. Bridge: add `health.updateCustomFood`/`health.deleteCustomFood` contracts and
   tests.
3. Android: repository update/delete plus the two HealthModule methods; emit
   `records.changed`.
4. Pages: reuse the form for edit, add Edit/Delete with confirm, wire App and the
   preview bridge, add i18n keys and styles.
5. Rebuild the bundle and APK, verify create → edit → delete on the web preview,
   update the RFC index, commit and watch CI; iOS needs no new native code.
