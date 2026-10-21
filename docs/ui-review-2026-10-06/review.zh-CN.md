# LeanOn UI 深入设计评审

[English](review.md) · [简体中文](review.zh-CN.md) · [Annotated overview](annotated-overview.png)

当前内容已比早期原型更可读、更诚实，但层级仍停留在同等白卡堆叠。已认可原生底栏是最好的基准：形态克制、图标统一、选中目标明确。内容区应延续这种秩序，而不是继续添加效果。

## 证据与范围

2026-10-06只读评审。main@89b5e157844d62933a5ebfa773e7aa7b8d076cb9；origin为https://github.com/Zzzode/LeanOn.git，独立读取确认远端HEAD相同。工作区已有61个跟踪文件修改及未跟踪测试、RFC、设计提案，全部保留。本轮新iOS截图覆盖五个主tab，Settings使用明确标注日期的既有原生证据；Android仅Today。未使用浏览器。没有修改业务/UI源码、构建应用、提交、推送或写健康记录。仅使用隔离QA演示数据；五tab通过已有debug初始路由启动，不等于验证了手势。

Installed iOS/Android bundle SHA-256: `2ace1e5f1e0984d1053cd8e02572014234c481be7b45aed35484eb29504b43b5`.
The bundle matches dist; no fresh rebuild is claimed.

## 五项关键发现

1. P1 — Today入口清楚，但指标太多且等权。余量、体重、宏量和重复进度条拉平层级；运动排在多个营养区域后。
2. P1 — Diary目前是总量页，尚不是条目日记。1310 kcal重复，存储限制占视觉中心，米饭快捷入口未明确标成再次添加。
3. P1 — 缺失数据和不可用行动需单独处理。饮食空态仍显示零和预算余量；饮水、秤入口可能只通向不可用弹层。
4. P1/P2 — Me和Partner把最好的空间花在未开放说明上。可用工具应前置；两人互相支持需要简洁、有目的的品牌表达和诚实空态。
5. P2 — Progress现已真正显示图表。局部体重域值得保留，但日期与观测折线、拟合速率之间的区别仍不清楚。

## 逐屏问题与具体改法

### Today · P1

Design judgment / 设计判断

两行记录按钮后依次堆能量、体重、宏量、微量、饮水和运动容器，日常伙伴变成指标清单。保留三个记录入口；压成紧凑动作组和一个主摘要，体重与运动开放并列，营养细节下移。以已记录摄入作为主要描述值，余量作为次级估算并标明完整性；保留安全下限提示。

`packages/pages/src/screens/TodayScreen.tsx:22–55`; `packages/pages/src/components/EnergyCard.tsx:16–41`; `packages/pages/src/App.css:1415–1430`

Screenshot: [today](screens/today.png), 2026-10-06.

### Today · P1

Explicit capability mismatch / 明确能力错配

WaterCard总是提供写入按钮，而iOS会拒绝不可用的health.writeWater；体重表单也没有按能力控制配对秤入口。用户先看到可行行动，再进入死路。根据宿主真实能力隐藏或明确禁用控件，保留只读数值和就地说明，不模拟成功。

`packages/pages/src/components/WaterCard.tsx:59–73`; `packages/pages/src/App.tsx:180–186`; `packages/pages/src/components/WeightSheet.tsx:119–126`

### Diary · P1

Observed repetition + unimplemented model / 实见重复＋未实现模型

1310 kcal出现两次，最长段落解释缺少餐次和份量存储。近期米饭chip像内容，实际会再次记录。合并总量和添加入口，标明日期与最近使用快捷项，限制说明缩成短提示。真实条目、餐次归属、已记录份量编辑需要持久化身份，属于产品与数据工作，不能靠视觉补齐。

`packages/pages/src/screens/DiaryScreen.tsx:28–81`

Screenshot: [diary](screens/diary.png), 2026-10-06.

### Diary / empty · P1

Observed historical state + current code / 历史实见＋当前代码

注明日期的饮食空态仍显示0 kcal、−0运动和1757余量。解释文案虽诚实，数字仍容易被读成完整状态。未记录应作为状态展示，数据不完整时收起净摄入和余量汇总，优先一个温和添加动作。已记录摄入为零不应等同实际没有吃。

`packages/pages/src/screens/DiaryScreen.tsx:28–79`; `packages/pages/src/state/select.ts:70–82`

Screenshot: [empty-diary](screens/empty-diary.png), 2026-10-05.

### Progress · P2

Observed data communication / 实见数据表达

观测折线和局部纵轴清楚，但没有横轴日期刻度或图例，无法解释周速率是拟合值而非这条折线。补三个日期刻度、可读时期和变化文本；只有真正绘制拟合线时才加观测/趋势图例。保留日历间距与真实缺测，不补零。营养、活动、覆盖率合并成次级行；30天和稀疏数据仍需重新实测。

`packages/pages/src/components/InsightsScreen.tsx:25–42`; `packages/pages/src/components/InsightsScreen.tsx:92–175`; `packages/pages/src/state/chart.ts:1–90`

Screenshot: [progress](screens/progress.png), 2026-10-06.

