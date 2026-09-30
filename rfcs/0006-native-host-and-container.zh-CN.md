- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0001, 0005, 0007, 0008

# 原生宿主与 Lynx 容器

[English](0006-native-host-and-container.md) · 简体中文

## Summary

设计内嵌 Lynx、并作为桥**服务端**的 iOS（Swift）与 Android（Kotlin）**原生宿主**：

- App 壳：启动、单容器导航、生命周期
- Lynx 容器：`LynxView` 创建/复用、通过注入的资源 provider 加载 bundle、路由与模块安全
- 实现 RFC 0005 各能力域的原生模块，含回调与原生→JS 全局事件
- 应答 `app.getCapabilities` 的能力注册表

TypeScript 包仍是契约的来源；宿主负责实现契约。

## Motivation

- Lynx 没有内置资源加载、也无法访问平台 API；任何页面运行前，宿主都必须提供 bundle loader
  与原生能力。
- RFC 0005 定义了类型化客户端与注入式传输，但真实传输与请求 handler 只存在于原生侧。本 RFC
  把它们接通。
- 两个独立版本的宿主必须注册各自实现的方法/事件，动态 bundle 才能安全协商支持。
- 原生调用需要安全边界（哪个页面可调哪个方法），并遵循平台生命周期与后台约束。

## Guide-level explanation

- 每个平台是承载一个可复用 Lynx 容器的薄壳。容器通过宿主提供的资源 provider 加载指定路由的
  bundle（本地缓存优先、再走网络；见 RFC 0007）。
- 宿主为每个能力域注册一个原生模块。JS 请求以导出方法的形式到达；结果通过回调/promise 返回，
  宿主通过全局事件 emitter 推送事件。
- 能力注册表映射 TS 契约使用的同一批完全限定方法名，因此 `app.getCapabilities` 报告的是实时
  能力面。
- 模块鉴权 validator 按容器门控调用；平台 health/BLE/storage 代码位于 `native/*` 并注入模块。

## Reference-level explanation

### App 壳

- **Android**：单一 `Activity`（不做每屏 fragment）；`Application` 一次性初始化 Lynx 并注册
  模块；导航在容器内由路由驱动。
- **iOS**：`AppDelegate`/`SceneDelegate` 初始化 Lynx 并呈现一个容器 view controller；路由同样
  由路由驱动。
- 两端把原生 UI 降到最少（启动屏、权限、罕见全屏流程）。

### Lynx 容器

- 持有 `LynxView`（Android）/ `LynxView : UIView`（iOS），跨路由复用/池化。
- 通过宿主注入的**资源 provider**加载 bundle（Lynx 自身不抓取）：本地已签名缓存 → 网络，并做
  完整性校验（RFC 0007）。
- 在加载页面前绑定全局事件 emitter 并安装模块鉴权 validator。
- 暴露路由操作：打开路由、替换、返回；每条路由传入 init data。

### 原生模块即桥服务端

- **Android**：类继承 `com.lynx.jsbridge.LynxModule`；导出方法带 `@LynxMethod`；结果使用
  `com.lynx.react.bridge.Callback` 或 promise。模块通过
  `LynxEnv.inst().registerModule(name, class)` 一次性注册；注解处理器（`lynx-processor`）经
  kapt 接入。
- **iOS**：类实现 `LynxModule` 协议，用静态 `name` 与 `methodLookup` 把 JS 方法名映射到
  selector；结果使用回调 block。模块在 Lynx 环境初始化时注册。
- **原生→JS 事件**：宿主调用全局事件发送器（`sendGlobalEvent(eventName, params)`，参数可
  克隆）；JS 通过 GlobalEventEmitter 订阅。
- 跨边界只传可克隆结构化数据；原生代码把平台类型转换为 TS 契约声明的扁平 DTO。

### 能力注册表与协商

宿主侧注册表枚举支持的完全限定方法、事件与桥协议版本。`app.getCapabilities` 直接返回它；
`app.getInfo` 返回平台、宿主版本、设备型号与 OS 版本。业务代码隐藏未列出的能力。

### 模块安全

