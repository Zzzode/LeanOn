- Start Date: 2026-10-03
- RFC Type: architecture
- Status: Proposed
- Related: 0005, 0006, 0007, 0008, 0009, 0019, 0027

> [English](0028-bottom-tab-native-shell.md) | 简体中文

# 底部 Tab 导航与 Native 壳

## 摘要

将 App 重构为原生底部 Tab 栏，包含五个目的地——Today、Diary、Progress、Partner、Me；每个屏幕是一个路由参数化的 Lynx 容器，由原生宿主负责导航，并把设置与登录收进 Me。

## 动机

当前整个 App 运行在单个 LynxView 中，顶层导航是 Lynx 自绘的分段控件加一个以覆盖层呈现设置页的齿轮。这偏离了平台惯例：主要目的地无法从一个持久、系统标准的位置到达；语言切换放在每一页；登录没有归属；切换目的地会丢失屏内状态；也没有每屏独立的返回栈。

顶尖的健康与健身类 App 都用原生底部 Tab 栏承载四到五个主要角色，保留每个 Tab 的导航栈与滚动位置，并把设置和账号放在个人主页。如果不做这次重构，随着饮食日记、伴侣和个人主页等能力加入，只会把更多模式堆进同一个容器，认知负担随能力增长而加重。

## 指南层面的说明

- App 打开停留在 Today。持久的底部栏显示五个 Tab：Today、Diary、Progress、Partner、Me。点按 Tab 即时切换，并保留该 Tab 的状态（滚动位置、已输入数据、各自的返回栈）。
- Today 是一屏总览仪表盘：能量环、宏量、水合、体重快照、活动与饮食质量。
- Diary 是饮食日记：当天各餐、添加食物（搜索、条码、自定义），以及底部“食物减运动等于净摄入/剩余”的汇总。
- Progress 是升级版洞察：带目标线的体重曲线、能量缺口、达标率、里程碑、目标预测与周/月报告。
- Partner 是双人界面：两人的今日、共同目标、温和对比，以及 Cheer/Hug/Note 互动。
- Me 是个人主页：头像与资料、目标、饮食偏好、健康 App、连接的秤、提醒、设置（语言、单位、主题、关于）与数据导出。未登录时展示 guest-first 的登录卡片；不登录也能在本地完整使用。
- 语言切换只放在 Me 的 Settings 里，不再出现在每一页。

## 参考层面的说明

### 路由驱动的 Lynx 容器

- 每个屏幕是一个原生界面对象，内含一个加载同一 bundle 的 LynxView。要渲染哪个屏幕，由引导数据中的 `route` 字符串决定，而不是 Lynx 内的 Tab 状态。
- 引导数据增加 `route` 字段，把现有 `initialRoute` 测试钩子通用化：`BootstrapData = { hostData, locale, route }`。
- pages 根节点读取 `route`：
  - 已知路由只渲染对应屏幕；
  - 缺失或未知路由（Web 预览、旧宿主）渲染一个开发者壳，其 Lynx 自绘 Tab 栏仅用于本地开发与 Web 预览。这保证迁移期间 Web bundle 与旧的单容器宿主仍可工作。
- 模态快速记录任务（体重、运动、食物、水合的 sheet）仍作为发起它的屏幕内的 Lynx 模态。完整目的地（Settings、Goals、食物搜索）则由原生导航栈 push 为新的路由容器，而不是切换 Lynx 内的某个模式。

### 路由表

- 一级 Tab：`today`、`diary`、`progress`、`partner`、`me`。
- 初始的 push 页面：`settings`、`goals`、`profile-edit`、`health-connections`、`food-search`。其他（指标详情、秤配对）随对应功能加入；秤配对可继续用 sheet。

### iOS

- 根是 `RootTabBarController: UITabBarController`，含五个 Tab。每个 Tab 是一个 `UINavigationController`，其根为 `LynxContainerViewController(route:)`。被 push 的页面是该导航栈上额外的 `LynxContainerViewController(route:)`。
- Tab 懒加载；每个容器拥有独立的 LynxView（同一 bundle），与现状一样布局在安全区内。Tab 栏、转场、滑动返回与各 Tab 状态由系统提供。
- `SceneDelegate` 把 Tab 栏控制器设为 `rootViewController`，取代单个容器。
- `ServiceRegistry` 仍是持有记录存储的共享单例。事件分发器维护已挂载 LynxView 列表，把 `records.changed` 扇出到所有视图；容器在加载时绑定、释放时解绑。每个容器在加载时读取最新 HostData，之后靠扇出事件更新。

