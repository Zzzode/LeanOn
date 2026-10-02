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
    { date: string; kcal: number; macros: unknown },
    { success: true; hostData: { today: string } }
  >('health.writeIntake', (request) => ({
    success: true,
    hostData: { today: request.date },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.writeIntake', {
    date: '2026-10-01',
    kcal: 500,
    macros: { proteinG: 30, carbsG: 50, fatG: 15 },
  });
  expect(response.success).toBe(true);
  expect(response.hostData.today).toBe('2026-10-01');
});

test('health.writeCustomFood stores the food and returns hostData', async () => {
  const bridge = createMemoryBridge();
  bridge.handle<
    { name: string; kcal: number },
    { success: true; hostData: { today: string; customFoods: unknown[] } }
  >('health.writeCustomFood', (request) => ({
    success: true,
    hostData: {
      today: '2026-10-01',
      customFoods: [{ id: 'custom-1', name: { en: request.name } }],
    },
  }));
  const client = createLeanOnBridgeClient(bridge.transport);
  const response = await client.invoke('health.writeCustomFood', {
    name: 'My Bar',
    kcal: 400,
  });
  expect(response.success).toBe(true);
  expect(response.hostData.customFoods).toHaveLength(1);
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
