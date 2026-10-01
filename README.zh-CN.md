<div align="center">

<img src="assets/app-icon.png" width="96" height="96" alt="LeanOn logo" />

# LeanOn

**和爱人一起，记录每日饮食与运动，把健康交给彼此。**

[English](README.md) · 简体中文

[![CI](https://github.com/Zzzode/LeanOn/actions/workflows/ci.yml/badge.svg)](https://github.com/Zzzode/LeanOn/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Zzzode/LeanOn)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](.github/CONTRIBUTING.md)

</div>

## 项目简介

**LeanOn** 是一款为**两个人**（你和你的爱人）打造的个人健康伴侣，用于记录每日饮食、
运动、体重和身体围度，核心目标是**可持续的体重控制与长期健康**，而非短期节食。

名字一语双关：一起变 **Lean（精瘦）**，也能彼此 **Lean On（依靠）**。

## 为什么选择 LeanOn

- **天生为两人设计**——共同目标与挑战，配合隐私分级，让 App 是支持而非监视。
- **几秒完成记录**——AI 拍照记餐、语音/文字速记、条码扫描，以及针对中式家常菜和
  外卖调校的个人食物库。
- **懂你身体的代谢引擎**——用你自己的数据反推真实消耗（而非静态公式），支持平台期
  识别与趋势去噪。
- **UI 可动态化**——页面与卡片基于 [Lynx](https://lynxjs.org) 构建，可远程更新，无需
  等待应用商店发版。
- **健康优先于体重数字**——腰围、体成分、睡眠与非体重成就，陪你走过平台期。

## 功能特性

- 饮食记录：AI 拍照识别、油量与分量估算、条码扫描、外卖订单导入、简记/详记双模式、饮水
- 体重与体成分：智能秤同步、每日称重、体脂/肌肉量、每周围度测量、月度体型照
- 运动活动：步数同步、力量与有氧记录、智能手表接入
- 恢复：睡眠阶段、静息心率/HRV、压力与情绪
- 洞察：今日仪表盘、餐后即时反馈、每周复盘、CBT 小课程、AI 教练、轨迹预测与减重维持期
- 双人：隐私分级、共同与独立目标、点赞互动、共同挑战、共享食谱与家庭餐分食记录

## 技术架构

LeanOn 采用 **Lynx × Native 混合架构**：

- **Lynx** 渲染快速迭代、可动态下发的页面与卡片。
- **Native（Swift / Kotlin）** 掌握健康数据命脉：HealthKit / Health Connect、蓝牙智能秤、
  后台任务、通知、Widget 与手表 App。
- 纯 TypeScript 领域核心（`@zzzode/core`）承载代谢与营养逻辑，端侧与服务端均可复用。

设计决策见 [`rfcs/`](rfcs/)，从
[RFC 0001](rfcs/0001-monorepo-and-tooling.md) 与
[RFC 0002](rfcs/0002-project-naming-and-open-source-governance.md) 开始。

## 目录结构

| 路径 | 说明 |
|---|---|
| `apps/ios` | iOS 原生宿主（Swift） |
| `apps/android` | Android 原生宿主（Kotlin） |
| `packages/core` | 纯 TS 领域引擎（TDEE、趋势、营养） |
| `packages/bridge` | Lynx ↔ Native 通信 |
| `packages/ui` | 设计系统与组件（基于 lynx-ui） |
| `packages/pages` | Lynx 页面 bundle |
| `packages/cards` | 可动态下发的卡片 bundle |
| `native/` | 跨端原生能力 |
| `server/` | Manifest、同步与智能能力后端 |
| `rfcs/` | 设计文档 |

## 快速开始

**环境要求：** Node.js >= 22.13、pnpm >= 11

```bash
corepack enable
pnpm install
pnpm typecheck   # 全部包类型检查
pnpm build       # 构建全部包
```

## 路线图

- [ ] 领域引擎：自适应 TDEE、趋势去噪、平台期识别
- [ ] Bridge 协议与原生模块清单
- [ ] 原生宿主与 Lynx 容器接入
- [ ] 动态化下发通道（Manifest、签名、离线兜底）
- [ ] 数据模型、本地加密存储与云同步

详见 [RFC 0001](rfcs/0001-monorepo-and-tooling.md) 中的 RFC 路线。

## 参与贡献

欢迎贡献！请先阅读[贡献指南](.github/CONTRIBUTING.zh-CN.md)；重大变更需走
[RFC 流程](rfcs/README.md)。

本项目遵循 [Contributor Covenant 行为准则](.github/CODE_OF_CONDUCT.md)。

## 安全问题

报告漏洞请查看[安全策略](.github/SECURITY.md)，使用私密漏洞报告渠道，而非公开 Issue。

## 开源协议

基于 [Apache License 2.0](LICENSE) 开源。

## 致谢

- [Lynx](https://lynxjs.org) —— 跨平台原生 UI 框架
- [lynx-ui](https://lynxjs.org/zh/blog/lynx-ui) —— 官方组件库
