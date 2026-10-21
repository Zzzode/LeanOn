import { expect, test } from '@rstest/core';
import { commitWaterChange, waterSummary } from './water.js';

test('water can be logged before a weight without inventing a personal target', () => {
  expect(waterSummary([{ date: '2026-10-06', amountMl: 500 }], '2026-10-06')).toEqual({ currentMl: 500, goalMl: null });
  expect(waterSummary([], '2026-10-06', 80)).toEqual({ currentMl: 0, goalMl: 2800 });
});

test('overlapping cup taps produce one absolute write until persistence finishes', async () => {
  const lock = { current: false };
  const writes: number[] = [];
  let finish = () => {};
  const first = commitWaterChange(lock, 500, 250, amount => {
    writes.push(amount);
    return new Promise<void>(resolve => { finish = resolve; });
  });
  expect(await commitWaterChange(lock, 500, 250, async amount => { writes.push(amount); })).toBe(false);
  expect(writes).toEqual([750]);
  finish();
  expect(await first).toBe(true);
  expect(lock.current).toBe(false);
});

test('a rejected save unlocks retry, and removing a cup cannot persist a negative total', async () => {
  const lock = { current: false };
  await expect(commitWaterChange(lock, 100, 250, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  const writes: number[] = [];
  expect(await commitWaterChange(lock, 100, -250, async amount => { writes.push(amount); })).toBe(true);
  expect(writes).toEqual([0]);
});
