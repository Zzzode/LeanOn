import { expect, test } from '@rstest/core';
import { formatQuantity, palettes } from './theme.js';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(first: string, second: string): number {
  const a = luminance(first); const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('normal text and disabled labels remain readable on actual light and dark surfaces', () => {
  for (const palette of Object.values(palettes)) {
    for (const background of [palette.canvas, palette.paper, palette.control]) {
      for (const foreground of [palette.ink, palette.muted]) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.outline, background)).toBeGreaterThanOrEqual(3);
    }
    for (const role of ['brand', 'foodText', 'exerciseText', 'weightText', 'waterText'] as const) expect(contrast(palette[role], palette.actionInk)).toBeGreaterThanOrEqual(4.5);
    for (const [foreground, background] of [[palette.foodText, palette.foodTint], [palette.exerciseText, palette.exerciseTint], [palette.weightText, palette.weightTint], [palette.waterText, palette.waterTint], [palette.partnerText, palette.partnerTint]]) expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
  }
});

test('health quantities group numbers without changing decimal precision or the sign', () => {
  expect(formatQuantity(1310)).toBe('1,310');
  expect(formatQuantity(80.4, 1)).toBe('80.4');
  expect(formatQuantity(-1000.6, 1)).toBe('-1,000.6');
});
