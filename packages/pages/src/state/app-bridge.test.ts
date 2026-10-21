import { expect, test } from '@rstest/core';
import { createAppBridge } from './app-bridge';

test('a native bootstrap cannot report a preview-only health write as persisted', async () => {
  const bridge = createAppBridge(true);
  await expect(bridge.invoke('health.writeWeight', {
    date: '2026-10-01',
    weightKg: 80,
  })).rejects.toMatchObject({ code: 'method-not-found' });
});

test('preview appearance changes emit the same state returned by subsequent reads', async () => {
  const bridge = createAppBridge();
  const events: unknown[] = [];
  const unsubscribe = bridge.subscribe('app.appearanceChanged', state => events.push(state));
  expect(await bridge.invoke('app.getAppearance')).toEqual({ preference: 'system', resolved: 'light' });
  expect(await bridge.invoke('app.setAppearance', { preference: 'dark' })).toEqual({ success: true, preference: 'dark', resolved: 'dark' });
  expect(await bridge.invoke('app.getAppearance')).toEqual({ preference: 'dark', resolved: 'dark' });
  expect(events).toEqual([{ preference: 'dark', resolved: 'dark' }]);
  unsubscribe();
});

test('food CRUD, favorites and recently logged shortcuts follow the persisted host snapshot', async () => {
  const bridge = createAppBridge();
  const created = await bridge.invoke('health.writeCustomFood', {
    name: 'Parity fixture', kcal: 120, proteinG: 5, carbsG: 15, fatG: 4, defaultGrams: 80,
  });
  const food = created.hostData.customFoods[0]!;
  const favorite = await bridge.invoke('health.setFoodFavorite', { id: food.id, favorite: true });
  expect(favorite.hostData.favoriteFoodIds).toContain(food.id);
  const logged = await bridge.invoke('health.writeIntake', {
    date: created.hostData.today, foodId: food.id, kcal: 120, macros: food.macros, micros: food.micros,
  });
  expect(logged.hostData.recentFoodIds[0]).toBe(food.id);
  const updated = await bridge.invoke('health.updateCustomFood', {
    id: food.id, name: 'Edited fixture', kcal: 140, proteinG: 5, carbsG: 15, fatG: 4, defaultGrams: null,
  });
  expect(updated.hostData.customFoods[0]?.name.en).toBe('Edited fixture');
  expect(updated.hostData.customFoods[0]?.defaultGrams).toBeUndefined();
  const deleted = await bridge.invoke('health.deleteCustomFood', { id: food.id });
  expect(deleted.hostData.customFoods).toEqual([]);
  expect(deleted.hostData.favoriteFoodIds).not.toContain(food.id);
  expect(deleted.hostData.recentFoodIds).not.toContain(food.id);
});

test('water updates replace the absolute day total and return all other records unchanged', async () => {
  const bridge = createAppBridge();
  const first = await bridge.invoke('health.writeWater', { date: '2026-10-01', amountMl: 1750 });
  const second = await bridge.invoke('health.writeWater', { date: '2026-10-01', amountMl: 1500 });
  expect(second.hostData.water.filter(sample => sample.date === '2026-10-01')).toEqual([{id:'water-2026-10-01',date: '2026-10-01', amountMl: 1500 }]);
  expect(second.hostData.weights).toEqual(first.hostData.weights);
  expect(second.hostData.intake).toEqual(first.hostData.intake);
});

test('isolated preview follows native mutations: individual meals, durable deletion identity and exact replay', async () => {
  const bridge=createAppBridge();
  const initial=(await bridge.invoke('records.getSnapshot')).hostData;
  const request={operationId:'preview-meal',expectedRevision:initial.revision,mutation:{type:'save-intake' as const,entry:{id:'meal-preview-closure',date:'2026-09-30',meal:'lunch' as const,name:'Original snapshot',grams:150,kcal:350,macros:{proteinG:20,carbsG:40,fatG:12},micros:{fiberG:4,sugarG:5,saturatedFatG:2,sodiumMg:500}}}};
  const saved=await bridge.invoke('records.mutate',request);
  expect(saved.hostData.intakeEntries[0]?.name).toBe('Original snapshot');
  const replay=await bridge.invoke('records.mutate',request);
  expect(replay.replayed).toBe(true);
  expect(replay.hostData.intakeEntries).toHaveLength(1);
  const removed=await bridge.invoke('records.mutate',{operationId:'preview-delete',expectedRevision:saved.hostData.revision,mutation:{type:'delete-record',kind:'intake',id:'meal-preview-closure'}});
  expect(removed.undoToken).toBe('undo-preview-delete');
  expect(removed.hostData.intakeEntries).toHaveLength(0);
  expect(removed.hostData.deletedRecords[0]?.record).toEqual(request.mutation.entry);
  const restored=await bridge.invoke('records.mutate',{operationId:'preview-restore',expectedRevision:removed.hostData.revision,mutation:{type:'restore-record',token:removed.undoToken!}});
  expect(restored.hostData.intakeEntries[0]).toEqual(request.mutation.entry);
  expect(restored.hostData.deletedRecords).toHaveLength(0);
});
