import type { BridgeTransport } from './types';
import { normalizeError } from './types';

/** Structural shape any RPC contract must satisfy. */
export interface RpcContractShape {
  [method: string]: { request: unknown; response: unknown };
}

/** Structural shape any event contract must satisfy. */
export interface EventContractShape {
  [event: string]: { payload: unknown };
}

type MethodOf<C extends RpcContractShape> = keyof C & string;

/** Methods with a `void`/`undefined` request take no argument; others require one. */
type InvokeArgs<C extends RpcContractShape, M extends keyof C> = undefined extends C[M]['request']
  ? [request?: C[M]['request']]
  : [request: C[M]['request']];

export interface TypedBridgeClient<
  C extends RpcContractShape,
  E extends EventContractShape,
> {
  invoke<M extends MethodOf<C>>(
    method: M,
    ...args: InvokeArgs<C, M>
  ): Promise<C[M]['response']>;
  subscribe<M extends keyof E & string>(
    event: M,
    handler: (payload: E[M]['payload']) => void,
  ): () => void;
}

/**
 * Bind a typed client to a transport. The contract exists only at the type
 * level; at runtime the client forwards a method name and a cloneable request,
 * normalizing any native error into a {@link BridgeError}.
 */
export function createBridgeClient<
  C extends RpcContractShape,
  E extends EventContractShape,
>(transport: BridgeTransport): TypedBridgeClient<C, E> {
  return {
    invoke(method, request) {
      return transport
        .call(method, request)
        .catch((error: unknown) => {
          throw normalizeError(error);
        }) as Promise<never>;
    },
    subscribe(event, handler) {
      return transport.on(event, handler as (payload: unknown) => void);
    },
  };
}
