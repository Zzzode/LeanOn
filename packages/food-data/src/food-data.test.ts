import { describe, expect, it } from '@rstest/core';
import { foods, portion, searchFoods } from './index.js';

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
