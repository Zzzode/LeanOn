- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0001, 0003

# Core Domain Engine

English · [简体中文](0004-core-domain-engine.zh-CN.md)

## Summary

Design `@zzzode/core`, a **pure TypeScript, zero-UI, zero-native** domain engine that is the
"brain" of LeanOn. It owns six capabilities:

1. Baseline energy estimation (BMR / static TDEE)
2. **Adaptive TDEE inferred from the user's own weight trend and intake**
3. Weight-signal processing: denoising, robust trend slope, menstrual-cycle awareness
4. Plateau and metabolic-adaptation detection
5. Nutrition: macro targets and a food/diet quality score
6. Forecasting: target date and the weight-loss → maintenance transition

All functions are deterministic: structured records in, computed results out. There are no side
effects, no I/O, no clocks, no randomness — the same inputs always produce the same outputs.

## Motivation

- Population formulas (Mifflin-St Jeor × activity factor) are a useful **day-zero guess** with
  roughly ±10% spread, but they are fitted to other people and do not update as the body changes.
- The most accurate personal estimate is already contained in the user's own data: what they ate
  and what their weight did. Energy conservation lets us infer their *real* expenditure from the
  relationship between the two.
- Daily weight is dominated by water, glycogen, sodium and (for women) the menstrual cycle, so a
  naive "compare today to last week" produces false stalls and panic. We need explicit denoising
  and cycle-aware comparison.
- The linear "3,500 kcal per pound" rule overpredicts long-term loss because expenditure falls as
  the body gets smaller; forecasts must account for that slowdown.
- Keeping all of this in a pure, portable package lets it run on a Lynx background thread, on the
  server, and in unit tests against fixed fixtures.

## Guide-level explanation

- On first launch, before any data exists, the engine estimates BMR with Mifflin-St Jeor (or
  Katch-McArdle if body fat is known) and derives a starting TDEE with an activity factor.
- After at least 2–4 weeks of logs, the engine switches to an **adaptive TDEE**: it fits the
  recent weight trend, converts the slope to an energy imbalance, and combines it with average
  intake to report the user's real maintenance number with a confidence band.
- Every weight view uses a 7-day rolling average; trends are slopes over a window, never
  point-to-point deltas. Female users get cycle-aware comparisons (same cycle phase across months).
- A **plateau is declared only when the trend slope is statistically flat for ≥3 weeks** while
  logging is consistent; shorter flat spells are labelled normal variation, and a flat scale with
  a shrinking waist is labelled body recomposition, not a stall.
- The engine returns daily calorie and macro targets that respect safety floors, a diet-quality
  score for the day, and a continuously updated forecast with an explicit maintenance plan.

## Reference-level explanation

### Inputs (domain model)

```ts
type Sex = 'female' | 'male';

interface Profile {
  sex: Sex;
  birthDate: ISODate;        // age derived, not stored
  heightCm: number;
  activityLevel: ActivityLevel; // sedentary..extremely_active
  bodyFatPercent?: number;
}

interface WeightSample { date: ISODate; weightKg: number; }
interface IntakeSample { date: ISODate; kcal: number; macros: Macros; }
interface Macros { proteinG: number; carbsG: number; fatG: number; }
```

The engine never reads these from disk; callers pass arrays sorted by date.

### Module layout

```
src/
├── types.ts
├── energy/  bmr.ts · tdee.ts · targets.ts
├── weight/  trend.ts · smoothing.ts · cycle.ts · plateau.ts
├── nutrition/ macros.ts · score.ts
└── forecast/ projection.ts
```

### 1. Baseline energy

- **Mifflin-St Jeor** (default, body composition unknown):
  `BMR = 10·kg + 6.25·cm − 5·age + s`, where `s = +5` male, `−161` female.
- **Katch-McArdle** (when `bodyFatPercent` is set):
  `LBM = kg·(1 − bf%)`, `BMR = 370 + 21.6·LBM`.
- Static TDEE = BMR × activity factor (sedentary 1.2 … extremely active 1.9). This is used only
  until enough personal data exists; the UI must label it an estimate.

### 2. Adaptive TDEE from weight trend

Energy conservation: `ΔE_stores = intake − expenditure`. Rearranged over a window of `n` days:

```
adaptiveTDEE = mean(intake) − (ΔweightKg · ρ / n)
```

