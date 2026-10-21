import { expect, test } from '@rstest/core';
import { diaryHistoryDates, resizeExerciseSession, resizeIntakeEntry, shiftDiaryDate, summarizeDiary, validDiaryDate } from './diary.js';
import type { ExerciseSample, IntakeEntry } from '@zzzode/core';
import { sampleHostData } from './sample.js';

test('no intake is distinct from an explicitly recorded zero-energy entry', () => {
  expect(summarizeDiary({ ...sampleHostData, intake: [] }).recorded).toBe(false);
  expect(summarizeDiary({ ...sampleHostData, intake: [{ date: sampleHostData.today, kcal: 0, macros: { proteinG: 0, carbsG: 0, fatG: 0 }, micros: { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0 } }] })).toEqual({ recorded: true, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
});

test('daily food totals remain available without a weight or estimated budget', () => {
  const meal = { date: sampleHostData.today, kcal: 130, macros: { proteinG: 2.4, carbsG: 28.2, fatG: 0.3 }, micros: { fiberG: 0.4, sugarG: 0, saturatedFatG: 0.1, sodiumMg: 1 } };
  const summary = summarizeDiary({ ...sampleHostData, weights: [], intake: [meal, meal, { ...meal, date: '2026-09-01', kcal: 900 }] });
  expect(summary).toEqual({ recorded: true, kcal: 260, proteinG: 4.8, carbsG: 56.4, fatG: 0.6 });
});

test('history totals use the selected day instead of the refreshed native today', () => {
  const meal = { date: '2026-10-05', kcal: 420, macros: { proteinG: 20, carbsG: 60, fatG: 10 }, micros: { fiberG: 2, sugarG: 3, saturatedFatG: 4, sodiumMg: 5 } };
  expect(summarizeDiary({ ...sampleHostData, today: '2026-10-07', intake: [meal, { ...meal, date: '2026-10-07', kcal: 100 }] }, '2026-10-05').kcal).toBe(420);
});

test('calendar selection rejects rolled dates, future days and non-calendar input', () => {
  expect(validDiaryDate('2024-02-29', '2026-10-06')).toBe(true);
  for (const date of ['2025-02-29', '2026-02-30', '2026-10-07', '2026-1-05', '0000-01-01', '2026-10-06T00:00:00Z']) expect(validDiaryDate(date, '2026-10-06')).toBe(false);
});

test('day navigation crosses leap, year and DST boundaries using calendar arithmetic', () => {
  expect(shiftDiaryDate('2024-02-28', 1)).toBe('2024-02-29');
  expect(shiftDiaryDate('2026-01-01', -1)).toBe('2025-12-31');
  expect(shiftDiaryDate('2026-03-08', 1)).toBe('2026-03-09');
  expect(shiftDiaryDate('0001-01-01', -1)).toBe('0001-01-01');
});

test('history shortcuts deduplicate record dates and omit future migration dates', () => {
  const data = { ...sampleHostData, today: '2026-10-06', weights: [{ id: 'w', date: '2026-10-04', weightKg: 80 }],
    intake: [], water: [{ id: 'water', date: '2026-10-04', amountMl: 250 }], exercises: [
      { id: 'ex', date: '2026-10-05', typeId: 'walk', durationMin: 20, kcal: 100 },
      { id: 'future', date: '2026-10-08', typeId: 'walk', durationMin: 20, kcal: 100 },
    ] };
  expect(diaryHistoryDates(data)).toEqual(['2026-10-06', '2026-10-05', '2026-10-04']);
});

const savedMeal: IntakeEntry = { id: 'entry-1', date: '2026-10-05', meal: 'lunch', name: 'Saved meal', foodId: 'deleted-food', grams: 200, kcal: 600,
  macros: { proteinG: 30, carbsG: 60, fatG: 25 }, micros: { fiberG: 8, sugarG: 10, saturatedFatG: 5, sodiumMg: 900 } };

test('portion editing scales all original snapshot nutrients and preserves identity', () => {
  const resized = resizeIntakeEntry(savedMeal, 100);
  expect(resized).toEqual({ ...savedMeal, grams: 100, kcal: 300, macros: { proteinG: 15, carbsG: 30, fatG: 12.5 }, micros: { fiberG: 4, sugarG: 5, saturatedFatG: 2.5, sodiumMg: 450 } });
  expect(savedMeal.grams).toBe(200);
  expect(savedMeal.macros.proteinG).toBe(30);
});

test('portion validation rejects zero, invalid numbers and arithmetic overflow', () => {
  for (const grams of [0, -5, Infinity, NaN]) expect(resizeIntakeEntry(savedMeal, grams)).toBe(null);
  expect(resizeIntakeEntry({ ...savedMeal, grams: 0 }, 100)).toBe(null);
  expect(resizeIntakeEntry({ ...savedMeal, kcal: Number.MAX_VALUE }, Number.MAX_VALUE)).toBe(null);
});

const savedExercise: ExerciseSample = { id: 'exercise-original', date: '2026-10-05', typeId: 'walking', durationMin: 30, kcal: 100 };

test('exercise activity and duration correction preserve the original energy basis and identity', () => {
  expect(resizeExerciseSession(savedExercise, 'strength', 60)).toEqual({ ...savedExercise, typeId: 'strength', durationMin: 60, kcal: 400 });
  expect(resizeExerciseSession(savedExercise, 'walking', 15)?.kcal).toBe(50);
  expect(savedExercise).toMatchObject({ typeId: 'walking', durationMin: 30, kcal: 100 });
});

test('unknown historical activities retain their saved type and cannot invent a new energy basis', () => {
  const unknown = { ...savedExercise, typeId: 'historical-custom-activity' };
  expect(resizeExerciseSession(unknown, unknown.typeId, 60)).toEqual({ ...unknown, durationMin: 60, kcal: 200 });
  expect(resizeExerciseSession(unknown, 'walking', 60)).toBe(null);
  expect(resizeExerciseSession(savedExercise, 'missing-activity', 60)).toBe(null);
});

test('a saved zero-energy session stays zero without supplying a fabricated estimate', () => {
  expect(resizeExerciseSession({ ...savedExercise, kcal: 0 }, 'strength', 60)?.kcal).toBe(0);
});

test('exercise correction rejects invalid durations, invalid saved energy, mirrors and overflow', () => {
  for (const duration of [0, 1441, Infinity, NaN]) expect(resizeExerciseSession(savedExercise, 'walking', duration)).toBe(null);
  expect(resizeExerciseSession({ ...savedExercise, durationMin: 0 }, 'walking', 30)).toBe(null);
  expect(resizeExerciseSession({ ...savedExercise, kcal: -1 }, 'walking', 30)).toBe(null);
  expect(resizeExerciseSession({ ...savedExercise, source: 'healthkit' }, 'walking', 30)).toBe(null);
  expect(resizeExerciseSession({ ...savedExercise, kcal: Number.MAX_VALUE }, 'strength', 60)).toBe(null);
});
