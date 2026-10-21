import { expect, test } from '@rstest/core';
import { createAppBridge } from './app-bridge.js';
import { foodUpdateRequest } from './food-edit.js';

test('renaming an imported food preserves all saved micronutrients through the replacement RPC', async () => {
  const bridge = createAppBridge();
  const imported = await bridge.invoke('health.writeScannedFood', {
    barcode:'4006381333931',name:'Original label',kcal:120,
    proteinG:5,carbsG:15,fatG:4,fiberG:7,sugarG:8,saturatedFatG:2,sodiumMg:310,defaultGrams:80,
  });
  const food = imported.hostData.customFoods.find(value=>value.id==='off-4006381333931');
  if(food === undefined)throw new Error('Imported fixture missing');
  const edited = await bridge.invoke('health.updateCustomFood',foodUpdateRequest(food,{
    name:'Edited label',kcal:food.kcal,...food.macros,defaultGrams:null,
  }));
  const updated = edited.hostData.customFoods.find(value=>value.id===food.id);
  expect(updated?.name.en).toBe('Edited label');
  expect(updated?.micros).toEqual({fiberG:7,sugarG:8,saturatedFatG:2,sodiumMg:310});
  expect(updated?.macros).toEqual(food.macros);
  expect(updated?.defaultGrams).toBeUndefined();
});
