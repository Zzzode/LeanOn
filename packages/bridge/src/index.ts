/**
 * @zzzode/bridge —— Lynx 与 Native 通信的统一封装。
 *
 * 规划能力：
 * - NativeModules 调用封装（Lynx → Native，仅后台线程调用）
 * - GlobalEventEmitter 事件订阅（Native → Lynx）
 * - 接口 TS 类型与能力版本协商（minNativeVersion）
 *
 * 仓库基线见 rfcs/0001，命名与开源治理见 rfcs/0002，详细设计见后续 RFC 0004。
 */
export const BRIDGE_VERSION = '0.0.0' as const;
