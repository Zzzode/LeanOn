# @zzzode/food-data

English · [简体中文](README.zh-CN.md)

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
reasonable kitchen estimates; they are not lab measurements.

## Barcode products

`normalizeProductBarcode` validates retail GTIN-8/12/13/14 check digits and uses one EAN-13 identity for UPC-A and its leading-zero equivalent.
`createFoodFromBarcode` maps public Open Food Facts product nutrition to the same local food model.
It uses normalized kcal/100 g or kJ/100 g divided by 4.184, converts sodium grams to milligrams, and preserves normalized mass serving quantities.
Known volume-based products raise `OffNutritionError` with reason `volume-basis`; a grams-only record cannot assume liquid density.
Only the native lookup sends a barcode to OFF; these pure functions do not perform network requests or upload records.
See [RFC 0033](../../rfcs/0033-barcode-recovery-and-product-units.md), [OFF nutrition units](https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product_nutrition/) and [normalized servings](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/lib/ProductOpener/Units.pm).
Open Food Facts product data is © its contributors under [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).

## License

Apache-2.0. The bundled USDA data remains in the public domain (CC0 1.0).
