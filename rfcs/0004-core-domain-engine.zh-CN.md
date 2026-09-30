- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0001, 0003

# Core 领域引擎

[English](0004-core-domain-engine.md) · 简体中文

## Summary

设计 `@zzzode/core`：一个**纯 TypeScript、零 UI、零原生**的领域引擎，是 LeanOn 的“大脑”。
它承载六项能力：

1. 基础能量估算（BMR / 静态 TDEE）
2. 从用户自身**体重趋势与摄入反推的自适应 TDEE**
3. 体重信号处理：去噪、稳健趋势斜率、月经周期感知
4. 平台期与代谢适应识别
5. 营养：宏量目标与饮食质量评分
6. 预测：目标日期与减重→维持期过渡

所有函数都是确定性的：结构化记录输入、计算结果输出。无副作用、无 I/O、无时钟、无随机——
相同输入永远得到相同输出。

## Motivation

- 人群公式（Mifflin-St Jeor × 活动系数）是有用的**首日猜测**，离散约 ±10%，但它拟合的是
  别人，且不会随身体变化更新。
- 最准确的个人估算其实已包含在用户自己的数据里：吃了什么、体重如何变化。借助能量守恒，
  可从两者关系反推其**真实消耗**。
- 每日体重主要由水分、糖原、钠以及（女性）月经周期主导，朴素地“今天比上周”会产生假停滞
  和焦虑，因此需要显式去噪与周期感知比较。
- 线性的“每磅 3500 kcal”规则会高估长期减重，因为身体变小后消耗下降；预测必须考虑这种
  减速。
- 把这些放进纯、可移植的包，可在 Lynx 后台线程、服务端以及针对固定夹具的单测中复用。

## Guide-level explanation

- 首次启动、尚无数据时，引擎用 Mifflin-St Jeor（已知体脂则用 Katch-McArdle）估算 BMR，
  再用活动系数得到起始 TDEE。
- 记录满 2–4 周后，引擎切换到**自适应 TDEE**：拟合近期体重趋势，把斜率换算为能量失衡，
  结合平均摄入，给出带置信带的真实维持热量。
- 每个体重视图使用 7 日滚动均值；趋势是窗口上的斜率，绝不用点对点差值。女性用户获得周期
  感知比较（跨月比较同一周期相位）。
- 只有当**趋势斜率在记录一致的情况下连续 ≥3 周统计持平**才宣布平台；更短的持平标记为正常
  波动；体重平但腰围降标记为身体重组而非停滞。
- 引擎返回遵守安全下限的每日热量与宏量目标、当日饮食质量评分，以及持续更新的预测和明确的
  维持计划。

## Reference-level explanation

### 输入（领域模型）

```ts
type Sex = 'female' | 'male';

interface Profile {
  sex: Sex;
  birthDate: ISODate;        // 年龄由生日推导，不直接存
  heightCm: number;
  activityLevel: ActivityLevel; // sedentary..extremely_active
  bodyFatPercent?: number;
}

interface WeightSample { date: ISODate; weightKg: number; }
interface IntakeSample { date: ISODate; kcal: number; macros: Macros; }
interface Macros { proteinG: number; carbsG: number; fatG: number; }
```

引擎绝不从磁盘读取；调用方传入按日期排序的数组。

### 模块布局

```
src/
├── types.ts
├── energy/  bmr.ts · tdee.ts · targets.ts
├── weight/  trend.ts · smoothing.ts · cycle.ts · plateau.ts
├── nutrition/ macros.ts · score.ts
└── forecast/ projection.ts
```

### 1. 基础能量

- **Mifflin-St Jeor**（默认、体成分未知）：
  `BMR = 10·kg + 6.25·cm − 5·age + s`，男性 `s = +5`，女性 `−161`。
- **Katch-McArdle**（设置了 `bodyFatPercent` 时）：
  `LBM = kg·(1 − bf%)`，`BMR = 370 + 21.6·LBM`。
- 静态 TDEE = BMR × 活动系数（久坐 1.2 … 极高 1.9）。仅在个人数据充足前使用；UI 必须标注
  其为估算值。

### 2. 从体重趋势反推自适应 TDEE

能量守恒：`ΔE_储存 = 摄入 − 消耗`。在 `n` 天窗口上重排：

```
adaptiveTDEE = mean(摄入) − (ΔweightKg · ρ / n)
```

