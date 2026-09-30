# iOS 宿主（Swift）

[English](README.md) · 简体中文

iOS 原生壳与 Lynx 运行时容器。

## 职责

- App 壳：启动、单容器导航、生命周期
- Lynx 容器：承载 `LynxView`、通过注入的资源 provider 加载 bundle、路由与模块安全
- 桥服务端：每个能力域的原生模块（见 `@zzzode/bridge` 与 RFC 0005）
- 原生能力：HealthKit、后台任务、通知、相机、蓝牙
- 系统目标：Widget / Live Activity / App Shortcuts、独立 watchOS 应用

## 目录结构

```
LeanOn/
├── App/                        # AppDelegate、SceneDelegate
├── Container/                  # LynxContainerViewController、BundleResourceProvider
├── Bridge/                     # CapabilityRegistry、GlobalEventDispatcher、LynxRuntime
└── Modules/                    # App、Health、Scale、Storage、Resource、Notification 模块
```

## 构建

Xcode 工程通过 [XcodeGen](https://github.com/yonaskolb/XcodeGen) 生成，不提交。需要 macOS、
Xcode 与 iOS 15+。

```bash
brew install xcodegen
xcodegen generate
open LeanOn.xcodeproj
```

Lynx 通过 CocoaPods 或 Swift package 接入，使用固定的 3.9.x 版本（见 `project.yml`）。

## 状态

原生源为经过评审的骨架，未在项目的 Linux CI 中编译。请在 Xcode 中构建；资源 provider
（RFC 0007）与加密存储（RFC 0008）在后续 RFC 接线。

## 相关 RFC

- RFC 0005 桥协议
- RFC 0006 原生宿主与 Lynx 容器
- RFC 0007 动态化下发
- RFC 0008 数据模型、加密存储与同步
