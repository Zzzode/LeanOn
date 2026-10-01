- 开始日期：2026-10-02
- RFC 类型：feature
- 状态：Accepted
- 相关：0006、0007

# RFC 0009：国际化（i18n）

## 摘要

引入纯 TypeScript 的 `@zzzode/i18n` 包，提供类型化消息目录、语言解析与参数插值，并把界面接入**英文**与**简体中文**：默认跟随系统语言，并支持应用内切换。

## 动机

- 项目开源，同时面向英文与中文用户，两位创始人本身也是中文使用者。硬编码英文会把中文用户挡在门外，也会让未来每增加一种语言都变成昂贵且易错的“找字符串”工程。
- 当前字符串硬编码在 `packages/pages`，部分甚至在 selector 内部拼好（`greeting`、趋势单位 `kg/week`、日期标签）。语言是横切关注点，需要一个统一的归属。
- 语言还会改变日期顺序与部分单位；临时拼凑必然导致各屏不一致。

如果现在不做，第一块真实页面就会把英文固化，随着页面增多，改造成本只会上升。

## 指南级说明

- 首次启动界面跟随设备语言，用户可自行覆盖；第一刀在 Home 提供 **EN / 中** 切换，随后补全设置页入口。该选择按设备保存，不进入任何双人比较。
- 所有用户可见文案都通过 `t(key, params?)` 获取，组件中不出现裸句子。
- 增加一种语言只需新增一份同 key 的目录。key 一致性测试会在漏翻或多出 key 时让 CI 失败，避免某屏静默回退到别的语言。

示例：

```ts
const t = createTranslator('zh-CN');
t('macros.ofGrams', { n: 115 }); // “目标 115 克”
```

## 参考级说明

### 包结构

新增 `@zzzode/i18n` 包，纯 TypeScript、不依赖 UI 或原生（约束与 `core` 相同），用 Rslib 构建、Rstest 覆盖。

```
packages/i18n/src/
  locales/en.ts        # 权威（源）目录，`as const`
  locales/zh-CN.ts     # 简体中文，key 完全一致
  translate.ts         # createTranslator 与插值
  resolve-locale.ts    # 系统标识 -> 受支持 Locale，含回退
  format-date.ts       # 按语言格式化日期部件
  index.ts
```

### 类型与目录

```ts
export type Locale = 'en' | 'zh-CN';
export const defaultLocale: Locale = 'en';

export const en = {
  'home.greeting.morning': 'Good morning',
  'home.greeting.afternoon': 'Good afternoon',
  'home.greeting.evening': 'Good evening',
  'home.dayStreak': 'day streak',
  'energy.title': 'Energy',
  'energy.kcalLeft': 'kcal left',
  'energy.kcalOver': 'kcal over',
  'energy.goal': 'Goal',
  'energy.food': 'Food',
  'energy.exercise': 'Exercise',
  'weight.title': 'Weight',
  'weight.kgPerWeek': 'kg/week',
  'weight.start': 'Start',
  'weight.lost': 'Lost',
  'weight.toGoal': 'To goal',
  'macros.title': 'Macros',
  'macros.protein': 'Protein',
  'macros.carbs': 'Carbs',
  'macros.fat': 'Fat',
  'macros.ofGrams': 'of {n}g',
  'action.logFood': 'Log food',
  'action.logWeight': 'Log weight',
  'notice.safeFloor': 'Your target was raised to the safe minimum.',
  'footer.disclaimer': 'LeanOn · not medical advice',
  'date.weekday.0': 'Sun', /* …… 到 6 */
  'date.month.0': 'Jan',   /* …… 到 11 */
  'date.format': '{weekday}, {month} {day}',
} as const;

export type MessageKey = keyof typeof en;
```

`zh-CN.ts` 使用 `satisfies Record<MessageKey, string>`，漏写或改名的 key 会直接编译报错。中文 `date.format` 为 `'{month}月{day}日 {weekday}'`，说明被翻译的不只是单词，还包括格式本身。

### 翻译器与插值

```ts
export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(locale: Locale): Translator;
```

