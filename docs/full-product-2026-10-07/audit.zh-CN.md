# 完整产品安全与验收审计

## 最新限定范围闭环 — 2026年10月7日

本节取代下文较早仍待处理的 Progress 对比度、Partner 密度、图库重复／分页偏移及 Android 新回执协议真实运行门槛。
最终共享包为 `7711c4ba96b81f8d0917c77b8b93618462f234a6782046db3a571af37d095f10`，双端隔离原生宿主内嵌字节一致。
本节由 root 编写；下方独立审计及旧不可变检查点保留原作者和证据范围。

| 已观察问题 | 修正与用户影响 | 证据边界 |
|---|---|---|
| Progress 体重标题／空态对比度，根内容延伸到原生浮动底栏下 | 标题和空态采用正文墨色；Lynx 根内容止于原生安全区。已认可的底栏源码未改。 | 不筛选问题的系统对比度审查覆盖完整图表，再覆盖完整可见的营养、运动、活跃天数及0。此前底栏边缘局部裁切失败仍保留；不宣称任意滚动位置或全可访问性认证。 |
| Partner 本机说明对比度，管理信息挤占伙伴主线 | 缩短双语离线说明并用正文色；UUID、设备和账号操作移到明确的“连接详情”，展开状态绑定当前账号。 | 虚构账号真实 UI 验证收起／展开身份与设备工具、保留邀请入口及最终删除账号；不把假鼓励送达或登录占位计为完成。 |
| 图库隐私段落重复，成对操作全宽堆叠 | 顶部一次本地化隐私摘要；编辑／删除及分页并排、可换行，保留最小触控宽度。选择／编辑表单保留完整隐私语境。 | 实际生成灰图截图；原照片高度、删除确认与修订检查保持。 |
| 上／下一页沿用旧滚动位置 | 使用受支持的嵌套 `scrollIntoViewOptions` 使新页从首项开始，取消过期计时器。 | iOS 在 helper 补偿滚动前断言返回首图完整可见；Android 原生翻页／返回截图显示虚构图5、图1各自位于页首。不扩大为所有伙伴共享图库分页认证。 |
| 320dp／两倍字体下隐私说明压住选择按钮 | 标题块明确列布局，说明不允许压缩。 | 最终原生中英文截图显示完整说明和按钮；不扩大为全页面大字体认证。 |

真实 Partner 页还暴露了既有 capability 注册遗漏：`companion.confirmAccountDeletionLocalData` 已实现却未公布，导致整页报告“不支持”。
已补一行注册及模块／注册表一致性测试，不改删除协议。

Android 新删除协议现有最终 QA 产物上的真实回环 TCP、AndroidKeyStore、加密多存储日志及三个独立 OS 进程验收。
前两个进程均在精确 `.uiqa` force-stop 前核验存活，之后核验已退出。
流程覆盖 DELETE 已提交但响应丢失、回执恢复／本地擦除、ACK 已提交但响应丢失、第三进程结束恢复；新建加密记录／照片字节不变，没有第二次 DELETE 或擦除。
专用别名和夹具已清理，原 QA 三份存储哈希不变。
这区别于旧 C 账号协议及内存运输测试，不证明真实 Health Connect 取消、写入中断电或生产文件系统持久性。

最终用例数、产物哈希、截图、清理回执及部署决定分别记录于 `bounded-final-acceptance.json` 与有索引的证据 ZIP。
不将重叠检查点相加为一轮测试。
没有提交、推送、付费资源、生产端点、真机操作或真实健康数据读取。

最终：工作区构建／类型检查、Pages142、i18n18通过；同轮 iOS 原生85／UI6及另轮暗色UI2通过。Android 真实回执 PID26419→26499→26576。专用夹具／密钥／模拟器／中继已精确清理。见[最终验收](bounded-final-acceptance.json)；ZIP索引保存真实原生截图。

| Correction | Current exact source anchor |
|---|---|
| Contrast/density tokens | `packages/pages/src/App.css:1763` |
| Whole header flow | `packages/pages/src/App.css:1750` |
| Gallery privacy/actions | `packages/pages/src/components/PhotosSheet.tsx:76` |
| Native page-start callback | `packages/pages/src/state/photo-page-anchor.ts:13` |
| Account-scoped secondary tools | `packages/pages/src/screens/PartnerScreen.tsx:75` |
| Native root safe-area sizing | `apps/ios/LeanOn/Container/LynxContainerViewController.swift:51` |
| Missing implemented capability | `apps/ios/LeanOn/Bridge/CapabilityRegistry.swift:21` |
| Capability parity behavior test | `apps/ios/LeanOnTests/companion-tests.swift:7` |
| Actual Android receipt process harness | `apps/android/app/src/androidTest/java/com/zzzode/leanon/companion/receipt-process-native-checks.kt:24` |
| iOS unfiltered full-label audits | `apps/ios/LeanOnUITests/personal-workflows-ui-tests.swift:508` |

## 较早检查点 — 保留历史

简体中文 · [English](audit.md)

本审计独立读取当前源码和 root／原生负责人提供的、明确标识的隔离执行证据。
审计者没有触发权限、读取真实记录、改动产品源码、发布构建或执行被阻／新批准运行阶段。
源码、单测、真实 HTTP、原生 provider、原生 UI 和实体硬件验收分层报告。

## 恢复补充：当前源码与已核执行

最终已构建共享bundle为 `12c19b25fbd6e82aac7f736b8957b9cfd368dfe43868a948ab20ee7003d66e90`（独立核全workspace build／typecheck及09:56:51Z Pages142通过）。
与实际运行 `086e4ac318be1a47f6f39b9eeea4b864b3227d6d81966bbc9f200e59e85917ed` 仅差一条中英删除验证说明；无行为／版式变化，未在文案更新后重跑runtime。
Android真bound-reader Cancel及Save现均回到可见饮食偏好Button；8张PNG hash独立匹配，两张stable画面亲看。
入口bounds1248–1395在nativebar2210上方；AX原点与真像素共同关闭此有限scope的focus P1。
iOS stable-role迁移及local-complete验证在一轮实际84／84原生批次通过；更新native build42／086另有3项受影响UI通过。
审计独立匹配build42全部102项source hash并核Release9成功；最终文案产物身份由native owner／root记录。

验证计数分别报告：历史420／3bbe；全workspace437／f69；最终Pages142与relay32组件批次；Android c66全native243（242过／1 opt-in skip）；iOS最终84／84及受影响UI3／3。
不组合这些重叠批次生成总数。
历史437／Data49／Bridge50证据在 `recovery-workspace-test-summary.json`；后续组件／构建日志保留各自身份。
早期iOS49及Android memory-transport recovery12在下方注明边界；真provider、真TCP、OS进程证据分别报告。

