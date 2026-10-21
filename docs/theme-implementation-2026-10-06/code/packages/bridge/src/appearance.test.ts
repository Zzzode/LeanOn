import { expect, test } from '@rstest/core';
import {
  createLeanOnBridgeClient,
  createMemoryBridge,
  isAppearanceState,
  type AppearancePreference,
  type AppearanceState,
} from './index';

test('appearance events preserve follow-system preference as its resolution changes', async () => {
  const bridge = createMemoryBridge();
  let appearance: AppearanceState = { preference: 'system', resolved: 'light' };
  bridge.handle('app.getAppearance', () => appearance);
  bridge.handle<{ preference: AppearancePreference }, AppearanceState & { success: true }>(
    'app.setAppearance',
    ({ preference }) => {
      appearance = { preference, resolved: preference === 'system' ? 'light' : preference };
      bridge.emit('app.appearanceChanged', appearance);
      return { success: true, ...appearance };
    },
  );
  const client = createLeanOnBridgeClient(bridge.transport);
  const changes: AppearanceState[] = [];
  const unsubscribe = client.subscribe('app.appearanceChanged', value => changes.push(value));
  expect(await client.invoke('app.getAppearance')).toEqual(appearance);
  expect(await client.invoke('app.setAppearance', { preference: 'dark' })).toEqual({
    success: true, preference: 'dark', resolved: 'dark',
  });
  await client.invoke('app.setAppearance', { preference: 'system' });
  bridge.emit('app.appearanceChanged', { preference: 'system', resolved: 'dark' });
  unsubscribe();
  bridge.emit('app.appearanceChanged', { preference: 'system', resolved: 'light' });
  expect(changes).toEqual([
    { preference: 'dark', resolved: 'dark' },
    { preference: 'system', resolved: 'light' },
    { preference: 'system', resolved: 'dark' },
  ]);
});

test('appearance guard rejects malformed and contradictory native payloads', () => {
  for (const value of [null, undefined, [], 'dark', {},
    { preference: 'auto', resolved: 'dark' },
    { preference: 'system', resolved: 'auto' },
    { preference: 'dark', resolved: 'light' },
    { preference: 'light', resolved: 'dark' },
    { preference: false, resolved: 'light' },
  ]) expect(isAppearanceState(value)).toBe(false);
  expect(isAppearanceState({ preference: 'system', resolved: 'dark' })).toBe(true);
  expect(isAppearanceState({ preference: 'system', resolved: 'light' })).toBe(true);
  expect(isAppearanceState({ preference: 'dark', resolved: 'dark' })).toBe(true);
  expect(isAppearanceState({ preference: 'light', resolved: 'light', success: true })).toBe(true);
});