- 容器安装鉴权 validator，每次调用收到（module、method、params）并返回允许/拒绝；被拒调用
  产生 JS 错误而不执行。
- 这为动态下发的 bundle 强制最小权限，并提供独立于能力检查的统一审计点。

### 能力域模块

| 模块 | 背后实现（native/*） | 推送事件 |
|---|---|---|
| Health | `native/health-adapter`（HealthKit / Health Connect） | `health.authorizationChanged` |
| Scale | `native/ble-scale` | `scale.discovered`、`scale.reading` |
| Storage | 加密存储（RFC 0008） | — |
| Resource | bundle provider/缓存（RFC 0007） | — |
| App | 宿主信息/能力/生命周期 | `app.lifecycle` |
| Notification | 平台通知 + 后台调度 | — |

模块是薄适配层；实质逻辑（授权流程、BLE 状态机、加密）保留在 `native/*` 下可复用的原生组件
中，使模块可测、跨平台一致。

### 生命周期与后台

- 后台工作使用平台调度器（Android `WorkManager`；iOS 后台任务）。
- 前后台切换发出 `app.lifecycle`；长操作与同步（RFC 0008）不阻塞 UI 并遵守电量策略。

### 项目布局

- **Android**：Gradle Kotlin DSL + 版本目录（`gradle/libs.versions.toml`），`app/` 包含壳、
  容器、模块与注册表。
- **iOS**：Swift 源 + **XcodeGen** `project.yml`；`.xcodeproj` 按需生成而不提交，避免合并
  冲突与 UUID 漂移。

## Build and verification

- Android 需要 Android SDK + Gradle；iOS 需要 macOS + Xcode。当前 Linux/CI 环境无法编译两者，
  因此原生源以经过评审的骨架交付，必须在各自平台工具链中构建。CI 目前验证 TypeScript 工作区
  （typecheck/build/test）；待有平台 runner 时再加入原生 CI（模拟器/真机或至少 Gradle/Xcode
  构建）。

## Drawbacks

- 维护两套原生实现使表面翻倍；骨架无法在此编译，平台错误只能在原生 IDE 暴露。
- 生成 iOS 工程引入 XcodeGen 依赖；提交工程则以合并冲突为代价。
- 模块鉴权 validator 与能力注册表是额外的宿主簿记。

## Rationale and alternatives

- **跨平台原生框架（Flutter/KMP 做壳）**：会取代 Lynx 并失去动态 UI；否决。
- **只提交生成的 Xcode/Gradle 工程**：iOS 方便但易冲突、不透明；XcodeGen 让定义保持声明式。
  Gradle 文件本就是文本，直接保留。
- **把逻辑直接写进模块**：会把传输与平台代码耦合；改为把可复用 `native/*` 组件注入薄模块。
- **不做鉴权 validator**：更简单但让每个动态 bundle 拥有全部原生访问；否决。

## Unresolved questions

- HealthKit/Health Connect 与 BLE 错误到 `RpcErrorCode` 的具体映射。
- 原生模块是现在就发布为 autolink 库（`lynx.lib.json`），还是在接口稳定前留在 App 内。
- 原生构建的 CI 策略（托管 macOS/Android runner、所需密钥）。
- 是否通过 Node-API 共享必须跨平台完全一致的原生 C/C++ 逻辑。

## Implementation plan

- [x] 容器与宿主设计（本 RFC）
- [ ] Android Gradle 骨架、壳、容器、模块、注册表
- [ ] iOS Swift 骨架与 XcodeGen 工程定义
- [ ] 真实资源 provider 接线（RFC 0007）
- [ ] 支撑 storage 模块的加密存储（RFC 0008）
- [ ] 平台工具链中的原生构建/CI

## References

- Lynx：接入现有应用（Android Gradle 工件；iOS LynxView 与 bundle loader）。
- Lynx：原生模块（Android `LynxModule`/`@LynxMethod`/`registerModule`；iOS `LynxModule`、
  `name`/`methodLookup`）。
- Lynx：原生模块权限 validator；全局事件（`sendGlobalEvent`）。