### Partner · P2

Design judgment + unimplemented feature / 设计判断＋未实现功能

两个泛化圆、两张说明卡和满宽设置动作让页面像公告板。保留诚实未开放说明与不比较数字的文案。用一个小成对图形和一句支持表达，再加一个本地状态说明；设置降为次级链接。关联、共享、同意和鼓励送达尚未实现，不补虚构伙伴、假本地cheer或假连接动作。

`packages/pages/src/screens/PartnerScreen.tsx:3–25`; `packages/pages/src/App.css:1449–1452`

Screenshot: [partner](screens/partner.png), 2026-10-06.

### Me · P1

Observed task priority / 实见任务优先级

访客/目标体重卡与本地模式卡占顶部，多项未开放工具排在Settings和About之前；资料与目标像设置行却只能读取。可用Settings/About前置，本地资料压成明确只读摘要，未开放连接随后分组或折叠。中性图标线宽向底栏对齐，秤图标目前更像天平。不要把登录描绘成已完成。

`packages/pages/src/screens/MeScreen.tsx:42–89`; `packages/pages/src/components/MeIcons.tsx:1–120`

Screenshot: [me](screens/me.png), 2026-10-06.

### Settings · P2

Historical observation + platform inconsistency / 历史实见＋平台不一致

朴素分组列表和语言标签值得保留。注明日期的iOS二级页面保留底栏，Android二级路由隐藏，属于导航约定不一致，不是要求重画已认可底栏。统一二级页规则并验证返回恢复。语言写入缺少可见等待态，错误进入泛化不可用内容；增加保存中、避免重复点击，失败保留原语言。外观选择尚未实现，不能称为已实见的深色模式bug。

`packages/pages/src/components/SettingsScreen.tsx:29–87`; `packages/pages/src/App.tsx:103–108`; `apps/ios/LeanOn/Bridge/NativeRouter.swift:15–27`; `apps/android/app/src/main/java/com/zzzode/leanon/MainActivity.kt:212–223`

Screenshot: [settings](screens/settings.png), 2026-10-05.

### Weight form · P1

Historical observation + code / 历史实见＋代码

无效值截图正确保留输入0并给出本地化范围提示。但下划线没有明显焦点/错误区别，配对秤分散手动任务。保留真实输入、单位、校验、取消和保存；增加清楚字段边界与就地错误状态，写入失败作为表单级消息，配对按能力控制。这里没有独立历史体重编辑器，新增需定义日期与身份。

`packages/pages/src/components/WeightSheet.tsx:32–70`; `packages/pages/src/components/WeightSheet.tsx:80–126`; `packages/pages/src/App.css:480–505`

Screenshot: [weight-invalid](screens/weight-invalid.png), 2026-10-05.

### Food new / portion / custom edit · P1/P2

Current code only; old food screenshot superseded / 当前仅代码；旧食物截图已过期

搜索、选择、份量和自定义食物管理集中在大组件内。份量详情的热量预览比可编辑克数更强；保存/取消位于详情滚动区。顶部取消、返回结果、底部取消争夺出口。以克数输入为主、kcal为次级即时估算，区分任务内返回与整体关闭，键盘上方固定行动区；返回保留查询和选择。自定义增改使用紧凑标签字段，删除单独确认。食物定义编辑不等于已吃条目编辑。早期绿色缺输入截图不能证明当前缺陷。

`packages/pages/src/components/FoodSheet.tsx:388–410`; `packages/pages/src/components/FoodSheet.tsx:544–678`; `packages/pages/src/components/FoodSheet.tsx:681–833`

### Exercise new / edit · P1

Historical observation + current code / 历史实见＋当前代码

编辑先显示已有活动与时长，再给很长运动目录，割裂当前任务与估算。当前运动前置，换运动作为展开/搜索任务，时长和估算保持相邻。保留固定动作、预填、防重复提交和失败保留草稿。未选择/无效草稿未禁用保存时，应清楚说明所缺内容；选中使用勾选和文字，不只靠颜色。iOS截图不能证明Android Back或保存已通过。

`packages/pages/src/components/ExerciseSheet.tsx:53–98`; `packages/pages/src/components/ExerciseSheet.tsx:115–180`

Screenshot: [exercise-edit](screens/exercise-edit.png), 2026-10-05.

### Empty / loading / failure / modal · P1

Code gaps, not newly observed states / 代码缺口；本轮未新实测

无体重时App把Today、Diary和Progress都挡在同一张先记录体重卡后；记录食物不应必须先算TDEE。把记录与估算分开，空态按路由表达。初始化缺失会回退sampleHostData，原生读取失败不能变成看似真实的演示记录。加载、读取失败/重试、确认空、能力不可用需分开。保存中只保留一个行动，防重复写、失败保留输入，成功依据真实宿主结果。写入期间Back/取消需有明确规则；弹层焦点恢复和键盘遮挡须原生验证后才能宣称解决。

`packages/pages/src/App.tsx:48–56`; `packages/pages/src/App.tsx:83–101`; `packages/pages/src/App.tsx:455–464`; `packages/pages/src/components/WeightSheet.tsx:53–70`

