- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0001, 0003, 0004

# 类型化 Lynx ↔ Native 桥

[English](0005-typed-bridge.md) · 简体中文

## Summary

设计 `@zzzode/bridge`：Lynx（TypeScript）与原生宿主（Swift / Kotlin）之间一层薄而**类型安全**
的桥。它提供：

- 基于 Promise 的 **JS → Native** 请求通道
- **Native → JS** 推送事件的订阅通道
- 编译期检查的 RPC 与事件**契约**
- 归一化错误模型与宿主能力/版本协商

运行时传输被注入，因此同一类型化客户端既能对接真实宿主，也能在测试中使用内存实现。

## Motivation

- Lynx 页面必须触达自身无法实现的原生能力：HealthKit / Health Connect、蓝牙秤、加密存储、
  通知与动态资源。
- 直接调用字符串方法名、无类型载荷的原生 `NativeModules` 没有编译期检查，把所有集成错误
  推迟到真机运行时。
- 原生推送数据（秤读数、授权变化）需要对称且无泄漏的订阅 API。
- 两个宿主平台与动态下发的 bundle 必须能检测已安装宿主支持哪些方法并优雅降级，而不是崩溃。

## Guide-level explanation

- 业务代码只依赖类型化客户端：`client.invoke('health.readSamples', request)` 与
  `client.subscribe('scale.reading', handler)`。参数与返回类型由契约推导，方法名或载荷错误
  会在 `tsc` 阶段失败。
- 客户端把完全限定方法名与可克隆载荷转发给注入的传输；真实传输映射到 Lynx NativeModules，
  测试使用内存传输。
- 任何失败——未知方法、缺少权限、适配器不可用——都变成带稳定 code 的 `BridgeError`，与平台
  无关。
- 启动时客户端请求 `app.getCapabilities`；不支持的方法被隐藏或禁用。

## Reference-level explanation

### 底层两个 Lynx 通道

- **JS → Native**：Lynx NativeModules。宿主收到带数据的模块/方法调用
  （`onNativeModulesCall(name, data, moduleName)`），通过 callback 返回数据。调用未注册方法
  会产生原生“function not found”错误。
- **Native → JS**：宿主调用 `sendGlobalEvent(eventName, params)`；JS 通过
  `lynx.getJSModule('GlobalEventEmitter')` 订阅（`addListener` / `removeListener` /
  `removeAllListeners`）。不存在 bare 的 `GlobalEventEmitter` 全局。

### 传输抽象

```ts
interface BridgeTransport {
  call<Response>(method: string, request: unknown): Promise<Response>;
  on(event: string, handler: (payload: unknown) => void): () => void;
}
```

bridge 包不 import `lynx` 全局。平台适配器（随原生宿主在 RFC 0006 添加）基于
NativeModules/GlobalEventEmitter 实现该接口；`createMemoryBridge()` 提供可控实现，用于单测，
并作为原生服务端必须满足的参考形态。

### 契约仅存在于类型层

```ts
type RpcContractShape = Record<string, { request: unknown; response: unknown }>;
type EventContractShape = Record<string, { payload: unknown }>;
```

`LeanOnRpcContract` 与 `LeanOnEventContract` 用精确类型枚举每个方法与事件。无参方法使用
`request: void`。契约只存在于类型层；运行时代码仍发送普通方法字符串，新增契约成员不会下发
任何逻辑。

### 类型化客户端

```ts
interface TypedBridgeClient<C, E> {
  invoke<M extends keyof C>(method: M, ...args: InvokeArgs<C, M>): Promise<C[M]['response']>;
  subscribe<M extends keyof E>(event: M, handler: (payload: E[M]['payload']) => void): () => void;
}
```

`InvokeArgs` 让 `void`/`undefined` 请求的参数可选，其余必传。客户端通过 `normalizeError`
归一化任何拒绝值。

### 错误模型

```ts
type RpcErrorCode =
  | 'method-not-found' | 'not-authorized' | 'unavailable'
  | 'invalid-request' | 'cancelled' | 'unknown';

class BridgeError extends Error { code; retriable?; details? }
```

