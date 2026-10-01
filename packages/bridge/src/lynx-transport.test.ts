import { afterEach, expect, test } from '@rstest/core';
import { BridgeError, createLynxTransport, hasLynxHost } from './index';

const g = globalThis as unknown as {
  NativeModules?: Record<string, unknown>;
  lynx?: { getJSModule: (name: string) => unknown };
};

afterEach(() => {
  delete g.NativeModules;
  delete g.lynx;
});

test('hasLynxHost reflects native module presence', () => {
  expect(hasLynxHost()).toBe(false);
  g.NativeModules = { health: {} };
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
