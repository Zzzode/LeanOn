# RFC 0023 — 水合追踪

- 状态：Accepted
- 创建时间：2026-10-02
- 相关：RFC 0010（原生持久化为权威）、RFC 0012（食物/摄入）、
  RFC 0021（Health Connect）

## 摘要

为 LeanOn 增加每日**饮水追踪**，让用户可以对照基于体重的个人每日目标记录饮水量。
主屏新增饮水卡片，展示今日摄入相对目标的进度条以及快速 +/− 杯按钮。水以「每日一条
总量」存储，通过单次 `health.writeWater` 往返进行 upsert，与体重写入路径一致。

##  Motivation

- 充足饮水直接支撑 LeanOn 的两个目标：它能减少「假性饥饿」带来的加餐（有助于热量缺口），
  也是健康的基本支柱。减肥产品应当让记录饮水和记录食物一样简单。
- 饮水记录天然高频、快速（一天很多小杯），因此必须一键完成，不能有弹层、键盘或搜索——
  这与食物不同。
- 个人化目标（而非固定的「8 杯水」）会随用户体重变化而调整，让目标始终可信。

## 目标

1. 在原生侧持久化每日饮水总量（毫升），每天一条。
2. 提供由纯 core 计算、基于体重的每日目标。
3. 让用户在主屏一键添加或移除一杯标准水量（250 ml），当日总量以 0 为下限。
4. 用现有进度条视觉语言展示相对目标的进度，包括清晰的「已达标」状态。

## 非目标

- 本版本不支持自定义杯量或用户可编辑目标（目标由最新体重推导；两者后续可做成可配置）。
- 不做带独立 id 的逐杯事件历史；每日总量即记录单位，足以支持 +/−，并保持模型简单。
- 不向 Health Connect 导出水（`HydrationRecord`）——属增量能力，可在该写入路径稳定后跟进。
- 不做微量营养素（纤维、糖、钠）——另立 RFC。
- 不做 iOS 实现（并行设计，在 macOS 上构建）。

## 设计

### 领域模型

新增 core 类型：

```ts
export interface WaterSample {
  /** ISO 日期 `YYYY-MM-DD`。 */
  date: string;
  /** 当日饮水总毫升数（绝不为负）。 */
  amountMl: number;
}
```

`HostDataDto` 新增 `water: WaterSample[]`。每个日期至多一条；宿主按日期 upsert（日期已存在
则替换总量，否则按日期顺序插入）。

### 目标

纯函数依据体重推导目标，采用广泛使用的约 35 ml/kg 指南（指饮用水，不含食物水），并约束到
合理范围、取整到友好的步长：

```ts
export const WATER_ML_PER_KG = 35;
export const WATER_GOAL_MIN_ML = 1500;
export const WATER_GOAL_MAX_ML = 4000;
export const WATER_GOAL_STEP_ML = 50;

export function recommendWaterGoalMl(weightKg: number): number;
```

- 原始值 = `weightKg * 35`
- 截断到 `[1500, 4000]`
- 四舍五入到最近的 50 ml
- 当 `weightKg` 不是有限正数时抛 `RangeError`。

示例：60 kg → 2100；80 kg → 2800；100 kg → 3500；120 kg → 4000。

页面根据最新记录的体重计算目标；在尚无体重记录时，回退到默认参考体重对应的截断常量（目标
仅用于展示，不参与持久化）。

### 读取 helper

```ts
export function waterForDate(
  water: readonly WaterSample[],
  date: string,
): number;
```

返回当日 `amountMl`，该日期无记录时返回 0。

### RPC

```ts
'health.writeWater': {
  request: { date: string; amountMl: number };
  response: { success: true; hostData: HostDataDto };
};
```

交互由页面掌控：点 + 时在当前展示总量上加一杯并写入新的绝对总量；点 − 时减一杯（以 0 为下限）
并写入。宿主校验日期非空、`amountMl` 为有限非负数，upsert 当日，发出 `records.changed`，返回
更新后的 `HostDataDto`。不需要单独的删除方法——移除一杯就是写入更低的总量。

### Android

- `RecordsRepository.upsertWater(date, amountMl)`：在 `water` 数组（按需创建）中定位当日，
  替换或按日期顺序插入，持久化并返回 HostData。
- `HealthModule.writeWater`：解析并校验，调用仓库，发出 `records.changed`；非法输入映射到标准
  失败码。
- seed `hostData.json` 新增 `"water": []`。

### Pages

- 新增 `WaterCard` 组件，置于 Macros 卡片之后：
  - 标题与今日总量（ml）以及目标（如 `1750 / 2800 ml`）。
  - 进度条填充比例 `min(total / goal, 1)`。
  - 两个控件：− 按钮与 + 按钮，标注杯量增量（`−250 ml`、`+250 ml`）；总量为 0 时 − 禁用。
  - 当总量达到或超过目标时显示「已达标」状态，进度条使用完整 botanical 填充。
- 杯量为页面常量 `CUP_ML = 250`。
- `App` 通过桥接接入 `writeWater` 动作，并依据响应更新 `hostData`，与其他记录动作一致。
- preview `app-bridge` 新增 `health.writeWater` handler，在内存宿主数据中 upsert 当日总量，
  使 web 流程可操作。
- 英文与简体中文均新增 `water.*` i18n key。

### i18n key

- `water.title` —— "Hydration" / "饮水"
- `water.goal` —— "Goal" / "目标"
- `water.ml` —— "ml" / "毫升"
- `water.left` —— "{amount} ml left" / "还差 {amount} 毫升"
- `water.reached` —— "Goal reached" / "已达标"
- `water.add` —— "+250 ml"
- `water.remove` —— "−250 ml"

## 验证

- core 单测覆盖目标计算、截断/取整、非法输入错误以及 `waterForDate`。
- bridge client 测试覆盖 `health.writeWater` 与新增的 `water` 字段。
- Android JVM 构建与单测通过；`assembleDebug` 成功。
- web E2E 流程打开主屏，点 + 数次、点 − 一次，断言总量与达标状态，并验证重开后持久化。

## 缺点与后续工作

- 每日总量模型意味着两台设备并发编辑可能互相覆盖；对当前单人、以单设备为主的使用可接受。
  基于增量的合并可随同步（RFC 0008）再议。
- 固定杯量与推导目标尚不适配个人偏好；可配置化是自然的后续。
- Health Connect 饮水导出与饮水提醒暂缓。

## 待解决问题

- 本版本无；杯量与目标公式遵循常见饮水指南，且易于调整。