- 查找顺序：当前目录 → 英文目录 → 原始 key（让未知 key 在开发期可见，而不是渲染空白）。
- 插值替换 `{name}` 占位；未提供的占位保留为 `{name}`。
- 翻译器是纯函数；ReactLynx 按 locale 做 memoize。

### 语言解析

```ts
export function resolveLocale(input: string | null | undefined): Locale;
```

先把下划线归一为连字符并转小写；`zh` 与任意 `zh-*` 映射到 `zh-CN`，`en` 与 `en-*` 映射到 `en`；其他（以及 null/undefined）回退到 `en`。繁体中文（`zh-TW`、`zh-HK`）暂映射到简体，作为未决问题跟踪。

### 日期、数字与单位

- 日期由数值部件（星期/月/日）通过 `date.*` key 与本地化的 `date.format` 组装；**不**依赖 `Intl.DateTimeFormat`，因为 primjs 运行时对其覆盖不保证。
- `kg`、`kcal` 在两种语言中都保留国际符号；趋势速率单位做本地化（`kg/week` 对应 `公斤/周`）。
- selector 不再返回预拼字符串，改为返回 `dayPart`（morning|afternoon|evening）、日期数值部件与 `trendKgPerWeek`，由视图拼出本地化文案，使 `core`/selector 保持语言中立。

### 界面接入

- `packages/pages` 依赖 `@zzzode/i18n`。入口从 `lynx.__globalProps` 读取可选 `locale`（经 `resolveLocale` 回退，再到 `en`），存入 state，并用 `useMemo` 构建翻译器。
- Header 增加紧凑的 **EN / 中** 分段控件，切换立即重渲染；覆盖值的持久化随原生设置切片落地。
- 各组件按需接收数据并通过 `t` 渲染，不再硬编码句子。

### 与 bundle / 下发的关系

- 第一刀把两份目录都打进 bundle（文案仅几百字节），切换即时且离线可用。
- 后续可把各语言目录拆成分片，像页面 bundle 一样经 RFC 0007 通道下发（签名清单、按 locale 选择），缩小基础包体。翻译器的回退契约已经假定目录可能缺失。

## 缺点

- 同时打包两份目录会增加少量固定体积，并要求逐 key 的纪律。
- 我们重新实现了日期/数字格式化的一小部分，而非直接用 `Intl`，需要自行维护。
- 暂未覆盖繁体中文与其他文字体系（如 RTL）；`zh-TW/HK` 用户会看到简体。

## 理由与备选方案

- **i18next / FormatJS**：功能丰富但更重，ICU 机制与运行时假设在 Lynx 内未经验证，对两种语言属于过度设计。暂不采用；`createTranslator` API 刻意保持小而接近，未来切换只影响本包。
- **依赖 `Intl.DateTimeFormat` / `Intl.NumberFormat`**：纸面上最简单，但 primjs 的 Intl 覆盖不确定且随版本变化。在验证前不采用，`format-date` 是确定性的过渡。
- **一开始就按语言拆 bundle**：规模化后正确，但在第二块页面出现前会增加清单/构建复杂度。暂缓；回退设计已预留空间。
- **把文案留在 `pages`**：无法被卡片、Widget、原生界面复用，也难做一致性校验。故采用独立包。

## 未决问题

- 语言覆盖值保存在哪里（原生设置存储）、是否同步？语言属于按设备的偏好，默认应**不**在伴侣间共享。
- 何时加入繁体中文与真正的复数/CLDR 规则（当某条文案需要真正的单复数形式时）？
- 一旦验证 primjs 的 Intl 覆盖，是否回归标准 `Intl`？RTL 语言如何处理？

## 实施计划

1. 新增 `@zzzode/i18n`（目录、翻译器、解析器、日期格式化）、Rslib 配置、含 en/zh-CN key 一致性的 Rstest 套件、README（中英）。
2. 接入 `packages/pages`：替换硬编码文案、调整 selector 输出、增加 locale state 与 Header 切换；重新构建 Lynx bundle 与 Android APK。
3. 收录 RFC 并在 `AGENTS.md` 注明目录位置；验证完整 CI。
