import { afterEach, expect, test } from '@rstest/core';
import { BridgeError, createLeanOnBridgeClient, createLynxTransport, hasLynxHost } from './index';

const g = globalThis as unknown as {
  NativeModules?: Record<string, unknown>;
  lynx?: { getJSModule: (name: string) => unknown };
};

afterEach(() => {
  delete g.NativeModules;
  delete g.lynx;
});

test('account deletion reconfirmation preserves an explicit retain choice and both revision checks', async () => {
  let received: unknown;
  g.NativeModules = { companion: { confirmAccountDeletionLocalData: (params: unknown, callback: (result: unknown) => void) => {
    received = params; callback({ success: true });
  } } };
  const request = { deleteLocalData: false, expectedRecordsRevision: 0, expectedPersonalRevision: 17 };
  await createLeanOnBridgeClient(createLynxTransport()).invoke('companion.confirmAccountDeletionLocalData', request);
  expect(received).toEqual(request);
});

test('hasLynxHost reflects native module presence', () => {
  expect(hasLynxHost()).toBe(false);
  g.NativeModules = { health: {} };
  expect(hasLynxHost()).toBe(true);
});

test('hasLynxHost recognizes a lazy non-enumerable native registry', () => {
  g.NativeModules = Object.defineProperty({}, 'app', { value: { getInfo: () => {} } });
  expect(Object.keys(g.NativeModules)).toEqual([]);
  expect(hasLynxHost()).toBe(true);
});

test('call resolves with the native callback result', async () => {
  const response = { success: true, hostData: { today: '2026-10-02' } };
  g.NativeModules = {
    health: {
      writeWeight: (_params: unknown, cb: (r: unknown) => void) => cb(response),
    },
  };
  const transport = createLynxTransport();
  const result = await transport.call<typeof response>('health.writeWeight', {
    date: '2026-10-02',
    weightKg: 80,
  });
  expect(result).toEqual(response);
});

test('void native methods receive object envelopes for omitted and explicit null requests', async () => {
  const seen: unknown[] = [];
  const native = (params: unknown, callback: (result: { success: true }) => void): void => {
    // Models the SDK conversion failure observed before an NSObject-typed
    // native method executes, rather than accepting null in the test double.
    if (params === null || params === undefined) throw new Error('90104 expected NSObject, got Null');
    seen.push(params);
    callback({ success: true });
  };
  g.NativeModules = { app: { getAppearance: native }, records: { getSnapshot: native },
    personal: { getState: native }, companion: { getState: native, logout: native, sync: native },
    notification: { getSettings: native }, healthKit: { getStatus: native }, scanner: { getStatus: native } };
  const transport = createLynxTransport();
  await createLeanOnBridgeClient(transport).invoke('app.getAppearance');
  for (const method of ['records.getSnapshot', 'notification.getSettings', 'healthKit.getStatus', 'scanner.getStatus',
    'personal.getState', 'companion.getState', 'companion.logout', 'companion.sync']) {
    await transport.call(method, undefined);
    await transport.call(method, null);
  }
  expect(seen).toHaveLength(17);
  expect(seen.every(params => JSON.stringify(params) === '{}')).toBe(true);
});

test('nullable payload values and custom top-level null requests cross the native boundary unchanged', async () => {
  const seen: unknown[] = [];
  const native = (params: unknown, callback: (result: { success: true }) => void): void => {
    seen.push(params); callback({ success: true });
  };
  g.NativeModules = { health: { updateCustomFood: native }, custom: { clear: native } };
  const request = { id: 'food-one', name: 'Food', kcal: 100, defaultGrams: null };
  const transport = createLynxTransport();
  await createLeanOnBridgeClient(transport).invoke('health.updateCustomFood', request);
  await transport.call('custom.clear', null);
  expect(seen[0]).toBe(request);
  expect(seen[1]).toBeNull();
});

test('records JSON envelope preserves explicit nulls through an SDK map that omits null keys', async () => {
  function dropNullKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(dropNullKeys);
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (item !== null) result[key] = dropNullKeys(item);
      }
      return result;
    }
    return value;
  }
  const request = { operationId: 'setup-one', expectedRevision: 0, mutation: {
    type: 'save-profile' as const,
    profile: { sex: 'male' as const, birthDate: '1993-05-12', heightCm: 178, activityLevel: 'lightly_active' as const },
    goalWeightKg: null, weeklyLossKg: null, guidanceMode: 'tracking-only' as const,
    safetyFlags: { pregnant: null, breastfeeding: null, eatingDisorderRisk: null },
  } };
  expect(dropNullKeys(request)).not.toEqual(request);
  let received: unknown;
  g.NativeModules = { records: { mutate: (params: unknown, callback: (result: unknown) => void) => {
    const nativeMap = dropNullKeys(params) as { __leanonRecordsRequestJSON: string };
    received = JSON.parse(nativeMap.__leanonRecordsRequestJSON);
    callback({ success: true });
  } } };
  await createLeanOnBridgeClient(createLynxTransport()).invoke('records.mutate', request);
  expect(received).toEqual(request);
});