最终仅构建iOS43 native为 `2a2f92039655e718185310a18630818c73db8e7270b59f43d99fe282de65528b`，内置12c；Release10 unsigned可执行文件 `7ef89463424e5213f3dd35db2b811063b4cd6a4cf352968b8ec3695603bb250a` 配12c资源。
最终Android debug `d0d8111a3aefdffc2b48b9116bbe519891233f682bcb170479145069d745f0bc`；unsigned release `057fc01d21f6396964942520227961fb54742a60a0b3bdea9515c745a54c1fc2`。
审计直接匹配两APK hash及内置12c，再匹配iOS43全部102 source hash与4项log hash；build-only产物不替代真runtime086身份。
最终workspace build／typecheck／Pages日志为 `/tmp/leanon-final-copy-{workspace-build,workspace-typecheck,pages-tests}.log`，无构建或测试失败记录。
限定清理完成：Android a11y cache／4个准确alias09:59:27Z均无，原records hash保持；D清理另已完成。
iOS owner报告独占SE3于10:02:48Z移除、原17设备保留、QA／runner TCC0及正式baseline不变；未操作真机。
已执行scope没有当前审批阻碍；其余属于测试／设计／部署边界，不是生产就绪声明。

| 项目 | 当前源码／实际证据 | 待验收或修正 |
|---|---|---|
| relay删除receipt | 同state-file事务purge账号／groups／invites并存用途分离proof hash；query／ACK均有持久屏障，容量10000、客户端ACK前无TTL |最新定向32真TCP过，含重启无会话、密码／设备拒绝、fsync不确定、rename失败、冲突／容量、重注册身份及旧state兼容；非部署验收 |
| 原生准备／确认 | 加密prepared保留随机32字节proof、原realm／account／选择及双revision；严格receipt DTO后撤凭证 |Swift deletion16已过，fake relay／MemoryDataKey但真加密journal；Android恢复定向12使用memory transport／隔离加密状态已过；两项真URLSession／QA Keychain现过，同XCTest进程内native对象重开；具名真OS进程恢复现过，限下述QA namespace条件，新UI另验 |
| 本机marker／CAS | 源码经现有journal删除数据并与companion状态提交localDataCleared；prewipe改变选择须fresh双CAS |host wiring／ledger门／freshCAS keep-local(false)已有源码；定向journal／fault及两项真QA Keychain／URLSession过，具名OS进程完成已过（test-only namespace重映射），产品upgrade兼容／UI另验 |
| marker后新文件 | 已接受边界：新records／personal／health ledger文件存在时，保bytes／keys且永不重wipe |源码已统一 `account-deletion-key-cleanup-conflict`、changed=true及freshCAS keep-local(false)，Pages禁二次wipe；Swift定向新数据／keys及真QA Keychain ledger保留检查已过；不声称持久write gate／完整native验收 |
| Android重试会话 | 源码已在显式密码重试时总freshlogin，校验原账号／设备／authorized |Android定向丢响应／重开／无receipt测试过；新prepared-receipt协议没有Android真relay／OS重启验收，早期C属旧intent协议；旧token缺陷源码已修 |
| 未授权设备首次删除 | 首次持久准备前须authorized，拒绝后仍可配对／登出 |源码已在write／HTTP前拒未授权首次prepare，UI／RPC也阻Delete；Pages定向12、Swift deletion16内未授权case及Android首次guard测试过；完整最终native产物另验 |
| iOS健康清理顺序 | health actor清理须在records／personal锁及CAS前完成，超时不可遗留破坏性Task |新account路径已先清health再取coordinator锁，actor检查取消，超时返回前drain completion；定向queued-cancel测试已过，旧清理也复用同helper；等待可超过30秒，ledger清理独立于三store回滚journal |
| backup／公共DTO | 新凭证字段排除，公开phase／choice／changed／account名称，无proof |Data49／Bridge50过；早期PUBLIC双向native backup以自己的身份通过，不暗示最终provider export另重跑 |
| 图库 | 自用／Partner各页最多mounted4张，1000项及取消fixture、Pages测试过 |最终build42／086真图库首屏／下一页／返回／foreground灰像素过，审计亲看foreground；TalkBack绑定角色／ACTION_CLICK已有观察，物理手势／发音待；每gallery4张非整个进程内存上限 |
| 可访问性 | 稳定偏好／围度contrast0，真绑定TalkBack Button／CLICK及selected label已观察，设置精确恢复 |有限Cancel／Save P1已关闭：086同Button及可见bounds／真像素过，读屏设置精确恢复；Progress contrast5及Partner all-audit1未解决，物理手势／发音未核，VoiceOver未验 |
| iOS key namespace | role-stable／AAD认证legacy解析、相同DEK复制、只读预检及所有恢复写入前promote已有；含local-complete hook的实际84／84原生批次通过 | 最终84及build42／086受影响UI3过；最终12c仅文案构建验收点，非新行为重跑。未迁移正式数据／不称真实用户故障 |
| 部署 | draft保留loopback proxy／single-writer／file lease，明确volume／backup／load，并要求invite-only beta先有注册准入 |仅proposal，无付费资源／deploy／sign；1GB内存不是实测容量认证 |

此前自动review拒绝Swift新隔离relay原命令 `LEANON_RELAY_FILE=/tmp/leanon-ios-deletion-relay.SHRdqX/state.json LEANON_RELAY_PORT=0 node server/companion/dist/cli.js`，理由为原UI-review范围、后续授权未核实。
该拒绝动作未启动relay／创建账号，负责人停止，未换port／server／owner绕过。
08:57:19Z父线程用户明确批准原fresh-loopback虚构删除／重启／清理、Android D命名导入，以及临时TalkBack发音／手势并恢复设置。
root协调原动作各一次重试；批准不等于执行／验收，若再拒绝须停止。
已执行relay32／workspace437仍有效。原freshrelay重试成功，两项Swift live09:01:40Z过，随后reader／key窄修现通过，边界见下方。
两项已编译Swift live case是在同XCTest进程内使用真native HTTP／QA Keychain并重建native对象，不是OS进程kill／relaunch。
真OS进程prepare在PID23784已过；v3 recover09:20:47Z在PID58867过、oldPID absent，receipt-only恢复／atomic wipe／ACK及隔离key／file清理；先前path guard失败发生HTTP／清理前，历史C／8590只旧意图。
不推断生产、真机iPhone、真实camera／Health／BLE授权。

Android D实际范围：`/tmp/leanon-d-approved-result-sanitized.json` 确认原checkbox09:23:25Z、显式submit09:24:03Z、sync09:25:41Z。
使用原01b0／3bbe及旧8787，只有加密vault／keyring（sequence2），一条围度／两张生成照片，其它record为零，无peer sharing／health明文上传。
这关闭原命名同意／导入gate，不是当前receipt协议验收；D清理已独立核：`/tmp/leanon-android-focus-return-p1-2026-10-07/d-cleanup-result.json` 09:37:18Z四个准确alias均无、cache无、原records hash相同，无Repository初始化／key bytes读取。
root删除private handoff／typed capture，并保旧8787其它两个账号／group；D-account match0和新删除relay全0分开。
交付仅 `/tmp/leanon-d-approved-public-evidence` 五张sanitized D PNG及metadata。

