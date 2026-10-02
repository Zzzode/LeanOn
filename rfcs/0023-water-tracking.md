# RFC 0023 — Water tracking

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0010 (native persistence authority), RFC 0012 (food/intake),
  RFC 0021 (Health Connect)

## Summary

Add daily **hydration tracking** to LeanOn so the user can log glasses of
water against a personal, weight-based daily goal. The Home screen gains a
Water card showing today's intake versus goal with a progress bar and quick
+/− cup buttons. Water is stored as one total per day and upserted through a
single `health.writeWater` round trip, mirroring the weight write path.

## Motivation

- Adequate hydration supports the two outcomes LeanOn exists for: it reduces
  false-hunger snacking (helping the calorie deficit) and is a basic pillar of
  health. A weight-loss product should make water as easy to log as food.
- Water logging is inherently quick and frequent (many small glasses per day),
  so it must be a single tap with no sheet, keyboard, or search — unlike food.
- A personal goal (rather than a fixed "8 cups") adapts as the user's weight
  changes and keeps the target credible.

## Goals

1. Persist a daily water total (millilitres) natively, one entry per day.
2. Provide a weight-based daily goal computed by the pure core.
3. Let the user add or remove a standard cup (250 ml) in one tap from Home,
   with the day total clamped at zero.
4. Show progress toward the goal with the existing progress-bar visual
   language, including a clear "goal reached" state.

## Non-goals

- Custom cup sizes or a user-editable goal in this version (the goal is
  derived from the latest weight; both can be made configurable later).
- Per-glass event history with individual ids; the day total is the unit of
  record, which is sufficient for +/− and keeps the model simple.
- Exporting water to Health Connect (`HydrationRecord`) — additive, can follow
  once this write path is settled.
- Micronutrients (fiber, sugar, sodium) — a separate RFC.
- iOS implementation (parallel design, built on macOS).

## Design

### Domain model

A new core type:

```ts
export interface WaterSample {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** Total millilitres consumed on that day (never negative). */
  amountMl: number;
}
```

`HostDataDto` gains `water: WaterSample[]`. There is at most one sample per
date; the host upserts by date (replace the amount when the date already
exists, otherwise insert in date order).

### Goal

A pure function derives a goal from body weight, using the widely used
~35 ml/kg guideline (drinking water; food water excluded), bounded to a sane
range and rounded to a friendly step:

```ts
export const WATER_ML_PER_KG = 35;
export const WATER_GOAL_MIN_ML = 1500;
export const WATER_GOAL_MAX_ML = 4000;
export const WATER_GOAL_STEP_ML = 50;

export function recommendWaterGoalMl(weightKg: number): number;
```

- raw = `weightKg * 35`
- clamp to `[1500, 4000]`
- round to the nearest 50 ml
- throws `RangeError` when `weightKg` is not a finite, positive number.

Examples: 60 kg → 2100; 80 kg → 2800; 100 kg → 3500; 120 kg → 4000.

The page computes the goal from the latest logged weight; before any weight
exists it falls back to the clamped constant for a default reference weight
(the page uses the goal only for display, never for persistence).

### Read helper

```ts
export function waterForDate(
  water: readonly WaterSample[],
  date: string,
): number;
```

Returns the day's `amountMl`, or 0 when the date has no sample.

### RPC

```ts
'health.writeWater': {
  request: { date: string; amountMl: number };
  response: { success: true; hostData: HostDataDto };
};
```

The page owns the interaction: tapping + adds a cup to the currently displayed
total and writes the new absolute total; tapping − subtracts a cup (clamped at
0) and writes it. The host validates a non-blank date and a finite, non-negative
`amountMl`, upserts the day, emits `records.changed`, and returns the updated
`HostDataDto`. There is no separate delete method — removing a cup simply
writes a lower total.

### Android

- `RecordsRepository.upsertWater(date, amountMl)`: locate the day in the
  `water` array (created on demand), replace or insert in date order, persist,
  return HostData.
- `HealthModule.writeWater`: parse and validate, call the repository, emit
  `records.changed`; invalid input maps to the standard failure codes.
- Seed `hostData.json` gains `"water": []`.

### Pages

- New `WaterCard` component placed after the Macros card:
  - title and today's total in ml, with the goal (e.g. `1750 / 2800 ml`).
  - a progress bar filled to `min(total / goal, 1)`.
  - two controls: a − button and a + button labelled with the cup delta
    (`−250 ml`, `+250 ml`); − is disabled at 0.
  - when the total meets or exceeds the goal, a "Goal reached" state is shown
    and the bar uses the full botanical fill.
- Cup size is a page constant `CUP_ML = 250`.
- `App` wires a `writeWater` action through the bridge and updates `hostData`
  from the response, consistent with the other logging actions.
- The preview `app-bridge` gains a `health.writeWater` handler that upserts a
  day total in the in-memory host data so the web flow is exercisable.
- i18n keys under `water.*` are added to both English and Simplified Chinese.

### i18n keys

- `water.title` — "Hydration" / "饮水"
- `water.goal` — "Goal" / "目标"
- `water.ml` — "ml" / "毫升"
- `water.left` — "{amount} ml left" / "还差 {amount} 毫升"
- `water.reached` — "Goal reached" / "已达标"
- `water.add` — "+250 ml"
- `water.remove` — "−250 ml"

## Verification

- Core unit tests cover the goal math, clamping/rounding, invalid-input
  errors, and `waterForDate`.
- Bridge client tests cover `health.writeWater` and the new `water` field.
- Android JVM build and unit tests pass; `assembleDebug` succeeds.
- A web E2E flow opens Home, taps + several times and − once, asserts the
  total and the goal-reached state, and verifies persistence on reopen.

## Drawbacks and future work

- The day-total model means concurrent edits from two devices could overwrite
  each other; acceptable for the current single-user, primarily single-device
  usage. Delta-based merging can be revisited with sync (RFC 0008).
- Fixed cup size and derived goal do not yet adapt to individual preference;
  configuration is a natural follow-up.
- Health Connect hydration export and water reminders are deferred.

## Open questions

- None for this version; cup size and goal formula follow common hydration
  guidance and are easy to tune.
