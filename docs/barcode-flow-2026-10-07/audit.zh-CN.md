# 条码恢复链路：源码审计

[English](audit.md)

审计日期为 2026-10-07，分支为 `main`，HEAD 为 `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`。
工作区实现仍在并行修改，尚未提交。
本报告仅依据当前源码，不代表已经运行或实际看到任何页面、权限弹窗、相机识别、网络异常或持久化失败状态。
审计未修改产品源码、测试、模拟器数据或用户记录。
02:07 UTC 的首次页面冻结已因主任务发现原生交互问题而被后续修复取代。
本审计重新阅读了 02:20 UTC 后续修复和 02:30 UTC 反馈冻结源码，包括最上层返回、份量预填、焦点/尺寸变化避让与原生回填后的错误保留。
已审重建 bundle 为 `3a598649f5f5ed6b02929cb351677a05579c0d6da894e191f0305b13a3f7a134`，已独立读取本地 SHA-256 核对。
以下行号对应该工作区版本；最终原生复测由主任务负责，本次刷新时结论仍未知。

## 已交负责人处理的问题

| 问题 | 用户影响 | 当前源码状态与证据 |
|---|---|---|
| iOS 返回首个非空 Code 128，且未展开 UPC-E。 | 无效帧会结束扫码；有效 UPC-E 可能被拒绝或产生错误产品身份。 | 已重新阅读负责人加入的有效候选过滤与展开逻辑：`apps/ios/LeanOn/Scanner/barcode-scan-view-controller.swift:103`、`product-barcode.swift:5`、`:21`。实际运行及测试结果由主任务验证。 |
| iOS 查询与扫码食品写入边界只校验普通食品 ID，Android 已校验 GTIN。 | 直接原生调用可产生共享页面拒绝的产品身份。 | 负责人已在 `apps/ios/LeanOn/Net/open-food-facts-client.swift:42` 与 `apps/ios/LeanOn/Modules/HealthModule.swift:133` 加入规范化校验。内部存储 API 保留旧记录兼容。 |
| Android 接受全零 GTIN，共享 TS 拒绝。 | 原生解码与页面对有效产品码的判断不同。 | `apps/android/app/src/main/java/com/zzzode/leanon/scanner/ProductBarcode.kt:7` 已加入全零拒绝。 |
| 食品导入锁只保护弹层关闭，没有保护全局原生返回。 | 导入写入已开始时关闭页面，会隐藏结果，而目录仍可能完成持久化。 | `packages/pages/src/App.tsx:149`、`packages/pages/src/state/scan-food.ts:107` 已用操作 gate 保护导入关闭。此处写入食品目录，不代表记录了一餐。 |
| 返回食品列表后再次查询同一已导入产品，effect 依赖不变。 | 第二次查询可能关闭条码层，却不进入份量确认。 | `packages/pages/src/App.tsx:480` 与 `packages/pages/src/components/FoodSheet.tsx:200` 已加入明确的选择版本号。 |
| 收藏/目录刷新会重新应用原产品和 100 g 份量。 | 同一表单内用户修改的份量可能悄然重置。 | `packages/pages/src/state/food-selection.ts:6` 与 `FoodSheet.tsx:198` 按选择 token 只消费一次；新扫码结果有新版本，暂未找到产品时仍可等待目录到达。 |
| 编辑扫码食品时替换 RPC 未传微量营养。 | 仅改名称也可能清零纤维、糖、饱和脂肪和钠。 | `packages/pages/src/state/food-edit.ts:14`、`FoodSheet.tsx:344`、`App.tsx:416` 已保留表单未开放编辑的字段。 |
| OFF 未明确单位的份量变成克默认值。 | 未知单位被赋予质量含义，与 RFC 0033 不一致。 | `packages/food-data/src/barcode.ts:49` 现仅在明确克单位或质量份量说明时生成新默认值；旧持久化食品不动。 |

以上均已重新阅读修复源码，不在本报告中标成“实际运行通过”。

## 主任务提供的原生后续诊断

主代理报告在候选 bundle `ab4981135d7f08e837b7575020b5db8ed2a83ade2fe9aa8715e70493ab088054` 上观察到以下现象。
这是主代理提供的历史候选 hash；[source-checkpoint.json](source-checkpoint.json) 由主任务维护当前检查点。
本审计没有执行这些原生操作，也未独立截取其截图。
下表实际现象归属于主任务；修复判断仅为源码复核。

