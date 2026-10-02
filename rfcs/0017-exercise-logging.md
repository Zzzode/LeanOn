# RFC 0017 — Exercise logging

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0010 (weight write path), RFC 0012 (food logging)

## Summary

Make intentional exercise a first-class, user-logged record. Today the Home
screen shows a single static `todayExerciseKcal` value with no way to enter,
correct, or review activity. This RFC introduces an offline, bilingual
catalogue of exercise types with standard **MET** (metabolic equivalent)
values, computes the kilocalories of a session from its duration and the
user's current body weight, persists sessions as history, and surfaces them on
Home. The existing "exercise adds calories back to the daily budget" behaviour
is retained but is now driven by real logged sessions instead of a hard-coded
number.

## Motivation

Weight control rests on three pillars: what you eat, what you weigh, and how
you move. Food logging (RFC 0012) and weight logging (RFC 0010, plus the BLE
scale in RFC 0011) are closed loops; exercise is the only pillar the user
cannot actually record. The energy card already reserves a line for exercise
and already adds it back to the calorie budget, but the value is fake, which
both overstates progress and gives the user no reason to open the app after a
workout.

Logging exercise also creates the same daily return-visit habit that food and
weight logging rely on, and it makes the "calories earned back" number honest:
the user sees exactly which session produced it and can delete a mistaken
entry.

## Design

### Energy model and the eat-back decision

`selectToday` already computes

```text
remainingKcal = energyGoalKcal - foodKcal + exerciseKcal
```

so exercise currently earns calories back at 100% (the MyFitnessPal model). We
keep this model rather than switching to "exercise never adds budget back",
for two reasons:

1. It is the behaviour already shipped and visible on Home; changing it would
   silently make every day feel more restrictive.
2. MET-based gross energy expenditure is a well-established estimate, and
   sessions are individually reviewable and deletable, which limits the damage
   from an overestimate.

The change in this RFC is that `exerciseKcal` becomes the sum of the day's
real logged sessions instead of a constant. A future RFC may introduce a
conservative eat-back factor (e.g. 0.7) if logged data shows systematic
overestimation; it is deliberately not added before there is data to justify
it.

### Domain type

A new core type mirrors `IntakeSample`:

```ts
export interface ExerciseSample {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Id of the type in the exercise-data catalogue. */
  typeId: string;
  durationMin: number;
  /** Kilocalories burned for this session. */
  kcal: number;
}
```

Sessions are append-only history, like intake. Multiple sessions on the same
day are allowed and summed. They carry no id in this RFC; editing/deleting
individual sessions is deferred to a later RFC (the same progression food
followed), and a mistaken entry can be corrected day-by-day once that lands.

### Exercise data package

A new private package `@zzzode/exercise-data` (built with Rslib, same shape as
`@zzzode/food-data`) owns the catalogue and the calculation:

```ts
export interface ExerciseType {
  id: string;
  name: { en: string; 'zh-CN': string };
  /** Metabolic equivalent of the task (Compendium of Physical Activities). */
  met: number;
}

export function calculateExerciseKcal(
  type: ExerciseType,
  durationMin: number,
  bodyWeightKg: number,
): number;
```

`calculateExerciseKcal` returns `Math.round(met * bodyWeightKg * durationMin /
60)` and throws `RangeError` when duration or weight is not a finite positive
number. The package also exports the `exercises` list and `getExerciseById`.

The catalogue ships offline and bilingual, covering roughly two dozen common
activities (walking, running, cycling, swimming, strength, HIIT, elliptical,
rope skipping, yoga, Pilates, stairs, racket and team sports, dance, hiking),
with MET values taken from the Compendium of Physical Activities. No network
or device sensor is required; this RFC is manual entry only. Connecting to
phone motion sensors / Health Connect is a separate slice.

### Bridge contract

`HostDataDto` replaces the optional scalar with a history array:

```diff
- /** Kilocalories burned through intentional exercise today. */
- todayExerciseKcal?: number;
+ /** Logged intentional-exercise sessions (RFC 0017). */
+ exercises: ExerciseSample[];
```

A new write RPC follows the existing one-round-trip write pattern:

```ts
'health.writeExercise': {
  request: { date: string; typeId: string; durationMin: number; kcal: number };
  response: { success: true; hostData: HostDataDto };
};
```

The host appends the session, persists, dispatches `records.changed`, and
returns the updated `HostDataDto`, exactly like `health.writeIntake`. The host
does not recompute kilocalories; the page passes the value it calculated so the
formula stays unit-tested in TypeScript.

### Android host

- `RecordsRepository` gains an `exercises` array constant and `addExercise`,
  appending the session JSON (`date`, `typeId`, `durationMin`, `kcal`) with an
  `optJSONArray` fallback, mirroring `addIntake`.
- `HealthModule` gains `writeExercise`, validating a positive finite duration
  and kcal and mapping validation failures to `invalid-request`.
- The seed/sample gains an `exercises` array; the sample's previous
  `todayExerciseKcal: 240` becomes a strength session of the same value so the
  Home numbers are unchanged.

### Pages

- A new `ExerciseSheet` bottom sheet: pick a type from the scrollable
  catalogue, enter duration in minutes, and see the kilocalories update live
  using the current weight; Save calls `health.writeExercise`.
- `QuickActions` gains a **Log exercise** action alongside Log food / Log
  weight.
- A compact Home card shows today's total exercise kilocalories and minutes and
  lists the day's sessions (type name, minutes, kcal).
- `selectToday` aggregates today's sessions (sum of kcal and minutes) instead
  of reading `todayExerciseKcal`.
- New en + zh-CN strings for the sheet, card, and quick action.

## Alternatives considered

- **Derive exercise automatically from phone sensors / step count.** Removes
  manual friction but is platform-specific, inaccurate for strength/cycling/
  swimming, and cannot be built or verified in this environment. Deferred; the
  manual catalogue is the data foundation such a feature would write through.
- **Do not eat exercise calories back.** Better protects the deficit when
  estimates are inflated, but changes shipped behaviour and removes a positive
  reinforcement for exercising. Revisit later with a conservative factor once
  real data exists.
- **Reuse the food-data package for exercise.** Keeps the package count down
  but mixes two domains (nutrition vs activity) and their different math; a
  dedicated package mirrors the existing package-per-domain structure.
- **Add per-session ids and edit/delete now.** More complete, but repeats the
  scope of RFC 0014 in the same slice; the food feature already proved the
  create-first / manage-later progression.

## Open questions

- Eat-back factor: keep 100% or move to a conservative multiplier after
  observing logged sessions?
- Should a workout be splittable into warm-up / main sets, or is one type per
  session sufficient?
- Future: Health Connect / HealthKit sync, heart-rate-aware calorie estimates,
  and workout templates/presets.
