/**
 * @zzzode/bridge — unified wrapper for Lynx ↔ Native communication.
 *
 * Planned capabilities:
 * - NativeModules call wrappers (Lynx → Native, background thread only)
 * - GlobalEventEmitter subscriptions (Native → Lynx)
 * - TS interface types and capability-version negotiation (minNativeVersion)
 *
 * Repository baseline: rfcs/0001; naming & governance: rfcs/0002;
 * detailed design: RFC 0005.
 */
export const BRIDGE_VERSION = '0.0.0' as const;