| 证据类型 | 问题及用户影响 | 后续冻结源码 |
|---|---|---|
| 主代理 Android 观察 | 条码子层内一次系统返回关闭了整个 FoodSheet，而不是回到父层，丢失预期的搜索/草稿上下文。 | `App.tsx:148` 通过 `state/modal-dismiss.ts:11` 分发；`BarcodeLookupSheet.tsx:44` 同步取消操作并关闭子层，`:45` 注册/注销该 handler；`FoodSheet.tsx:953` 透传注册。controller 优先阻止导入关闭，旧 cleanup 不会清掉新 handler（`modal-dismiss.ts:7`）。 |
| 主代理 iOS 观察 | 数字键盘展开后 Amount 被底部动作区域覆盖，第二次点击命中关闭操作。 | Amount 在 Meal 之前（`FoodSheet.tsx:797`、`:817`），目标 `:798` 使用 `flatten={false}`；焦点触发 center/start/none 的 `scrollIntoView`（`:142`、`:806`），详情滚动区高度变化且字段仍聚焦时再次避让（`:148`、`:766`）。实际键盘可见范围和点击区域仍需主任务重建后复测。 |
| 源码诊断，并非本审计独立观察的 UI 失败 | 预填使用 `selected.defaultGrams`，但条码确认的份量状态可被指定为 100 g。默认 80 g 的食品可能显示 80，而营养计算按 100。 | `FoodSheet.tsx:232` 现按当前 `grams` 调用 `setValue`，与 `:210` 的份量计算一致。新候选原生输入显示仍需检查。 |

最上层 handler 只关闭条码子层；子层清理后再次返回才可以关闭父层。
份量避让只处理聚焦字段和实际视口高度变化，没有重复计时器或记录写入。

## 原生回填后的错误反馈诊断

主代理报告，在候选 `a2c05ca4783880224c8b0ea93a4a5d3351e4e6877a835cf23d5235781dd2dde8` 上真实找不到产品/404 查询后错误消失，而相同按钮能够查到另一已知产品。
这组证据不能诊断为“点击未触发”。
本审计没有执行这些原生操作。

页面负责人提供的 Android SDK 字节码已经本审计阅读：`setValue` 调用 `Editable.replace`（`/tmp/leanon-input-bytecode.txt:1694`、`:1766`）。
已注册的 TextWatcher 发出携带文本的 Lynx `input` 事件（`/tmp/leanon-input-watcher-bytecode.txt:18`）。
旧 input handler 在程序回填条码后无条件清除查询错误。
该原生事件路径与错误消失现象相吻合，是主任务观察支持的源码/SDK 诊断。

冻结修复先将规范化条码及错误同步写入 ref，再调用原生 `setValue`（`BarcodeLookupSheet.tsx:23`、`:29`、`:56`）。
同值程序输入保留失败/重试状态，条码真正变化才清除（`state/barcode-feedback.ts:13`、`BarcodeLookupSheet.tsx:74`）。
手动查询使用 ref 最新值，避免旧 render 闭包取值（`BarcodeLookupSheet.tsx:53`）。
两项事件序列回归覆盖同值回填，以及 UPC 规范化回填后真实编辑（`state/barcode-feedback.test.ts:4`、`:12`）。
修复已读源码且自动化已测，本报告不声明 `3a598…` 原生行为已通过。

## 契约、营养、取消与兼容性

- 原生预检返回 `{cameraAvailable, permission, hostAvailable}`，读取状态不能申请权限或打开相机（`packages/bridge/src/contracts.ts:37`、`:279`；iOS coordinator `:55`；Android ScannerModule `:21`）。
- 相机、产品查询、目录导入和饮食记录是不同操作（`contracts.ts:246`、`:280`、`:284`；`packages/pages/src/state/scan-food.ts:65`）。
- 手动输入条码只校验/查询 GTIN，不调用相机 API（`scan-food.ts:41`）。
- UPC-A 统一到带前导零的 EAN-13；旧 `off-<12 位 UPC>` 存在时按原 ID 重新打开（`scan-food.ts:46`）。
  此链路不重写 ID、不迁移收藏/最近记录，也不删除或改写历史记录。
