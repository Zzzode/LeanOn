import type { BridgeTransport, RpcError } from './types';
import { BridgeError } from './types';

type Handler = (request: never) => unknown;

/**
 * In-memory transport used in tests and as the reference shape a native-side
 * server is expected to satisfy. Handlers are keyed by fully-qualified method.
 */
export interface MemoryBridge {
  transport: BridgeTransport;
  handle<Request, Response>(
    method: string,
    fn: (request: Request) => Response | Promise<Response>,
  ): void;
  fail(method: string, error: RpcError): void;
  emit(event: string, payload: unknown): void;
}

export function createMemoryBridge(): MemoryBridge {
  const handlers = new Map<string, Handler>();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const transport: BridgeTransport = {
    async call<Response>(method: string, request: unknown): Promise<Response> {
      const handler = handlers.get(method);
      if (handler === undefined) {
        throw new BridgeError({
          code: 'method-not-found',
          message: `No handler registered for ${method}`,
        });
      }
      return (await handler(request as never)) as Response;
    },
    on(event: string, handler: (payload: unknown) => void): (() => void) {
      let set = listeners.get(event);
      if (set === undefined) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
      return () => set!.delete(handler);
    },
  };

  return {
    transport,
    handle(method, fn): void {
      handlers.set(method, fn as Handler);
    },
    fail(method, error): void {
      handlers.set(method, () => {
        throw new BridgeError(error);
      });
    },
    emit(event, payload): void {
      const set = listeners.get(event);
      if (set !== undefined) {
        for (const handler of set) {
          handler(payload);
        }
      }
    },
  };
}
