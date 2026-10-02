# RFC 0024 — Micronutrients (fiber, sugar, saturated fat, sodium)

- Status: Accepted
- Date: 2026-10-02
- Slice: 16
- Related: RFC 0004 (engine), RFC 0012 (food logging), RFC 0013/0014 (custom
  foods), RFC 0016 (Open Food Facts), RFC 0021 (Health Connect export)

## Summary

Extend the nutrition model beyond energy and the three macronutrients to track
four diet-quality signals that matter for weight control and long-term health:

- **Fiber** (g) — a target to *reach* (satiety, gut and metabolic health).
- **Sugar** (g) — an upper limit (added sugars; liquid calories in particular).
- **Saturated fat** (g) — an upper limit tied to energy intake.
- **Sodium** (mg) — an upper limit (water retention, cardiovascular risk).

The values are captured automatically from Open Food Facts for scanned foods,
scaled per portion, accumulated into the day's intake, and shown both in the
food detail and in a compact Home card. The Health Connect nutrition export is
extended to carry the same fields.

## Motivation

Weight loss is driven by the energy deficit, but *how* the deficit is composed
determines satiety, adherence and health outcomes. A dieter can hit a calorie
target with low-fiber, high-sugar, high-sodium food and still feel hungry,
retain water (masking the scale trend) and eat poorly. The app already records
calories and protein/carbs/fat; it has no visibility into the nutrients that
most strongly influence hunger and diet quality. Fiber in particular is a
leading predictor of how satiating a calorie-controlled diet is, while sodium
drives the day-to-day water-weight noise that demoralises users.

Open Food Facts already exposes these fields for most packaged foods, so the
data can be captured with no extra manual entry.

## Goals

- Add a first-class `Micros` value object and thread it through foods, portions,
  daily intake, the bridge, Android persistence and the UI.
- Parse fiber, sugars, saturated fat and sodium from Open Food Facts, including
  unit conversion (OFF reports sodium in grams; LeanOn stores milligrams) and a
  salt-derived sodium fallback.
- Accumulate micronutrients across the day's meals like macros.
- Show per-portion micronutrients in the food detail (hidden when the food has
  no data) and a Home card with the day's totals versus reference goals, using
  the existing semantic colours (green = fiber goal met / red = limit exceeded).
- Extend the Health Connect `NutritionRecord` export with the same fields.

## Non-goals

- Full vitamin/mineral coverage (vitamin C, iron, potassium, etc.) — the four
  signals above cover the strongest, most-available diet-quality levers; more
  can be added to the same object later.
- A micronutrient editor in the custom-food form. The factories and contracts
  accept optional micros, but the manual-entry UI is deferred; custom and
  curated foods simply report zeros for now.
- Distinguishing "unknown" from a measured zero. Consistent with `Macros`,
  missing values normalise to zero; the detail view hides an all-zero block
  rather than asserting the nutrients are literally absent.
- Personalised, sex- or condition-specific micronutrient goals; the reference
  goals are population guidelines (see below).

## Design

### Data model (core)

```ts
/** Diet-quality micronutrients for an amount of food or a day of intake. */
export interface Micros {
  fiberG: number;
  sugarG: number;
  saturatedFatG: number;
  sodiumMg: number;
}
```

All fields are required numbers, defaulting to zero, exactly like `Macros`.
`IntakeSample` gains a required `micros: Micros`. Fiber, sugar and saturated
fat are grams; sodium is milligrams (the convention used in nutrition labels).

A `ZERO_MICROS` constant and the following pure helpers live in a new
`nutrition/micros.ts`:

- `microsForDate(intake, date): Micros` — sum every intake sample on `date`,
  rounding gram fields to one decimal and sodium to whole milligrams; returns
  `ZERO_MICROS` when the day has no meals.
- `addMicros(a, b): Micros` — component-wise sum (used by accumulation and the
  Android port).
- `recommendMicroGoals(energyGoalKcal): MicroGoals` — reference daily goals:

  | Nutrient | Goal | Basis |
  |---|---|---|
  | Fiber | 30 g | adult adequate-intake guideline |
  | Sugar | 50 g | WHO conditional upper limit (10% of 2000 kcal) |
  | Saturated fat | `round(energyGoal × 0.10 / 9)` g | WHO/heart-health <10% of energy (9 kcal/g) |
  | Sodium | 2300 mg | WHO/label tolerable upper intake |

  Throws `RangeError` for a non-finite or non-positive `energyGoalKcal`.

`MicroGoals` has the same shape as `Micros`. These are reference values for
display, not medical targets.

### Food data

