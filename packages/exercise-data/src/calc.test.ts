import { describe, expect, it } from '@rstest/core';
import { calculateExerciseKcal } from './calc';
import { getExerciseById } from './exercises';

const running = getExerciseById('running')!;
const strength = getExerciseById('strength')!;
const walking = getExerciseById('walking')!;

describe('calculateExerciseKcal', () => {
  it('computes MET x kg x hours', () => {
    // 8.3 x 80 x 0.5 = 332
    expect(calculateExerciseKcal(running, 30, 80)).toBe(332);
  });

  it('rounds to whole kcal', () => {
    // 5 x 80.4 x 1 = 402
    expect(calculateExerciseKcal(strength, 60, 80.4)).toBe(402);
  });

  it('handles short sessions', () => {
    // 2.5 x 80 x 10/60 = 33.3 -> 33
    expect(calculateExerciseKcal(walking, 10, 80)).toBe(33);
  });

  it('rejects non-positive duration', () => {
    expect(() => calculateExerciseKcal(running, 0, 80)).toThrow(RangeError);
    expect(() => calculateExerciseKcal(running, -5, 80)).toThrow(RangeError);
  });

  it('rejects non-finite duration', () => {
    expect(() =>
      calculateExerciseKcal(running, Number.NaN, 80),
    ).toThrow(RangeError);
  });

  it('rejects non-positive weight', () => {
    expect(() => calculateExerciseKcal(running, 30, 0)).toThrow(RangeError);
    expect(() => calculateExerciseKcal(running, 30, -80)).toThrow(RangeError);
  });
});

describe('getExerciseById', () => {
  it('resolves known ids and misses unknown ones', () => {
    expect(getExerciseById('hiit')?.met).toBe(8);
    expect(getExerciseById('nope')).toBeUndefined();
  });
});
