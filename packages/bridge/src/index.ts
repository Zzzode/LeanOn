/**
 * @zzzode/bridge — typed Lynx ↔ Native communication.
 *
 * Two channels underlie the bridge: NativeModules for JS -> Native requests and
 * GlobalEventEmitter for Native -> JS events. The transport is injected so the
 * same typed client runs against the real host or an in-memory test transport.
 * Capability domains and the request/response/event contracts live in
 * contracts.ts; detailed design: RFC 0005.
 */

export const BRIDGE_VERSION = '0.1.0' as const;

export type {
  BridgeTransport,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RpcError,
  RpcErrorCode,
} from './types';
export { BridgeError, isRpcError, normalizeError } from './types';

export { createMemoryBridge } from './memory-transport';
export type { MemoryBridge } from './memory-transport';

export {
  createBridgeClient,
} from './client';
export type {
  EventContractShape,
  RpcContractShape,
  TypedBridgeClient,
} from './client';

export { BridgeEvents, RpcMethods } from './contracts';
export type {
  AppInfo,
  HealthDataType,
  HealthSampleDto,
  HostCapabilities,
  LeanOnEventContract,
  LeanOnRpcContract,
  ReadSamplesRequest,
  ScaleDeviceDto,
  ScaleReadingDto,
  ScheduleNotificationRequest,
} from './contracts';

import type { BridgeTransport } from './types';
import { createBridgeClient, type TypedBridgeClient } from './client';
import type { LeanOnEventContract, LeanOnRpcContract } from './contracts';

/** Client pre-bound to the LeanOn RPC and event contracts. */
export type LeanOnBridgeClient = TypedBridgeClient<
  LeanOnRpcContract,
  LeanOnEventContract
>;

/** Create a client typed against the LeanOn capability contracts. */
export function createLeanOnBridgeClient(
  transport: BridgeTransport,
): LeanOnBridgeClient {
  return createBridgeClient<LeanOnRpcContract, LeanOnEventContract>(transport);
}