### 当前准确wire与顺序

`DELETE /v1/accounts/current` body为 `{password,operationId,proof}`，proof是独立随机32字节、规范base64。
服务端存 `["leanon-account-deletion-v1",operationId,accountId,proof]` 的用途分离SHA-256，不存raw proof。
`POST /v1/account-deletions/:operationId/receipt` 与 `/ack` body均为 `{proof}`，不依赖已删Bearer会话。
未知／错误capability返回404 `deletion_not_found`；普通404／401／超时／无receipt不证明成功。
receipt查询经串行持久屏障重写，不能把rename后503当已确认durable删除。
DELETE事务内重新校验会话、账号／设备及密码snapshot。

原生phase为prepared→confirmed→local-complete。
prepared也可能已发请求但结果未知，不能据此安全取消。
先加密持久操作／账号／realm／选择／修订，再发DELETE，密码不持久。
恢复先查proof receipt，复用操作；receipt无记录才要求用户重输密码。
匹配且durable的receipt才允许持久confirmed及撤凭证。
本机删除经多store事务记local-cleared marker；清理失败保marker，永不重wipe。
local-complete持久后客户端ACK才可删除服务端receipt；此phase下确认ACK或已无receipt才可清私有准备。
因此proof保留至本机完成且ACK，不是仅远端确认。
receipt无自动过期；count／state容量满在purge前拒绝。
ACK响应丢失可重试；这是本地file-backed可恢复行为，不是分布式原子或服务端存储损毁保证。

已接受外部操作边界：若其它设备在本操作提交前删除账号／撤销授权，本机prepared capability可能没有对应receipt。
客户端保留准备，不从404推断成功；服务端取消／tombstone对账超出此最小协议。
不加入不安全取消或分布式原子声明。

后端版本边界：root报告现有loopback8787有意保持旧协议。
新客户端连该服务可先持久prepared，随后收到未知receipt路由并保留意图；普通route404不是删除确认。
新receipt／ACK协议生产前须协调server-first更新或验证readiness／capability协商，不能声称已滚动兼容。
没有重启／复用旧服务绕过review；具体批准后的fresh-relay原重试已成功，Android D原批准同意／导入／同步已在旧验收点过，清理随后已核。

### 必需隔离验收矩阵

| 情况 | 必需结果 |
|---|---|
| 本机准备写失败 | HTTP零次，凭证／记录未变 |
| prepared／请求派发后崩溃 | 重开保proof／realm／选择，先查，不新UUID |
| 错密码／会话401／路由404 | 不假成功／不清本机，保原proof |
| DELETE响应丢失 | durable receipt确认原操作，原本机选择保留 |
| 写／rename失败 | 不purge账号／不制造receipt |
| rename后目录fsync失败 | DELETE503，查询屏障未成功也失败，保proof |
| relay重启 | 已删会话可query；仍活账号能显式密码freshlogin重试 |
| receipt重放／冲突操作 | proofquery稳定，不同account操作409，错proof404，不改数据 |
| 非法proof／DTO额外字段 | 拒31／33字节、非规范base64、错类型／额外字段 |
| receipt或128MiB state容量 | purge前失败，保未ACK receipt |
| 同login新accountID | 旧准备不删／导入新账号 |
| 本机提交失败／marker重开 | 保原准备，marker与删除一起恢复 |
| marker后新records／personal／ledger | 不重wipe／不删key；changed=true、exactcode，freshCAS keep-local退出 |
| ACK丢响应／本机清准备失败 | 保durable local-complete，仅此phase下ACK重试／404安全 |
| proof隐私／账号隔离 | UI／backup／日志无proof，阻account／endpoint／export切换 |

单文件queue／PID lease仅协调单本地writer进程。
它不证明多host／共享文件系统安全、生产volume断电实测或state／receipt丢失后的恢复。
iOS定向证据：`/tmp/leanon-ios-final-targeted-49.log` 08:35:10Z 49／49过，含deletion16、真TCP HTTP边界4、Health28、凭证排除1。
HTTP fixture实际覆盖307／308零转发、声明／chunked 96 MiB超限、精确小上限，无真实账号／权限。
Health含真隔离QA Keychain ledger保留及fake HealthKit client；deletion为fake relay／MemoryDataKey，但journal是真加密文件。
此前15失败是非法dietary-preference fixture初始化，已由合法fixture重跑替代，没有放松产品校验。
Android定向证据：`/tmp/leanon-android-companion-deletion-recovery-unit-evidence` 三份XML合计08:40:40Z 12／12过（恢复8、校验2、首次guard2）。
审计者独立汇总XML，并匹配 `source-freeze.json` 全部14个源码hash。
这是memory transport／隔离加密state的repository故障／重开测试，不是真HTTP、Keystore、OS进程重启或实际host journal。
不累加到workspace437。
最新relay证据 `/tmp/leanon-companion-deletion-source-evidence.json` 及 `/tmp/leanon-companion-deletion-server-tests.log` 08:27:19Z记32真TCP／零失败，build／typecheck过。
审计者匹配十个源码／文档hash，relay为 `b489077039162664e8c556579677afdb2ede4b2cfbb3a32235e4b904d9001263`；32替代定向relay29结果，不改437 workspace snapshot。
Android `CompanionHttpNetworkTest` final XML另含两项真raw-loopback TCP：307／308凭证和body零转发、chunked96MiB+1byte拒绝；不含账号、secret或持久relay。
这层transport验收与memory-transport删除测试、上方已获批准执行的真relay删除流程分别报告。
新真provider／网络证据：`/tmp/leanon-ios-approved-deletion-live-two.log` 09:01:40Z两项过（0.713秒），真URLSession、新loopback relay及真隔离QA Keychain。
case覆盖丢DELETE／ACK不重wipe、错密码／无receipt须显式原账号重试；名称restart仅指同XCTest进程内native对象重开。
`/tmp/leanon-ios-approved-deletion-process-prepare.log` 09:08:13Z一项过，真PID23784；原recover的scoped parent-path测试guard在probe／clear前拒绝。
`/tmp/leanon-ios-approved-deletion-process-recover-v3.log` 09:20:47Z一项过，PID58867对23784（oldPIDAbsent=true），不重放DELETE，receipt已ACK，fixture／pointer／四个key alias均不存在。
sanitized `deletion-process-final-sanitized.json` 确认最终account／group／invite／receipt均零，fixture／pointer／四原alias不存在，owned relay session exit0、lease不存在、目录已删。
单独listener probe被sandbox拒绝；停止证据是进程退出及清理，不制造TCP探测成功。
源码对真native HTTP／QA Keychain断言以上结果；test-only准确UUID sibling重映射在重装后复用原QA namespace，不验证产品app-update／正常boot兼容。
当前iOS Release8 `/tmp/leanon-ios-final-release-8.log` 以BUILD SUCCEEDED结束；仅unsigned device-SDK编译，不是签名／安装／分发。
最终84原生、受影响UI3及有限Android focus证据，与上方两项获批准真relay及带限定OS进程阶段分别报告；随后文案12c仅build。

