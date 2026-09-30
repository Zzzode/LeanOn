- Start Date: 2026-10-01
- RFC Type: process
- Status: Accepted
- Supersedes: 0001（仅取代其中 `@health/*` 包命名约定）

# 项目命名与开源治理

## Summary

确定项目品牌名为 **LeanOn**，代码仓库托管于个人 GitHub 账号 `Zzzode/LeanOn`，npm 包统一使用
`@zzzode/*` scope，开源协议采用 **Apache License 2.0**，并建立完整的社区健康文件与 CI 基线。

## Motivation

项目决定开源。开源的长期资产首先是**名字与治理结构**：名字决定辨识度与传播，治理文件决定
外部贡献者能否顺畅参与、漏洞如何被负责任地处理。需要在项目早期一次性确定，避免开源后改名
带来链接、文档与包名的迁移成本。

## Guide-level explanation

- 项目对外统一称 **LeanOn**：寓意两人一起变 **lean（精瘦）**，也能彼此 **lean on（依靠）**，
  与 "Lean on me" 的文化意象一致。
- 仓库地址：`https://github.com/Zzzode/LeanOn`。
- 安装 TS 包：`pnpm add @zzzode/core`（npm 用户 `zzzode` 注册后生效）。
- 贡献者入口：README → CONTRIBUTING；重大变更先写 RFC；漏洞走私密报告。

## Reference-level explanation

### 命名可用性核查

- `leanon`：GitHub 上为 2017 年停更的个人组织；npm 上是 2017 年的废弃包，且 npm 官方
  保留该包名（"hanging on to the package name"），无法重新注册。
- 因此品牌名用 LeanOn，但**技术 handle 不占用 `leanon`**：
  - GitHub 仓库放在作者个人账号下：`Zzzode/LeanOn`。
  - npm scope 使用作者 handle：`@zzzode/*`（核查时 `zzzode` 包名空闲）。
- 备选组织名（若未来需要独立组织）：`leanonhq` / `leanon-app`（核查时 npm 均空闲）。

### 包命名映射

| 旧名（RFC 0001） | 新名 |
|---|---|
| `@health/core` | `@zzzode/core` |
| `@health/bridge` | `@zzzode/bridge` |
| `@health/ui` | `@zzzode/ui` |
| `@health/pages` | `@zzzode/pages` |
| `@health/cards` | `@zzzode/cards` |

包的 `package.json` 统一补充 `license`、`author`、`repository`、`homepage`、`bugs`、
`keywords`、`files` 与 `publishConfig`。

### 开源协议

采用 **Apache License 2.0**：

- 与上游 [Lynx](https://lynxjs.org)（Apache-2.0）生态一致。
- 相比 MIT，包含明确的**专利授权与终止条款**，对包含原生端、可能被商业使用的项目更稳妥。
- 根目录提供 `LICENSE` 全文与 `NOTICE`；第三方许可说明见 `docs/licenses.md`。

### 社区与工程文件

- 文档：`README.md`（英文，默认）与 `README.zh-CN.md`（中文），顶部互相链接。
- 贡献：`.github/CONTRIBUTING.md`（英文）与 `CONTRIBUTING.zh-CN.md`（中文）。
- 行为准则：`.github/CODE_OF_CONDUCT.md`（Contributor Covenant 2.1）。
- 安全：`.github/SECURITY.md`，使用 GitHub 私密漏洞报告。
- Issue 模板：bug report / feature request / config（blank issues 关闭）。
- PR 模板、`CODEOWNERS`、`FUNDING.yml`（占位）、`dependabot.yml`。
- CI：`.github/workflows/ci.yml`，在 Node 20 / 22 上执行 install、typecheck、build。
- 其他：`CHANGELOG.md`（Keep a Changelog）、`.gitattributes`、`assets/logo.svg`。

## Drawbacks

- 品牌名（LeanOn）与 npm 名（@zzzode/*）不一致，需要在 README 中明确解释，否则使用者
  初次安装时略有认知成本。
- Apache-2.0 比 MIT 多了 NOTICE 与文件头约定，维护上略繁琐。
- 双语 README / CONTRIBUTING 带来长期双份维护成本。

## Rationale and alternatives

- **MIT**：更简单、更宽松，但缺少专利授权条款；考虑到与 Apache-2.0 的 Lynx 集成及原生端
  分发，选择 Apache-2.0。
- **AGPL**：可强制网络服务开源，但会提高企业与社区使用门槛，不符合本项目定位。
- **npm 扁平包名 `lean-on`**：核查时空闲，但五个包需要多个扁平名且缺少 scope 聚合；
  作者 scope `@zzzode/*` 更清晰，扁平名作为未来需要时的备选。
- **独立 GitHub 组织**：`leanon` / `lean-on` / `leanon-dev` 均被空账号占用；个人账号托管
  对当前阶段最省事，组织化留待项目成熟后再迁移。

## Unresolved questions

- npm 用户 `zzzode` 的实际注册与包发布流程（需作者亲自完成）。
- 是否启用 GitHub Sponsors / FUNDING。
- 是否引入 DCO（Developer Certificate of Origin）检查。
- 未来成立独立组织时的迁移与重定向方案。

## Implementation plan

- [x] 下载并放置 Apache-2.0 `LICENSE` 与 `NOTICE`
- [x] 社区健康文件（CoC、CONTRIBUTING 双语、SECURITY、Issue/PR 模板、CODEOWNERS、FUNDING、dependabot）
- [x] CI 工作流
- [x] 双语 README、Logo、CHANGELOG、`.gitattributes`、`docs/licenses.md`
- [x] 五个包改名为 `@zzzode/*` 并补齐元信息
- [ ] 作者注册 npm 用户并发布首个版本
- [ ] 推送仓库并在 GitHub 设置中开启 Discussions / 私密漏洞报告
