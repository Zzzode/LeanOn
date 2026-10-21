import { expect, test } from '@rstest/core';
import { foods } from '@zzzode/food-data';
import { resolveFoodSelection } from './food-selection.js';

const food = foods[0];
if (food === undefined) throw new Error('Food fixture missing');
const database = new Map([[food.id,food]]);

test('a new barcode result reopens the same food after returning to the list', () => {
  const first = resolveFoodSelection(null,food.id,1,database);
  expect(first?.food.id).toBe(food.id);
  expect(resolveFoodSelection(first?.token ?? null,food.id,2,database)?.food.id).toBe(food.id);
});

test('catalog or favorite refresh does not reapply a consumed selection and reset the edited portion', () => {
  const consumed = resolveFoodSelection(null,food.id,1,database)?.token ?? null;
  expect(resolveFoodSelection(consumed,food.id,1,new Map(database))).toBeNull();
});

test('a food not yet present can resolve when the imported catalog arrives', () => {
  expect(resolveFoodSelection(null,food.id,1,new Map())).toBeNull();
  expect(resolveFoodSelection(null,food.id,1,database)?.food.id).toBe(food.id);
});
