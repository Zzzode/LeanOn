# @zzzode/exercise-data

Offline, bilingual (English + Simplified Chinese) exercise catalogue for
[LeanOn](../../), with MET-based kilocalorie estimation.

- `exercises` / `getExerciseById` — common activities with Compendium-derived
  MET values.
- `calculateExerciseKcal(type, durationMin, bodyWeightKg)` —
  `round(MET × kg × min / 60)`, throws `RangeError` on invalid input.

The package is pure TypeScript, ships no network or sensor integration, and is
built with [Rslib](https://lib.rsbuild.dev/). See
[RFC 0017](../../rfcs/0017-exercise-logging.md) for the design.
