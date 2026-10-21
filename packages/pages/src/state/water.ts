import { recommendWaterGoalMl, waterForDate, type WaterSample } from '@zzzode/core';

export const CUP_ML = 250;

export function waterSummary(water: WaterSample[], today: string, weightKg?: number) {
  const currentMl = waterForDate(water, today);
  const goalMl = weightKg !== undefined && Number.isFinite(weightKg) && weightKg > 0
    ? recommendWaterGoalMl(weightKg) : null;
  return { currentMl, goalMl };
}

/** Absolute totals must not race while the host is persisting a cup change. */
export async function commitWaterChange(
  lock: { current: boolean }, currentMl: number, deltaMl: number,
  persist: (amountMl: number) => Promise<void>,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await persist(Math.max(0, currentMl + deltaMl));
    return true;
  } finally {
    lock.current = false;
  }
}
