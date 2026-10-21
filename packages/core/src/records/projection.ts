import type { IntakeSample } from '../types';
import type { IntakeEntry, RecordsState } from './types';

function empty(date: string): IntakeSample {
  return { date, kcal: 0, macros: { proteinG: 0, carbsG: 0, fatG: 0 },
    micros: { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0 } };
}

/** Daily totals are a projection; legacy aggregates never become fabricated meals. */
export function projectIntake(legacy: readonly IntakeSample[], entries: readonly IntakeEntry[]): IntakeSample[] {
  const days = new Map<string, IntakeSample>();
  for (const row of [...legacy, ...entries]) {
    const result = days.get(row.date) ?? empty(row.date);
    result.kcal += row.kcal;
    result.macros.proteinG += row.macros.proteinG;
    result.macros.carbsG += row.macros.carbsG;
    result.macros.fatG += row.macros.fatG;
    result.micros.fiberG += row.micros.fiberG;
    result.micros.sugarG += row.micros.sugarG;
    result.micros.saturatedFatG += row.micros.saturatedFatG;
    result.micros.sodiumMg += row.micros.sodiumMg;
    if (![result.kcal, ...Object.values(result.macros), ...Object.values(result.micros)].every(Number.isFinite)) {
      throw new RangeError('Daily intake totals must be finite');
    }
    days.set(row.date, result);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function createEmptyRecordsState(): RecordsState {
  return { schemaVersion: 2, revision: 0, setupCompleted: false, profile: null,
    goalWeightKg: null, weeklyLossKg: null, guidanceMode: 'tracking-only',
    safetyFlags: { pregnant: null, breastfeeding: null, eatingDisorderRisk: null },
    weights: [], water: [], exercises: [], legacyIntake: [], intakeEntries: [], intake: [],
    deletedRecords: [], processedOperations: [] };
}
