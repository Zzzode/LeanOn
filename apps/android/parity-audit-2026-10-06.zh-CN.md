# Android 平台对齐审查 — 2026-10-06

[English](parity-audit-2026-10-06.md)

本轮开始前，Android 已有饮水、食物管理、扫码、提醒、Health Connect 和 BLE 实现。
iOS 初始仅声明体重、饮食汇总、运动和应用外壳方法；其他 owner 正在补齐平台对应实现。
能力声明或源码存在不能替代设备与硬件验收。
本轮没有删除 Android 已实现功能来迎合 iOS 占位。

## 能力与证据

Android 行号路径均相对于 `app/src/main/java/com/zzzode/leanon/`。

| 能力 | Android 实现与持久化 | 初始 iOS 差异／当前集成 | 验证边界 |
|---|---|---|---|
| 体重、饮食汇总、运动 CRUD | `modules/HealthModule.kt:36`、`:59`、`:255`；`data/RecordsRepository.kt:116`、`:148`、`:246` | iOS 已有基础实现；现统一真实日期、有限数字、体重 20–300 kg、运动 1–1440 分钟，保留小数时长 | JVM 校验与存储测试；未声称人工保存／Back 通过 |
| 饮水日总量 | `HealthModule.kt:106`；`RecordsRepository.kt:213` 按日覆盖绝对总量，允许零 | 初始 iOS 缺失，owner 已补 RPC／存储路径 | 真实 Android 临时文件覆盖／重开通过；实际明暗截图可见饮水控件 |
| 自定义／扫码食物 CRUD | `HealthModule.kt:140`、`:168`、`:196`、`:213`；`RecordsRepository.kt:394`、`:472`、`:531` | 初始 iOS 缺失，owner 补齐对应方法 | Android 创建／编辑／重开／删除通过；扫码身份保留与内置来源保护经 JVM 验证 |
| 收藏与最近 | `HealthModule.kt:122`；`RecordsRepository.kt:563`、`:588`、`:602` | 初始 iOS 缺失，owner 补齐索引 | 收藏幂等、未知 ID、最近排序／去重／上限 12、删除清理测试；设备临时文件检查通过 |
| 扫码与产品查询 | `modules/ScannerModule.kt:27`；`scanner/BarcodeScanActivity.kt:36`；`net/OpenFoodFactsClient.kt:16` | 初始 iOS 缺失，另一个 owner 补 AVFoundation／OFF | 已审查相机权限、取消和错误回调；本轮没有真实相机／条码／网络验收 |
| 每日提醒 | `NotificationModule.kt:39`、`:49`、`:78`；`SettingsRepository.kt:25`、`:42`；`ReminderScheduler.kt:26`、`:32` | 初始 iOS 为 TODO，root 补原生提醒 | 保留 WorkManager 与通知权限路径；决策／时间校验经 JVM 验证；通知投递未实测 |
| 平台健康集成 | `HealthConnectModule.kt:37`、`:59`、`:78`、`:106`；`HealthConnectManager.kt:52`、`:59`、`:87` | HealthKit 是平台对应能力，不能伪装为 Health Connect；iOS owner 补 adapter | 权限／状态／同步代码审查；导出失败、时间戳时序、镜像回流抑制经 JVM 验证；真实授权／同步未测 |
| 标准 BLE 秤 | `ScaleModule.kt:25`；`BleScaleManager.kt:66`、`:264`；`BlePermissions.kt:17` | 初始 iOS 为 TODO，owner 补 CoreBluetooth | 保留标准服务／测量；解析、回调 gate、当前连接 CCCD ACK 规则测试；无实体秤验收 |
| 通用存储／资源／健康 samples | `CapabilityRegistry.kt:10`；`StorageModule.kt:13`；`ResourceModule.kt:14`；`HealthModule.kt:22`、`:27` | 两端都未完成，不能与记录持久化或平台 adapter 混淆 | 修正虚假声明：未实现方法不再广告支持，直接调用明确返回 `unavailable` |

## 已修问题

- `modules/RecordRequest.kt:11` 先验证 Lynx 实际类型，接受 SDK `Number`／`Int`／`Long`；空 ID、非规范／不存在日期、null 营养、伪装数字的布尔值、非有限／负数、提醒小数时间返回 `invalid-request`。
- `data/AtomicRecordsFile.kt:9` 同目录临时文件写完并 sync 后原子替换，仓库串行执行读改写。
- `RecordsRepository.kt:498` 编辑扫码食物保留 source／barcode；仅允许 custom／OFF 条目编辑删除，并清理两种索引。
- `data/CurrentSnapshot.kt:10` 按本地时钟衍生 today／todayHour／streak，不写回元数据或健康记录。
  streak 使用体重／饮食／运动／饮水正值记录日期并集，包含健康镜像；今天有记录从今天算，否则仍可从昨天算，遇断日停止。
