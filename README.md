# health-app（工作名）

面向两人（本人与爱人）的每日饮食与运动健康管理 App，核心目标是**体重控制与长期健康，尤其是减重成功且不反弹**。

技术方向：**Lynx × Native 混合架构**——Lynx 负责可动态化下发的页面与卡片，Native 负责健康数据采集、蓝牙、后台任务与系统能力。

## 快速开始

```bash
# 环境：Node >= 20，pnpm >= 9（推荐 corepack enable）
pnpm install
pnpm typecheck   # 全部包类型检查
pnpm build       # 构建全部包
```

## 目录结构

| 路径 | 说明 |
|---|---|
| `apps/ios` | iOS 原生宿主（Swift） |
| `apps/android` | Android 原生宿主（Kotlin） |
| `packages/core` | 纯 TS 领域引擎（TDEE / 趋势 / 营养） |
| `packages/bridge` | Lynx ↔ Native 通信封装 |
| `packages/ui` | 设计系统与组件（基于 lynx-ui） |
| `packages/pages` | Lynx 页面 bundle |
| `packages/cards` | 可动态下发的卡片 bundle |
| `native/` | 跨端原生能力（health-adapter / ble-scale / offline-kit） |
| `server/` | Manifest、同步与智能能力后端 |
| `rfcs/` | 设计决策文档（RFC） |

## 设计流程

所有重要设计以 **RFC** 推进，流程与模板见 [`rfcs/README.md`](./rfcs/README.md)。
当前基线：[RFC 0001 Monorepo 结构与工程基线](./rfcs/0001-monorepo-and-tooling.md)。

## 当前状态

- [x] pnpm workspace 与 TS 基线
- [x] 五个 TS 包骨架（可安装、可类型检查）
- [x] RFC 机制与基线 RFC
- [ ] 领域引擎、Bridge、Lynx 接入、动态化、云同步（见 RFC 0001 的路线图）