- `ρ` is the **working energy density of weight change, 7700 kcal/kg** (32.2 MJ/kg; ≈3500
  kcal/lb). It is a working constant, not a physical law: it is accurate for people with higher
  body fat and overstates the density for leaner people whose losses include more lean tissue.
- `ΔweightKg` is the **fitted trend change** over the window (slope × n), not first-vs-last raw
  values.
- Weight loss makes `ΔweightKg` negative, so adaptive TDEE is *higher* than mean intake.
- Minimum window: 14 days; recommended 28 days. Require a minimum count of logged days and flag
  low adherence rather than emitting a false-precise number.
- Output includes a point estimate and a **confidence band (≈ ±100 kcal)**; wider when data is
  sparse or logging is uneven.
- **Consistent under-reporting is tolerable**: if intake is logged ~15% light every day, the
  inferred TDEE and the resulting targets shift by the same factor and still produce the planned
  trend. *Uneven* logging (strict weekdays, blank weekends) is the destructive case and is
  detected via per-day coverage and flagged.

### 3. Weight-signal processing

- **7-day rolling average** for display; a trimmed mean / median rejects single-day outliers.
- **Trend slope** via ordinary least squares over a 14–28 day window; the slope (kg/day), not
  point deltas, drives all decisions.
- Daily fluctuations of 1–2 kg from water, glycogen, sodium and gut contents are expected and
  must not trigger any message.
- **Cycle awareness (female)**: weight commonly peaks just before/at the start of menstruation,
  with documented within-cycle variation around 0.6–2 kg. The engine aligns samples by cycle day
  and compares the same phase across months instead of adjacent weeks. Cycle phase is an optional
  input; when absent, the engine widens the noise band rather than assuming a cycle.
- Smoothing parameters (window, trim fraction) are named constants in one place.

### 4. Plateau and adaptation detection

A **plateau** requires all of:

1. The fitted |slope| over the most recent ≥21 days is within the noise band (indistinguishable
   from zero), and
2. Logging coverage over that window meets the consistency threshold, and
3. Secondary signals (waist circumference, progress photos) are also flat.

- 1–2 flat weeks → `normal_variation`. Flat scale with a declining waist / rising strength →
  `body_recomposition` (a win).
- **Metabolic adaptation** is estimated by comparing measured TDEE against the TDEE *predicted
  for the new, smaller body*. The part explained by lost mass is obligatory (roughly 10–15
  kcal/kg/day RMR); only the remainder is adaptive thermogenesis. We must not label the obligatory
  drop "metabolic damage."
- When a true plateau is confirmed, the engine recommends, **in order**: audit logging → increase
  NEAT (steps) → a modest 100–200 kcal adjustment → a 7–14 day diet break at maintenance
  (MATADOR evidence). It never recommends a large crash cut first.

### 5. Nutrition

- **Protein is the anchor**: target 1.6 g/kg, up to 2.0–2.4 g/kg on aggressive deficits,
  expressed against **goal/reference weight** so people with large fat mass are not prescribed
  protein for tissue they intend to lose.
- **Fat floor**: ≥0.5 g/kg and ~20–30% of calories (avoid the sub-15% range linked to hormonal
  disruption). Carbs fill the remainder.
- **Diet-quality score (0–100)** is a LeanOn model combining NRF-style signals: positive for
  protein adequacy, fibre, micronutrient density and whole foods; negative for added sugar,
  excess sodium/saturated fat and ultra-processed items. It scores the *day's mix*, complementing
  the traffic-light per-food signal; it is explicitly a product heuristic, not a clinical index.
- A maximum fat-mobilisation guideline (~31 kcal/lb of fat mass/day) bounds how large a deficit
  can be before the body must catabolise lean tissue; targets exceeding it are rejected.

### 6. Forecast and maintenance transition

- Short-range planning may use the working constant; longer forecasts iterate a **dynamic model**
  (Hall/NIDDK-style): expenditure and the deficit shrink as weight changes, producing a curved
  trajectory rather than a linear one. The response to an intake change is asymptotic
  (half-time on the order of a year), so the model is for planning while the live trend remains
  the calibration signal.
- Outputs: projected date to goal, expected weekly rate, and the maintenance calorie range at
  goal.
- When goal weight is reached the engine switches to an explicit **maintenance phase**: intake is
  raised gradually toward the adaptive TDEE while weight is monitored, with a defined tolerance
  band and a re-intervention trigger if weight drifts beyond it.

### Confidence and uncertainty

