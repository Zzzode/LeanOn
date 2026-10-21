import type { HostData } from './types.js';
import type { ExerciseSample, IntakeEntry } from '@zzzode/core';
import { getExerciseById } from '@zzzode/exercise-data';

/** Calendar dates stay calendar dates; UTC arithmetic avoids local DST shifts. */
export function validDiaryDate(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > today) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftDiaryDate(value: string, offset: number): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || !Number.isInteger(offset)) return value;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  const result = parsed.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && result >= '0001-01-01' ? result : value;
}

/** Only recorded calendar dates appear in the history shortcut list. */
export function diaryHistoryDates(data: HostData): string[] {
  return [...new Set([data.today, ...data.weights.map(item => item.date),
    ...data.intake.map(item => item.date), ...data.exercises.map(item => item.date),
    ...data.water.map(item => item.date)])].filter(date => validDiaryDate(date, data.today)).sort().reverse();
}

/** Editing portions scales the saved snapshot, never the current food catalogue. */
export function resizeIntakeEntry(entry: IntakeEntry, grams: number): IntakeEntry | null {
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(entry.grams) || entry.grams <= 0) return null;
  const ratio = grams / entry.grams;
  const scale = (amount: number): number => amount * ratio;
  const result: IntakeEntry = { ...entry, grams, kcal: scale(entry.kcal),
    macros: { proteinG: scale(entry.macros.proteinG), carbsG: scale(entry.macros.carbsG), fatG: scale(entry.macros.fatG) },
    micros: { fiberG: scale(entry.micros.fiberG), sugarG: scale(entry.micros.sugarG), saturatedFatG: scale(entry.micros.saturatedFatG), sodiumMg: scale(entry.micros.sodiumMg) } };
  return [result.kcal, ...Object.values(result.macros), ...Object.values(result.micros)].every(value => Number.isFinite(value) && value >= 0) && result.kcal > 0 ? result : null;
}

/** Preserve the original saved estimate basis when correcting activity/duration. */
export function resizeExerciseSession(original: ExerciseSample, typeId: string, durationMin: number): ExerciseSample | null {
  if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 1440
    || !Number.isFinite(original.durationMin) || original.durationMin < 1 || original.durationMin > 1440
    || !Number.isFinite(original.kcal) || original.kcal < 0
    || (original.source !== undefined && original.source !== 'leanon')) return null;
  let metRatio = 1;
  if (typeId !== original.typeId) {
    const previous = getExerciseById(original.typeId);
    const next = getExerciseById(typeId);
    if (previous === undefined || next === undefined || !Number.isFinite(previous.met) || previous.met <= 0 || !Number.isFinite(next.met) || next.met <= 0) return null;
    metRatio = next.met / previous.met;
  }
  const kcal = original.kcal * metRatio * (durationMin / original.durationMin);
  return Number.isFinite(kcal) && kcal >= 0 ? { ...original, typeId, durationMin, kcal } : null;
}

/** Presence is separate from recorded energy: absent intake is not a zero meal. */
export function summarizeDiary(data: HostData, date = data.today) {
  const entries = data.intake.filter(record => record.date === date);
  return entries.reduce((summary, record) => ({
    recorded: true,
    kcal: summary.kcal + record.kcal,
    proteinG: summary.proteinG + record.macros.proteinG,
    carbsG: summary.carbsG + record.macros.carbsG,
    fatG: summary.fatG + record.macros.fatG,
  }), { recorded: false, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}
