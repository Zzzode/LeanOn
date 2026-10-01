import { normalizeError } from './types';
import type { BridgeTransport, RpcErrorCode } from './types';

/** Result map a native callback is invoked with. An error carries code/message. */
interface NativeResult {
  code?: string;
  message?: string;
  [key: string]: unknown;
}

type NativeCallback = (result: NativeResult) => void;

interface NativeModule {
  [method: string]:
    | ((params: unknown, callback: NativeCallback) => void)
    | undefined;
}

interface NativeModulesRegistry {
  [domain: string]: NativeModule | undefined;
}

interface GlobalEventEmitterLike {
  addListener(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

interface LynxGlobalLike {
  getJSModule(name: 'GlobalEventEmitter'): GlobalEventEmitterLike;
}

function readNativeModules(): NativeModulesRegistry {
  return (globalThis as { NativeModules?: NativeModulesRegistry }).NativeModules ?? {};
}

function readLynx(): LynxGlobalLike | undefined {
  return (globalThis as { lynx?: LynxGlobalLike }).lynx;
}

/** True when the real Lynx host exposes at least one native module. */
export function hasLynxHost(): boolean {
  const modules = (globalThis as { NativeModules?: NativeModulesRegistry }).NativeModules;
  return modules != null && Object.keys(modules).length > 0;
}

/**
 * Transport backed by the real Lynx runtime: requests go through `NativeModules`
 * with a Promise-wrapped callback; events go through `GlobalEventEmitter`.
 */
export function createLynxTransport(): BridgeTransport {
  return {
    call<Response>(method: string, request: unknown): Promise<Response> {
      return new Promise<Response>((resolve, reject) => {
        const dot = method.indexOf('.');
        if (dot < 0) {
          reject(
            normalizeError({
              code: 'invalid-request',
              message: `Malformed method "${method}"`,
            }),
          );
          return;
        }
        const domain = method.slice(0, dot);
        const action = method.slice(dot + 1);
        const mod = readNativeModules()[domain];
        const fn = mod?.[action];
        if (mod == null || typeof fn !== 'function') {
          reject(
            normalizeError({
              code: 'method-not-found',
              message: `${method} is not available`,
            }),
          );
          return;
        }
        let settled = false;
        const callback: NativeCallback = (result) => {
          if (settled) return;
          settled = true;
          if (result != null && typeof result === 'object' && typeof result.code === 'string') {
            reject(
              normalizeError({
                code: result.code as RpcErrorCode,
                message:
                  typeof result.message === 'string'
                    ? result.message
                    : `${method} failed`,
              }),
            );
            return;
          }
          resolve(result as Response);
        };
        try {
          fn.call(mod, request, callback);
        } catch (error) {
          if (settled) return;
          settled = true;
          reject(normalizeError(error));
        }
      });
    },
    on(event, handler) {
      const emitter = readLynx()?.getJSModule('GlobalEventEmitter');
      if (emitter == null) {
        return () => {};
      }
      // The host wraps the payload in a parameter list; read the first argument.
      const listener = (...args: unknown[]): void => handler(args[0]);
      emitter.addListener(event, listener);
      return () => emitter.removeListener(event, listener);
    },
  };
}
