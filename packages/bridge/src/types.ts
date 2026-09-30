/**
 * Core bridge types.
 *
 * The bridge is a thin, typed layer over two Lynx channels:
 * - JS -> Native: NativeModules (request/response, Promise-based)
 * - Native -> JS: GlobalEventEmitter (push events)
 *
 * Everything crossing the boundary must be cloneable structured data; no
 * functions, class instances or live handles may appear in a payload.
 */

export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/** Stable, transport-independent error codes. */
export type RpcErrorCode =
  | 'method-not-found'
  | 'not-authorized'
  | 'unavailable'
  | 'invalid-request'
  | 'cancelled'
  | 'unknown';

export interface RpcError {
  code: RpcErrorCode;
  message: string;
  retriable?: boolean;
  details?: JsonValue;
}

/** Error thrown on the JS side; survives as a plain {@link RpcError} over the wire. */
export class BridgeError extends Error implements RpcError {
  readonly code: RpcErrorCode;
  readonly retriable?: boolean;
  readonly details?: JsonValue;

  constructor(error: RpcError) {
    super(error.message);
    this.name = 'BridgeError';
    this.code = error.code;
    this.retriable = error.retriable;
    this.details = error.details;
  }
}

export function isRpcError(value: unknown): value is RpcError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RpcError).code === 'string' &&
    typeof (value as RpcError).message === 'string'
  );
}

/** Coerce any thrown value into a normalized {@link BridgeError}. */
export function normalizeError(value: unknown): BridgeError {
  if (value instanceof BridgeError) {
    return value;
  }
  if (isRpcError(value)) {
    return new BridgeError(value);
  }
  return new BridgeError({
    code: 'unknown',
    message: value instanceof Error ? value.message : 'Unknown bridge error',
  });
}

/**
 * The transport is intentionally minimal so it can be backed by Lynx
 * NativeModules/GlobalEventEmitter or by an in-memory implementation for tests.
 */
export interface BridgeTransport {
  /** Perform a request to a fully-qualified method, e.g. `health.authorize`. */
  call<Response>(method: string, request: unknown): Promise<Response>;
  /**
   * Subscribe to a native event. Returns an unsubscribe function; the same
   * logical handler must be removable.
   */
  on(event: string, handler: (payload: unknown) => void): () => void;
}
