- 开始日期：2026-10-03
- RFC 类型：架构
- 状态：已接受
- 相关：0005、0006、0007、0008、0009、0021、0025

# iOS 宿主落地

## 摘要

将 iOS 原生宿主从“经过评审的骨架”变为可完整运行的应用：接入 Lynx iOS 引擎、承载共享的
Lynx bundle、把 Android 的数据层与能力层移植到 Swift，并补齐 HealthKit、通知和蓝牙，使同一套
界面与领域逻辑在 Android 和 iOS 上都能运行。

## 动机

Android 宿主在 RFC 0025 时已功能完整，但 `apps/ios` 下的 Swift 源码仍是未编译的骨架：
`LynxRuntime.initialize()`、容器的 `viewDidLoad()` 与 bundle provider 均为空或 `fatalError`，
Lynx 引擎也未接入。项目的 Linux CI 无法构建 iOS，因此这部分工作一直推迟到有 Mac 之后。否则
应用只能在 Android 上发布，而产品承诺双平台，双人场景也依赖双方各自使用的手机。

## 指南层面的解释

用户在 iPhone 上安装 LeanOn 后，会得到与 Android 相同的 Home、Sheet 与流程：记录体重、餐食、
运动和饮水；查看能量、宏量营养素、微量营养素与洞察；授权健康数据；配对蓝牙秤；接收智能提醒。
TypeScript 工作区（`core`、`pages`、`i18n`、各数据包）原样共享，只有平台外壳与平台能力用 Swift
重写。iOS 的健康数据存入 HealthKit 而非 Health Connect，但行为、范围与镜像模型完全一致。

## 参考层面的解释

### 依赖管理与工具链

- Lynx 通过 **CocoaPods** 接入，这是 Lynx 团队对 3.9.x 固定版本支持的分发方式：

  ```ruby
  source 'https://cdn.cocoapods.org/'
  platform :ios, '15.0'
  use_modular_headers!
  target 'LeanOn' do
    pod 'Lynx', '3.9.0', :subspecs => ['Framework']
    pod 'PrimJS', '3.8.0-alpha.6', :subspecs => ['quickjs', 'napi']
  end
  ```

- 工作流：`xcodegen generate` 生成 `LeanOn.xcodeproj`，`pod install` 生成
  `LeanOn.xcworkspace`；所有构建都针对 workspace。生成的工程、Pods 与 workspace 均加入
  gitignore。
- Swift 5，iOS 部署目标 15.0，不设开发团队（模拟器无需签名）。

### 进程与容器

- `LynxRuntime` 执行一次性的 `LynxEnv` 设置并注册原生模块，在
  `AppDelegate.didFinishLaunching` 中调用。
- `LynxContainerViewController` 持有单个 `LynxView`，用 AutoLayout 铺满，加载
  `main.lynx.bundle` 并注入初始数据；同时绑定事件分发器与模块注册表。3.9 版本中
  `LynxView` 的具体构造与模板加载 API 在实现时对照官方 iOS 接入指南确认。
- `BundleResourceProvider` 在 v1 从 `Bundle.main` 读取 `main.lynx.bundle`。RFC 0007 的签名
  缓存与网络回退在后续叠加，不改变容器接口。
- Lynx bundle 作为资源打包。`project.yml` 引用 `../../packages/pages/dist/main.lynx.bundle`；
  构建前必须先 `pnpm --filter @zzzode/pages build`，与 Android 的 `prepareLynxAssets` 对应。

### 桥与数据层

- 原生模块暴露与 `packages/bridge/src/contracts.ts` 完全相同的方法名与事件名；
  `CapabilityRegistry` 更新为完整方法集，并与契约保持同步。
- Swift 的 `RecordsStore` 移植 `RecordsRepository`：位于 Documents 目录的 JSON 文件，首启从内置
  seed 拷贝，提供相同的增删改与外部镜像操作。领域计算仍在共享的 TypeScript `core` 中，Swift
  只负责持久化与提供数据，与 Android 的职责划分一致。
- 模块：`AppModule`（信息/能力）、`HealthModule`（HealthKit）、`ScaleModule`
  （CoreBluetooth）、`StorageModule`、`ResourceModule`、`NotificationModule`
  （UserNotifications）。

### HealthKit 映射与范围

- 体重映射到 `HKQuantityTypeIdentifier.bodyMass`（千克）；运动映射到 `HKWorkout`，活动类型
  映射与 `ExerciseTypeMapping` 等价。运动热量在 Swift 中用同一 `MET×kg×小时` 公式重算，绝不
  读取外部总量。
- 范围与 RFC 0025 一致：双向同步**只覆盖体重与运动**；营养与水合的读取在餐食指纹方案出现前
  不做。外部 HealthKit 样本以重建模型呈现为只读镜像，并对 LeanOn 自己写入的记录做回声抑制。
- `DataSource` 扩展为 `'leanon' | 'health_connect' | 'healthkit'`。镜像徽标文案本地化：iOS
  显示 “HealthKit”，Android 显示 “Health Connect”。

### 持续集成

- 独立的 `ios.yml` 工作流在 macOS runner 上执行 `xcodegen generate`、`pod install`，再用
  `xcodebuild` 构建模拟器。鉴于 macOS runner 更慢且计费不同，初期工作流可限定在 `main` 与手动
  触发。

## 缺点

- CocoaPods 引入 Ruby 工具链，首次安装与编译较慢；工程规格变化时需重新生成 workspace 与 Pods。
- 外壳与平台能力需要编写两份（Kotlin 与 Swift），契约与映射必须手动同步，存在漂移风险。
- macOS CI 任务比 Linux 任务更慢、更贵。

## 理由与备选方案

- 选择 CocoaPods 而非 Swift Package Manager，是因为 Lynx 通过 CocoaPods 发布稳定的 3.9.x 产物；
  Swift Package Manager 并非该固定版本的受支持路径。
- 复用单一 Lynx bundle 与 TypeScript 工作区，使 UI、i18n 与领域逻辑只有一个事实来源，差异仅在
  轻量平台外壳，这正是 Lynx×Native 架构的核心原因。再做一套原生 UI（例如 SwiftUI 屏）会重复
  实现每个界面，故被否决。

## 未决问题

- 创建 `LynxView`、加载模板与初始数据的 Lynx iOS 3.9 确切 API，在第一个切片中对照官方指南确认。
- 完整的 HealthKit 运动类型映射与 bundle 的资源布局，在移植运动切片时定稿。

## 实施计划

以垂直切片落地，每个切片都能在 iOS 模拟器上编译运行：

1. 基座：Podfile、`LynxRuntime`、容器、bundle 打包、seed 初始数据、`AppModule`；Home 依据
   seed 渲染。
2. `RecordsStore` 与体重写入路径。
3. 饮食记录：搜索、自定义食物、条码（相机 + Open Food Facts）。
4. 运动、水合与微量营养素。
5. 洞察（共享 `core`，无需原生改动）。
6. HealthKit 体重与运动双向同步。
7. 通知与智能提醒。
8. 基于 CoreBluetooth 的蓝牙秤。
9. iOS CI 工作流与完整模拟器验证。

后续 RFC 覆盖动态 bundle 下发（iOS 上的 RFC 0007）、加密存储与同步（RFC 0008），以及
watchOS、Widget 与 Live Activity，这些在本 RFC 中均为非目标。
