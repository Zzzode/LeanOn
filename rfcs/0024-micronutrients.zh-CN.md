# RFC 0024 — 微量营养素（膳食纤维、糖、饱和脂肪、钠）

- 状态：Accepted
- 日期：2026-10-02
- 切片：16
- 相关：RFC 0004（引擎）、RFC 0012（饮食记录）、RFC 0013/0014（自定义食物）、
  RFC 0016（Open Food Facts）、RFC 0021（Health Connect 导出）

## 概述

在热量和三大宏量营养素之外，扩展营养模型，追踪四项对体重控制与长期健康
至关重要的饮食质量信号：

- **膳食纤维**（克）——需要*达到*的目标（饱腹感、肠道与代谢健康）。
- **糖**（克）——上限（尤其添加糖与液体热量）。
- **饱和脂肪**（克）——与热量摄入挂钩的上限。
- **钠**（毫克）——上限（水钠潴留、心血管风险）。

扫码食物的这些值自动从 Open Food Facts 获取，按份量缩放，累计到当日摄入，
并同时展示在食物详情和首页一张紧凑卡片中。Health Connect 的营养导出也扩展
为携带相同字段。

## 动机

减肥由热量缺口驱动，但缺口*由什么构成*决定了饱腹感、坚持度与健康结果。
用户可以用低纤维、高糖、高钠的食物凑到热量目标，却仍然饥饿、水肿（掩盖体重
趋势）且饮食质量差。App 目前记录热量和蛋白/碳水/脂肪，却看不到对饥饿和饮食
质量影响最大的这些营养素。膳食纤维尤其能预测热量控制饮食的饱腹感，而钠会
造成日间水重波动，打击用户信心。

Open Food Facts 对大多数包装食品已经提供这些字段，因此无需额外手动录入即可
采集。

## 目标

- 新增一等 `Micros` 值对象，并贯穿食物、份量、每日摄入、bridge、Android 持久
  化与 UI。
- 从 Open Food Facts 解析纤维、糖、饱和脂肪和钠，包括单位换算（OFF 的钠以克
  计，LeanOn 存毫克）以及由盐推算钠的兜底。
- 像宏量营养素一样按当日各餐累计微量营养素。
- 在食物详情展示每份微量（无数据时隐藏），并在首页卡片展示当日总量与参考目标，
  使用既有语义色（纤维达标绿色 / 超限红色）。
- 将 Health Connect 的 `NutritionRecord` 导出扩展为携带相同字段。

## 非目标

- 完整维生素/矿物质覆盖（维生素 C、铁、钾等）——上述四项覆盖最强且最易获得的
  饮食质量杠杆；后续可向同一对象继续添加。
- 自定义食物表单中的微量营养素编辑器。工厂与契约已接受可选 micros，但手动录入
  UI 暂缓；自定义与 curated 食物目前上报零值。
- 区分「未知」与实测为零。与 `Macros` 一致，缺失值归一为零；详情视图在全零时
  隐藏区块，而不是断言这些营养素确实不存在。
- 个性化、按性别或疾病定制的微量目标；参考目标采用人群指南（见下）。

## 设计

### 数据模型（core）

```ts
/** 一份食物或一日摄入的饮食质量微量营养素。 */
export interface Micros {
  fiberG: number;
  sugarG: number;
  saturatedFatG: number;
  sodiumMg: number;
}
```

所有字段均为必填数字，缺省为零，与 `Macros` 完全一致。`IntakeSample` 增加必填
`micros: Micros`。纤维、糖、饱和脂肪单位为克；钠为毫克（营养标签惯例）。

新文件 `nutrition/micros.ts` 提供 `ZERO_MICROS` 常量及以下纯函数：

- `microsForDate(intake, date): Micros`——累加 `date` 当日所有摄入样本，克字段
  保留一位小数、钠取整到毫克；当日无餐返回 `ZERO_MICROS`。
- `addMicros(a, b): Micros`——逐分量相加（供累计与 Android 移植使用）。
- `recommendMicroGoals(energyGoalKcal): MicroGoals`——每日参考目标：

  | 营养素 | 目标 | 依据 |
  |---|---|---|
  | 膳食纤维 | 30 克 | 成人适宜摄入量指南 |
  | 糖 | 50 克 | WHO 条件性上限（2000 kcal 的 10%） |
  | 饱和脂肪 | `round(energyGoal × 0.10 / 9)` 克 | WHO/心脏健康 <总能量 10%（脂肪 9 kcal/g） |
  | 钠 | 2300 毫克 | WHO/标签可耐受上限 |

  `energyGoalKcal` 非有限或非正时抛 `RangeError`。

`MicroGoals` 与 `Micros` 形状相同。这些仅为展示用参考值，非医疗目标。

### 食物数据