### 当前原生可访问性证据

原生 `XCUIApplication.performAccessibilityAudit` 附件 `45990611-3E8D-478F-9D07-400EAC177FEC.json` 在08:38:31Z报告Progress五个contrast问题，含画面可见的“Not enough data yet”。
审计者亲看真实模拟器截图 `89385B8B-1D6D-4388-A2F4-2BEF60985E35.png`：其它部分被报元素在此滚动位置裁切／位于固定底栏后，不能据此认定永久无法访问。
不可将整组官方结果当offscreen排除，也不可把有限像素spotcheck当完整contrast通过。
Partner未登录all-audit对relay／离线说明文字报一个contrast问题；稳定偏好、围度contrast-only audit各为零。
实际choice AX label／选择证据比读屏发音、焦点或手势activation窄。
当前TalkBack证据：`reader/services-during.txt` 确认真绑定service及touch exploration启用。
`reader-invoker-focus.json` 09:06:39Z显示焦点“饮食偏好”为android.widget.Button、ACTION_CLICK16；`reader-open-accessible-click.json` 打开modal，`reader-choice-selected.json` 激活后label明确已选择。
首次注入物理双击snapshot未打开modal；手势fidelity及发音仍未核，不称完整reader通过或持久产品手势缺陷。
`reader/restoration-result.json` 09:15:01Z已独立确认secure设置与原值exact match，无绑定TalkBack／touch exploration／UiAutomation，未直接改偏好／读取私有bookkeeping。
P1实际焦点连续性：`reader-cancel-restore.json` 09:13:35Z焦点到Me标题，原饮食偏好按钮仍在且未focused。
应保留invoker控件identity，在modal unmount后恢复焦点；`WorkflowSheet.tsx:33`目前只申请进入／error焦点、70行exclusive focus，缺调用者返回闭环。
这是具名reader实测缺陷，root已授权窄focus-return修，`state/modal-focus.ts`／App modal transition／MeRow现冻结。
`/tmp/leanon-modal-focus-tests.log` 09:24:58Z六项过／零失败，typecheck过。
outer invoker保留，不被Cancel／Save覆盖，reopen／route generation阻迟到返回；086真bound-reader有限饮食入口回归过。
不等于所有raw Action-btn／每层nested coverage；
新真像素发现：审计者亲看 `focus-cancel-return-stable.png`，原入口focus bounds[63,2176][1017,2323]与nativebar2210–2347重叠，文字不可见。
中间版本仅AX原点归位不能关闭P1；随后揭示修在测试scope内关闭该问题。
当前App沿支持的 `scrollIntoView` center／start／none调用，等success／failure callback再请求focus；定时与callback两层均核generation。
`/tmp/leanon-modal-focus-reveal-tests.log` 在09:47:28Z通过7／7，typecheck过；实际086可见文字／bounds及同Button的Cancel／Save现已过（2项用例、11个动作，不是11项用例）。
保留已认可底栏。发音及物理手势仍未核。
最终揭示manifest为 `/tmp/leanon-android-focus-return-p1-2026-10-07/reveal-final/public-evidence/evidence-manifest.json`。
实际runtime app SHA-256 `3168190609f54445746960724c5d1f31a8fff91f569b9607509bca4fb900620f`；runner `8a45c691633a98b85f1732f13b8070ad53971d37d17dff203618d4ecb7bdb63f`；两用例均086。
Cancel保personal revision2；Save以选择的隔离饮食模式把2改3；原QA store前后hash相同。
09:55:52Z准确恢复secure settings，bound=false、touch exploration=false、UiAutomation不存在。
发音、物理TalkBack手势及所有弹层通用coverage仍未核。
这些snapshot不能认证所有主题、大字号、viewport、角色或触控范围；Progress／Partner发现仍未解决。

P1基线iOS key-path可用性风险：新provider前 `ServiceRegistry.swift:35` hash绝对personal路径派生personal／companion／journal／ledger Keychain account，`EncryptedRecordsFile.account:11` hash绝对records路径。
`KeychainDataKey`（`native-crypto.swift:82`）旧provider只按准确service／account查询，无跨container alias fallback。
staged-test重装实际改变QA container parent，但首guard在产品解密前失败；不证明formal store失败或真实用户数据丢失事故。
若文件搬迁而Keychain仍在，同ciphertext会查新account并正确fail closed keyUnavailable：保密性保持，可用性有风险。
获授权的stage-only harness把准确QA basename映射回原key namespace以完成进程证据；该workaround不证明产品app-update兼容或正常boot恢复。
root后来授权窄产品修：稳定logical identifier及审查既有alias兼容路径，保undecryptable bytes，不能静默替换established key。
新 `relocatable-store-key.swift` 已提供exact service≤256属性／role≤16 legacy candidate、AAD认证及唯一匹配、stable冲突拒绝、相同DEK复制且保旧alias。
重开cleanup只清相同DEK旧alias、stable最后删，新role file存在则拒绝。
启动current／before-image预检及任何recovery前promote现已落源码（Registry recoverImmediately:false），跨generation强制相同DEK。
实际 `/tmp/leanon-ios-key-migration-targeted-78.log`（文件名名义78）在09:47:24Z通过79／79：provider12、consumer9、Backup9、deletion16、HTTP4、Health28、credential1。
provider测试用真隔离QA Keychain；注入兼容／journal故障不等于部署或正式数据迁移验收。
新增 `validateAccountDeletionCompletion` hook在local-complete ACK前执行：只读核缺失role文件是否有孤立stable／legacy alias；新创建role文件不打开、不删除。
实际最终84／84批次 `/tmp/leanon-ios-key-migration-final-84.log` 在09:53:44Z通过：provider15、consumer11、Backup9及此前49项，在此独立批次内只计一次。
旧local-complete／不ACK及新weight／photo保留两用例均过。build42 native `c5eea7181fda925d3f009aa10d547b56651dc60247b0c2bd1ddaacc7fc217f37` 内置086，09:55:22Z受影响UI3／3过；与84项原生批次分别报告。
本审计不修产品／不迁移正式数据。

