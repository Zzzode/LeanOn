import type { LeanOnRpcContract } from '@zzzode/bridge';
import type { FoodItem } from '@zzzode/food-data';

export interface FoodEditFields {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  defaultGrams: number | null;
}

/** The form edits energy/macros; preserve nutrition it does not expose. */
export function foodUpdateRequest(food: FoodItem, fields: FoodEditFields): LeanOnRpcContract['health.updateCustomFood']['request'] {
  return {id:food.id,...fields,...food.micros};
}
