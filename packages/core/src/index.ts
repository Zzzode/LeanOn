/**
 * @zzzode/core — pure-TS domain engine (zero UI, zero native dependencies).
 *
 * Every export is deterministic: structured records in, computed results out,
 * with no I/O, clock or randomness. Detailed design and evidence: RFC 0004.
 *
 * Implemented so far:
 * - Baseline BMR (Mifflin-St Jeor / Katch-McArdle) and static TDEE
 * - Adaptive TDEE inferred from the weight trend and intake
 * - Weight smoothing, fitted trend slope and plateau classification
 * - Protein-anchored macro targets
 */

export const ENGINE_VERSION = '0.1.0' as const;

export type {
  ActivityLevel,
  Confidence,
  DateRange,
  Estimate,
  ExerciseSample,
  IntakeSample,
  Macros,
  PeriodRecord,
  Profile,
  Sex,
  WaterSample,
  WeightSample,
} from './types';

export {
  estimateBmr,
  katchMcArdle,
  mifflinStJeor,
} from './energy/bmr';
export type { BmrContext, MifflinInput } from './energy/bmr';

export {
  ACTIVITY_FACTORS,
  adaptiveTdee,
  ENERGY_DENSITY_KCAL_PER_KG,
  staticTdee,
} from './energy/tdee';
export type { AdaptiveTdeeInput, AdaptiveTdeeResult } from './energy/tdee';

export { mean, median, rollingMean } from './weight/smoothing';
export { fitWeightTrend, linearTrend, weightPoints } from './weight/trend';
export type { LinearTrend, Point } from './weight/trend';
export {
  classifyWeightStatus,
  FLAT_BAND_KG_PER_WEEK,
  MIN_PLATEAU_COVERAGE,
  PLATEAU_WINDOW_DAYS,
} from './weight/plateau';
export type { PlateauInput, WeightStatus, WeightStatusResult } from './weight/plateau';
export { alignToCycle, weightsAtCycleDay } from './weight/cycle';
export type {
  CycleAlignment,
  CyclePhase,
  SameCycleDayPoint,
} from './weight/cycle';

export {
  FAT_MIN_CALORIE_FRACTION,
  FAT_MIN_G_PER_KG,
  macroTargets,
  PROTEIN_AGGRESSIVE_G_PER_KG,
  PROTEIN_G_PER_KG,
} from './nutrition/macros';
export type { MacroTargetInput, MacroTargets } from './nutrition/macros';

export { buildProgressInsights } from './insights';
export type {
  BuildInsightsInput,
  DailyKcalPoint,
  ExerciseInsight,
  NutritionInsight,
  ProgressInsights,
  WeightInsight,
} from './insights';

export {
  DEFAULT_REMINDER_SETTINGS,
  normalizeReminderSettings,
} from './reminders';
export type {
  ReminderKind,
  ReminderSettings,
  ReminderSlot,
} from './reminders';

export {
  recommendWaterGoalMl,
  waterForDate,
  WATER_GOAL_MAX_ML,
  WATER_GOAL_MIN_ML,
  WATER_GOAL_STEP_ML,
  WATER_ML_PER_KG,
} from './hydration';
