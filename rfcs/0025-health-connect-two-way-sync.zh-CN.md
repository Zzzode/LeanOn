# RFC 0025 — Health Connect 双向同步（读取体重与运动、镜像与删除）

- 状态：Accepted
- 创建于：2026-10-03
- 相关：RFC 0021（Health Connect 导出）、RFC 0017（运动）、RFC 0010（记录写入路径）

## 摘要

将 Health Connect 集成从单向导出扩展为受控的**双向同步**。LeanOn 继续发布自有记录（带 `leanon-` 的 `clientRecordId`），同时**读取其他 app 和设备写入的体重与运动会话**，并以只读**镜像记录**（id 前缀 `hc-`、`source: 'health_connect'`）呈现。每次同步都从 Health Connect 重建镜像集合，而 LeanOn 自有记录是权威数据、读取过程绝不触碰。删除 LeanOn 运动时，也会通过 `deleteRecords` 删除此前导出的会话，修复 v1「在 LeanOn 删除后 Health Connect 仍残留」的问题。本版本营养仍只导出、不读取。

## 动机

- 用户体重可能由写入 Health Connect 的智能秤 / 合作 app 采集，运动也常在其他 app（Strava、Samsung Health、Keep、健身房器械）中记录。在 LeanOn 重复录入会带来摩擦，削弱 app 试图培养的习惯本身。
- 导入的体重应进入趋势/当前体重计算，导入的运动应与在 LeanOn 记录的运动一样获得热量「eat-back（吃回）」——否则在别处锻炼的日子里，能量预算就是错的。
- v1 导出没有删除路径：在 LeanOn 删除运动会在 Health Connect 留下孤立会话。可信的双向集成必须协调删除，而不只是插入。

## 为什么先做体重和运动（而不是营养）

- **体重**天然可按天去重，镜像风险低。
- **运动会话**是带类型和时长的时间点事件，每个都能干净地映射为一条 LeanOn 运动样本并获得 eat-back。
- **营养**导入有**能量重复计算**风险。外部餐食粒度细、按 `mealType` 分类，无法可靠匹配用户已在 LeanOn 记录的餐食——导入会悄悄抬高（或压低）当天热量。餐食指纹匹配需要单独的 RFC。水合同样存在「多个 app 记录同一杯水」的歧义。二者在本版本中保持只导出 / 不做。

## 目标

1. 在现有写权限之上，申请体重与运动的 Health Connect **读**权限。
2. 读取外部体重（最近 90 天）与运动会话（最近 30 天），忽略 LeanOn 自己导出的记录。
3. 用稳定 id 和 `source` 标记把外部记录镜像进 HostData，并在每次同步时幂等地重建镜像集合。
4. 通过 LeanOn 自有 MET 表推算导入运动的热量，使 eat-back 与手动记录的运动保持一致。
5. 删除 LeanOn 运动时删除其 Health Connect 会话。
6. 整个能力保持 best-effort、脱离记录写入路径；Health Connect 绝不阻塞或导致录入失败。

## 非目标

- 读取**营养**或**水合**（重复计算风险，另立 RFC）。
- 在 LeanOn 内编辑或删除镜像记录——来源 app 才拥有它们；本地删除的镜像会在下次同步时重新出现。
- 将导入运动与用户同时在 LeanOn 记录的运动做匹配（无冲突 UI；镜像带可见的来源徽标）。
- 读取 `TotalCaloriesBurnedRecord` / 活动能量；为保证确定性，热量由 LeanOn 的 MET 表推算。
- 通过 WorkManager 做周期性后台同步；同步在 app 进入前台、启用时以及手动「Sync now（立即同步）」时运行，定时任务可后续再加。
- 按 `DataOrigin` 选择性导入（按 app 允许/屏蔽列表）。
- 关闭功能时批量删除已导出的数据。
- iOS（HealthKit）——在 macOS 上实现的并行设计。

## 设计

### 数据模型（core）

```ts
export type DataSource = 'leanon' | 'health_connect';
```

