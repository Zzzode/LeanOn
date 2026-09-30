# Android 宿主（Kotlin）

[English](README.md) · 简体中文

Android 原生壳与 Lynx 运行时容器。

## 职责

- App 壳：启动、单 Activity 导航、生命周期
- Lynx 容器：`LynxView` 创建/复用、通过注入的资源 provider 加载 bundle、路由与模块安全
- 桥服务端：每个能力域的原生模块（见 `@zzzode/bridge` 与 RFC 0005）
- 原生能力：Health Connect、后台任务（`WorkManager`）、通知、相机、蓝牙
- 系统目标：App Widget / Quick Settings Tile、独立 Wear OS 应用

## 目录结构

```
app/src/main/java/com/zzzode/leanon/
├── LeanOnApplication.kt        # 进程初始化、宿主单例
├── MainActivity.kt             # 单 Activity 壳
├── container/                  # LynxContainer 与 BundleResourceProvider
├── bridge/                     # CapabilityRegistry、GlobalEventDispatcher、鉴权、引导
└── modules/                    # Health、Scale、Storage、Resource、App、Notification 模块
```

## 构建

需要 Android SDK（compile/target SDK 35，min SDK 26）与 JDK 17。

```bash
./gradlew :app:assembleDebug
```

Lynx 工件（`org.lynxsdk.lynx:*`）版本在 `gradle/libs.versions.toml` 中固定。

## 状态

原生源为经过评审的骨架，未在项目的 Linux CI 中编译。请在 Android Studio 中构建；资源
provider（RFC 0007）与加密存储（RFC 0008）在后续 RFC 接线。

## 相关 RFC

- RFC 0005 桥协议
- RFC 0006 原生宿主与 Lynx 容器
- RFC 0007 动态化下发
- RFC 0008 数据模型、加密存储与同步
