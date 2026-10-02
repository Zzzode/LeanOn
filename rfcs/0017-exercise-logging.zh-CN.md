# RFC 0017 — 运动记录

- 状态：Accepted
- 创建：2026-10-02
- 相关：RFC 0010（体重写入路径）、RFC 0012（饮食记录）

## 概述

让有意识的运动成为一类可由用户记录的数据。目前 Home 屏只显示一个静态的
`todayExerciseKcal` 值，无法录入、纠正或回顾运动。本 RFC 引入一套离线、双语、
带标准 **MET**（代谢当量）值的运动类型目录，根据运动时长和用户当前体重计算
每次运动的千卡，将运动作为历史持久化，并在 Home 上展示。现有“运动把热量加回
每日预算”的行为保留，但改由真实记录的运动驱动，而不是写死的数字。

## 动机

体重控制建立在三大支柱上：吃了什么、体重多少、动了多少。饮食记录（RFC 0012）
和体重记录（RFC 0010，以及 RFC 0011 的蓝牙秤）都已闭环；运动是唯一用户还无法
记录的支柱。能量卡已经为运动保留了一行，并且已经把它加回热量预算，但这个数值
是假的，既会夸大进展，也让用户在锻炼之后没有理由打开 App。

记录运动还能养成和饮食、体重记录一样的每日回访习惯，并让“赚回的热量”这个数字
变得诚实：用户能清楚看到是哪一次运动产生了它，也能删除错误条目。

## 设计

### 能量模型与 eat-back 决策

`selectToday` 当前已经按下面的方式计算：

```text
remainingKcal = energyGoalKcal - foodKcal + exerciseKcal
```

也就是说运动目前按 100% 加回热量（MyFitnessPal 模型）。我们保留这个模型，而不是
改成“运动从不加回预算”，原因有二：

1. 这是已经上线并在 Home 可见的行为；改动会让每一天悄无声息地变得更严格。
2. 基于 MET 的总能量消耗是成熟的估算方法，而且每次运动都可单独查看、删除，能够
   限制高估带来的影响。

本 RFC 的变化是：`exerciseKcal` 改为当天真实记录运动的合计，而不是常量。未来的
RFC 可能引入保守的 eat-back 系数（例如 0.7），前提是记录数据显示存在系统性高估；
在没有数据支撑之前刻意不加。

### 领域类型

新增一个与 `IntakeSample` 对应的核心类型：

```ts
export interface ExerciseSample {
  /** ISO 日期 YYYY-MM-DD。 */
  date: string;
  /** exercise-data 目录中的类型 id。 */
  typeId: string;
  durationMin: number;
  /** 本次运动消耗的千卡。 */
  kcal: number;
}
```

运动与饮食一样是只追加的历史。同一天可以记录多次并累加。本 RFC 中条目不带 id；
编辑/删除单次运动留给后续 RFC（与饮食相同的推进顺序），在该能力落地前，错误条目
可在日后按天纠正。

### 运动数据包

新增私有包 `@zzzode/exercise-data`（用 Rslib 构建，结构与 `@zzzode/food-data`
相同），负责目录与计算：

```ts
export interface ExerciseType {
  id: string;
  name: { en: string; 'zh-CN': string };
  /** 该活动的代谢当量（Compendium of Physical Activities）。 */
  met: number;
}

export function calculateExerciseKcal(
  type: ExerciseType,
  durationMin: number,
  bodyWeightKg: number,
): number;
```

`calculateExerciseKcal` 返回
`Math.round(met * bodyWeightKg * durationMin / 60)`，当时长或体重不是有限正数时抛
`RangeError`。该包还导出 `exercises` 列表与 `getExerciseById`。

目录离线随包提供、中英双语，涵盖约二十余种常见活动（散步、跑步、骑行、游泳、
力量、HIIT、椭圆机、跳绳、瑜伽、普拉提、爬楼、持拍与团队运动、舞蹈、徒步），MET
值取自 Compendium of Physical Activities。本 RFC 仅支持手动录入，无需网络或设备
传感器；连接手机运动传感器 / Health Connect 作为独立切片。

### 桥接契约

`HostDataDto` 用历史数组取代可选标量：

```diff
- /** 通过有意识运动消耗的千卡。 */
- todayExerciseKcal?: number;
+ /** 记录的有意识运动条目（RFC 0017）。 */
+ exercises: ExerciseSample[];
```

新的写入 RPC 沿用现有一次往返写入模式：

```ts
'health.writeExercise': {
  request: { date: string; typeId: string; durationMin: number; kcal: number };
  response: { success: true; hostData: HostDataDto };
};
```

宿主追加条目、持久化、派发 `records.changed` 并返回更新后的 `HostDataDto`，与
`health.writeIntake` 完全一致。宿主不重新计算千卡；页面把它算出的值传入，使公式
始终在 TypeScript 中被单测覆盖。

### Android 宿主

- `RecordsRepository` 增加 `exercises` 数组常量与 `addExercise`，追加运动 JSON
  （`date`、`typeId`、`durationMin`、`kcal`），并用 `optJSONArray` 兜底，与
  `addIntake` 相同。
- `HealthModule` 增加 `writeExercise`，校验时长与千卡为有限正数，校验失败映射为
  `invalid-request`。
- seed/sample 增加 `exercises` 数组；sample 原先的 `todayExerciseKcal: 240` 变为一条
  相同数值的力量训练，保证 Home 数字不变。

### 页面

- 新增 `ExerciseSheet` 底部弹层：从可滚动目录中选择类型，输入时长（分钟），用当前
  体重实时显示千卡；保存调用 `health.writeExercise`。
- `QuickActions` 在 Log food / Log weight 之外增加 **Log exercise** 操作。
- Home 增加一张紧凑卡片，显示今日运动总千卡与总时长，并列出当天条目（类型名、
  分钟、千卡）。
- `selectToday` 聚合当天条目（千卡与分钟合计），不再读取 `todayExerciseKcal`。
- 为弹层、卡片和快捷操作新增英文与简中文案。

## 备选方案

- **从手机传感器 / 步数自动推导运动。** 免去手动录入，但与平台强相关，对力量、
  骑行、游泳不准确，且无法在当前环境构建或验证。暂缓；手动目录是这类功能将来写入
  的数据基础。
- **不把运动热量加回预算。** 在估算虚高时更能保护缺口，但会改变已上线行为，并削弱
  对运动的正向激励。待日后有真实数据时再用保守系数重新评估。
- **在 food-data 包里复用存放运动。** 能减少包数量，但混淆了两个领域（营养与活动）
  及其不同计算；独立包更符合现有的“每域一包”结构。
- **现在就加条目 id 与编辑/删除。** 更完整，但会在同一切片里重复 RFC 0014 的范围；
  饮食功能已经验证了“先创建、后管理”的推进方式。

## 待解决问题

- eat-back 系数：保持 100%，还是在观察记录的运动后改为保守乘数？
- 一次运动是否需要拆成热身 / 正式组，还是每次一个类型即可？
- 未来：Health Connect / HealthKit 同步、基于心率的千卡估算、训练模板/预设。
