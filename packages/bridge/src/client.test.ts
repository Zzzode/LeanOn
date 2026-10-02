import { expect, test } from '@rstest/core';
import {
  BridgeError,
  createLeanOnBridgeClient,
  createMemoryBridge,
} from './index';

test('invoke calls a no-argument method and returns its response', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('app.getInfo', () => ({
    platform: 'ios',
    hostVersion: '1.0',
    deviceModel: 'iPhone',
    osVersion: '18',
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const info = await client.invoke('app.getInfo');
  expect(info.platform).toBe('ios');
  expect(info.osVersion).toBe('18');
});

test('invoke forwards the typed request to the handler', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<{ key: string }, { value: string | null }>(
    'storage.get',
    (request) => ({ value: request.key === 'k' ? 'v' : null }),
  );
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('storage.get', { key: 'k' });
  expect(result.value).toBe('v');
});

test('a failed method rejects with a normalized BridgeError', async () => {
  const bridge = createMemoryBridge();
  bridge.fail('scale.connect', {
    code: 'unavailable',
    message: 'no adapter',
    retriable: true,
  });
  const client = createLeanOnBridgeClient(bridge.transport);
  let caught: unknown;
  try {
    await client.invoke('scale.connect', { deviceId: 'x' });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BridgeError);
  expect((caught as BridgeError).code).toBe('unavailable');
  expect((caught as BridgeError).retriable).toBe(true);
});

test('an unregistered method rejects as method-not-found', async () => {
  const bridge = createMemoryBridge();
  const client = createLeanOnBridgeClient(bridge.transport);
  let caught: unknown;
  try {
    await client.invoke('app.getInfo');
  } catch (error) {
    caught = error;
  }
  expect((caught as BridgeError).code).toBe('method-not-found');
});

test('subscribe receives native events and unsubscribe stops delivery', async () => {
  const bridge = createMemoryBridge();
  const client = createLeanOnBridgeClient(bridge.transport);
  const weights: number[] = [];
  const unsubscribe = client.subscribe('scale.reading', (payload) => {
    weights.push(payload.weightKg);
  });

  bridge.emit('scale.reading', { deviceId: 'd', date: '2026-10-01', weightKg: 70 });
  unsubscribe();
  bridge.emit('scale.reading', { deviceId: 'd', date: '2026-10-01', weightKg: 69 });

  expect(weights).toEqual([70]);
});

test('multiple subscribers to the same event each receive payloads', () => {
  const bridge = createMemoryBridge();
  const client = createLeanOnBridgeClient(bridge.transport);
  let a = 0;
  let b = 0;
  client.subscribe('app.lifecycle', () => {
    a += 1;
  });
  client.subscribe('app.lifecycle', () => {
    b += 1;
  });
  bridge.emit('app.lifecycle', { state: 'foreground' });
  expect(a).toBe(1);
  expect(b).toBe(1);
});

test('scale.getStatus reports lifecycle state and the paired device', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('scale.getStatus', () => ({
    state: 'connected' as const,
    pairedDeviceId: 'mac',
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const status = await client.invoke('scale.getStatus');
  expect(status.state).toBe('connected');
  expect(status.pairedDeviceId).toBe('mac');
});

test('scale.disconnect resolves with connected false', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('scale.disconnect', () => ({ connected: false as const }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('scale.disconnect');
  expect(result.connected).toBe(false);
});

test('health.writeIntake forwards the meal and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    {
      date: string;
      kcal: number;
      macros: { proteinG: number; carbsG: number; fatG: number };
      micros?: {
        fiberG: number;
        sugarG: number;
        saturatedFatG: number;
        sodiumMg: number;
      };
    },
    {
      success: true;
      hostData: {
        intake: {
          date: string;
          kcal: number;
          macros: { proteinG: number; carbsG: number; fatG: number };
          micros: {
            fiberG: number;
            sugarG: number;
            saturatedFatG: number;
            sodiumMg: number;
          };
        }[];
      };
    }
  >('health.writeIntake', (request) => ({
    success: true,
    hostData: {
      intake: [
        {
          date: request.date,
          kcal: request.kcal,
          macros: request.macros,
          // Host fills zeros when micros is omitted (RFC 0024).
          micros:
            request.micros ?? {
              fiberG: 0,
              sugarG: 0,
              saturatedFatG: 0,
              sodiumMg: 0,
            },
        },
      ],
    },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.writeIntake', {
    date: '2026-10-01',
    kcal: 500,
    macros: { proteinG: 30, carbsG: 50, fatG: 15 },
    micros: { fiberG: 8, sugarG: 22, saturatedFatG: 6, sodiumMg: 500 },
  });
  expect(response.success).toBe(true);
  expect(response.hostData.intake[0]!.micros).toEqual({
    fiberG: 8,
    sugarG: 22,
    saturatedFatG: 6,
    sodiumMg: 500,
  });
});

test('health.writeWater upserts the day total and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { date: string; amountMl: number },
    {
      success: true;
      hostData: { today: string; water: { amountMl: number }[] };
    }
  >('health.writeWater', (request) => ({
    success: true,
    hostData: {
      today: request.date,
      water: [{ date: request.date, amountMl: request.amountMl }],
    },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.writeWater', {
    date: '2026-10-01',
    amountMl: 1750,
  });
  expect(response.success).toBe(true);
  expect(response.hostData.water[0]!.amountMl).toBe(1750);
});

test('health.writeExercise forwards the session and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { date: string; typeId: string; durationMin: number; kcal: number },
    { success: true; hostData: { today: string } }
  >('health.writeExercise', (request) => ({
    success: true,
    hostData: { today: request.date },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.writeExercise', {
    date: '2026-10-01',
    typeId: 'running',
    durationMin: 30,
    kcal: 332,
  });
  expect(response.success).toBe(true);
  expect(response.hostData.today).toBe('2026-10-01');
});

test('health.updateExercise replaces the session and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    {
      id: string;
      date: string;
      typeId: string;
      durationMin: number;
      kcal: number;
    },
    { success: true; hostData: { today: string } }
  >('health.updateExercise', (request) => ({
    success: true,
    hostData: { today: request.typeId },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.updateExercise', {
    id: 'ex-1',
    date: '2026-10-01',
    typeId: 'cycling',
    durationMin: 45,
    kcal: 452,
  });
  expect(response.success).toBe(true);
  expect(response.hostData.today).toBe('cycling');
});

test('health.deleteExercise removes the session and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { id: string },
    { success: true; hostData: { today: string } }
  >('health.deleteExercise', () => ({
    success: true,
    hostData: { today: '2026-10-01' },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.deleteExercise', {
    id: 'ex-1',
  });
  expect(response.success).toBe(true);
  expect(response.hostData.today).toBe('2026-10-01');
});

test('health.writeCustomFood stores the food and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    {
      name: string;
      kcal: number;
      fiberG?: number;
      sodiumMg?: number;
    },
    { success: true; hostData: { today: string; customFoods: unknown[] } }
  >('health.writeCustomFood', (request) => ({
    success: true,
    hostData: {
      today: '2026-10-01',
      customFoods: [
        {
          id: 'custom-1',
          name: { en: request.name },
          micros: {
            fiberG: request.fiberG ?? 0,
            sodiumMg: request.sodiumMg ?? 0,
          },
        },
      ],
    },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.writeCustomFood', {
    name: 'My Bar',
    kcal: 400,
    fiberG: 12,
    sodiumMg: 300,
  });
  expect(response.success).toBe(true);
  expect(response.hostData.customFoods).toHaveLength(1);
  expect(response.hostData.customFoods[0]).toMatchObject({
    micros: { fiberG: 12, sodiumMg: 300 },
  });
});

test('health.updateCustomFood replaces the food and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { id: string; name: string; kcal: number },
    { success: true; hostData: { customFoods: unknown[] } }
  >('health.updateCustomFood', (request) => ({
    success: true,
    hostData: {
      customFoods: [{ id: request.id, name: { en: request.name } }],
    },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.updateCustomFood', {
    id: 'custom-1',
    name: 'Renamed Bar',
    kcal: 420,
  });
  expect(response.success).toBe(true);
  expect(response.hostData.customFoods).toHaveLength(1);
});

test('health.deleteCustomFood removes the food and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { id: string },
    { success: true; hostData: { customFoods: unknown[] } }
  >('health.deleteCustomFood', () => ({
    success: true,
    hostData: { customFoods: [] },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.deleteCustomFood', {
    id: 'custom-1',
  });
  expect(response.success).toBe(true);
  expect(response.hostData.customFoods).toHaveLength(0);
});

test('health.setFoodFavorite toggles the pinned id and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { id: string; favorite: boolean },
    { success: true; hostData: { favoriteFoodIds: string[] } }
  >('health.setFoodFavorite', (request) => ({
    success: true,
    hostData: { favoriteFoodIds: request.favorite ? [request.id] : [] },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const pinned = await client.invoke('health.setFoodFavorite', {
    id: 'food-42',
    favorite: true,
  });
  expect(pinned.hostData.favoriteFoodIds).toEqual(['food-42']);
  const unpinned = await client.invoke('health.setFoodFavorite', {
    id: 'food-42',
    favorite: false,
  });
  expect(unpinned.hostData.favoriteFoodIds).toEqual([]);
});

test('scanner.scanBarcode returns a barcode or cancellation', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('scanner.scanBarcode', () => ({ barcode: '5010251638056' }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('scanner.scanBarcode');
  expect('barcode' in result ? result.barcode : null).toBe(
    '5010251638056',
  );
});

test('food.lookupProduct reports found with the raw product', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { barcode: string },
    | { found: true; product: { product_name?: string } }
    | { found: false }
  >('food.lookupProduct', (request) =>
    request.barcode === 'known'
      ? { found: true, product: { product_name: 'Granola' } }
      : { found: false },
  );
  const client = createLeanOnBridgeClient(bridge.transport);
  const hit = await client.invoke('food.lookupProduct', { barcode: 'known' });
  expect(hit.found).toBe(true);
  if (hit.found) expect(hit.product.product_name).toBe('Granola');
  const miss = await client.invoke('food.lookupProduct', { barcode: 'nope' });
  expect(miss.found).toBe(false);
});

test('health.writeScannedFood persists and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    {
      barcode: string;
      name: string;
      kcal: number;
      fiberG?: number;
      sugarG?: number;
      saturatedFatG?: number;
      sodiumMg?: number;
    },
    {
      success: true;
      hostData: { customFoods: { id: string; micros?: unknown }[] };
    }
  >('health.writeScannedFood', (request) => ({
    success: true,
    hostData: {
      customFoods: [
        {
          id: `off-${request.barcode}`,
          micros: {
            fiberG: request.fiberG ?? 0,
            sugarG: request.sugarG ?? 0,
            saturatedFatG: request.saturatedFatG ?? 0,
            sodiumMg: request.sodiumMg ?? 0,
          },
        },
      ],
    },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('health.writeScannedFood', {
    barcode: '123',
    name: 'Bar',
    kcal: 400,
    fiberG: 8,
    sugarG: 22,
    saturatedFatG: 6,
    sodiumMg: 500,
  });
  expect(result.hostData.customFoods).toEqual([
    {
      id: 'off-123',
      micros: { fiberG: 8, sugarG: 22, saturatedFatG: 6, sodiumMg: 500 },
    },
  ]);
});

test('records.changed delivers the refreshed hostData snapshot', () => {
  const bridge = createMemoryBridge();
  const client = createLeanOnBridgeClient(bridge.transport);
  let seenToday: string | null = null;
  client.subscribe('records.changed', (payload) => {
    seenToday = payload.hostData.today;
  });
  bridge.emit('records.changed', { hostData: { today: '2026-10-01' } });
  expect(seenToday).toBe('2026-10-01');
});

test('notification.getSettings returns reminder settings', async () => {
  const bridge = createMemoryBridge();
  const settings = {
    weight: { enabled: true, hour: 7, minute: 30 },
    meals: { enabled: false, hour: 21, minute: 0 },
  };
  bridge.handle('notification.getSettings', () => ({ settings }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('notification.getSettings');
  expect(result.settings.weight.hour).toBe(7);
  expect(result.settings.meals.enabled).toBe(false);
});

test('notification.updateSettings returns the persisted settings', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { settings: { weight: { enabled: boolean } } },
    { success: true; settings: { weight: { enabled: boolean } } }
  >('notification.updateSettings', (request) => ({
    success: true as const,
    settings: request.settings,
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('notification.updateSettings', {
    settings: {
      weight: { enabled: false, hour: 7, minute: 30 },
      meals: { enabled: true, hour: 21, minute: 0 },
    },
  });
  expect(result.success).toBe(true);
  expect(result.settings.weight.enabled).toBe(false);
});

test('notification.requestPermission returns the granted state', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('notification.requestPermission', () => ({ granted: true }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('notification.requestPermission');
  expect(result.granted).toBe(true);
});

test('healthConnect.getStatus returns availability and flags', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('healthConnect.getStatus', () => ({
    supported: true,
    enabled: false,
    permissionsGranted: false,
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('healthConnect.getStatus');
  expect(result.supported).toBe(true);
  expect(result.enabled).toBe(false);
});

test('healthConnect.requestPermission returns the granted state', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('healthConnect.requestPermission', () => ({ granted: true }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('healthConnect.requestPermission');
  expect(result.granted).toBe(true);
});

test('healthConnect.setEnabled returns success', async () => {
  const bridge = createMemoryBridge();
  bridge.handle('healthConnect.setEnabled', () => ({ success: true }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const result = await client.invoke('healthConnect.setEnabled', {
    enabled: true,
  });
  expect(result.success).toBe(true);
});