### Android

- `MainActivity` 承载由 Jetpack Navigation 驱动的 Material 3 `NavigationBar`：一个 `NavHostFragment` 配含五个一级目的地的导航图。每个目的地是一个 `LynxContainerFragment`，构建按路由参数化的 LynxView。被 push 的页面是额外的目的地或 Fragment。
- `NavigationUI` 负责栏、标签、各 Tab 返回栈与状态保留；Fragment 保留其视图状态。
- 共享单例仍在 `LeanOnApplication`（记录、事件、能力）。分发器把变更事件扇出到已挂载的 Fragment 视图，在视图创建时绑定、销毁时解绑。

### 状态与数据扇出

- 原生写入本就会派发带最新 HostData 的 `records.changed`。多容器后，宿主把该事件广播给每个已挂载的 LynxView，使所有 Tab 保持一致；前台 Tab 也即时反映变更。
- 在写入之后创建的容器会在加载时读取最新快照，因此顺序是安全的。

### 登录与 Me

- App 是 guest-first、本地优先：记录无需账号。Me 展示登录卡片，说明备份、跨设备同步与伴侣关联；登录是 Me 内的动作，绝不成为阻断式门槛。账号与同步机制遵循 RFC 0008。

## 缺点

- 五个 LynxView（每个已挂载 Tab 一个）相比单个复用视图占用更多内存，并有首次访问的加载成本；懒加载与系统复用可缓解。
- 原生导航相比完全 Lynx 自绘壳更难动态重配：一级 Tab 的集合与顺序随 App 发布。动态下发仍适用于每个 Tab 内的内容（RFC 0007）。
- 这是对当前假设“单容器”的双端宿主的较大重构，且暂时需要开发者壳兜底。

## 理由与备选方案

- 原生 Tab 壳对比“单 LynxView + Lynx 自绘 Tab 栏”：原生带来平台标准的外观与动效、无障碍（动态字号、大内容、VoiceOver/TalkBack 焦点）、有保障的各 Tab 状态与返回栈，以及正确的安全区/键盘处理。Lynx 自绘栏仅保留用于 Web 与开发者预览。
- 对比顶层分段控件或汉堡菜单：底部 Tab 让所有主要角色一键可达；分段控件只能承载两个并列项，抽屉则会隐藏目的地。
- 对比双端各自纯原生屏幕：那会把 UI 重复实现两次，并失去共享的 Lynx 渲染与动态内容；路由容器保留单一 UI 代码库，同时让原生负责导航。
- Flutter 或其他跨端壳此前已被否决；Lynx × Native 是既定架构。

## 待解决问题

- 五个 LynxView 同时存在时在低端 Android 上的确切内存与启动表现（需验证；可考虑视图回收或只保留最近的 Tab）。
- 一级 Tab 配置是否需要远程可控，以及相应的安全兜底策略（默认：v1 固定 Tab）。
- 账号/同步落地前 Partner Tab 的数据来源：本地第二个 profile，还是明确标注的预览状态。

## 实施计划

垂直切片；每个切片在适用处都通过双端的类型检查、构建与验证。

1. pages 路由架构：给引导数据与契约加 `route`；创建 TodayScreen、DiaryScreen、ProgressScreen、PartnerScreen、MeScreen 并迁移现有内容（Today = 当前仪表盘；Progress = 当前洞察；Me = 个人资料加当前设置）；按路由渲染单屏，且只在开发者/Web 壳保留 Lynx Tab 栏。验证 Web 预览及当前宿主无回归。
2. iOS 原生壳：RootTabBarController、五个带路由容器的导航栈、Settings 的 push 与多视图事件扇出；在模拟器验证五个 Tab。
3. Android 原生壳：NavigationBar 加导航图、路由 Fragment 与各 Tab 返回栈；在模拟器验证。
4. 双端打磨：push 子页、状态保留、无障碍与 CI 更新；完整双端验证。

后续工作：

- 食物条目与餐次：当前 `IntakeSample` 只存每日聚合（kcal/macros/micros），没有餐次或逐条食物；完整 Diary（每餐食物、份量、编辑）需要在后续 RFC 扩展数据模型。
- 伴侣数据：真实双人记录依赖账号关联与同步（RFC 0008）；在此之前 Partner 展示框架与本地/预览内容。
- 持久化语言、单位与主题偏好，启动时读取并通过 Me 的 Settings 应用。