- `navigation/LynxContainerFragment.kt:107` 初始化当前快照与 `platform: android`；`MainActivity.kt:221` 前台／QA 时钟变更刷新，BLE 与提醒使用当前日期。
- `HealthConnectManager.kt:53` 如实报告导出失败；`:92` 仅导入与导出均成功才更新时间戳；分页读取，外部镜像不冒充 LeanOn 记录再次导出。
- `bridge/PendingRequest.kt:4` 阻止并发权限／扫码／RPC 覆盖旧回调；健康后台事件回到主线程派发。
- BLE RPC 等待者归 process manager 所有，新 Lynx 模块事件 sink 可完成原调用；配对／ready 等到对应 CCCD 成功 ACK。
- 相机拒权为 `not-authorized`，相机／启动失败为 `unavailable`，真正用户取消为 `cancelled`。

## 首批验证与准确构建

`JAVA_HOME=temurin17 ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:assembleDebugAndroidTest -PleanonUiQa=true -x :app:prepareLynxAssets` 通过。
88 个 JVM 测试，零失败／错误／跳过；日志 `/tmp/leanon-android-parity-build.log`。
`git diff --check -- apps/android` 通过。

官方 platform instrumentation 在 Android 15 `sdk_gphone64_arm64`、`emulator-5554`、1080 × 2400 上运行，只允许 `com.zzzode.leanon.uiqa`。
7 项真实原生临时文件检查通过：饮水覆盖／重开、自定义编辑／默认克数清除／重开、收藏幂等、最近排序／去重／上限、删除清理、跨午夜且不改记录、应用记录文件未变。
写入仅在 cache 临时目录，使用打包演示 seed。
既有 QA `files/records.json` 前后 hash 均为 `bf2eb866a8d4011f4329d5f50eee9b587c8821c969606172cae4dd8b208c088b`。

