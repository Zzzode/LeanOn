import { describe, expect, it } from '@rstest/core';
import { createFoodFromBarcode, type OffProduct } from './index.js';

const fullProduct: OffProduct = {
  product_name: 'Protein Bar',
  generic_name: 'Chocolate protein bar',
  nutriments: {
    'energy-kcal_100g': 400,
    proteins_100g: 30,
    carbohydrates_100g: 40,
    fat_100g: 10,
  },
  serving_quantity: 60,
  serving_size: '1 bar',
};

describe('createFoodFromBarcode', () => {
  it('maps a complete product to a FoodItem', () => {
    const item = createFoodFromBarcode('123456789', fullProduct);
    expect(item.id).toBe('off-123456789');
    expect(item.barcode).toBe('123456789');
    expect(item.source).toBe('open-food-facts');
    expect(item.name.en).toBe('Protein Bar');
    expect(item.kcal).toBe(400);
    expect(item.macros).toEqual({ proteinG: 30, carbsG: 40, fatG: 10 });
    expect(item.defaultGrams).toBe(60);
  });

  it('falls back to kilojoules when kcal is absent', () => {
    const product: OffProduct = {
      product_name: 'KJ Only',
      nutriments: { energy_100g: 418.4 },
    };
    const item = createFoodFromBarcode('1', product);
    expect(item.kcal).toBeCloseTo(100, 6);
  });

  it('prefers kcal over kilojoules when both are present', () => {
    const product: OffProduct = {
      product_name: 'Both',
      nutriments: { 'energy-kcal_100g': 200, energy_100g: 9999 },
    };
    expect(createFoodFromBarcode('1', product).kcal).toBe(200);
  });

  it('falls back to generic_name then barcode for the name', () => {
    const generic: OffProduct = {
      generic_name: 'A generic snack',
      nutriments: { 'energy-kcal_100g': 100 },
    };
    expect(createFoodFromBarcode('777', generic).name.en).toBe('A generic snack');

    const noName: OffProduct = { nutriments: { 'energy-kcal_100g': 100 } };
    expect(createFoodFromBarcode('777', noName).name.en).toBe('777');
  });

  it('defaults missing macros to 0 and omits a missing serving', () => {
    const product: OffProduct = {
      product_name: 'Sparse',
      nutriments: { 'energy-kcal_100g': 100 },
    };
    const item = createFoodFromBarcode('9', product);
    expect(item.macros).toEqual({ proteinG: 0, carbsG: 0, fatG: 0 });
    expect(item.defaultGrams).toBeUndefined();
  });

  it('throws when no usable energy is present', () => {
    expect(() => createFoodFromBarcode('5', {})).toThrow();
    expect(() =>
      createFoodFromBarcode('5', { nutriments: {} }),
    ).toThrow();
  });

  it('throws on a non-positive energy value', () => {
    const product: OffProduct = {
      product_name: 'Bad',
      nutriments: { 'energy-kcal_100g': 0 },
    };
    expect(() => createFoodFromBarcode('6', product)).toThrow();
  });

  it('ignores a non-positive serving quantity', () => {
    const product: OffProduct = {
      product_name: 'No Serving',
      nutriments: { 'energy-kcal_100g': 100 },
      serving_quantity: -5,
    };
    expect(
      createFoodFromBarcode('8', product).defaultGrams,
    ).toBeUndefined();
  });

  it('maps fiber, sugars, saturated fat and converts sodium grams to mg', () => {
    const product: OffProduct = {
      product_name: 'Micros Bar',
      nutriments: {
        'energy-kcal_100g': 400,
        fiber_100g: 8,
        sugars_100g: 22,
        'saturated-fat_100g': 6,
        sodium_100g: 0.5,
      },
    };
    expect(createFoodFromBarcode('1', product).micros).toEqual({
      fiberG: 8,
      sugarG: 22,
      saturatedFatG: 6,
      sodiumMg: 500,
    });
  });

  it('derives sodium from salt when sodium is absent', () => {
    const product: OffProduct = {
      product_name: 'Salty',
      nutriments: { 'energy-kcal_100g': 400, salt_100g: 1.25 },
    };
    // 1.25 g salt / 2.5 = 0.5 g sodium = 500 mg
    expect(createFoodFromBarcode('1', product).micros.sodiumMg).toBe(500);
  });

  it('prefers explicit sodium over the salt-derived value', () => {
    const product: OffProduct = {
      product_name: 'Both',
      nutriments: {
        'energy-kcal_100g': 400,
        sodium_100g: 0.4,
        salt_100g: 2,
      },
    };
    expect(createFoodFromBarcode('1', product).micros.sodiumMg).toBe(400);
  });

  it('defaults missing micros to zero and ignores a negative sodium', () => {
    const sparse = createFoodFromBarcode('1', {
      product_name: 'Sparse',
      nutriments: { 'energy-kcal_100g': 100 },
    });
    expect(sparse.micros).toEqual({
      fiberG: 0,
      sugarG: 0,
      saturatedFatG: 0,
      sodiumMg: 0,
    });

    const negative = createFoodFromBarcode('1', {
      product_name: 'Bad Sodium',
      nutriments: { 'energy-kcal_100g': 100, sodium_100g: -1 },
    });
    expect(negative.micros.sodiumMg).toBe(0);
  });
});
