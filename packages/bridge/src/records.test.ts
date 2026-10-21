import { expect, test } from '@rstest/core';
import { createEmptyRecordsState } from '@zzzode/core';
import { createLeanOnBridgeClient, createMemoryBridge, RpcMethods } from './index';
import type { HostDataDto, RecordsMutationRequest } from './index';

const snapshot: HostDataDto = { ...createEmptyRecordsState(), today: '2026-10-06', todayHour: 12,
  streak: 0, customFoods: [], favoriteFoodIds: [], recentFoodIds: [] };

test('snapshot RPC preserves unconfigured nullable state without seeded user data', async () => {
  const memory = createMemoryBridge();
  memory.handle(RpcMethods.recordsGetSnapshot, () => ({ hostData: snapshot }));
  const result = await createLeanOnBridgeClient(memory.transport).invoke('records.getSnapshot');
  expect(result.hostData.profile).toBeNull();
  expect(result.hostData.schemaVersion).toBe(2);
  expect(result.hostData.setupCompleted).toBe(false);
});

test('mutation transports operation identity and expected revision unchanged', async () => {
  const memory = createMemoryBridge();
  let received: RecordsMutationRequest | undefined;
  memory.handle<RecordsMutationRequest, unknown>(RpcMethods.recordsMutate, (request) => {
    received = request;
    return { success: true, hostData: snapshot, appliedRevision: 1, replayed: false };
  });
  const request: RecordsMutationRequest = { operationId: 'qa-water', expectedRevision: 0,
    mutation: { type: 'set-water', date: snapshot.today, amountMl: 250 } };
  const result = await createLeanOnBridgeClient(memory.transport).invoke('records.mutate', request);
  expect(received).toEqual(request);
  expect(result.replayed).toBe(false);
});

test('explicit conflict survives bridge normalization for a stale draft', async () => {
  const memory = createMemoryBridge();
  memory.fail('records.mutate', { code: 'conflict', message: 'Records changed', retriable: false });
  await expect(createLeanOnBridgeClient(memory.transport).invoke('records.mutate', {
    operationId: 'stale', expectedRevision: 0, mutation: { type: 'set-water', date: snapshot.today, amountMl: 250 },
  })).rejects.toMatchObject({ code: 'conflict', retriable: false });
});