实际 APK 内 bundle SHA256 为 `fd1f1ceb7ff182eac340b798109fb42ee3139c99332a8e1525f96a43c4ee55b8`。
APK SHA256 为 `6aa9c863864d6ca00f23c151a5e02c11c6d4daa713236a4b5746363440f45995`。
构建来自 dirty `main`／HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`，不能当成干净 HEAD 构建。
实际截图 `today-light.png`（13:54:01 UTC）、`today-dark.png`（13:54:05 UTC），显式 QA clock 为 `2026-10-01T19:00:00+08:00`。
随后真实时钟冷启动显示 10 月 6 日、未记录饮食和饮水 0；`today-real-clock.png` 采于 13:58:58 UTC。
QA 时钟和外观均恢复 `system`，记录文件 hash 仍未变。
完整证据、图片 hash、原生临时数据快照在 `/tmp/leanon-android-parity-qa/evidence-manifest.json`。

合法 accessibility 查找／点击 `记录饮食` 未找到节点，返回 false。
所以本轮**不能宣称**自定义表单打开、输入、保存／取消／Back、键盘或饮水按钮实际写入通过。
可见饮水控件与存储验证是分开的证据。
真实扫码、通知、Health Connect、BLE 权限及硬件流程仍待设备验收。
在上述首批构建中，提醒／Health Connect 偏好仍用 SharedPreferences 异步 `apply`；下述可靠性批次已替换该路径。
没有输入工具绕行、生产记录／资料修改、服务发布、提交或推送。

## 最终可靠性批次

上述旧构建 hash 与 88／7 结果保留为历史证据，不重新标记为最终构建。
最终冻结原生源码通过 **119 个 JVM 测试**，零失败／错误／跳过；同一隔离 Android 15 应用通过 **15 项官方设备临时文件检查**。
日志／结果为 `/tmp/leanon-android-durability-qa/native-unit-results.json`、`native-unit-build.log`、`native-instrumentation.json`。

- `data/SettingsRepository.kt:17` 原子保存私有设置快照，首次成功写入导入旧偏好，保留损坏文件，读写失败明确抛错。
- `NotificationModule.kt:49` 启用前检查通知授权，区分 `invalid-request`、`not-authorized`、`unavailable`；`ReminderScheduler.kt:32` 等待两个 WorkManager 操作确认。
  `ReminderSettingsUpdate.kt:4` 调度部分失败后尽力恢复旧偏好和任务，保持失败结果。
- `HealthConnectModule.kt:78` 要求平台支持、完整权限、设置持久化和首次同步成功；状态／同步／数据读取 IO 错误仅返回一次失败。
  启用失败恢复偏好，不代表撤销健康平台已经完成的合法导入或导出。
- `HealthConnectManager.kt:59` 串行执行快照／版本预留／插入，使用 `HealthConnectExportLedger.kt:18` 在平台插入前持久化 mapper 指纹版本。
  初始版本 2 覆盖旧固定版本 1；相同内容重试不变，每次编辑递增，改回旧内容也递增。
  `HealthConnectMappers.kt:156` 只对明确导出字段生成指纹，不受无关 JSON 排序或 metadata 干扰。
- `LeanOnApplication.kt:80`、`MainActivity.kt:249`、`ReminderWorker.kt:24`、`HealthConnectManager.kt:78` 处理设置 IO 错误，不覆盖损坏文件，也不把成功本地记录写入变成适配器失败。

最终包内 bundle SHA256 为 `5e00a89740d78d17ce0dfcaad708a78396f50911725275f13e5afb338cb6a583`。
APK SHA256 为 `056b4d8d327ec771252e35b2a27ce59a0f6e412dc704b1d6f022c42f20f2e0bc`。
ZIP 字节检查发现 Gradle 资产合并缓存未更新，已在安装前修复，日志为 `asset-cache-repair.log`。
最终 Today 明／暗原生截图采于 14:39:14／14:39:19 UTC；14:40:08 UTC 的真实时钟截图显示 10 月 6 日、尚未记录饮食及饮水 0。
三张均实际查看；QA 外观与时钟恢复 system。
应用记录仍为原 `bf2eb866...208c088b` hash；应用设置／版本账本／旧偏好文件前后均不存在，测试写入仅在 cache 临时文件。
完整准确 hash、时间、检查与路径在 `/tmp/leanon-android-durability-qa/evidence-manifest.json`。
15 项检查覆盖原子设置迁移／重开／失败保留、持久导出版本／重试／失败阻止提交，以及真实 SDK metadata 构造，并包含原先七项存储场景。
没有真实健康平台插入、权限授予、通知投递或 BLE 硬件操作。
Accessibility 仍未找到饮食按钮节点，未执行点击；表单／保存／键盘／Back 验收仍未完成。

## 个人日常记录闭环——最终原生及共享包

最终每日记录原生源码通过 26 个 suite 的 154 个 JVM 测试，零失败／错误／跳过，并通过 release Kotlin 编译。
共同 worked fixture 独立通过十次成功操作和三个预期失败；这是仓库一致性检查，不是 UI 手势。
正式首次安装为空，不复制演示健康数据。
只读旧数据迁移、原子版本／回执／删除快照、严格空值 RPC 传输和损坏保护分别实现于 `data/DailyRecordsSchema.kt`、`data/DailyRecordsMutation.kt`、`data/RecordsRepository.kt` 和 `modules/RecordsModule.kt`。

最终真实设备证据为 `/tmp/leanon-android-daily-recovery-qa/evidence-manifest.json`，设备 emulator-5554／Android 15 API 35／1080×2400／zh-CN／Asia/Shanghai。
内嵌 bundle SHA-256 为 `23593dc3f5eecd295b451d9068aa33d5a3f550d62dceb1961e2b7dc071b636e1`；不可变 QA APK SHA-256 为 `35dd007aff2e99630a1dd23995ea25c9911cb144570bd495cdc588d26986399f`。
官方 Instrumentation／UiAutomation 手势只操作 `com.zzzode.leanon.uiqa` 中一次性 `cache/daily-ui/records.json` 仓库。
实际设置取消／保存、10 月 5 日餐食补录／编辑／删除取消／删除／Undo、体重 71→72 kg、饮水 750→500 ml、散步 30→45 分钟均通过。
应用内部注入时钟改为 10 月 7 日并切换深色模式时，10 月 5 日草稿日期保持固定。
明确 force-stop 后，新 PID 重开版本 13，实际恢复按钮在版本 14 恢复原运动 ID。

受控缓存损坏读取失败时，175 g 餐食草稿在连续前台 88.13 秒期间保持打开。
恢复原始字节后，同一弹层直接保存成功，没有回首页或自动重设版本。
第二次有界失败检查在滚动表单后看见红色保存失败反馈；初始视口不显示反馈，仍是 P1 可发现性限制。
未把隐藏全局刷新提示声称为视觉已观察。

原隔离 `files/records.json` 字节保持一致（`bf2eb866a8d4011f4329d5f50eee9b587c8821c969606172cae4dd8b208c088b`）；未访问或修改正式记录。
清理仅把 QA 应用外观偏好及内部时钟 override 恢复系统行为，然后停止 QA 应用；没有改 OS 时间、时区或权限。
自然前台午夜、真实健康平台／硬件／通知，以及最终包体重／饮水分别删除手势仍不在本次 UI 验收内。
旧数据、冲突、资格筛查边界有原生／一致性覆盖，不能概括成全部 UI 通过。
早期 98f 失败诊断、366 成功 checkpoint 和 827 checkpoint 保留各自哈希，没有重新标为最终 235 证据。