平台特有的原生错误在宿主适配器中映射为这些 code，业务代码可在一个小而稳定的枚举上分支，
并判断错误是否可重试。

### 能力协商

`app.getCapabilities` 返回 `HostCapabilities`：

```ts
{ platform; hostVersion; bridgeVersion; supportedMethods: string[]; supportedEvents: string[] }
```

客户端把想用的契约成员与 `supportedMethods`/`supportedEvents` 比较，隐藏不支持的能力；
`bridgeVersion` 用于协议级变更的门控。

### 能力域

| 域 | 方法 | 事件 |
|---|---|---|
| `health.*` | `authorize`、`readSamples`、`writeWeight` | `authorizationChanged` |
| `scale.*` | `scan`、`connect` | `discovered`、`reading` |
| `storage.*` | `get`、`set`、`remove` | — |
| `resource.*` | `fetch`（动态 bundle，RFC 0007） | — |
| `app.*` | `getInfo`、`getCapabilities` | `lifecycle` |
| `notification.*` | `schedule` | — |

DTO（`HealthSampleDto`、`ScaleDeviceDto`、`ScaleReadingDto`、`AppInfo`、`HostCapabilities`
等）是定义在 `contracts.ts` 的扁平 JSON 形态。

### 序列化与线程

- 跨边界只能传**可克隆的结构化数据**：JSON 兼容值，禁止函数、类实例、symbol 或活句柄。
  类型在契约边界强制这一点。
- 原生调用遵循 Lynx 双线程模型：在事件/后台上下文中 invoke，不在主线程渲染期间调用。

## Drawbacks

- 维护契约有额外簿记；宿主新增方法但没有契约成员时，对类型化客户端不可见。
- 仅类型层契约无法在运行时保证宿主遵守声明形态；能力协商与测试可缓解但不能根除。
- 相比直接调用 NativeModules，注入传输多了一层间接。

## Rationale and alternatives

- **每页手写原生调用包装**：没有单一事实来源、没有端到端类型；否决。
- **从 IDL/schema 生成代码**：运行时保证更强，但引入 codegen 步骤与事实来源分裂；待接口
  稳定后再考虑。
- **通用 `postMessage` 字符串信封**：灵活但失去类型与集中化；选择带契约的命名方法。
- **把原生调用放进 core**：会破坏 core 的纯/可移植约束；bridge 保持独立包，由业务代码编排
  两者。

## Unresolved questions

- HealthKit/Health Connect 错误与 BLE 状态到 `RpcErrorCode` 的确切映射。
- 宿主适配器应放在 `packages/bridge`（ts）还是各平台 `apps/*`/`native/*`（倾向各平台，
  RFC 0006）。
- 请求取消、超时与批量是现在做，还是随首个重用例（历史批量导入）做。
- 契约是否最终驱动 Swift/Kotlin 宿主桩的 codegen。

## Implementation plan

- [x] 核心类型：传输、JSON/可克隆载荷、RPC 错误模型
- [x] 内存传输与参考服务端形态
- [x] 类型化客户端（`invoke` / `subscribe`）与错误归一化
- [x] LeanOn 能力契约、DTO 与方法/事件常量
- [ ] 基于 NativeModules/GlobalEventEmitter 的真实 Lynx 传输（随 RFC 0006）
- [ ] 原生宿主 handler 与能力注册
- [ ] 视需要增加超时/取消与批量调用

已实施领域由 6 个内存 Rstest 用例覆盖；真实传输与原生 handler 随宿主 RFC 落地。

## References

- Lynx 文档：NativeModules 与 `onNativeModulesCall`（接入现有应用）。
- Lynx 文档：通过 `lynx.getJSModule` 使用 GlobalEventEmitter 及事件处理。
- Lynx 错误码（native module method not found）。
- Lynx `<lynx-view>`：`sendGlobalEvent(eventName, params: Cloneable[])`。
