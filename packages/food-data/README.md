# @zzzode/food-data

Offline, bilingual (English + Simplified Chinese) food database for LeanOn. It ships
inside the Lynx bundle and provides **pure, synchronous local search** and a
**portion calculator**, so food entry works with no network and no native food code.

## Usage

```ts
import { foods, searchFoods, portion } from '@zzzode/food-data';

const results = searchFoods(foods, 'chicken breast', 'en');
// [{ id: 'usda-chicken-breast', ... }]

const meal = portion(results[0], 200);
// { kcal: 330, macros: { proteinG: 62, carbsG: 0, fatG: 7.2 } }
```

- `searchFoods(database, query, locale, limit?)` matches the active-locale name first
  (prefix, then substring) and falls back to the other locale; an empty query returns
  common staples.
- `portion(item, grams)` scales the per-100 g values; calories round to whole units and
  macros to one decimal.

## Data sources & attribution

Staple ingredients are derived from [USDA FoodData Central](https://fdc.nal.usda.gov/),
whose data are released into the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Per-100 g
values use the FDC nutrient IDs energy `1008`, protein `1003`, total lipid (fat)
`1004`, carbohydrate by difference `1005`.

Common Chinese dishes that FDC does not cover are marked `source: 'curated'` and use
reasonable kitchen estimates; they are not lab measurements. Barcode/packaged data
(e.g. Open Food Facts) and online search are planned separately.

## License

Apache-2.0. The bundled USDA data remains in the public domain (CC0 1.0).
