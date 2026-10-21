import { expect, test } from '@rstest/core';
import { exerciseEstimateForDate, weightForRecordDate } from './exercise-estimate.js';
import { exercises } from '@zzzode/exercise-data';

test('a historical exercise uses its latest earlier real weight and ignores later weighings',()=>{
  const weights=[{id:'future',date:'2026-10-06',weightKg:100},{id:'earlier',date:'2026-09-30',weightKg:60},{id:'old',date:'2026-09-01',weightKg:50}];
  const walking=exercises.find(item=>item.id==='walking')!;
  expect(weightForRecordDate({weights},'2026-10-01')).toBe(60);
  expect(exerciseEstimateForDate({weights},'2026-10-01','walking',30)).toBe(Math.round(walking.met*60*0.5));
  expect(exerciseEstimateForDate({weights},'2026-10-06','walking',30)).toBe(Math.round(walking.met*100*0.5));
});

test('missing historical weight cannot produce a fabricated zero-calorie exercise',()=>{
  const futureOnly={weights:[{id:'later',date:'2026-10-06',weightKg:80}]};
  expect(exerciseEstimateForDate(futureOnly,'2026-10-01','walking',30)).toBeNull();
  expect(exerciseEstimateForDate({weights:[]},'2026-10-01','walking',30)).toBeNull();
  expect(exerciseEstimateForDate({weights:[{id:'real',date:'2026-10-01',weightKg:70}]},'2026-10-01','unknown',30)).toBeNull();
});
