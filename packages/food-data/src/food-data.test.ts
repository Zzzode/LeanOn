import { describe, expect, it } from '@rstest/core';
import {
  createCustomFood,
  foods,
  portion,
  searchFoods,
  updateCustomFood,
} from './index.js';

describe('searchFoods', () => {
  it('returns common staples for an empty query', () => {
    const results = searchFoods(foods, '', 'en');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe('usda-white-rice');
  });

  it('matches English names by prefix', () => {
    const results = searchFoods(foods, 'chicken breast', 'en');
    expect(results[0]!.id).toBe('usda-chicken-breast');
  });

  it('matches English names by substring', () => {
    const ids = searchFoods(foods, 'rice', 'en').map((r) => r.id);
    expect(ids).toContain('usda-white-rice');
  });

  it('matches Chinese names', () => {
    const results = searchFoods(foods, '鸡胸', 'zh-CN');
    expect(results[0]!.id).toBe('usda-chicken-breast');
  });

  it('finds a Chinese dish from an English query', () => {
    const results = searchFoods(foods, 'kung pao', 'en');
    expect(results[0]!.id).toBe('curated-kung-pao-chicken');
  });

  it('finds an English-named food from a Chinese query', () => {
    const results = searchFoods(foods, '三文鱼', 'zh-CN');
    expect(results[0]!.id).toBe('usda-salmon');
  });

  it('caps results to the limit', () => {
    expect(searchFoods(foods, 'a', 'en', 3).length).toBeLessThanOrEqual(3);
  });

  it('returns nothing for an unmatched query', () => {
    expect(searchFoods(foods, 'zzzz-no-such-food', 'en')).toEqual([]);
  });
});

describe('portion', () => {
  it('scales per-100g values up', () => {
    const item = foods.find((f) => f.id === 'usda-chicken-breast')!;
    const result = portion(item, 200);
    expect(result.kcal).toBe(330);
    expect(result.macros.proteinG).toBe(62);
  });

  it('scales a smaller portion', () => {
    const item = foods.find((f) => f.id === 'usda-white-rice')!;
    const result = portion(item, 50);
    expect(result.kcal).toBe(65);
    expect(result.macros.carbsG).toBe(14);
  });

  it('rejects non-positive grams', () => {
    expect(() => portion(foods[0]!, 0)).toThrow();
    expect(() => portion(foods[0]!, -10)).toThrow();
  });
});

describe('createCustomFood', () => {
  it('builds a minimal food with a mirrored name and zero macros', () => {
    const item = createCustomFood({
      id: 'custom-1',
      name: 'My Granola',
      kcal: 420,
    });
    expect(item.source).toBe('custom');
    expect(item.name.en).toBe('My Granola');
    expect(item.name['zh-CN']).toBe('My Granola');
    expect(item.macros.proteinG).toBe(0);
    expect(item.macros.fatG).toBe(0);
  });

  it('keeps full nutrition and default grams', () => {
    const item = createCustomFood({
      id: 'custom-2',
      name: '能量棒',
      kcal: 400,
      proteinG: 10,
      carbsG: 50,
      fatG: 15,
      defaultGrams: 30,
    });
    expect(item.macros.carbsG).toBe(50);
    expect(item.defaultGrams).toBe(30);
  });

  it('trims the name', () => {
    const item = createCustomFood({
      id: 'custom-3',
      name: '  latte  ',
      kcal: 50,
    });
    expect(item.name.en).toBe('latte');
  });

  it('rejects an empty name', () => {
    expect(() =>
      createCustomFood({ id: 'x', name: '   ', kcal: 10 }),
    ).toThrow();
  });

  it('rejects zero or negative kcal', () => {
    expect(() => createCustomFood({ id: 'x', name: 'a', kcal: 0 })).toThrow();
    expect(() => createCustomFood({ id: 'x', name: 'a', kcal: -5 })).toThrow();
  });

  it('rejects negative macros and bad default grams', () => {
    expect(() =>
      createCustomFood({ id: 'x', name: 'a', kcal: 10, proteinG: -1 }),
    ).toThrow();
    expect(() =>
      createCustomFood({ id: 'x', name: 'a', kcal: 10, defaultGrams: 0 }),
    ).toThrow();
  });
});

describe('updateCustomFood', () => {
  const original = createCustomFood({
    id: 'custom-9',
    name: 'Bar',
    kcal: 400,
    proteinG: 10,
    carbsG: 20,
    fatG: 5,
    defaultGrams: 60,
  });

  it('applies edits while keeping id and source', () => {
    const updated = updateCustomFood(original, {
      name: '  New Bar ',
      kcal: 420,
      proteinG: 12,
      carbsG: 22,
      fatG: 6,
    });
    expect(updated.id).toBe('custom-9');
    expect(updated.source).toBe('custom');
    expect(updated.name.en).toBe('New Bar');
    expect(updated.kcal).toBe(420);
    expect(updated.macros.proteinG).toBe(12);
    expect(updated.defaultGrams).toBe(60);
  });

  it('clears the default serving when given null', () => {
    const updated = updateCustomFood(original, {
      name: 'Bar',
      kcal: 400,
      defaultGrams: null,
    });
    expect(updated.defaultGrams).toBeUndefined();
  });

  it('rejects editing bundled catalogue foods', () => {
    expect(() => updateCustomFood(foods[0]!, { name: 'x', kcal: 1 })).toThrow();
  });

  it('rejects invalid edits', () => {
    expect(() =>
      updateCustomFood(original, { name: '   ', kcal: 10 }),
    ).toThrow();
    expect(() =>
      updateCustomFood(original, { name: 'Bar', kcal: -1 }),
    ).toThrow();
  });
});
