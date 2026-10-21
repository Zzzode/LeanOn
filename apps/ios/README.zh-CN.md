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

宿主已实现本地体重/摄入/运动/饮水、自建及扫码食物增删改、收藏和最近快捷入口。
正式首次启动不复制演示资料或记录，资料和目标在保存前保持未设置。
`records.getSnapshot` 与 `records.mutate` 提供 schema 2 快照及原子、带版本校验的事务。
Lynx 传输为事务使用私有 JSON 信封，避免 SDK 对象转换丢弃请求中值为 null 的属性；原生解码保留显式 null，缺失字段仍接受严格校验。
操作回执使重试幂等；删除墓碑支持撤销和重启后恢复，避免覆盖更新记录。
旧的每日摄入保留为可识别汇总，与逐条饮食记录共同生成每日总量。
读取已存在的旧文件不会提交迁移；损坏文件保留原字节。
只有显式注入的测试种子可以在读取时初始化 QA 文件。
本地午夜、时区变化与回到前台会刷新运行时日历信息。
AVFoundation 扫码、Open Food Facts 查询、HealthKit 和标准 SIG 蓝牙秤均通过桥接接入。
HealthKit 读取体重/运动，按类型写权限导出 LeanOn 体重、运动和八项日营养 quantity。
读取授权始终未知，注入 client 测试不等于物理设备就绪。
UserNotifications 在调度成功后才持久保存提醒，滚动预排28天，在前台/设置/记录变化时刷新。
原生源码可在 macOS 构建和运行 XCTest，但项目的 Linux CI 不编译它们。
动态资源 provider 与加密存储仍是独立 RFC 工作；当前记录文件不声称已加密。
Widget、Live Activity、App Shortcuts 和 watchOS 是计划目标，并非已完成能力。

固定的 Lynx 3.9.0 Pod 归档缺少生成头文件与错误码源码。
`Podfile` 暂存仓库提供的官方生成产物及 iOS 构建配置，使全新安装可重复构建。
来源见 [support 说明](support/README.md)。

## 外观与隔离 UI 检查

设置通过 `app.setAppearance` 持久化 `system`（默认）、`light` 或 `dark`。
窗口外观与共享页面的初始主题在首次 Lynx 挂载之前设置。
`app.appearanceChanged` 同步更新所有已挂载路由、原生界面与输入键盘。
原生底栏保留形态与动效，仅为深色背景适配选中颜色。
命名启动背景跟随系统外观。
应用显式外观与系统相反时，系统启动画面到应用仍可能发生颜色过渡。

运行 `LeanOnTests` 或 `LeanOnUITests` 前，构建页面 bundle、重新生成项目并安装本地 Pods。
UI 测试使用 `LEANON_RECORDS_PATH` 与独立 QA 偏好，避免修改正常记录和偏好。
日常记录 UI QA 还必须使用独立 `com.zzzode.leanon.uiqa` 应用构建覆盖，不得为此安装或启动正常应用。
无需权限的记录 QA 不设置通知批准开关，遇到任何非预期系统权限弹窗即中止。
仅 Debug 且设置了隔离记录路径时，才接受 `LEANON_QA_NOW` 与 `LEANON_QA_TIME_ZONE`。
可丢弃的 `com.zzzode.leanon.uiqa` 应用还支持配对的 `LEANON_QA_CLOCK_PATH`，其值必须等于 `LEANON_RECORDS_PATH + ".clock.json"`，且记录路径限定为 `/tmp/leanon-daily-ui-*` 隔离文件。
JSON 文件必须包含 ISO 时间戳 `now` 与已知时区 `timeZone`；文件无效时回退到实际系统时钟与日历。
此流程验证受控的前台日期切换，不更改系统时钟，也不代表已自然等待到午夜。
基础记录测试覆盖实际表单取消/创建/编辑/删除/重启和饮水写入失败恢复。
健康状态 UI 测试仅查询状态，不申请授权、开启同步或读取系统样本。
应用宿主单测也应通过隔离 `.xctestrun` 环境运行 `test-without-building`。
前台系统外观切换测试通过测试运行器环境 `LEANON_SYSTEM_UI_TESTS=1` 显式启用。
外部模拟器控制器读取 `/tmp/leanon-theme-ios-system-step.txt`，按 `await-*` 标记切换外观，并以 `keyboard-dark-sent` 或 `keyboard-light-sent` 确认键盘阶段。
没有控制器时不设置此环境变量，测试会跳过。

实际系统权限授予必须先得到用户明确批准，隔离 `.uiqa` 应用也不例外。
通知权限 QA 必须只为应用目标设置 `LEANON_APP_BUNDLE_IDENTIFIER=com.zzzode.leanon.uiqa`，并使用独立 DerivedData 目录。
仅在获得该批准后，才可同时为测试运行器设置 `LEANON_NOTIFICATION_QA=1` 和 `LEANON_NOTIFICATION_QA_APPROVED=1`；否则测试会在启动应用或申请权限前跳过。
不得为 QA 授予正常应用权限；获批实验结束后仅卸载 `.uiqa`，清除它自己的待发通知与权限。

## 相关 RFC

- RFC 0005 桥协议
- RFC 0006 原生宿主与 Lynx 容器
- RFC 0007 动态化下发
- RFC 0008 数据模型、加密存储与同步
- RFC 0031 平台能力对齐