Screenshot: [no-weight](screens/no-weight.png), 2026-10-05.

### Typography / accessibility / theme · P1/P2

Observed styling + code audit; assistive technology untested / 实见样式＋代码；辅助技术未测

内容蓝色与底栏绿色各行其是，等同圆角白卡与较重数字拉平含义。末尾CSS覆写.Weight-value和.Macro-val，但实际数字类是.Weight-current和.Macro-grams，减字重意图没有命中。输入多有标签，很多可点击view仍缺明确按钮/禁用/选中语义，透明度反馈还会淡化文字。统一紧凑字阶、常规正文、中等字重等宽数字和单位基线，并分别检查中英文换行。集中色彩角色，覆盖SVG与原生宿主，禁用文字保持可读、字段/焦点边界至少3:1。实际设备检查iOS44pt/Android48dp目标；rpx不是pt。大字、读屏、减少动态及深色模式未测前，不宣称无障碍通过。

`packages/pages/src/App.css:206–209`; `packages/pages/src/App.css:264–267`; `packages/pages/src/App.css:1415–1431`; `packages/pages/src/App.css:25–27`; `packages/pages/src/components/InsightsScreen.tsx:37–41`

Screenshot: [today](screens/today.png), 2026-10-06.

## 应保留的设计

保留原生底栏形态、图标语言、选中胶囊和动效。保留直接记录入口、暖纸底色、单位、真实输入、就地校验、草稿保留、防重复提交、已显示且按日历间距的体重图，以及诚实本地/不可用状态。最新Partner已不声称cheer送达，Me也不应被当作有真实登录。早期缺输入、空图表和底栏截弹层属于旧版本证据，不能沿用为当前P0。

## 统一视觉方向

统一方向：两人日常相互支持的安静伙伴。暖画布、石墨文字，白表面只承载主摘要或边界明确的任务；行动沿用现有植物绿导航强调色。内容比底栏更轻，每屏一个主要数字，次级信息用开放分隔行。关系品牌轻量出现在Today/Partner，工具页保持功能性。类别色可用于小图标或图表线，不铺满每张卡；避免竞争评分、礼花、玻璃面板和排行榜。这是评审方向，不是完整重设计。

## 获授权后的改造顺序

改造顺序：1可信状态：区分缺失/零/不可用，去掉死路，保持弹层、输入和持久化行为。2 Today/Diary任务层级：一个日摘要、紧凑记录、去掉重复总量。3共享基础：token、字阶、按钮、字段、列表；若外观进入范围，再做真正双平台浅深色协调。4 Progress日期/图例与表单任务连续性。5 Me/Partner内容减法和关系品牌。每步都以底栏为基准，重新验收iOS/Android截图、空/有数据/失败、两语言及大字。日记存储、关联和登录作为独立能力工作走仓库RFC。

## 覆盖边界

当前没有可用受支持屏幕控制工具，无法新做触控交互。新证据：iOS五tab中文浅色，Android Today中文浅色。注明日期的既有证据：iOS Settings、饮食空态、无体重、无效体重及运动编辑。当前食物布局/搜索/自定义编辑、其他连接弹层、加载/错误/权限拒绝、英文、深色、大字、读屏、Android导航与表单属于仅代码或未见范围。本次不审查健康指导或公式。既有v2/v3稿是提案，排除出当前运行证据；不宣称完整无障碍或交互通过。

## 建议设计 token

Starting values, not implemented. See [tokens.json](tokens.json).

| Role | Light | Dark |
| --- | --- | --- |
| canvas | #F8F7F4 | #201D26 |
| surface | #FFFFFF | #2B2731 |
| ink | #28242C | #FAF5F3 |
| muted | #69616B | #CEC3CE |
| action | #176B50 | #84D2AF |
| actionTint | #E7F1EB | #263D34 |
| divider | #E5DED8 | #443D48 |
| fieldOutline | #8B808E | #8B7B91 |
| error | #B63D46 | #FF949C |

Spacing 4/8/12/16/24/32/40; title27, section18, body16, auxiliary14, main number44, secondary32; body400/number500/title600.
One main summary per screen; open secondary rows. Physical values are pt/dp or sp, not rpx.
Contrast checks apply only to the listed token pairs, not complete accessibility.

## 官方依据与优先级

P1：下一轮优先处理的可信度、任务或可用性问题；P2：随后改进的表达与一致性。未发现可按当前新截图确定的阻断级P0。源码仅静态审查的风险不会冒充已复现。

- [Android Developers: accessibility, 48dp targets and semantic descriptions](https://developer.android.com/guide/topics/ui/accessibility/apps)
- [W3C: normal text contrast 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C: non-text contrast and necessary control boundaries](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

Apple HIG页面本轮只返回需JavaScript，未读取有效正文，因此不以其名义引用具体条款。iOS44pt为建议验收目标；并非本轮实测。AGENTS.md已读取；本机.agents/skills目录已检查，未发现与本次原生UI评审相匹配的专项技能；memory仅做历史检索，无相关LeanOn依据。