P2视觉密度（仅review）：审计者亲看实际Android `ui/gallery-page-one-stable.png`，生成灰图可见。
重复隐私说明与长system-picker介绍占开屏大量空间，大片方图、metadata及全宽编辑／删除又占其余viewport。
保留已认可底栏；后续设计可合并为一条简短隐私说明、收紧上下文操作，并可选两列缩略图对比。
每页4张限制mounted数量，不代表图库已设计精致或最坏内存有保证。
root报告隔离1000张fixture加密20,451,894字节，该观测点PSS221,430KiB／RSS327,784KiB／HWM442,960KiB；这是单次峰值而非通用resource ceiling。
翻页连续性P2：root观察下一页foreground后图像正确重载，但返回前页保留scroll offset，首张图部分位于viewport上方。
翻页后须再滚到首项；这是导航连续性问题，不是持久blank／cache渲染失败证据。
Android下一页／返回观察每页四个image control，跨访问生成八个cache file；缓存文件数不是mounted图像数。
Android bafb／c66 foreground真像素已独立看；iOS build42／086修正harness首屏／下一页／返回／foreground像素现已过。返回页helper会滚动到首项，所以未消除P2旧offset连续性发现。
Android sanitized `public-evidence/evidence-manifest.json` 共13 PNG，全部hash已匹配；首屏／下一页／返回是transport-factory更新前7aae／c66（gallery源码相同），最终foreground是bafb／c66。
最终cache generation数量4→0→4、旧新名字不重叠已观察；Partner gallery、全部250页及32MiB／高entropy极限未stress。
最终sampled PSS最大239,528KiB／kernelRSS HWM453,312KiB，仅该instrumentation一轮，不是连续GPU／allocator／lifetime认证。
只读device发现有一台已配对iPhone16Pro；未授权／执行任何真机交互、安装、权限或VoiceOver启动。
当前Xcode26.6会话没有受支持可调用的VoiceOver驱动／音频工具，模拟器AX audit不能替代实际读屏发音测试。
Library证据不得包含真机标识。

## 历史已核验收点：3bbe／420项

前期协议／存储缺陷已修正，大量本地验收已有实际执行证据。
两端缺失renderer已有修后真像素证据；scoped清理失败已关闭访问，Android最终有界decoder／provider实测已过。
当前源码检查和具名本地回归已过；完整生产、硬件和读屏验收仍有边界。
本报告不声称发生过真实用户数据泄漏事故。

- 分支 main；基准提交 `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`；远端 `https://github.com/Zzzode/LeanOn.git`。
- 保留共享工作区已有未提交变更及并行任务；审计者只写本双语审计。
- 已读 AGENTS.md、RFC 0008 和当前协议；`.agents`／`.codex` 不存在。
- 授权范围是本地实现和虚构隔离 fixture，不含生产部署、长期凭证、真实 Health／BLE／camera／通知权限。
- 最终共享 bundle SHA-256：`3bbe6225013ec611f0cde9c69a614d5ab15250234448f1d8ecf99d190606387d`。
- 审计者在该历史验收点独立核对 iOS built-app 内文件相同；Android 隔离 APK 与 artifact metadata 的 bundle 一致。
- 最终bounded-decoder Android debug APK：`30e04a2acea9807d1f6f039dd44db5fcc8a606fb5b0706787b1e46648e19eff8`；runner `f5b616f64808f2998459695adbbb380256ca44a1703ff3d462fda23e090f268a`；unsigned release `d35c646e9fc33fee8819f7aad86d914e287c37a632075441e8680cb12fd5d478`。三者已独立哈希并解zip核内置3bbe。
- 最终 iOS `final-native-identity.json`，07:45:47Z核验：SE3／iOS26.5 Simulator、375×667pt、隔离设备 `CE6916DA-858B-4BFB-91E4-7935612F49CB`；native SHA-256 `d51fd5b95b400a241141d7a34249f90d64d4c1d07362cc71ae37dcafc2fa9225`。审计者在该验收点独立匹配native字节、内置3bbe及95个源码清单条目。原生190和受影响UI2属于此最终源码／产物；build21整轮七项保留为较广的先前证据。
- iOS Release7仅unsigned device-SDK编译，非签名安装／archive。manifest release-native SHA-256 `3fbd60d9c2058e9a30cbaa51df5b98310d0cf5ca0d7e6127012bca07fa7585d1`；审计者已读成功日志，未独立重新哈希该release文件。


## 历史验收点矩阵：2026-10-07