- 两端返回 OFF 原始产品，营养转换统一在 TS 完成，包括 kcal/kJ、钠/盐和份量（`packages/food-data/src/barcode.ts:60`、`:80`、`:98`）。
  两端查询均包含份量及产品单位字段（iOS client `:37`；Android client `:71`）。
- 明确的容量单位被拒绝，不能把 100 ml 当作 100 g（`barcode.ts:102`）。
  页面进入 100 g 确认，不直接相信产品默认份量（`App.tsx:481`）。
- 原生网络超时为 8 秒，共享只读查询截止时间为 15 秒（`scan-food.ts:30` 及两端 OFF client）。
  超时后到达的只读响应不能恢复已丢弃的导入路径。
- 弹层 pending ref 阻止重复点击，操作版本抑制过期 UI 响应（`packages/pages/src/components/BarcodeLookupSheet.tsx:34`、`:44`）。
  helper 在写入前检查取消（`scan-food.ts:62`）。
  App 按请求身份释放锁，旧已取消请求不能释放新请求的导入锁（`App.tsx:458`、`:488`；`scan-food.ts:112`）。
- 原生单次扫码只允许一个待完成请求：iOS coordinator `:42`；Android launcher `:19` 与 `ProductBarcodeDecoder.kt:10` 的帧 gate。
  取消、返回、后台等生命周期表现仍需原生验证。

食品目录导入推进存储版本时不改打开的记录草稿日期（`packages/pages/src/state/record-mutation.ts:37`）。
饮食保存明确使用捕获的草稿日期（`App.tsx:330`），餐次在 FoodSheet 本地状态内跨嵌套条码层保持（`FoodSheet.tsx:123`）。
已审源码的子层取消保留食品搜索词，成功选择产品后清空搜索词并进入份量确认（`FoodSheet.tsx:205`）。
前述 Android 返回观察推翻了“所有原生返回路径已保留”的初始判断；后续修复必须有独立运行结果。
这些是源码关系复核，不是实际运行连续性通过。

当前模型仍有两项独立限制：缺失营养值变成数值零（`barcode.ts:75`）；缺失营养计量基础时，仅凭 `_100g` 属性名不能证明产品按质量计量。
未知营养不能证明为零；明确容量产品已拒绝，但未知元数据不等于已验证的质量基础。
完整解决需要营养完整性/计量基础字段和 UI 表达，当前源码没有提供这些保证。
默认份量的问题已在源码修复，不再作为未解决模型限制。

## 可见“不可用”入口清单

| 入口 | 当前根因 | 可用实现的规模 |
|---|---|---|
| 扫码相机 | 相机不存在、权限、活动宿主或缺少原生能力。 | 现有原生链路与恢复 UI；手动查询独立可用，不需要账号服务。 |
| 条码查询/导入 | 网络/服务响应、找不到产品、无可用能量值、容量单位、持久化失败或旧宿主能力不足。 | 现有本地链路；保留条码，提供重试/搜索/手动创建。 |
| Me 饮食偏好 | `MeScreen.tsx:35` 永久只读、无 handler；当前 profile/records 没有偏好字段或 RPC。 | 中等本地功能：定义偏好语义、持久化、筛选与未知食品属性处理。不能依赖不完整食品数据承诺过敏安全。 |
| Me 数据导出 | `MeScreen.tsx:36` 永久只读、无 handler；没有导出/分享 RPC。 | 中等本地功能：完整版本化快照或明确 CSV、原生文件/分享目的地、失败/取消与敏感数据处理。并不必然需要登录或云备份。 |
| Partner 关联/消息/共享 | `PartnerScreen.tsx:11`、`:15` 明确本地模式；没有伴侣/账号/关联/共享契约。 | 大规模新能力：身份、双向同意、授权、同步、冲突及隐私设计。开启按钮不能完成它。现有一起活动建议和设置入口不伪称发送消息。 |
| 健康连接 | 缺少宿主方法，或设备 HealthKit/Health Connect 支持/权限状态。 | 现有平台集成；区分不支持设备、拒绝/未知权限和临时同步失败。 |
| 提醒 | 缺通知方法、权限或设置读取/保存失败。 | 现有本地原生链路。负责人已统一完整方法组（`state/capabilities.ts:23`、`MeScreen.tsx:34`、`App.tsx:595`）；声明方法存在不代表设备权限或提供方运行已验证。 |
| 连接体脂秤 | 缺方法、蓝牙状态/权限、未找到设备或连接/订阅错误。 | 现有 BLE 链路；真实硬件验证不能用模拟器页面替代。负责人已按完整组判断（`state/capabilities.ts:24`、`MeScreen.tsx:33`）；声明方法存在不代表真实秤连接已验证。 |
| 记录/资料/饮水保存 | 缺 `records.mutate`、日记刷新失败或安全估计暂不可用。 | 现有本地服务/能力恢复；不能通过虚构体重或不安全指导消除空态。 |

