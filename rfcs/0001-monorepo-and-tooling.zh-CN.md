- Start Date: 2026-09-30
- RFC Type: architecture
- Status: Accepted

# Monorepo 结构与工程基线

## Summary

采用 **pnpm workspace monorepo** 作为双人健康管理 App 的唯一代码仓库，承载 Lynx 业务包、跨端领域核心、原生宿主与后端代码；同时确立 TypeScript 基线配置、`@health/*` 命名约定和 RFC 设计流程。

## Motivation

- 产品确定采用 **Lynx × Native 混合架构**：Lynx 负责可动态化的页面与卡片，Native 负责健康数据采集（HealthKit / Health Connect）、蓝牙智能秤、后台任务、通知与 Widget/手表。两类代码需要清晰的物理边界，又要在同一仓库内保持接口同步。
- 只有两位使用者兼开发者，monorepo 让跨端接口改动在一次提交内完成，避免多仓库版本错配。
- 设计决策需要留痕，避免"为什么当初这么做"反复争论，因此引入 RFC（流程见 `rfcs/README.md`）。

## Guide-level explanation

日常开发入口：

```bash
pnpm install        # 安装全部 workspace 依赖
pnpm typecheck      # 对所有包做类型检查
pnpm build          # 构建所有包
pnpm test           # 运行所有包的测试
```

新增一个 TS 包：在 `packages/<name>/` 下按现有包结构创建 `package.json`、`tsconfig.json`、`src/`，命名为 `@health/<name>`，pnpm 会自动识别。

新增一个设计决策：复制 `rfcs/0000-template.md`，按 `rfcs/README.md` 的流程提交。

## Reference-level explanation

### 目录结构

```
.
├── apps/
│   ├── ios/                 # iOS 原生宿主（Swift）：Shell、Lynx 容器、桥接实现
│   └── android/             # Android 原生宿主（Kotlin）
├── packages/                # pnpm workspace 成员（TS）
│   ├── core/                # @health/core 纯 TS 领域引擎（TDEE/趋势/营养评分）
│   ├── bridge/              # @health/bridge NativeModules 封装与 TS 类型
│   ├── ui/                  # @health/ui 设计系统与业务组件（基于 lynx-ui）
│   ├── pages/               # @health/pages Lynx 页面 bundle 集合
│   └── cards/               # @health/cards 可动态下发的卡片 bundle
├── native/                  # 跨端原生能力的分组目录（非 workspace 成员）
│   ├── health-adapter/      # HealthKit / Health Connect 统一适配
│   ├── ble-scale/           # 智能秤 BLE 协议
│   └── offline-kit/         # LynxResourceProvider：bundle 下载/验签/缓存/兜底
├── server/                  # Manifest/离线包服务与数据同步后端
├── rfcs/                    # 设计文档（流程见 rfcs/README.md）
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .npmrc
├── .editorconfig
└── .gitignore
```

### Workspace 约定

- `pnpm-workspace.yaml` 当前只纳入 `packages/*`；`server/` 在后端 RFC 定稿后加入。
- 包命名统一使用 `@health/*` scope，版本号在独立发布前统一为 `0.0.0`、`private: true`。
- 包间引用使用 `workspace:*` 协议。

### TypeScript 基线

- 所有包 `extends` 根 `tsconfig.base.json`，统一 `strict`、`noUncheckedIndexedAccess`、`isolatedModules`、`verbatimModuleSyntax`。
- 面向 Lynx/Rspeedy 打包，`module` 为 `ESNext`、`moduleResolution` 为 `Bundler`。
- 每个包提供 `typecheck`（`tsc --noEmit`）与 `build`（`tsc`）脚本。

### 架构边界（与 RFC 后续细化）

- 原生能力（健康数据、BLE、后台、通知、Widget、手表）不进入 `packages/`，分别落在 `apps/*` 与 `native/*`。
- 领域引擎保持**零 UI、零原生依赖**的纯 TS 形态，使其既能在 Lynx 后台线程运行，也能在服务端复用，并可随 bundle 灰度更新。
- Lynx 与 Native 的所有交互经 `@health/bridge` 收敛，禁止页面直接散落调用。

## Drawbacks

- 原生 iOS/Android 工程与 pnpm 工程共存于同一仓库，需要约定好忽略规则与 CI 编排，初期目录语义靠 README 维持。
- monorepo 的工具链（Rspeedy、CI、缓存）配置集中，配置失误会影响所有包。
- 纯 TS 领域引擎在"App 被杀进程仍需后台计算"的场景不可用，这类任务仍需下沉原生。

## Rationale and alternatives

- **多仓库（polyrepo）**：原生与 JS 分仓会让 Bridge 接口、数据模型在改动时跨仓错配，对两人团队协作成本过高，否决。
- **单仓库无 workspace**：缺少依赖联动与统一脚本，包管理退化为手工维护，否决。
- **领域引擎用 KMP**：Kotlin Multiplatform 在后台离线计算上更强，但引入 Kotlin/Native 工具链，且无法随 Lynx bundle 热更；在当前规模下纯 TS core 的迭代收益更大，KMP 作为未来性能瓶颈时的备选。

## Unresolved questions

- 包构建与发布形态：`tsc` 直出 vs `tsup`/Rsbuild（需支持 Lynx 双线程产物时再定）。
- Lynx / Rspeedy 的版本与接入方式、LynxView 容器的具体封装。
- Bridge 的接口描述与代码生成方案、能力版本协商格式。
- 离线包的签名密钥管理、Manifest 服务与 CDN 形态。
- CI 平台、测试框架（Node 测试运行器选型）与 lint 工具链。
- 云同步后端与数据加密方案。

## Implementation plan

- [x] 根配置：`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.npmrc`、`.editorconfig`、`.gitignore`
- [x] `packages/` 下五个可安装、可类型检查的 TS 包骨架
- [x] `apps/*`、`native/*`、`server/` 占位说明
- [x] RFC 流程、模板与本基线 RFC
- [ ] 后续 RFC（编号仅为建议顺序）：
  - `0002` 领域引擎 `@health/core`：自适应 TDEE、趋势去噪、平台期识别
  - `0003` Bridge 协议与 NativeModules 清单
  - `0004` 原生宿主与 Lynx 容器接入
  - `0005` 动态化下发通道（offline-kit / Manifest / 签名）
  - `0006` 数据模型、本地加密存储与云同步