| 验收项 | 当前源码与已核实执行 | 边界 |
|---|---|---|
| 共享构建／测试 | 最终 build／typecheck 通过；420项通过、零失败，含 Pages128／Data47／Bridge49／relay23 | 是单轮总数，不再累加 focused run |
| relay | 23项真 TCP；源码 SHA-256 `7c9b68d2fb720b26f3a0e85faa305914e201d7d90c52e5a4387f56031b71e6a8`；body／state／并发有界 | 仅回环 QA，非生产防滥用认证 |
| proof／配对 | 独立32字节 proof 哈希绑定会话；HKDF proof／wrap 分离；创建者设备确认；最多两人、默认私有 | Swift Create／Confirm／Receive、Android Accept／Sync 实际通过；新批准A/B native VERIFY、C新进程删除恢复、Swift／Android撤销实际已过；最后隔离fixture／key清理实际已过 |
| 账号 attachment | endpoint+account 命名空间；注册／登录不导出；命名同意、双 revision CAS | iOS 真 Partner 流程覆盖 configure／注册／不自动导入／显式导入／登出重登／删远端保留本机；非所有 relay／错误组合认证 |
| 共享／撤销 | 本机初始空 consent 与当前 grants 交集；先持久拒绝／清队列再 PUT；配对只搬 key | Android真HTTP覆盖新设备同意；Swift／Android撤销／拒发／清理阶段已过，完整读屏／UI撤销语义另验 |
| 同步／ACK | 接收元数据固定 AAD；先认证后解析；schema／grants 校验；records+personal/photos+companion journal 持久后才 ACK | 真跨原生交换两条体重、双方精确 JPEG、接收端持久 ACK；A/B VERIFY证明native delivered及活跃家庭重登／Keystore重开，非发送方UI视觉 |
| 多 store／恢复 | 双 revision CAS、加密 prepared／committed journal、启动恢复门、实际回滚重开 | iOS 新原生对象重开、Android provider 重开不等于 OS 进程重启；C在新实际进程8590恢复旧失败进程5479持久删除意图；强停前PID为空，不冒称活进程kill |
| 备份 crypto | Data47 含真 Node PBKDF2／AES-GCM；iOS CommonCrypto／CryptoKit 与 Android JCA 真 Unicode fixture 恢复 | 原 crypto-port 替身仅证编排；PUBLIC Swift→Kotlin／Kotlin→Swift真native导出文件inspect／atomicrestore及精确JPEG已过；不含实际picker／真实数据 |
| 加密迁移／密钥 | 旧格式读取不写；下一次显式写加密；缺 established key fail closed；真 Keystore／QA Keychain 已过 | 正式数据未读／迁移；iOS generic-password WhenUnlockedThisDeviceOnly 非 Secure Enclave 不可导出；Android 硬件能力依设备 |
| 照片／预览 | 真有界 pixels／JPEG 校验、scrub／元数据拒绝、精确 canonical 字节、scoped 有界 cache／generation 防迟到写 | iOS修后真灰像素及整轮七UI已过；Android第一／第二生成图实际可见，14项provider已过。稳定foreground像素已独立看，完整Android UI另验，真实camera／picker权限未测 |
| health ledger／本机删除 | 旧读兼容／下次写加密；仅清 app ledger／key；generation 取消；Android 删除前持久关同步 | 14项 Android 原生检查含旧结果阻断／关闭自动重导入；真实 OS provider／后台未验，OS 健康记录未删 |
| 删账号 | relay 再认证清理；显式可选本机删除；远端成功后本机持久重试 | 真 iOS Keychain 本机失败／重开重试、Android 删除失败阶段通过；远端确认→本机意图 crash 间隙仍在 |
| HTTP／endpoint | 流式有界、禁止重定向、端口1–65535；iOS 拒存在但 getter=nil 的溢出端口 | 未提供专门 chunked／超限／307／308 真测试；源码不等于穷尽 transport 运行 |
| 个人 UI | 真 compact iOS 围度 CRUD／取消／重启、英文偏好保存／取消／重启、文档导出／只读检查／确认恢复、generated-photo元数据操作 | pixel-build21七项iOS UI含真灰像素全过；最终source受影响照片／Partner UI2重跑全过；Android完整UI另验，AX Image单独仍不证显示 |
| 小屏／大字 | SE3 最大 Dynamic Type 草稿／焦点／保存重开／恢复普通字实际通过；审计者已看原生截图 | 仅偏好流程，不等于逐屏 grid；VoiceOver／TalkBack、播报／焦点恢复、触控实测未验 |
| 对比度 | 明暗22组不透明语义 token 最低5.013、全部≥4.5 | 仅源码计算，非原生像素／透明合成／非文字／读屏验收 |
| 时间／生命周期 | 午夜／DST／时区源码测试、字体刷新；实际照片前台与偏好草稿连续性 | 真 OS 后台唤醒、各流程跨午夜时区变化／离线重试另验 |
| 原生构建 | Android224项=223过／一项 opt-in HTTP skip；iOS最终190执行=189过／一项 staged skip | 网络证据由另列真 relay／staged 提供；skip不是pass |
| release／硬件 | Android release build 成功、unsigned；QA HTTP 限debug、allowBackup=false；iOS Release7构建成功 | 未生产签名／分发；iOS team未设；真实健康／BLE／扫码／通知权限、硬件及锁屏后台未授权／未验 |

## 历史验收点边界

1. **P1：远端／本机删除 crash 边界。** 两端均在远端 DELETE 确认后写本机清理意图；间隙崩溃或写意图失败仍可能丢意图。这不是分布式原子删除。生产补强需 prepared／恢复／receipt 协议；意图后的重试通过不能关闭该间隙。
2. **该历史验收点的审批阻碍：Android D。** 用户07:18:37Z明确批准后，历史A/B/C拒绝已解决，native VERIFY、新进程删除恢复、Swift／Android撤销实际通过；最后隔离fixture／key清理实际已过。C从旧失败进程5479遗留意图到新8590恢复，强停前无PID，证明跨进程恢复而非活进程kill。另Android D实际named-import-consent点击仍被自动审批以敏感外发拒绝，未执行，ABC不涵盖D，未绕过；后来08:57:19Z批准已覆盖D，当前执行状态见上方。
3. **验收覆盖。** 两端都有修后真实照片像素。Android最终native14通过；iOS最新native190和受影响照片／Partner UI2通过。它们不证明完整Android UI矩阵、真读屏或逐屏最大字体验；Android D仍按上项单独阻断。
4. **P2：专门失败测试。** 流式超限／重定向、注册成功响应丢失→409→登录保同 key、前台过期 scoped cache 清除、仍需具体执行证据；PUBLIC native备份文件互通已过。

已收口源码包括 proof 绑定、创建者确认、先 keyring 再发布、账号／realm 隔离、consent交集、撤销先清队列、首条仅鼓励投影、过期／401清理、持久后ACK、三store CAS／恢复、照片generation、旧healthledger加密和删除期间禁止健康重导入。
这些是源码结论及上列部分运行证据，不声称所有生命周期／硬件边缘均通过。

逻辑撤权／cache purge P1已由源码和定向回归收口：两端先持久清auth／family／peer健康／keys及重试marker，再清可能失败的preview。Android scoped11、iOS final190含顺序fault断言；iOS七类覆盖家庭移除、grants、登出、过期、401、endpoint切换和unlink。fake relay／preview port证明顺序，不冒称真实OS文件系统故障；真provider／UI另列。

## 照片渲染与隐私收口

| 优先级 | 实测／源码发现 | 收口要求 |
|---|---|---|
| rendering P1已关闭 | 两端曾AX Image存在但blank；现在受限loader已安装 | 审计者已看iOS真灰图、Android第一／第二生成图；iOS build21七项pixel-aware UI全过、JS仍3bbe |
| P1 | iOS受限URI／digest／file-only／no-symlink／delivery锁；已先撤cap再删，前台清理失败保持inactive | 已重读：scoped清理失败设inactive，旧交付／新cap均阻，即使companion旧cache仍在；实际注入fault测试已过新cap／旧交付阻断；删除失败可见且预览保持inactive |
| P1 | Android已在onSuccess经synchronized deliverApproved再验，阻任意URI／prefetch，Fresco disk／bitmap／encoded cache关 | 14项实测含任意URI／tamper／迟到撤销，以fake SDK delegate；真实renderer另看像素。清理失败已foreground=false，最终bounded-decoder native14中新增cap阻断／清理失败fault已过 |

源码位置：`apps/ios/LeanOn/Container/private-photo-image-fetcher.swift:11`、`apps/ios/LeanOn/Storage/private-photo-store.swift:180`、`apps/android/app/src/main/java/com/zzzode/leanon/personal/ApprovedPhotoImageService.kt:32`、`apps/android/app/src/main/java/com/zzzode/leanon/personal/PersonalPreviews.kt:74`。
审计者已从本机AAR独立读取Lynx3.9 ILynxImageService／ImageLoadListener签名。
零缓存不能保证在途回调取消。
iOS loader已按有限targetSize×scale限制1–2048pixels、fallback256，每fetcher仅一张解码图等待main交付，取消／错误路径均释放背压门；Android显式decoder输入≤20 MiB、pixels≤4,194,304。压缩32 MiB／1000照片仍不限制已mounted图像的总驻留pixels；gallery虚拟化／总像素预算是P2边界。
iOS final190源码测试已过清理失败／新URI阻断及fetcher真实selector／cancel回调；`/tmp/leanon-personal-ios-photo-pixels-verified.log` 新iOS loader后真灰像素／元数据／生命周期targeted 1／1通过；新 `/tmp/leanon-personal-ios-final-seven-preview.log` 整轮7／7零失败、含灰像素断言；最终iOS source受影响照片／Partner UI2已过。Android最终bounded-decoder前台图 `final-bounded-3bbe/ui/bounded-photo-foreground-stable.png` 已独立看、native14通过；旧AX-only七项只作历史，不证明像素渲染。

