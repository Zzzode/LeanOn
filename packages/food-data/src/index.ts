export { createFoodFromBarcode, OffNutritionError } from './barcode.js';
export { normalizeProductBarcode } from './product-barcode.js';
export { createCustomFood, updateCustomFood } from './custom.js';
export { foods } from './data.js';
export { portion } from './portion.js';
export { searchFoods } from './search.js';
export type {
  CreateCustomFoodInput,
  EditCustomFoodInput,
  FoodDatabase,
  FoodItem,
  FoodLocale,
  Macros,
  Micros,
  Portion,
} from './types.js';
export type { OffNutriments, OffProduct } from './barcode.js';
