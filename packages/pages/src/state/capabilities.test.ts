import { expect, test } from '@rstest/core';
import { foodCapabilities, supportsMethod, toolCapabilities } from './capabilities.js';

test('a native shell never guesses capabilities from a missing or malformed list', () => {
  for (const methods of [undefined, null, {}, 'health.writeWater', [true, 1]]) {
    expect(supportsMethod('health.writeWater', methods)).toBe(false);
    expect(foodCapabilities(methods)).toEqual({ create: false, edit: false, delete: false, favorite: false, lookup:false, camera:false, scan: false });
  }
  expect(supportsMethod('health.writeWater', ['health.writeWeight'])).toBe(false);
  expect(supportsMethod('health.writeWater', ['health.writeWater'])).toBe(true);
});

test('native food parity exposes actual CRUD and favorites while scanning requires the whole pipeline', () => {
  const methods = ['health.writeCustomFood', 'health.updateCustomFood', 'health.deleteCustomFood', 'health.setFoodFavorite', 'health.writeScannedFood'];
  expect(foodCapabilities(methods)).toEqual({ create: true, edit: true, delete: true, favorite: true, lookup:false, camera:false, scan: false });
  expect(foodCapabilities([...methods, 'scanner.scanBarcode']).scan).toBe(false);
  expect(foodCapabilities([...methods, 'scanner.scanBarcode', 'food.lookupProduct']).scan).toBe(true);
});


test('manual lookup remains available without a camera and camera status alone never permits import',()=>{
  expect(foodCapabilities(['food.lookupProduct','health.writeScannedFood'])).toMatchObject({lookup:true,camera:false,scan:false});
  expect(foodCapabilities(['scanner.getStatus','scanner.scanBarcode'])).toMatchObject({lookup:false,camera:true,scan:false});
});


test('reminder and scale entries require complete workflows, consistently across screens',()=>{
  const methods=['notification.getSettings','notification.updateSettings','notification.requestPermission','scale.scan','scale.getStatus','scale.connect','scale.disconnect'];
  expect(toolCapabilities(method=>methods.includes(method))).toEqual({reminders:true,scale:true});
  for(const missing of methods){
    const available=toolCapabilities(method=>method!==missing&&methods.includes(method));
    expect(available[missing.startsWith('scale.')?'scale':'reminders']).toBe(false);
  }
});