Every computed number carries a confidence level (`low | medium | high`) derived from sample
count, window length, logging coverage and trend fit quality. The UI must show uncertainty rather
than false precision and must prefer the trend over the model once a diet is running.

### Safety constraints (hard rules)

- Default rate: 0.5–1 kg/week; never prescribe calories below estimated BMR-driven floors
  (general guidelines ~1200 female / 1500 male) without professional supervision.
- Refuse to emit targets when inputs are implausible; surface an error instead of guessing.
- The engine does not diagnose or treat disease; eating-disorder screening and medical referrals
  live in the app layer, but the engine must never recommend ever-smaller intake to force loss.

## Drawbacks

- Adaptive TDEE is only as good as intake logs; consistent bias is tolerable but uneven logging
  silently corrupts it.
- The 7700 kcal/kg constant is approximate; for lean users and short windows it drifts, hence the
  confidence band and the dynamic model.
- Cycle-aware logic needs cycle-phase data the user may not provide; absent data forces a wider
  noise band and slower plateau calls.
- A dynamic ODE model is more complex to implement, test and explain than a single divisor.

## Rationale and alternatives

- **Static formula only**: simple, but ignores the user's own (more accurate) data and does not
  adapt; rejected as the final estimator, retained as the day-zero guess.
- **Flat 3500/7700 linear forecasting**: grossly overpredicts multi-month loss; rejected for
  long horizons, kept for short back-of-envelope planning.
- **Per-day point comparisons / weekly weigh-ins**: too noisy given 1–2 kg daily swings; rejected
  in favour of daily weighing with rolling averages and fitted slopes.
- **Black-box ML model for TDEE**: opaque, untrainable on two users and hard to debug; rejected
  in favour of an interpretable energy-balance model.
- **KMP shared engine**: stronger for offline background compute but heavier and not
  hot-updatable; deferred (see RFC 0001).

## Unresolved questions

- Whether to implement the full Hall ODE or a reduced approximation first, and how to calibrate
  it for two users.
- Exact cycle-phase source (manual log vs HealthKit/Health Connect data) and default cycle length.
- Tuning of plateau thresholds and the confidence-band width against real data.
- Whether Rslib's isolated-declaration mode should drive stricter source typing in core.

## References (evidence base)

- Wishnofsky M. *Caloric equivalents of gained or lost weight.* Am J Clin Nutr, 1958 —
  source of the ~3,500 kcal/lb (7,700 kcal/kg) working constant.
- Hall KD, Sacks G, Chandramohan D, Chow CC, et al. *Quantification of the effect of energy
  imbalance on bodyweight.* The Lancet, 2011 — dynamic body-weight model; fixed intake does not
  yield a fixed deficit.
- Thomas DM, Martin CK, Redman LM, et al. — the 3,500 kcal rule overpredicts multi-week loss;
  adherence pattern (not just average) drives the plateau.
- U.S. NIDDK/NIH **Body Weight Planner** — public implementation of the Hall dynamic model.
- Byrne NM, et al. *Intermittent energy restriction improves weight loss efficiency in obese
  men: the MATADOR study.* Int J Obes, 2018 — diet breaks / intermittent restriction.
- Morton RW, et al. *Protein supplementation and resistance training-induced gains: a systematic
  review and meta-analysis.* Br J Sports Med, 2018 — protein ~1.6 g/kg (up to ~2.2 g/kg) for
  retention.
- Nedeltcheva AV, et al. *Insufficient sleep undermines dietary efforts to reduce adiposity.*
  Ann Intern Med, 2010 — short sleep shifts loss toward lean tissue.
- Fulgoni VL III, Keast DR, Drewnowski A. *Development and validation of the Nutrient-Rich Food
  Index (NRF).* J Nutr, 2009 — basis for the diet-quality score.
- Menstrual-cycle body-weight variation review, 2025 (PMC13373534) — cycle-phase alignment.

## Implementation plan

- [x] Module/folder layout and shared domain types
- [x] Baseline BMR / static TDEE
- [x] Rolling average, robust slope, adaptive TDEE with confidence
- [x] Cycle-aware alignment and same-phase comparison
- [x] Plateau / adaptation classification
- [x] Macro targets
- [ ] Diet-quality score
- [ ] Dynamic forecast and maintenance phase
- [x] Fixed-fixture unit tests (Rstest) for every formula, including known worked examples

Implemented areas are covered by 39 fixed-fixture Rstest cases. The diet-quality score,
dynamic forecasting, and automatic cycle-aware noise bands inside plateau classification
remain.