`food-data` 新增结构兼容的 `Micros` 类型（仿照其自带 `Macros` 的做法），
`FoodItem` 增加每 100 克的 `micros: Micros`。

- `portion(item, grams)` 在缩放 kcal 和 macros 的同时按 `grams / 100` 缩放
  micros；`Portion` 增加 `micros`。
- `createFoodFromBarcode` 读取额外 OFF 营养字段：

  | LeanOn 字段 | OFF 键（`_100g`） | 处理 |
  |---|---|---|
  | fiberG | `fiber` | 克，非负 |
  | sugarG | `sugars` | 克，非负 |
  | saturatedFatG | `saturated-fat` | 克，非负 |
  | sodiumMg | `sodium`，兜底 `salt` | OFF 钠以**克**计 → ×1000 并取整为毫克；钠缺失时由盐推算：`盐 / 2.5 × 1000` |

  缺失或非法值通过既有 `macro()` 辅助（泛化为非负数）归一为零。
- `createCustomFood` / `updateCustomFood` 的输入类型接受可选 micros 并校验
  （有限、非负；钠为毫克），缺省为零。自定义食物 UI 暂不发送这些字段。

### Bridge 契约

`HostDataDto` 的摄入条目以及各写入方法携带的食物对象增加 `micros`。
`health.writeIntake`、`health.writeScannedFood`、`health.writeCustomFood` 请求
接受 `micros`（请求中可选；host 以零填充，与可选 macros 的处理一致）。响应继续
返回刷新后的 `hostData`。不引入新的 RPC 方法。

### Android

- `RecordsRepository.addIntake(...)` 接受 micros 并累计到当日摄入样本（与累计
  macros 的 map/replace 路径相同）。扫码与自定义食物写入持久化食物每 100 克的
  micros。
- `loadHostData()` 为每条摄入样本和每个已存食物回填缺失的 `micros`，仿照既有
  `ensureExerciseIds` 迁移，保证旧 `records.json` 仍有效。
- `HealthModule.writeIntake` / `writeScannedFood` / `writeCustomFood` 读取并转发
  micros，采用与 macros 相同的有限/非负校验。
- Health Connect 营养映射在非零时为 `NutritionRecord` 设置 `fiber`、`sugar`、
  `saturatedFat`、`sodium`，四项均用 `Mass.grams`（钠由毫克 ÷1000 换算为克）。
  映射单测同步扩展。
- seed 数据集为示例摄入/食物加入 micros。

### Pages

- **食物详情（FoodSheet）：** 当所选食物存在任一非零 micros 时，展示一行紧凑的
  *所选份量*纤维/糖/饱和脂肪/钠（使用缩放后的 `portion().micros`）。全零食物不
  显示微量区块。
- **首页：** 在 `MacroCard` 之后、`WaterCard` 之前新增 `MicrosCard`。以四个紧凑
  项展示当日总量与参考目标：纤维达到/超过目标时标绿；糖、饱和脂肪、钠超限时标红；
  其余中性。卡片使用 `microsForDate` 与 `recommendMicroGoals(energyGoalKcal)`。
- preview bridge 在模拟写入时累计并返回 micros，en / zh-CN 文案目录新增
  `micros.*` 键。

### i18n 键

| 键 | English | 简体中文 |
|---|---|---|
| `micros.title` | Diet quality | 饮食质量 |
| `micros.fiber` | Fiber | 膳食纤维 |
| `micros.sugar` | Sugar | 糖 |
| `micros.saturatedFat` | Sat. fat | 饱和脂肪 |
| `micros.sodium` | Sodium | 钠 |
| `micros.ofGrams` | of {n} g | 目标 {n} 克 |
| `micros.ofMg` | of {n} mg | 目标 {n} 毫克 |
| `micros.fiberReached` | Fiber goal met | 纤维已达标 |

## 测试

- core：`microsForDate`（多餐累加、取整、空日）、`addMicros`、
  `recommendMicroGoals`（饱和脂肪取整、非法热量抛错）单测。
- food-data：覆盖纤维/糖/饱和脂肪解析、钠 g→mg 换算、盐兜底、份量缩放的条码
  测试；可选 micros 的自定义工厂校验测试。
- bridge：断言 micros 在各写入中往返的契约/客户端测试。
- Android：Health Connect micros 映射（含 mg→g）的 JVM 单测；构建编译仓库/模块
  改动。
- Pages：扫描模拟产品并断言详情展示缩放后 micros、首页卡片同步的 web E2E；
  en 与 zh-CN 截图。

## 待解决问题

- 糖目标是否应默认采用 WHO *更严格*的 25 克而非条件性的 50 克；待目标可配置后
  再定。
- 是否在体重趋势旁显式呈现钠导致的水钠潴留（与未来平台期/水重分析相关）。