- `WeightSample` 与 `ExerciseSample` 增加可选字段 `source?: DataSource`。缺省视为 `'leanon'`，因此现有记录与 fixtures 无需为该字段本身做迁移。
- 镜像 id 带命名空间：
  - 体重镜像：`"hc-weight-${date}"`（每天一条，见下）。
  - 运动镜像：`"hc-<health-connect-record-id>"`。
- 所有非镜像记录保留既有 id，并始终是用户的权威数据；读取代码只会新增/移除 `hc-` 记录。

### 权限

在现有写权限旁增加读权限：

- `android.permission.health.READ_WEIGHT`
- `android.permission.health.READ_EXERCISE`

`HealthConnectPermission.PERMISSIONS` 变为体重与运动的 `getReadPermission` / `getWritePermission`，加上既有仅写的营养权限之并集。由于申请集合发生变化，曾授予 v1 权限的用户会被再次提示授予新的读权限；`permissionsGranted()` 要求完整集合。清单（manifest）已声明 Health Connect 的 queries/rationale 条目，并新增这两个读权限。

### 读取外部记录

读取使用 `readRecords(ReadRecordsRequest<T>)` 并带 `TimeRangeFilter`：

- 体重：`now - 90 天` 至 `now`。
- 运动：`now - 30 天` 至 `now`。

**回声抑制**——LeanOn 跳过任何 `metadata.clientRecordId` 以 `"leanon-"` 开头的记录。那些是它自己导出后又返回的数据，绝不能被镜像。只有没有此类 id 的记录（即由其他 app 创建）才被导入。

### 体重镜像（按天，LeanOn 优先）

LeanOn 每天至多建模一条体重。外部 `WeightRecord` 因此做聚合：

- 按本地日期对外部记录分组；每个日期保留**最晚**时间点（当天更晚的称重最具代表性）。
- 若 LeanOn 在该日期已有自有（`source !== 'health_connect'`）体重，则**不为该日期镜像**外部值——显式的 LeanOn 记录优先，不产生同日冲突。
- 否则以外部公斤数 upsert 镜像 `"hc-weight-${date}"`。

这会填补用户未在 LeanOn 记录的那些天，同时绝不覆盖用户输入的值。

### 运动镜像（事件，MET 推算热量）

每个外部 `ExerciseSessionRecord` 映射为一条镜像运动：

- id = `"hc-${metadata.id}"`（跨同步稳定）。
- date = 会话开始的本地日期。
- `durationMin` = 会话结束 − 开始，取整分钟。
- `exerciseTypeId` 来自 Health Connect `ExerciseType` → LeanOn type id 的**反向**映射（见下）；未知类型回退为通用锻炼。
- `kcal` 用 LeanOn 既有 MET 计算器（`@zzzode/exercise-data`），根据映射类型与时长计算——与手动记录运动所用公式一致——而非信任关联的能量记录。时长为零/负则跳过。

因此导入会话像其他运动一样进入运动列表，其热量流入当天 eat-back 与洞察。

`ExerciseTypeMapping` 增加 `typeIdFor(hcExerciseType: Int): String`。当多个 LeanOn id 共享同一个 Health Connect 类型（如 jogging/running 都映射为 running）时，反向映射返回单一代表性 id。

### 镜像对账

镜像是只读投影，因此每次同步**重建**而非打补丁：

- `RecordsRepository.replaceExternalWeights(byDate: Map<String, Double>)`：移除所有 id 前缀为 `hc-weight-` 的体重样本，再插入聚合后的镜像（跳过 LeanOn 已记录的日期）。
- `RecordsRepository.replaceExternalExercises(items: List<ExerciseSample>)`：移除所有 id 前缀为 `hc-` 的运动样本，再插入映射后的镜像。

重建会自动反映外部编辑与删除：在 Health Connect 消失的记录会在下次同步时从镜像集合消失，无需墓碑簿记。这些方法绝不移除 LeanOn 自有记录。合并后的 HostData 照常落盘到 `records.json`。

### 删除对账（deleteRecords）

删除 LeanOn 运动时，Health Connect 必须丢弃 v1 导出的会话：

