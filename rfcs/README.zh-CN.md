# RFC 流程

本仓库的所有重要设计决策都通过 **RFC（Request for Comments）** 沉淀。RFC 是一份简短的设计文档，描述一个变更、它的动机、技术方案、备选方案与未决问题。

## 什么时候需要 RFC

需要：

- 影响整体架构或跨模块协作的决策（如 Lynx 容器方案、Bridge 协议、数据同步策略）
- 引入新的技术栈、依赖或工程约定
- 新的核心业务能力（如自适应 TDEE 引擎、动态化下发通道）
- 事后发现"如果当时记录下来就不会踩坑"的决策

不需要：

- 单模块内部的实现细节、重命名、格式调整
- Bug 修复、依赖升级
- 代码能直接表达清楚的小改动（拿不准就先写，成本很低）

## 流程

1. **复制模板**：从 `0000-template.md` 复制，编号取下一个四位序号，文件名形如 `0002-adaptive-tdee.md`。
2. **填写并提交**：新建分支 `rfc/<编号>-<短名>`，提交后发起 Merge/Pull Request；只有两个人时，直接在 PR 评论区讨论即可。
3. **讨论与修改**：根据反馈迭代文档。
4. **合并即 Accepted**：讨论收敛、两人无阻塞异议后合并，状态改为 `Accepted`。
5. **实施**：代码落地完成后状态改为 `Implemented`，并在 RFC 末尾补记实际实现与偏差。

## 状态

| 状态 | 含义 |
|---|---|
| `Proposed` | 已提出，讨论中 |
| `Accepted` | 已达成一致，待实施或实施中 |
| `Implemented` | 已在代码中落地 |
| `Rejected` | 经讨论不采纳（文档保留以记录原因） |
| `Withdrawn` | 提出者撤回 |
| `Superseded` | 被更新的 RFC 取代，头部注明取代关系 |

## 约定

- 编号一旦使用不复用、不重排。
- RFC 是**历史文档**：合并后不原地改写结论；需求变化用新 RFC 取代旧 RFC。
- 保持简短：能讲清决策即可，避免堆砌。
- 文档默认英文；若提供中文翻译，使用同名并加 `.zh-CN` 后缀（见 `AGENTS.md`）。

## RFC 索引

| # | 标题 | 状态 |
|---|---|---|
| [0001](0001-monorepo-and-tooling.md) | Monorepo 基线与工具链 | Accepted |
| [0002](0002-project-naming-and-open-source-governance.md) | 项目命名与开源治理 | Accepted |
| [0003](0003-docs-typescript7-build-system.md) | 文档、TypeScript 7 与构建系统 | Accepted |
| [0004](0004-core-domain-engine.md) | Core 领域引擎 | Accepted |
| [0005](0005-typed-bridge.md) | 类型化 Lynx ↔ Native 桥 | Accepted |
| [0006](0006-native-host-and-container.md) | 原生宿主与 Lynx 容器 | Accepted |
| [0007](0007-dynamic-delivery.md) | 动态化下发 | Accepted |