test('records envelope preserves missing fields and future JSON shapes without adding defaults', async () => {
  let received: unknown;
  g.NativeModules = { records: { mutate: (params: { __leanonRecordsRequestJSON: string }, callback: (result: unknown) => void) => {
    received = JSON.parse(params.__leanonRecordsRequestJSON); callback({ success: true });
  } } };
  const future = { operationId: 'future', expectedRevision: 3, mutation: {
    type: 'future-operation', payload: { list: [null, false, 0, '中文'], optional: undefined, nullable: null },
  } };
  await createLynxTransport().call('records.mutate', future);
  expect(received).toEqual({ operationId: 'future', expectedRevision: 3, mutation: {
    type: 'future-operation', payload: { list: [null, false, 0, '中文'], nullable: null },
  } });
  const malformed = { operationId: 'missing-flags', expectedRevision: 0, mutation: { type: 'save-profile', safetyFlags: {} } };
  await createLynxTransport().call('records.mutate', malformed);
  expect(received).toEqual(malformed);
});

test('non-serializable records requests reject before the native method runs', async () => {
  let nativeCalls = 0;
  g.NativeModules = { records: { mutate: () => { nativeCalls += 1; } } };
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const request of [undefined, circular, { value: Number.NaN }, { value: Number.POSITIVE_INFINITY },
    { value: 1n }, { value: () => 1 }, { value: Symbol('invalid') }, { value: [undefined] }]) {
    await expect(createLynxTransport().call('records.mutate', request)).rejects.toMatchObject({ code: 'invalid-request' });
  }
  expect(nativeCalls).toBe(0);
});

test('personal preference extensions preserve explicit null and unknown JSON values through native map conversion', async () => {
  let received: unknown;
  g.NativeModules = { personal: { mutate: (params: { __leanonPersonalRequestJSON: string }, callback: (result: unknown) => void) => {
    received = JSON.parse(params.__leanonPersonalRequestJSON);
    callback({ success: true });
  } } };
  const request = { operationId: 'preferences-one', expectedRevision: 0, mutation: {
    type: 'set-dietary-preferences' as const,
    preferences: { pattern: 'none' as const, excludedFoodIds: [], notes: '', futurePreference: { nullable: null, flags: [false, 0, '中文'] } },
  } };
  await createLeanOnBridgeClient(createLynxTransport()).invoke('personal.mutate', request);
  expect(received).toEqual(request);
});

test('invalid personal JSON fails before invoking persistence', async () => {
  let calls = 0;
  g.NativeModules = { personal: { mutate: () => { calls += 1; } } };
  const transport = createLynxTransport();
  await expect(transport.call('personal.mutate', { value: Number.NaN })).rejects.toMatchObject({ code: 'invalid-request' });
  await expect(transport.call('personal.mutate', undefined)).rejects.toMatchObject({ code: 'invalid-request' });
  expect(calls).toBe(0);
});

test('call rejects as method-not-found when the module or action is missing', async () => {
  g.NativeModules = { health: {} };
  const transport = createLynxTransport();
  let caught: unknown;
  try {
    await transport.call('health.writeWeight', {});
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BridgeError);
  expect((caught as BridgeError).code).toBe('method-not-found');
});

test('an error result map rejects with its code', async () => {
  g.NativeModules = {
    health: {
      writeWeight: (_p: unknown, cb: (r: unknown) => void) =>
        cb({ code: 'invalid-request', message: 'out of range' }),
    },
  };
  const transport = createLynxTransport();
  let caught: unknown;
  try {
    await transport.call('health.writeWeight', { date: 'x', weightKg: 5 });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BridgeError);
  expect((caught as BridgeError).code).toBe('invalid-request');
});

test('a synchronously throwing native method rejects', async () => {
  g.NativeModules = {
    health: {
      writeWeight: () => {
        throw new Error('boom');
      },
    },
  };
  const transport = createLynxTransport();
  let caught: unknown;
  try {
    await transport.call('health.writeWeight', {});
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BridgeError);
  expect((caught as BridgeError).message).toBe('boom');
});

test('on subscribes through GlobalEventEmitter and unsubscribes', () => {
  const added: Array<[string, (...a: unknown[]) => void]> = [];
  const removed: Array<[string, (...a: unknown[]) => void]> = [];
  g.lynx = {
    getJSModule: () => ({
      addListener: (event: string, listener: (...a: unknown[]) => void) =>
        added.push([event, listener]),
      removeListener: (event: string, listener: (...a: unknown[]) => void) =>
        removed.push([event, listener]),
    }),
  };
  const transport = createLynxTransport();
  const received: unknown[] = [];
  const unsubscribe = transport.on('scale.reading', (payload) => {
    received.push(payload);
  });
  expect(added.length).toBe(1);
  expect(added[0]![0]).toBe('scale.reading');
  // The host wraps the payload as the first argument.
  added[0]![1]({ weightKg: 70 });
  expect(received).toEqual([{ weightKg: 70 }]);
  unsubscribe();
  expect(removed.length).toBe(1);
  expect(removed[0]![0]).toBe('scale.reading');
});

test('native lookup errors preserve retryability and structured timeout reasons', async()=>{
  g.NativeModules={food:{lookupProduct:(_params:unknown,callback:(result:unknown)=>void)=>callback({code:'unavailable',message:'Network request timed out',retriable:true,details:{reason:'timeout'}})}};
  await expect(createLeanOnBridgeClient(createLynxTransport()).invoke('food.lookupProduct',{barcode:'4006381333931'})).rejects.toMatchObject({code:'unavailable',retriable:true,details:{reason:'timeout'}});
});