## 已核执行证据

- `/tmp/leanon-full-product-final-{build,typecheck,tests}.log`：独立合计420过／零失败，build／typecheck全部过。
- `/tmp/leanon-companion-server-tests-final.log`：23／23真TCP，`2026-10-07T05:23:31.194Z`。
- `/tmp/leanon-android-full-product-final-build.log` 和当前 JUnit XML：224项／一skip／零fail或error（独立汇总47个JUnit suite），release成功；另 `/tmp/leanon-android-companion-final-10-tests-2.log` 与staged补真HTTP证据。
- `/tmp/leanon-android-full-product-2026-10-07/final-bounded-3bbe/personal-native-report.json`：14／14真Keystore／JPEG／JCA，`2026-10-07T07:39:53.488279Z`；新增image-service错误测试用fake delegate，真实像素另列；虚构cache，无文档picker／camera／权限／UI-save验收。
- `/tmp/leanon-personal-ios-native-final190.log`：最新logical-purge／desiredActive源码，190执行／189过／一staged skip／零失败，07:40:50Z TEST EXECUTE SUCCEEDED；七类companion持久清理故障和预览inactive／重试测试通过，fake port证明顺序；真QA Keychain／删除失败重开与MemoryDataKey live fixture分别列明。
- `/tmp/leanon-personal-ios-final-privacy-two.log`：最新照片／Partner UI2／2零失败、07:43:01Z；`/tmp/leanon-personal-ios-release-build-7.log` BUILD SUCCEEDED。下面pixel-build21整轮七项保留为较广的先前运行覆盖，不重复当最终整轮七项。

- `/tmp/leanon-companion-interop-{create,confirm,receive}.log`、`/tmp/leanon-companion-interop-android-sync-v2.log`：实际native staged互通；`/tmp/leanon-companion-interop-android-deletion-fail.log` PID5479失败注入阶段通过，不代表进程重启。
- `/tmp/leanon-personal-ios-final-seven-preview.log`：pixel-build21 UI 7／7零失败、TEST EXECUTE SUCCEEDED；真文档保存／取消／检查／恢复、中文围度CRUD／重启、英文偏好连续性／最大字、灰像素照片生命周期、真回环Partner显式导入／登出重登／删除。此前AX-only interim漏blank，渲染结论已被本轮替代。
- `/tmp/leanon-full-product-ios-final-evidence/targeted3-attachments/BC30FA58-E398-4C22-AC90-EB400CDAEF2F.png`：审计者已看最大字偏好草稿真截图，compact SE3／iOS模拟器，设备 `2D6FE1C8-0441-4983-B497-8762B52B86BE`；非浏览器重绘。旧compact-current.png是历史失败，不当最终成功。
- `/tmp/leanon-full-product-ios-final-evidence/targeted3-attachments/E2A765EE-7D4F-4595-B4A1-2C38CDC10D9D.png`：审计者独立看实际照片sheet，图像区域白色；不将AX Image节点当像素显示通过。

Android 实际证据包括 label、48 dp bounds 和手指触发。
未启用可访问性服务时 native ViewGroup 的 `clickable=false` 不能单独证明 TalkBack 不可操作：本机 Lynx3.9 AAR 按 `isSystemAccessibilityEnable` 门控 delegate，helper／provider 有 tap／click 派发。
审计者已读 `/tmp/leanon-lynx-accessibility-sdk/provider.txt` 和 `decoded.txt`；真读屏触发、role／焦点仍未验。

已核iOS修正后像素：`/tmp/leanon-full-product-ios-final-evidence/photo-pixels-verified/9118F761-F739-4BA6-810C-EC0734685BF2.png`，审计者独立看实际灰方块，覆盖元数据编辑／返回前台。1／1测试检查中心RGB115–145，不只AX存在。

Android修后图像：`/tmp/leanon-android-full-product-2026-10-07/final-image-canonical-3bbe/ui/image-gallery-second.png`，审计者独立看第二生成照片灰色可见。审计者另看 `ui/image-gallery-foreground-stable.png`：第一生成图前台重载可见并切到light。早期即时black是加载暂态，不当持久渲染失败。

真原生备份互通：`/tmp/leanon-android-full-product-2026-10-07/final-3bbe-purge/public-backup-interop-report.json` 07:26:31Z通过；`/tmp/leanon-native-backup-interop-public-2026-10-07/swift-backup-report.json` peerImported／atomicRestore真，`/tmp/leanon-personal-ios-public-backup-kotlin-import.log` 07:28:23Z 1／1过。两端精确JPEG SHA-256 `902b88fb192ea99ddf99e5f2bd279afc0203dbbbb8ac79b5ee6356677d3d53c1`；Kotlin导出envelope SHA-256 `c10648346bb2c75e2b86683328b907f2182669e75bfdd1ffc2310b980cd639f6` 与Swift导入一致；Android原QA记录hash不变。这是真native provider／file／restore及公开虚构fixture，不是crypto-port替身或真实健康数据。

新批准staged证据：`/tmp/leanon-companion-interop-android-{verify,revoked,deletion-recover}.log` 均passed=true，恢复PID8590；Swift `/tmp/leanon-companion-interop-revoke-approved.log` 1／1过。源码断言覆盖native outgoing delivered、加密credential／cursor重开、活跃家庭重登、撤销消息／拒发、新instrumentation进程持久删除完成；不扩大为发送UI视觉或活进程强停有效性。Swift `/tmp/leanon-companion-interop-cleanup-approved.log` 07:37:19Z 1／1过，Android `/tmp/leanon-companion-interop-android-cleanup.log` 07:38:31Z通过；脱敏ios-cleaned／android-cleaned确认隔离fixture已清及应用记录未变。

## 冻结限制与协议