- `ρ` 是体重变化的**工作能量密度，7700 kcal/kg**（32.2 MJ/kg；约 3500 kcal/lb）。它是工作
  常数而非物理定律：对体脂较高者准确，对更瘦、减重含更多瘦组织者会高估密度。
- `ΔweightKg` 是窗口上的**拟合趋势变化**（斜率 × n），而非首尾原始值之差。
- 减重时 `ΔweightKg` 为负，因此自适应 TDEE **高于**平均摄入。
- 最小窗口 14 天，建议 28 天。要求最低记录天数；依从性低时给出标记，而非输出虚假精确值。
- 输出含点估计与**置信带（约 ±100 kcal）**；数据稀疏或记录不均时更宽。
- **一致的低估可以容忍**：若每天都少记约 15%，反推 TDEE 与据此设定的目标也同比例偏移，
  仍能产生计划中的趋势。**不均匀**记录（工作日严格、周末空白）才是致命情形，通过每日覆盖率
  检测并标记。

### 3. 体重信号处理

- 展示用 **7 日滚动均值**；截尾均值/中位数可拒绝单日异常。
- 14–28 天窗口上用普通最小二乘得到**趋势斜率**；所有决策由斜率（kg/天）驱动，而非点差值。
- 水分、糖原、钠、肠道内容造成的每日 1–2 kg 波动属预期，绝不能触发任何提示。
- **周期感知（女性）**：体重常在经前/经期初期达到峰值，文献中周期内波动约 0.6–2 kg。引擎
  按周期日对齐样本，跨月比较同一相位，而非比较相邻周。周期相位为可选输入；缺失时引擎加宽
  噪声带，而不是假设周期。
- 平滑参数（窗口、截尾比例）集中为命名常量。

### 4. 平台期与适应识别

**平台期**需同时满足：

1. 最近 ≥21 天的拟合 |斜率| 落在噪声带内（与零不可区分）；
2. 该窗口内记录覆盖率达到一致性阈值；
3. 次要信号（腰围、进度照）也持平。

- 持平 1–2 周 → `normal_variation`。体重平但腰围降/力量涨 → `body_recomposition`（胜利）。
- **代谢适应**通过把实测 TDEE 与“按新的、更小的身体预测的 TDEE”比较来估算。掉体重可解释
  的部分是必然的（RMR 约 10–15 kcal/kg/day）；只有剩余部分才是适应性产热。不得把必然下降
  标记为“代谢损伤”。
- 确认为真平台时，引擎**依次**建议：审计记录 → 增加 NEAT（步数）→ 小幅减 100–200 kcal →
  维持热量 7–14 天的 diet break（MATADOR 证据）。绝不首先建议大幅削减。

### 5. 营养

- **蛋白质为锚**：目标 1.6 g/kg，激进缺口时可至 2.0–2.4 g/kg，按**目标/参考体重**计算，
  以免体脂较多者为打算减掉的组织而被规定过多蛋白质。
- **脂肪下限**：≥0.5 g/kg、约占热量 20–30%（避免与激素紊乱相关的 15% 以下区间）。碳水补足
  剩余热量。
- **饮食质量评分（0–100）**是 LeanOn 模型，结合 NRF 风格信号：蛋白质达标、纤维、微量密度、
  全食物加分；添加糖、过量钠/饱和脂肪、超加工项减分。它评价**当日整体搭配**，与单食物红绿灯
  互补；明确是产品启发式规则，不是临床指数。
- 脂肪动员上限指南（约 31 kcal/lb 脂肪/天）约束缺口大小，超过则身体必分解瘦组织，此类目标
  被拒绝。

### 6. 预测与维持过渡

- 短期规划可用工作常数；长期预测迭代**动态模型**（Hall/NIDDK 风格）：消耗与缺口随体重变化
  收缩，产生曲线而非直线轨迹。摄入变化的响应是渐近的（半衰期约年级），故模型用于规划，实时
  趋势仍是校准信号。
- 输出：预计达标日期、预期周速率、目标体重下的维持热量区间。
- 达到目标体重后，引擎切换到明确的**维持阶段**：在监测体重的同时把摄入逐步提升至自适应
  TDEE，定义容差带，并在体重漂移超出时触发再干预。

### 置信与不确定性

