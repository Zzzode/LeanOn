# RFC 0015 — Favorites and recently eaten foods

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0012 (food logging), RFC 0013 (custom foods), RFC 0014 (manage custom foods)

## Summary

Add two fast, one-tap reuse surfaces to the food logger: **favorites** (foods the
user explicitly pins) and **recent** (the foods the user has logged most often of
late). Both are stored as ordered id lists on `HostData`, decoupled from the food
definitions, so bundled catalogue foods and user-owned custom foods are handled
identically.

## Motivation

Meals are logged under time pressure, and a small set of foods accounts for most
entries (daily staples, breakfast items, a favourite snack). Today every entry
starts with a text search. Once barcode-created foods land (a later slice) the
list grows quickly, making search slower exactly when the user wants to be fast.

- **Favorites** cover the *explicit* case: "I eat this often, pin it."
- **Recent** cover the *implicit* case: no curation required, the foods already
  logged this week float to the top.

Both reduce the path from "open sheet" to "portion confirmed" to a couple of
taps, which directly supports consistent logging and, in turn, the energy
budget that drives weight control.

## Design

### Data model

Two ordered arrays of food ids are added to `HostData` (and `HostDataDto`):

```ts
favoriteFoodIds: string[]; // user-pinned, stable order
recentFoodIds: string[];   // most recently logged first, capped
```

They reference foods by id across both sources:

- bundled catalogue foods have stable ids shipped in `@zzzode/food-data`;
- user-owned custom foods have host-generated ids.

The lists deliberately hold **ids, not food objects**. Food definitions stay
owned by the catalogue / `customFoods`; these arrays are pure user-preference and
convenience indexes and never participate in nutrition math.

### RPC: set favorite

```ts
'health.setFoodFavorite': {
  request: { id: string; favorite: boolean };
  response: { success: true; hostData: HostDataDto };
}
```

- `favorite: true` appends the id if absent (no duplicates);
- `favorite: false` removes every occurrence;
- the call does not validate that the id currently resolves to a food. Pinning a
  food and later having it disappear is harmless (see cleanup below), and
  accepting an unknown id keeps the host free of catalogue knowledge.

### Recent tracking through writeIntake

The `health.writeIntake` request gains an optional `foodId`:

```ts
request: { date: string; kcal: number; macros: Macros; foodId?: string };
```

When `foodId` is present the host, in the same write:

1. removes the id from `recentFoodIds` if present;
2. inserts it at the front;
3. truncates to `RECENT_LIMIT = 12`.

Logging a meal with no `foodId` (a future multi-food or free-form entry) leaves
`recentFoodIds` untouched. The recent list is a UI convenience derived from the
logging action; it is not nutrition history.

### Cleanup when a custom food is deleted

`deleteCustomFood` (RFC 0014) also removes the deleted id from both
`favoriteFoodIds` and `recentFoodIds`, so the lists do not accumulate dangling
ids for foods the user explicitly removed. Editing a custom food keeps its id,
so favorites/recent survive edits unchanged.

### Backwards compatibility

Older persisted records lack the two arrays. The repository treats a missing
array as empty (`optJSONArray` fallback, the same pattern used for
`customFoods`) and writes the arrays back on the next mutation. The seed and the
deterministic sample ship both arrays as empty.

### UI

- When the search query is empty, the food sheet shows two sections above an
  empty result list:
  - **Favorites**: each pinned food as a tappable row (star + name + kcal/100g);
  - **Recent**: up to 12 most recently logged foods, most recent first.
  Tapping a row opens the existing portion/detail view.
- When a query is present, behavior is unchanged: only search results (and the
  create row) show.
- The detail view gains a favorite toggle: a filled star for pinned
  (`★`, primary green) and an outlined star otherwise (`☆`, neutral). Tapping it
  calls `health.setFoodFavorite` and updates locally without leaving the view.
- Logging a portion from the detail view passes that food's `foodId` to
  `writeIntake`, so it becomes the most recent entry.

The star (rather than a heart) is used deliberately: the heart is the LeanOn
brand mark, while a star unambiguously signals "saved / pinned".

## Alternatives considered

- **`favorite: boolean` on `FoodItem`.** Bundled foods are shared, read-only data
  shipped in the offline package; mutating them per user is not possible without
  copying the whole catalogue into host state. A separate id list pins both
  bundled and custom foods uniformly and stays tiny.
- **`foodId` on `IntakeSample` to derive recent.** RFC 0012 intentionally keeps
  nutrition history as point-in-time totals decoupled from food definitions, so
  editing/deleting foods never rewrites history. Threading a food id through
  intake samples would recouple the two and still needs ordering/dedup logic. A
  dedicated capped `recentFoodIds` captures the intent (fast reuse) with no
  effect on history.
- **A separate `touchRecentFood` RPC after `writeIntake`.** Two round trips can
  disagree (intake saved, recent not) and add latency. Folding the optional
  `foodId` into the existing one-round-trip `writeIntake` keeps intake + recent
  atomic.
- **Unlimited recent.** A cap keeps the section bounded and relevant; foods not
  eaten recently are unlikely to be the next entry.

## Impact

- Contracts: new `health.setFoodFavorite`; optional `foodId` on
  `health.writeIntake`; two new `HostDataDto` arrays.
- Android: repository favorite/recent mutation and delete cleanup; new
  `HealthModule.setFoodFavorite`; `writeIntake` forwards `foodId`.
- Pages: Favorites/Recent sections, detail star toggle, `foodId` on save.
- No change to nutrition calculations or to historical records.