备份指序列化加密 envelope／文件≤64 MiB；单 JPEG≤20 MiB、合计≤32 MiB、metadata≤1000。
密码精确 UTF-8 12–1024 字节、不正规化；AAD 为 LeanOn backup v1。
JSON 深度≤20、节点≤500000；扩展 preferences 序列化 UTF-8≤32 KiB。
relay 解码 ciphertext≤64 MiB、HTTP≤96 MiB、state≤128 MiB、并发8且大 body仅1、page≤100 changes／95 MiB。
本地账号／邀请／group records／seen IDs／devices／session 上限100／500／1000／10000／32／全局1000（每账号32）。
change AAD 是规范 UTF-8 JSON 固定数组 ["leanon-change-v1",groupId,epoch,ownerId,deviceId,id,recordId,category,kind,updatedAt,deleted]，不含 sequence。
原生先认证后解析，按分类 schema 与当前 grants 校验再持久 merge。

## 平台依据与公共证据

- [Apple Keychain](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)：需解锁。
- [Apple Secure Enclave](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave)：generic-password 对称字节非不可导出 Enclave key。
- [RFC5869](https://www.rfc-editor.org/rfc/rfc5869)：不同 HKDF context 分离用途。
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)：硬件保护依设备。
- [Android 可访问性](https://developer.android.com/guide/topics/ui/accessibility/apps)：文字对比度和 48 dp 触控依据；源码 token 计算不能证明原生可访问性。
- `/tmp/leanon-full-product-public-crypto-vector.json`：公共固定 HKDF／AES-GCM／AAD，非应用凭证。
- `/tmp/leanon-full-product-lynx-font-sdk-audit.txt`：只读 Lynx3.9.0 SDK；SHA-256 `44e785480273a41e3f818360aba428ed35081d5ac7ae8c42714ba5f416648356`。

root 负责运行截图、日志和 Library 保存。
交付排除密码、session／device proof、invite secret、vault／family key、server state、私有文件。
仅公共 fixture 与脱敏测试进入交付。

## Source anchors (working-tree snapshot)

| Check | Code location |
|---|---|
| Relay device proof | `server/companion/src/index.ts:396` |
| Relay creator confirmation | `server/companion/src/index.ts:490` |
| Relay sync/ACK bound | `server/companion/src/index.ts:540` |
| iOS session/deletion state | `apps/ios/LeanOn/Companion/companion-service.swift:17` |
| iOS keyring guard | `apps/ios/LeanOn/Companion/companion-service.swift:441` |
| iOS durable sync | `apps/ios/LeanOn/Companion/companion-service.swift:538` |
| iOS bounded HTTP | `apps/ios/LeanOn/Companion/companion-http.swift:40` |
| iOS multi-store CAS | `apps/ios/LeanOn/Storage/backup-coordinator.swift:144` |
| iOS recovery | `apps/ios/LeanOn/Storage/backup-coordinator.swift:380` |
| iOS photo validation | `apps/ios/LeanOn/Storage/private-photo-store.swift:10` |
| iOS preview generation | `apps/ios/LeanOn/Storage/private-photo-store.swift:118` |
| iOS encrypted legacy ledger | `apps/ios/LeanOn/Storage/encrypted-legacy-json-file.swift:4` |
| Android session/deletion state | `apps/android/app/src/main/java/com/zzzode/leanon/companion/CompanionRepository.kt:67` |
| Android keyring guard | `apps/android/app/src/main/java/com/zzzode/leanon/companion/CompanionRepository.kt:403` |
| Android multi-store CAS | `apps/android/app/src/main/java/com/zzzode/leanon/personal/BackupCoordinator.kt:93` |
| Android recovery | `apps/android/app/src/main/java/com/zzzode/leanon/personal/PrivateTransactionJournal.kt:64` |
| Android preview generation | `apps/android/app/src/main/java/com/zzzode/leanon/personal/PersonalPreviews.kt:17` |
| Android encrypted legacy ledger | `apps/android/app/src/main/java/com/zzzode/leanon/personal/EncryptedLegacyJsonCodec.kt:9` |
| UI preview lifecycle | `packages/pages/src/components/PhotosSheet.tsx:15` |
| UI stale-reply rejection | `packages/pages/src/state/photo-preview.ts:16` |
| Backup auth before parse | `packages/data/src/backup.ts:165` |
| iOS approved photo loader | `apps/ios/LeanOn/Container/private-photo-image-fetcher.swift:11` |
| iOS preview capability validation | `apps/ios/LeanOn/Storage/private-photo-store.swift:180` |
| Android photo delivery guard | `apps/android/app/src/main/java/com/zzzode/leanon/personal/ApprovedPhotoImageService.kt:32` |
| Android locked authorized delivery | `apps/android/app/src/main/java/com/zzzode/leanon/personal/PersonalPreviews.kt:74` |
| iOS durable logical revoke | `apps/ios/LeanOn/Companion/companion-service.swift:795` |
| Android durable logical revoke | `apps/android/app/src/main/java/com/zzzode/leanon/companion/CompanionRepository.kt:32` |
| Android bounded pixel decoder | `apps/android/app/src/main/java/com/zzzode/leanon/personal/BoundedPhotoDecoder.kt:24` |
| Relay deletion transaction | `server/companion/src/index.ts:413` |
| Relay proof recovery durability | `server/companion/src/index.ts:366` |
| iOS prepared recovery | `apps/ios/LeanOn/Companion/companion-service.swift:171` |
| iOS CAS deletion marker | `apps/ios/LeanOn/Storage/backup-coordinator.swift:208` |
| iOS actor clear before locks | `apps/ios/LeanOn/Bridge/ServiceRegistry.swift:110` |
| Android prepared recovery | `apps/android/app/src/main/java/com/zzzode/leanon/companion/CompanionRepository.kt:178` |
| Android CAS deletion marker | `apps/android/app/src/main/java/com/zzzode/leanon/personal/BackupCoordinator.kt:117` |
| UI post-marker guard | `packages/pages/src/state/account-deletion.ts:6` |
| UI bounded photo page | `packages/pages/src/state/photo-page.ts:4` |
| iOS path-derived personal key | `apps/ios/LeanOn/Bridge/ServiceRegistry.swift:35` |
| iOS path-derived records key | `apps/ios/LeanOn/Storage/encrypted-records-file.swift:11` |
| iOS exact Keychain query | `apps/ios/LeanOn/Storage/native-crypto.swift:82` |
| UI modal entry focus | `packages/pages/src/components/WorkflowSheet.tsx:34` |
| iOS stable-role认证旧key | `apps/ios/LeanOn/Storage/relocatable-store-key.swift:104` |
| iOS恢复前key promote | `apps/ios/LeanOn/Bridge/ServiceRegistry.swift:70` |
| iOS只读journal预检 | `apps/ios/LeanOn/Storage/backup-coordinator.swift:133` |
| iOS local-complete验证 | `apps/ios/LeanOn/Companion/companion-service.swift:286` |
| UI揭示后返回focus | `packages/pages/src/App.tsx:186` |
| UI原生迟到揭示拒绝 | `packages/pages/src/state/modal-focus.ts:22` |
