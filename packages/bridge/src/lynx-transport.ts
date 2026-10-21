import { normalizeError } from './types';
import type { BridgeTransport, RpcErrorCode } from './types';
import type { LeanOnRpcContract } from './contracts';

type VoidRequestMethod = {
  [Method in keyof LeanOnRpcContract]: undefined extends LeanOnRpcContract[Method]['request'] ? Method : never;
}[keyof LeanOnRpcContract];

// Exhaustive at compile time: new void RPCs must declare their native envelope.
const VOID_REQUEST_METHODS: Record<VoidRequestMethod, true> = {
  'personal.getState': true,
  'companion.getMigrationState': true,
  'companion.pauseMigration': true,
  'companion.getState': true,
  'companion.logout': true,
  'companion.sync': true,
  'records.getSnapshot': true,
  'scale.scan': true,
  'scale.disconnect': true,
  'scale.getStatus': true,
  'scanner.getStatus': true,
  'scanner.scanBarcode': true,
  'app.getInfo': true,
  'app.getCapabilities': true,
  'app.getAppearance': true,
  'notification.getSettings': true,
  'notification.requestPermission': true,
  'healthConnect.getStatus': true,
  'healthConnect.sync': true,
  'healthConnect.requestPermission': true,
  'healthKit.getStatus': true,
  'healthKit.requestPermission': true,
  'healthKit.sync': true,
};

/** Transport-only wrapper: Lynx can omit null-valued keys in native maps. */
function mutationRequestEnvelope(request: unknown, domain: 'records' | 'personal'): Record<string, string> {
  try {
    const json = JSON.stringify(request, function (this: unknown, _key: string, value: unknown): unknown {
      if ((typeof value === 'number' && !Number.isFinite(value)) ||
        typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' ||
        (value === undefined && Array.isArray(this))) {
        throw new TypeError('Not a JSON value');
      }
      return value;
    });
    if (typeof json !== 'string') throw new TypeError('Missing JSON request');
    return { [domain === 'records' ? '__leanonRecordsRequestJSON' : '__leanonPersonalRequestJSON']: json };
  } catch {
    throw normalizeError({ code: 'invalid-request', message: `${domain} request must be JSON-serializable` });
  }
}

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

// Lynx supplies these names as lexical arguments to its CommonJS wrapper.
// They need not be properties of globalThis in the background runtime.
declare const NativeModules: NativeModulesRegistry | undefined;
declare const lynx: LynxGlobalLike | undefined;

function readNativeModules(): NativeModulesRegistry {
  if (typeof NativeModules !== 'undefined') return NativeModules ?? {};
  return (globalThis as { NativeModules?: NativeModulesRegistry }).NativeModules ?? {};
}

function readLynx(): LynxGlobalLike | undefined {
  if (typeof lynx !== 'undefined') return lynx;
  return (globalThis as { lynx?: LynxGlobalLike }).lynx;
}

/** True when the real Lynx host exposes at least one native module. */
export function hasLynxHost(): boolean {
  const modules = readNativeModules();
  // Lynx exposes a lazy native host object; its modules are not necessarily
  // enumerable. Probe the registered app module before the plain-object
  // fallback used by tests and custom hosts.
  return modules != null && (modules.app != null || Object.keys(modules).length > 0);
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
                ...(typeof result.retriable === 'boolean' ? {retriable:result.retriable} : {}),
                ...(result.details === undefined ? {} : {details:result.details}),
              }),
            );
            return;
          }
          resolve(result as Response);
        };
        try {
          // Lynx iOS converts undefined to Null and rejects it before Swift's
          // nullable parameter can run. Empty objects bridge as NSDictionary.
          // Null is retained for methods whose request carries meaningful data.
          const nativeRequest = method === 'records.mutate' ? mutationRequestEnvelope(request, 'records') :
            method === 'personal.mutate' ? mutationRequestEnvelope(request, 'personal') :
            (request === undefined ||
              (request === null && Object.prototype.hasOwnProperty.call(VOID_REQUEST_METHODS, method)) ? {} : request);
          fn.call(mod, nativeRequest, callback);
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
