import { expect, test } from '@rstest/core';
import { macroTargets } from './macros';

test('macroTargets anchor protein at 1.6 g/kg and fill carbs', () => {
  const m = macroTargets({
    targetKcal: 1800,
    goalWeightKg: 75,
    currentWeightKg: 80,
  });
  expect(m.proteinG).toBeCloseTo(120); // 75 * 1.6
  expect(m.fatG).toBeCloseTo(40); // max(80*0.5, 0.2*1800/9)
  expect(m.carbsG).toBeCloseTo(240);
  expect(m.proteinKcal + m.fatKcal + m.carbsKcal).toBeCloseTo(1800);
});

test('aggressive deficits raise protein to 2.0 g/kg', () => {
  const m = macroTargets({
    targetKcal: 1800,
    goalWeightKg: 75,
    currentWeightKg: 80,
    aggressive: true,
  });
  expect(m.proteinG).toBeCloseTo(150); // 75 * 2.0
});

test('a calorie target below protein plus fat floors is rejected', () => {
  expect(() =>
    macroTargets({ targetKcal: 800, goalWeightKg: 75, currentWeightKg: 80 }),
  ).toThrow();
});

test('macroTargets reject non-positive inputs', () => {
  expect(() =>
    macroTargets({ targetKcal: 0, goalWeightKg: 75, currentWeightKg: 80 }),
  ).toThrow();
});