`food-data` gains a structurally-compatible `Micros` type (mirroring how it
declares its own `Macros`), and `FoodItem` gains `micros: Micros` per 100 g.

- `portion(item, grams)` scales micros by `grams / 100` alongside kcal and
  macros; `Portion` gains `micros`.
- `createFoodFromBarcode` reads additional OFF nutriment keys:

  | LeanOn field | OFF key (`_100g`) | Handling |
  |---|---|---|
  | fiberG | `fiber` | grams, non-negative |
  | sugarG | `sugars` | grams, non-negative |
  | saturatedFatG | `saturated-fat` | grams, non-negative |
  | sodiumMg | `sodium`, fallback `salt` | OFF sodium is **grams** → ×1000 and round to mg; when sodium is absent derive from salt: `salt / 2.5 × 1000` |

  Missing or invalid values normalise to zero via the existing `macro()`
  helper (generalised to non-negative numbers).
- `createCustomFood` / `updateCustomFood` accept optional micros on their input
  types and validate them (finite, non-negative; sodium in mg), defaulting to
  zero. The custom-food UI does not send them yet.

### Bridge contracts

`HostDataDto` intake entries and the food objects carried by the write methods
gain `micros`. The `health.writeIntake`, `health.writeScannedFood` and
`health.writeCustomFood` requests accept `micros` (optional in the request; the
host fills zeros, matching how optional macros are treated). Responses continue
to return the refreshed `hostData`. No new RPC method is introduced.

### Android

- `RecordsRepository.addIntake(...)` accepts and accumulates micros into the
  day's intake sample (the same map/replace path that sums macros). Scanned and
  custom food writes persist the food's per-100 g micros.
- `loadHostData()` backfills missing `micros` on every intake sample and
  missing `micros` on every stored food, mirroring the existing
  `ensureExerciseIds` migration, so older `records.json` files stay valid.
- `HealthModule.writeIntake` / `writeScannedFood` / `writeCustomFood` read and
  forward micros with the same finite/non-negative validation as macros.
- The Health Connect nutrition mapper sets `fiber`, `sugar`, `saturatedFat`
  and `sodium` on `NutritionRecord` when non-zero, using `Mass.grams` for all
  four (sodium converts mg → g by ÷1000). The mapper unit tests are extended.
- The seed dataset gains micros on the sample intake/foods.

### Pages

- **Food detail (FoodSheet):** when the selected food has any non-zero micros,
  show a compact row of the *chosen portion's* fiber / sugar / saturated fat /
  sodium (using the scaled `portion().micros`). An all-zero food shows no
  micronutrient block.
- **Home:** a new `MicrosCard` is placed directly after `MacroCard` (and before
  `WaterCard`). It shows four compact items with the day's totals and reference
  goal: Fiber is highlighted green at/over its target; Sugar, Saturated fat and
  Sodium are highlighted red when over their limits; otherwise neutral. The
  card uses `microsForDate` and `recommendMicroGoals(energyGoalKcal)`.
- The preview bridge accumulates and returns micros on the simulated writes,
  and the en / zh-CN catalogues gain `micros.*` keys.

### i18n keys

| Key | English | 简体中文 |
|---|---|---|
| `micros.title` | Diet quality | 饮食质量 |
| `micros.fiber` | Fiber | 膳食纤维 |
| `micros.sugar` | Sugar | 糖 |
| `micros.saturatedFat` | Sat. fat | 饱和脂肪 |
| `micros.sodium` | Sodium | 钠 |
| `micros.ofGrams` | of {n} g | 目标 {n} 克 |
| `micros.ofMg` | of {n} mg | 目标 {n} 毫克 |
| `micros.fiberReached` | Fiber goal met | 纤维已达标 |

## Testing

- core: unit tests for `microsForDate` (multi-meal sum, rounding, empty day),
  `addMicros`, and `recommendMicroGoals` (clamped/rounded saturated fat,
  invalid energy throws).
- food-data: barcode tests covering fiber/sugars/saturated-fat parsing, sodium
  g→mg conversion, the salt fallback, and portion scaling; custom factory
  validation tests for optional micros.
- bridge: contract/client tests asserting micros round-trip on the writes.
- Android: JVM unit tests for the Health Connect micros mapper (including
  mg→g); the build compiles the repository/module changes.
- Pages: web E2E that scans the mock product and asserts the detail shows the
  scaled micros and the Home card reflects them; screenshots in en and zh-CN.

## Open questions

- Whether the sugar goal should default to the WHO *strong* 25 g rather than the
  conditional 50 g; deferred until we can make goals configurable.
- Whether to surface sodium-driven water retention explicitly alongside the
  weight trend (related to the future plateau/water-weight analysis).