```kotlin
client.deleteRecords(
  ExerciseSessionRecord::class,
  recordIds = emptyList(),
  clientRecordIds = listOf("leanon-exercise-${id}"),
)
```

- 与本地删除一起，在应用级 IO 协程上以 best-effort 方式调用；失败仅记录并吞掉，因此 LeanOn 内的删除始终成功。
- 体重与每日营养在 LeanOn 中目前没有单记录删除路径，因此本版本只接通运动删除。
- 外部（`hc-`）镜像由上述重建对账，而非 `deleteRecords`。

### 同步编排

`HealthConnectManager.sync()`（suspend），以「受支持 + 完整权限集合」为前提：

1. 带回声抑制读取外部体重与运动。
2. `replaceExternalWeights` / `replaceExternalExercises` 并落盘。
3. 运行既有幂等 `backfill()` 发布 LeanOn 记录。
4. 记录 `lastSyncEpochMs`。

触发时机：

- **手动**：新增 bridge RPC `healthConnect.sync`（`void` → `{ success: boolean; hostData: HostDataDto }`），由一个 `@LynxMethod` 支撑；UI 用返回的 HostData 刷新。
- **前台 / 启用**：当启用且已授权时，app 进入前台以及启用后异步同步一次（替代启用时仅 backfill 的路径）。
- **写入之后**：既有 `onRecordsChanged()` 导出照常触发；运动删除额外调用 `deleteRecords`。

`healthConnect.getStatus` 增加 `lastSyncEpochMs: number | null`，持久化在既有 `leanon_settings` prefs 中，重启后仍在。

### Bridge 契约

- `healthConnect.sync`：`void` → `{ success: boolean; hostData: HostDataDto }`。
- `healthConnect.getStatus` 响应增加 `lastSyncEpochMs: number | null`。
- `getStatus` / `requestPermission` / `setEnabled` 其余不变。

### UI（pages）

- **HealthConnectSheet**：已连接时显示「Sync now」控件（带忙碌态）与最近同步时间；成功后整屏用返回的 HostData 刷新，失败显示中性、可重试的提示。
- **ExerciseCard / Today's exercise**：镜像运动像其他运动一样渲染，但带小的「Health Connect」来源徽标，并隐藏 Edit / Delete 操作（它们是只读投影）。
- **体重**无需专门 UI：镜像体重本就驱动当前体重与每周趋势，这正是预期效果。
- 预览 bridge 模拟一组外部记录以及可工作的 `healthConnect.sync`，确定性地合并它们。

## 备选方案

- **同时读取营养**：最完整，但在两个 app 中记录的同一餐无法可靠匹配，热量会重复计算；在餐食指纹设计出现前延后。
- **信任外部会话热量 / 读取 TotalCaloriesBurnedRecord**：免去重算，但让 LeanOn 受制于各厂商不一致的能量估算、以及关联独立记录的复杂性；MET 推算热量确定性强，且与 LeanOn 自有记录运动一致。
- **按 HC id 增量打补丁镜像**：每次同步工作量更小，但需要墓碑才能捕获外部删除；全量重建这个不大的镜像集合更简单且能自愈。
- **对 LeanOn 自有 id 做 last-write-wins 合并**：会让外部数据覆盖用户录入；镜像模型保持 LeanOn 权威、外部数据可清晰归因。
- **WorkManager 定时同步**：能捕获 app 关闭期间的变化，但前台 + 手动同步已覆盖日常使用闭环，无需额外任务。

## 待解决问题

- 需要怎样的指纹（时间窗 + 条目 + 能量）才能在不与用户同时在 LeanOn 记录的餐食重复计算的前提下导入营养？
- 是否应增加周期性 WorkManager 同步（如一天几次）？
- 关闭功能时是否应提供「删除我导出到 Health Connect 的数据」？
- 是否需要针对噪声来源做按 app 的 `DataOrigin` 允许/屏蔽过滤？
- 镜像模型应如何映射到 iOS HealthKit 以实现功能对齐？