每个计算值都带置信等级（`low | medium | high`），由样本数、窗口长度、记录覆盖率与趋势拟合
质量推导。UI 必须展示不确定性而非虚假精度，且一旦进入减重，趋势优先于模型。

### 安全约束（硬规则）

- 默认速率 0.5–1 kg/周；未经专业监督，绝不规定低于 BMR 驱动下限的热量（一般指南女性约
  1200、男性约 1500）。
- 输入不合理时拒绝输出目标，报出错误而非猜测。
- 引擎不诊断或治疗疾病；饮食失调筛查与就医提示位于 App 层，但引擎绝不为强迫掉秤而建议越吃
  越少。

## Drawbacks

- 自适应 TDEE 的质量取决于摄入记录；一致偏差可容忍，不均记录会悄悄污染结果。
- 7700 kcal/kg 是近似值，对偏瘦用户与短窗口会漂移，故有置信带与动态模型。
- 周期感知需要用户可能不提供的周期相位数据；数据缺失会迫使噪声带更宽、平台判定更慢。
- 动态 ODE 模型比单一除数更难实现、测试与解释。

## Rationale and alternatives

- **仅静态公式**：简单，但忽略用户自己（更准确）的数据且不适应；不作为最终估算，保留为首日
  猜测。
- **3500/7700 线性预测**：会严重高估多月减重；长期不用，保留为短期估算。
- **每日点对点比较 / 每周称重**：在每日 1–2 kg 波动下太噪；改为每日称重 + 滚动均值与拟合
  斜率。
- **黑盒 ML 估算 TDEE**：不透明、两人数据无法训练且难调试；选择可解释的能量平衡模型。
- **KMP 共享引擎**：离线后台计算更强但更重且不能热更；顺延（见 RFC 0001）。

## Unresolved questions

- 先实现完整 Hall ODE 还是简化近似，以及如何为两名用户校准。
- 周期相位的确切来源（手动记录 vs HealthKit/Health Connect）与默认周期长度。
- 平台阈值与置信带宽度需结合真实数据调参。
- 是否用 Rslib 的隔离声明模式来要求 core 源码采用更严格的类型写法。

## References（循证依据）

- Wishnofsky M. *Caloric equivalents of gained or lost weight.* Am J Clin Nutr, 1958 ——
  约 3500 kcal/lb（7700 kcal/kg）工作常数的出处。
- Hall KD, Sacks G, Chandramohan D, Chow CC, 等. *Quantification of the effect of energy
  imbalance on bodyweight.* The Lancet, 2011 —— 动态体重模型；固定摄入不产生固定缺口。
- Thomas DM, Martin CK, Redman LM, 等 —— 3500 kcal 规则会高估多周减重；决定平台的是依从性
  模式而非仅平均值。
- 美国 NIDDK/NIH **Body Weight Planner** —— Hall 动态模型的公开实现。
- Byrne NM, 等. *Intermittent energy restriction improves weight loss efficiency in obese
  men: the MATADOR study.* Int J Obes, 2018 —— diet break / 间歇限制。
- Morton RW, 等. *Protein supplementation and resistance training-induced gains: a systematic
  review and meta-analysis.* Br J Sports Med, 2018 —— 蛋白质约 1.6 g/kg（可至约 2.2）以保肌。
- Nedeltcheva AV, 等. *Insufficient sleep undermines dietary efforts to reduce adiposity.*
  Ann Intern Med, 2010 —— 短睡使减重偏向瘦组织。
- Fulgoni VL III, Keast DR, Drewnowski A. *Development and validation of the Nutrient-Rich
  Food Index (NRF).* J Nutr, 2009 —— 饮食质量评分的基础。
- 月经周期体重波动综述, 2025（PMC13373534）—— 周期相位对齐。

## Implementation plan

- [x] 模块/目录布局与共享领域类型
- [x] 基础 BMR / 静态 TDEE
- [x] 滚动均值、稳健斜率、带置信的自适应 TDEE
- [x] 周期感知对齐与同相位比较
- [x] 平台/适应分类
- [x] 宏量目标
- [ ] 饮食质量评分
- [ ] 动态预测与维持阶段
- [x] 每个公式的固定夹具单测（Rstest），含已知算例

已实施领域由 39 个 Rstest 固定夹具用例覆盖。饮食质量评分、动态预测，以及平台判定中
自动的周期感知噪声带仍待完成。
