# RFC 0019 — Progress insights and weekly review

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0004 (domain engine), RFC 0017 (exercise logging), RFC 0010 (weight write path)

## Summary

LeanOn today is a single, day-focused Home screen: it shows the current energy
budget, today's weight summary, today's macros, and today's exercise. Weight
loss, however, is won or lost over weeks, not hours. Daily weigh-ins and intake
are noisy, and without a longer view the user cannot tell whether they are on
track, plateaus are invisible, and the motivation that comes from seeing
accumulated progress is lost. This RFC adds a second surface — **Insights** —
reachable from a segmented Today / Insights switch, with a 7-day and 30-day
window. It is built entirely from records already present in `HostData`; no new
native RPC, storage field, or network capability is required.

## Motivation

The core product promise is that the user loses weight and keeps it off. The
behavioural literature and the leading apps (Noom, WW, MyFitnessPal, Apple
Health) converge on three things beyond daily logging:

1. **Trend over noise.** A single weigh-in moves with hydration, glycogen and
   sleep. A fitted slope over a week or a month is the honest signal of whether
   the energy balance is right.
2. **Adherence feedback.** Knowing how many days the user ate within budget,
   and their average intake, turns a vague "am I being good?" into a concrete
   number and a realistic target.
3. **Progress reinforcement.** Showing accumulated weight lost, active days
   and logged days rewards the behaviour and protects against demotivation
   during a plateau.

All of the underlying data (35 days of weights, two weeks of intake, exercise
sessions) already exists on the host. What is missing is aggregation and a
place to show it.

## Goals

- Add a pure, deterministic aggregator in `@zzzode/core` that turns the
  existing records plus a date window into a single `ProgressInsights` result.
- Add an Insights surface with a 7-day / 30-day toggle and a segmented
  Today / Insights switch, without disturbing the existing Home.
- Show: weight change over the window, fitted weight slope in kg/week, a small
  weight trend chart, average daily intake, on-target days, average deficit,
  active days, total exercise, and logging consistency.
- Work offline with the same bilingual (English + Simplified Chinese) treatment
  as the rest of the app.

## Non-goals

- No new RPCs, no sync, no server work; the UI aggregates the `HostData` the
  host already provides.
- No goals, streaks, badges, or social comparison in this slice.
- No food-level or per-meal analytics; only daily energy totals.
- No exporting or sharing of the report.
- No menstrual-cycle or body-fat trend analysis yet.

## Proposal

### Date windowing

All math stays in UTC on whole days, consistent with the rest of the engine
(`util/date.ts`). A window is described by an inclusive `endDate` (normally
today) and a positive integer `windowDays`; the inclusive start is
`endDate - (windowDays - 1)` whole days. A new inverse helper
`isoFromDayIndex(index)` converts a whole-day index back to `YYYY-MM-DD`.
Records are included when their date satisfies `start <= date <= end`.

### Aggregation (`core/insights.ts`)

`buildProgressInsights(input): ProgressInsights` takes:

```
{
  endDate: string;
  windowDays: number;            // 7 or 30
  weights:   readonly WeightSample[];
  intake:    readonly IntakeSample[];
  exercises: readonly ExerciseSample[];
  dailyBudgetKcal: number;       // the adaptive TDEE energy target
}
```

and returns:

- **Weight**
  - `startWeightKg` / `endWeightKg`: the first and last weight in the window,
    and `changeKg = end - start` (negative is loss).
  - `slopeKgPerWeek`: ordinary least-squares slope (reusing `linearTrend`)
    over the in-window weights, expressed per week, with `r2`; `null` when
    fewer than two distinct-day weights exist.
  - `points`: the in-window `{ x, y }` weight points for the chart.
  - `weightLoggedDays`: distinct days with a weight.
- **Nutrition**
  - Intake is summed per calendar day (multiple meals accumulate, matching the
    existing `writeIntake` behaviour) into `dailyKcal: { date, kcal }[]`.
  - `loggedDays`: distinct days with any intake.
  - `onTargetDays`: days whose total is `<= dailyBudgetKcal`.
  - `averageKcal`: mean over **logged days only**; `null` if none.
  - `averageDeficitKcal = dailyBudgetKcal - averageKcal`; `null` if no logged
    days. Averaging only logged days avoids treating "not logged" as "ate zero",
    which would otherwise flatter the average.
- **Exercise**
  - `activeDays`: distinct days with at least one session.
  - `totalKcal` and `totalMin`: summed across sessions in the window.

`windowDays` must be a finite positive integer or the function throws
`RangeError`. The aggregator is pure and fully unit-tested, including empty and
partial windows.

### UI (pages)

- A segmented **Today / Insights** control is added at the top of the screen;
  Today renders the existing Home unchanged, Insights renders the new screen.
- The Insights screen has a **7d / 30d** segmented toggle and a set of cards:
  - **Weight card**: net change over the window (signed, loss in the primary
    green, gain in the budget-exceeded red), the fitted `kg/week` slope, and a
    compact trend chart drawn from native views — a row of vertical bars whose
    heights encode weight, so no charting dependency is added.
  - **Nutrition card**: average daily intake, on-target days expressed as
    `on-target / logged`, and the average daily deficit.
  - **Exercise card**: active days and total exercise kilocalories/minutes.
  - **Consistency line**: weight-logged days and logged intake days over the
    window.
- The aggregator is invoked from the existing selector/state layer using the
  current adaptive budget already shown on Home; no bridge change is needed.
- All labels are added to the i18n catalogs (English authoritative, Simplified
  Chinese via `satisfies Record<MessageKey, string>`).

### Edge cases

- Fewer than two weights in the window: slope and chart are hidden and a neutral
  "not enough data yet" label is shown; endpoint change is still shown if one
  weight exists.
- No logged intake days: averages and deficit show the neutral label rather
  than `0`, so missing data is never confused with fasting.
- A window that extends before the earliest record simply aggregates the days
  that exist; no synthetic zero-days are added.
- Multiple meals and multiple sessions on one day are accumulated/counted once
  per day as described above.

## Alternatives considered

- **Keep only the daily Home.** Rejected: it cannot distinguish trend from
  daily noise and provides no long-term reinforcement, which is central to the
  product goal.
- **A third-party charting library.** Rejected for this slice: a bar row built
  from views covers the trend visualisation, keeps the bundle small, and renders
  identically in the Lynx runtime. A richer chart can be revisited later.
- **Compute insights on the native host.** Rejected: aggregation is pure
  presentation logic over data the JS layer already holds; putting it in core
  makes it unit-testable and shared with any future server, and avoids touching
  both native implementations.
- **Average intake over all calendar days (treating gaps as zero).** Rejected:
  it systematically understates average intake and hides non-logging; only
  logged days are averaged, while consistency is reported separately.

## Future work

- A dedicated onboarding/goal projection (forecast date to goal from slope).
- Plateau detection surfaced in Insights (the engine already classifies
  plateaus).
- Richer charts, weight-zone bands, and per-week rather than trailing windows.
- Macro adherence (not just energy), hydration, and body-fat trends.
- Export/share and optional Health Connect / HealthKit read of external data.

## Open questions

- Should the default Insights window be 7 or 30 days? (Proposed: 7.)
- Should on-target use a small tolerance band around the budget rather than
  `<=`? Deferred until adherence data exists.
