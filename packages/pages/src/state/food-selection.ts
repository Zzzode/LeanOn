import type { FoodItem } from '@zzzode/food-data';

export interface FoodSelectionToken { id: string; version: number }

/** Resolve each requested selection once, without resetting a portion on catalog refresh. */
export function resolveFoodSelection(
  consumed: FoodSelectionToken | null,
  id: string | undefined,
  version: number,
  database: ReadonlyMap<string, FoodItem>,
): { token: FoodSelectionToken; food: FoodItem } | null {
  if (id === undefined || (consumed?.id === id && consumed.version === version)) return null;
  const food = database.get(id);
  return food === undefined ? null : { token: {id,version}, food };
}
