# Android 宿主（Kotlin）

App 的 Android 原生壳与 Lynx 运行容器。

## 规划职责

- App Shell：启动、导航/Tab、登录鉴权
- Lynx 容器：`LynxView` 创建与池化、生命周期、`LynxResourceProvider` 注入
- Bridge 的 Android 实现（见 `@health/bridge` 与 RFC 0003）
- 原生能力：Health Connect、后台任务（WorkManager）、通知、相机、蓝牙
- 系统目标：App Widget / Quick Settings Tile、Wear OS 独立 App

## 相关 RFC

- RFC 0003 Bridge 协议
- RFC 0004 原生宿主与 Lynx 容器接入
- RFC 0005 动态化下发通道
