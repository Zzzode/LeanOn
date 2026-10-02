# RFC 0021 — Health Connect 导出

- 状态：Accepted
- 创建：2026-10-02
- 相关：RFC 0010（记录写入路径）、RFC 0017（运动）、RFC 0020（提醒）

## 摘要

为 Android **Health Connect** 增加可选的单向集成，把 LeanOn 的体重、营养和运动记录导出到系统健康数据层。用户在 App 内入口开启、授予 Health Connect 权限后，LeanOn 先做一次历史回填（backfill），随后让新增记录保持同步。每条导出记录都带稳定的 `clientRecordId`，使重复导出幂等。该能力完全是附加的：当 Health Connect 不可用或被关闭时，LeanOn 行为与之前完全一致。本版本不回读任何数据。

## 动机

- Health Connect 是 Android 的系统级健康数据层（Android 14 起内置，更早版本可安装对应 App）。一个专业的健康 App 不应是信息孤岛——用户期望体重、饮食和运动与其他 App、可穿戴设备一起呈现。
- 导出让 LeanOn 数据出现在 Health Connect 界面及合作 App（Samsung Health、类 Google Fit 界面等）中，提升信任度与数据可迁移性。
- LeanOn 已在原生侧持久化每次写入，天然是发布数据的权威来源。

## 目标

1. 检测 Health Connect 是否可用，并给出清晰的连接/开启入口。
2. 通过平台契约请求 Health Connect 写入权限。
3. 导出**体重**、**营养**（能量 + 蛋白/碳水/脂肪）与**运动**记录，开启时历史回填、之后增量同步。
4. 导出幂等：重跑回填或重复导出同一天不得产生重复记录。
5. 完全离线，且绝不让记录写入路径被 Health Connect 阻塞。

## 非目标

- 本版本不做从 Health Connect 读取/导入（合并、去重与冲突处理需另立 RFC）。
- 不做双向同步、逐字段冲突解决，以及蛋白/碳水/脂肪之外的水/微量营养素同步。
- 不做 iOS（HealthKit）——平行设计，在 macOS 上实现。
- 不做独立于用户写入的后台同步；导出发生在开启时（回填）以及每次记录的当下。停用期间产生的增量改动，在重新开启时通过重新回填来对齐。

## 设计

### 可用性

- 依赖：`androidx.health.connect:connect-client:1.1.0`（稳定版）。
- `HealthConnectClient.getSdkStatus(context)` 无需运行中的 client 即可报告可用性；`SDK_AVAILABLE` 表示平台/App 已就绪。该状态驱动 UI 中的 `supported`。

### 桥接契约

- `healthConnect.getStatus`：`void` →
  `{ supported: boolean; enabled: boolean; permissionsGranted: boolean }`
- `healthConnect.requestPermission`：`void` → `{ granted: boolean }`
- `healthConnect.setEnabled`：`{ enabled: boolean }` →
  `{ success: boolean }`

`enabled` 持久化在现有设置 prefs（`leanon_settings`）中，不进 HostData。

### 权限

本版本仅申请写入范围：

- `android.permission.health.WRITE_WEIGHT`
- `android.permission.health.WRITE_NUTRITION`
- `android.permission.health.WRITE_EXERCISE`

权限通过 `PermissionController.createRequestPermissionResultContract()` 从 `MainActivity` 发起；结果经一个持有者回传（与通知相同的“命令到 Activity”桥接），走专用请求路径。Manifest 声明这些权限、Health Connect 包的 `<queries>`，以及平台要求的权限说明 activity / Android 14 alias。

### 记录映射与幂等

每条导出记录由纯映射函数构建，并携带：

```kotlin
Metadata(
  clientRecordId = ...,
  clientRecordVersion = 1,
)
```

稳定 id 让重复的 `insertRecords` 解析到同一条逻辑记录而非重复：

- 体重：每个记录日期一条 `WeightRecord`——
  `clientRecordId = "leanon-weight-$date"`，`weight = Mass.kilograms(kg)`，
  时间取该日期的固定本地时刻。
- 营养：每个记录日期一条 `NutritionRecord`（多餐已累加为每日总量）——
  `clientRecordId = "leanon-nutrition-$date"`，
  `energy = Energy.kilocalorie(kcal)`，
  `protein/carbsTotalFat = Mass.grams(...)`。
- 运动：每个运动样本一条 `ExerciseSessionRecord`——
  `clientRecordId = "leanon-exercise-${sample.id}"`，标题取本地化运动名，
  `exerciseType` 由类型 id 映射到存在的 Health Connect `ExerciseType` 常量
  （否则用 `EXERCISE_TYPE_OTHER_WORKOUT`），起止由时长在每日固定时刻推导。

映射函数基于 LeanOn 的 JSON 数据，是纯 Kotlin，做 JVM 单测；只有
`insertRecords` 调用会接触运行中的 client。

### 同步时机

- 开启时（权限授予后）：从 `RecordsRepository.loadHostData()` 构建全部体重/营养/运动记录，批量插入。
- 每次原生写入成功后（`writeWeight`、`writeIntake`、`writeExercise` 以及编辑/删除路径），在应用级协程上尽力（best-effort）重新导出受影响记录。失败仅记录并吞掉——Health Connect 绝不能阻塞或导致记录失败。
- 关闭会停止增量同步并翻转 pref；重新开启会执行一次幂等的完整回填，对齐遗漏内容。

### UI（pages）

一个入口（Today 上的卡片或从 Header 打开的一行）展示 Health Connect 状态：不可用，或“连接”/已连接及已授权范围。连接会请求权限，随后开启并回填；UI 反映最终状态。预览桥模拟 `supported: true`、`granted: true` 及内存中的 enabled 标志。

## 备选方案

- **立即做双向同步**：更有用，但导入需要我们尚未设计的身份、去重与冲突规则；先做导出是严格子集，可在不破坏现状的前提下扩展。
- **从 Health Connect 读取体重取代 BLE/手动**：方便，但在我们能归属或对齐之前，会把外部秤与 App 合并进 LeanOn 的权威数据；暂缓。
- **用 WorkManager 做周期性后台同步**：最终有助于捕获停用期间的编辑，但开启时的幂等重新回填已覆盖 v1，无需额外定时任务。
- **逐厂商定制集成（Samsung Health、Fit）**：Health Connect 是这些厂商已支持的中立枢纽；集成一次更省力、更可移植。

## 待解决问题

- 何时加入读取/导入，如何识别并去重源自 LeanOn 与其他 App 的记录？
- 当食物记录携带水与微量营养素（纤维、糖、钠）后，是否一并导出？
- 除运动 session 外，是否导出活动能量（`TotalCaloriesBurnedRecord`）？
- iOS 的 HealthKit 对齐，是否采用相同的幂等 id 方案？
