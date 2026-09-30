- Start Date: 2026-10-01
- RFC Type: process
- Status: Accepted
- Supersedes: 0001（TypeScript / 构建工具基线部分）
- Related: 0002

# 文档规范、TypeScript 7 与基于 Rspack 的构建

[English](0003-docs-typescript7-build-system.md) · 简体中文

## Summary

确立三项工程规范：

1. **英文为默认文档语言**；中文翻译在文件扩展名前使用 `.zh-CN` 后缀，覆盖 README、RFC
   及所有其他文档。
2. 代码库为 **strict TypeScript 7** 工程。
3. 以 **Rspack 生态**为构建标准：TS 库用 **Rslib**，Lynx 页面/卡片用 **Rspeedy**，任何
   web 风格应用用 Rsbuild。

根目录 **`AGENTS.md`** 成为开发者与编码助手共同遵循的权威指南。

## Motivation

- 仓库开源、面向国际受众；明确的语言策略可避免中英文文档混杂，并通过统一后缀让译文易于
  发现。
- TypeScript 7 是当前主版本，内置 Rslib 所使用的高速 `tsgo` 声明管线；尽早统一可避免编译器
  版本混用。
- 团队已确定使用 Lynx。Lynx 自有工具链（Rspeedy）与库工具（Rslib）都基于 Rspack，统一该生态
  可获得一致、高速的打包模型，而不是每个包各自选择 `tsc`/`tsup`。

## Guide-level explanation

- 所有新文档默认用英文并按常规命名；中文版本命名为 `<名>.zh-CN.md`，并在顶部互相链接。
- 代码、标识符与注释均使用英文。
- 库通过 `rslib build` 构建，产出 `dist/index.js` 与 `dist/index.d.ts`。
- 真实 Lynx 页面出现后，由 Rspeedy 构建。
- `AGENTS.md` 是贡献者或助手阅读的第一个文件，汇总上述规则。

## Reference-level explanation

### 文档语言策略

- 默认（英文）文件沿用常规命名：`README.md`、`0004-domain-engine.md`、`CONTRIBUTING.md`。
- 中文翻译在扩展名前插入 `.zh-CN`：`README.zh-CN.md`、`0004-domain-engine.zh-CN.md`、
  `CONTRIBUTING.zh-CN.md`。
- 该规则适用于所有目录，包括 `rfcs/`。
- 语言变体在顶部互相链接，并在同一 PR 中一起更新。
- 中文贡献指南位于 `.github/CONTRIBUTING.zh-CN.md`，与英文 `.github/CONTRIBUTING.md` 并列。

### TypeScript 7 基线

- `typescript` 锁定 7.x 主线；所有包 `extend` 根 `tsconfig.base.json`。
- 共享选项：`strict`、`noUncheckedIndexedAccess`、`isolatedModules`、`verbatimModuleSyntax`、
  `module: ESNext`、`moduleResolution: Bundler`。
- 使用命名导出；避免 `any`；`packages/core` 不引入 UI 与原生依赖。

### 构建系统

Rspack 是底层打包器，场景化工具位于其上：

| 目标 | 工具 | 命令 | 产物 |
|---|---|---|---|
| 库（`core`、`bridge`、`ui`） | Rslib（`@rslib/core`） | `rslib build` | ESM + `.d.ts`（经 `tsgo`） |
| Lynx 页面与卡片（`pages`、`cards`） | Rspeedy（`@lynx-js/rspeedy`） | `rspeedy build` | Lynx bundle |
| Web 风格应用（如需要） | Rsbuild（`@rsbuild/core`） | `rsbuild build` | web 资源 |

- 每个库有 `rslib.config.ts`，含单一 ESM `lib` 条目并设置 `dts: true`。
- `pages`、`cards` 现阶段以 `tsc` 占位，首个真实 Lynx 页面出现时切换 Rspeedy。
- 类型检查是独立的 `tsc --noEmit` 步骤；不依赖打包器做类型。

### AGENTS.md

根 `AGENTS.md` 汇总项目概述、布局、文档、TypeScript、构建、monorepo、RFC、提交与健康红线等
约定，并与这些 RFC 保持同步。

## Drawbacks

- 维护中英双语文档增加成本，缺少译者时可能出现内容漂移。
- TypeScript 7 / `tsgo` 较新，部分第三方类型生态可能滞后于大版本。
- Rslib 1.0 较新（2026 年 9 月），长期稳定性不如原始 `tsc` 经过验证。

## Rationale and alternatives

- **中文默认或中英混排**：对两位作者门槛更低，但不利于开源受众；否决，改为英文默认加明确的
  中文变体。
- **停留在 TypeScript 5**：稳定，但错过 `tsgo` 性能与当前主线；否决。
- **库仅用 `tsc` 构建**：最简单，但缺少打包/格式控制，且与基于 Rspack 的 Lynx 工具链割裂；
  Rslib 是 Rspack 团队的专用方案，优先采用。
- **直接用 Rsbuild library mode**：已被 Rslib 取代——Rslib 专为库设计并内置 dts 插件。

## Unresolved questions

- 源码满足隔离声明后，是否启用 Rslib 更快的 `dts.isolated` 模式。
- Lynx 页面落地时 Rspeedy 插件与版本锁定的具体选择。
- Lint/format 工具链（Biome 与 ESLint + Prettier 之争）及 Rstest 的推广。

## Implementation plan

- [x] 新增根 `AGENTS.md`
- [x] 升级 `typescript` 至 7.x 并验证所有包
- [x] 安装 Rslib，为 `core`、`bridge`、`ui` 添加 `rslib.config.ts` 并切换脚本
- [x] 所有文档改为英文默认并提供 `.zh-CN.md` 变体
- [x] 中文贡献指南移至 `.github/`
- [ ] 首个真实 Lynx 页面时为 `pages`/`cards` 接入 Rspeedy
- [ ] 引入 Rstest 与 lint/format 工具链