当前完整 iOS/Android 能力注册表均声明 scanner、food、records、提醒、健康提供方和体脂秤方法。
不能仅凭条件分支就说这些宿主“没有实现”，需核查实际安装构建及设备状态。
`review.unavailableBody` 是宽泛兜底文案，不代表每种失败的诊断。

## 主任务最终验证覆盖要求

页面负责人提供阶段日志 `/tmp/leanon-scanner-pages-tests.log`（24 项针对性通过）与 `/tmp/leanon-scanner-bridge-tests.log`（14 项通过），本审计已读取。
后续 `/tmp/leanon-scanner-p1-tests.log` 在 02:20 UTC 报告 26 项针对性通过，含两项最上层返回测试；`/tmp/leanon-scanner-p1-typecheck.log` 记录页面类型检查成功调用。
反馈负责人日志 `/tmp/leanon-barcode-feedback-tests.log` 在 02:30 UTC 报告 28 项针对性通过，类型检查日志也已读取。
主任务旧候选全仓检查曾分别通过 `ab498…` 的 331 项与 `a2c05…` 的 333 项；它们不代表原生 UI 验收，也是当前源码的阶段性记录。
主任务报告 bundle `3a598649f5f5ed6b02929cb351677a05579c0d6da894e191f0305b13a3f7a134` 按 build → typecheck → 335 项 TypeScript 测试通过；本审计已完整读取 `/tmp/leanon-scan-workspace-recovery-{build,typecheck,tests}.log` 并核对各包汇总。
数量为 Pages 101、Bridge 47、food-data 42、core 83、i18n 18、data 14、delivery 23、exercise-data 7，无报告失败测试。
bundle hash 与本审计读取的本地产物一致。
这些由负责人/主任务执行，不是本审计执行。
当前构建与自动化检查通过；最终原生复测仍在进行、本报告结论未知，TypeScript 通过不能证明原生行为通过。

| 范围 | 本次源码审计 | 主任务仍需运行/测试证据 |
|---|---|---|
| 相机状态及权限 | 已审 TS/iOS/Android。 | 无相机、首次申请、拒绝/受限、已授权、脱离宿主；读状态不能触发权限。 |
| 解码 | 已审规范化、UPC-E 展开、result gate。 | 有效 EAN/UPC、无效/不可读帧持续扫码、重复帧只完成一次；位图测试与物理相机验证需区分。 |
| 恢复路径 | 已审分型错误、条码保留和原生回填反馈修复；所提供日志中的事件序列与当前全仓测试通过。 | 新候选原生找不到产品错误持续可见并能重试，真实编辑才清除；另核查校验位错误、超时、离线、HTTP/畸形响应、缺能量、容量产品与导入失败。 |
| 取消及并发 | 已审操作版本、锁与原生单请求。 | 取消/返回/后台、查询中关闭、旧响应前重试、双击、导入关闭保护及重复同产品查询。 |
| 营养/旧 ID | 已审换算和旧 UPC alias。 | 固定 kcal/kJ/钠/盐夹具、质量/容量、旧 UPC ID 与收藏/最近记录保留、导入目录不写入饮食记录。 |
| 原生页面连续性 | 前文引用主任务的 `ab498…` 失败；本审计未实际查看。后续修复仅源码已审。 | 新候选 hash 和原生复测：一次返回保留 FoodSheet/搜索词/日期；Amount 聚焦后可见可编辑、显示克数与计算一致；键盘/安全区、中英文及明暗主题。 |

不能把源码审计变成截图或设备测试声明。
主任务最终报告需区分源码已审、自动化通过、原生运行通过、仅实机可测及受阻状态。
