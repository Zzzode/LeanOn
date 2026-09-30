# 为 LeanOn 做贡献

[English](CONTRIBUTING.md) · 简体中文

感谢你关注 LeanOn！你可以通过很多方式参与：提交 Bug、提出功能建议、改进文档、编写 RFC
或贡献代码。

## 基本准则

- 保持友善与尊重。参与本项目即表示你同意遵守[行为准则](.github/CODE_OF_CONDUCT.md)。
- 讨论请保持建设性、聚焦主题。

## 开发环境

**环境要求：** Node.js >= 22.13、pnpm >= 11（可通过 `corepack enable` 启用）。

```bash
git clone https://github.com/Zzzode/LeanOn.git
cd LeanOn
pnpm install
pnpm typecheck
pnpm build
```

常用命令：

| 命令 | 说明 |
|---|---|
| `pnpm typecheck` | 对所有 workspace 包做类型检查 |
| `pnpm build` | 构建所有包 |
| `pnpm test` | 运行包测试 |
| `pnpm --filter <包名> <脚本>` | 在单个包内运行脚本 |

## 仓库布局

本仓库是 pnpm workspace monorepo：TypeScript 包位于 `packages/*`，原生宿主位于 `apps/*`，
跨端原生能力位于 `native/*`，后端代码位于 `server/`。完整结构见 [README](README.zh-CN.md)。

## 编码约定

- 必须使用 TypeScript **严格模式**（含 `noUncheckedIndexedAccess`）。
- 优先使用纯的、类型完善的函数；领域核心（`packages/core`）不得引入 UI 与原生依赖。
- 所有原生访问经 `packages/bridge` 收敛，页面与卡片不直接调用原生模块。
- 格式遵循 [EditorConfig](.editorconfig)，统一 LF 行尾。
- 行为变更请尽量补充测试。

## 提交变更

1. Fork 仓库并创建分支：`feat/<简述>`、`fix/<简述>`、`docs/<简述>`。
2. 提交信息请遵循 [Conventional Commits](https://www.conventionalcommits.org/)，
   如 `feat(core): ...`。
3. 确保 `pnpm typecheck` 与 `pnpm build` 通过。
4. 发起 Pull Request 并填写模板，关联相关 Issue。

## RFC 流程

架构、公开 API 或新核心能力等重大变更，需在实施前通过 **RFC** 设计。请阅读
[RFC 指南](rfcs/README.md)并使用[模板](rfcs/0000-template.md)。

## 报告问题

- Bug 与功能建议：使用对应的 Issue 模板。
- 安全漏洞：遵循[安全策略](.github/SECURITY.md)，私下报告。

## 许可

提交贡献即表示你同意项目按 [Apache License 2.0](LICENSE) 授权你的贡献。新增依赖必须与
Apache-2.0 兼容（见 `docs/licenses.md`）。
