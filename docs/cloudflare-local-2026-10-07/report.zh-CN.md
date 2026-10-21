# LeanOn 私有 Cloudflare 后端：本地实现与验证

简体中文 · [English](report.md)

**本地后端、双端照片协议与实际 Settings 迁移流程已实现并验证；生产部署仍有明确阻塞项。**
这是此前 UI/产品工作的 Cloudflare 实现后续，不是新一轮视觉验收，也不把测试日志当作实际 UI 截图。
已认可底栏和其他页面设计没有被覆盖。

## 2026-10-08：统一合成数据运营交付

剩余小型本地交付已补齐：统一 CLI、独立 JSON 参数模板、严格验证及隔离官方 Miniflare/workerd D1/R2 测试。
复用既有 `admin.ts`；本轮没有改动该文件、Settings、桥接 action 或双端原生控制器。
仍为 `main` / `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`，保留此前并行变更；前后指纹及范围内源码在 `evidence/local-admin-2026-10-08/`。
通过命令级 PATH 使用临时官方 pnpm11.7.0，重建文件后端依赖及全仓，没有更改全局工具。

### 已交付的本机命令与约束

在 `server/companion-worker` 运行 `node scripts/local-admin.mjs COMMAND --config FILE`，或使用 `pnpm --filter @zzzode/companion-worker admin:local`。
子命令为 `init`、`backup`、`deletion-floor`、`restore`、`migration-plan`、`migration-stage`。
均默认 dry-run；只有显式 `--local-execute` 才打开临时本地后端，`migration-plan` 始终仅预览。
独立模板为 `server/companion-worker/templates/local-admin.example.json`；同包 `local-admin.md` / `local-admin.zh-CN.md` 提供完整双语说明。

dry-run 验证配置及有界输入编码，不打开 D1/R2、不写任何文件或锁。
恢复预览明确返回 `authentication: not-performed`、`databaseChecks: not-performed`，不冒充密文认证、空目标或权威最新基线检查。
本机执行调用既有认证恢复、维护门禁及检查点逻辑。
迁移暂存在导入身份/授权前检查实际本地 D1 服务ID与参数匹配，不复制旧聚合记录。
配置中的回环地址只是规划标签，不是 CLI 会访问的 HTTP 目的地。

拒绝未声明字段/参数、远端地址（包括HTTPS）、含凭据URL、穿越/绝对输入路径、软链接、状态/输入/输出重叠，以及不合法密钥/信封。
工作目录只能是系统临时目录或 `/tmp` 下全新、带标记且权限私有的 `leanon-admin-synthetic-*` 目录。
密钥、备份及删除基线必须位于独立目录；密钥为32字节二进制，权限私有。
初始化不生成运营密钥、账号、准入令牌或生产凭据。
导出原子发布完整私有文件，不覆盖已有输出。
输出仅包含公开服务ID/计数/状态或固定错误码，不输出原始异常、凭据、账号名、加密清单或密文。
本地运行时仅使用回环套接字，不启用遥测或提供方配置，阻止出站请求并显式关闭。

### 验证结果与清理

| 检查 | 实际结果 | `evidence/local-admin-2026-10-08/` 中证据 |
|---|---|---|
| 全仓 | 严格类型检查/构建通过；**502项测试通过**，0失败/跳过 | `workspace-typecheck.log`、`workspace-build.log`、`workspace-test.log` |
| Worker/运营测试 | **53项通过**，包含35项新增入口用例 | `workspace-test.log`、`scoped-source/` |
| 编译后 CLI | 使用两个公开虚构旧账号，**45项检查通过**，覆盖六个子命令 | `compiled-cli-checks.json`、`compiled-cli-drill.log` |
| 预览无写入 | 全部持久文件内容/mtime指纹不变，绑定工厂调用为零 | 测试和 CLI 回执 |
| 备份恢复 | 独立 R2 密文字节一致，两账号保留，会话清除 | CLI 回执及测试 |
| 最新删除基线 | 实际 Worker 删除+ACK 后恢复此前两账号快照，仅保留另一账号和零字节照片栅栏 | CLI 回执及测试 |
| 失败安全 | 真实 D1 batch故障保持 HTTP维护503；抛错释放锁，同一认证输入继续101设备行；篡改/缺失/过旧输入在目标写入前拒绝 | 运营测试 |
| 清理 | 编译演练两个工作目录和参数目录删除，运行时关闭；测试自有目录删除 | `compiled-cli-checks.json`、`cleanup.json` |

已有锁会拒绝后续执行；强制杀进程后须检查自有合成检查点并确认旧进程结束，才手动清理该锁。
锁拒绝测试和 D1 注入中断测试分别列证，本轮不声称做过运营 CLI 的实际 OS杀进程演练。
导出仍为有界内存实现，不是生产流式方案：每份备份64 MiB、基线24 MiB、旧输入16 MiB及64个快照对象。
构建日志含此前 Pages MaxListeners 警告；构建成功，没有改动无关 UI 源码。
本轮未启动模拟器/模拟设备或更改原生 QA 设置；没有擦除此前隔离 iOS QA App/Keychain。
仅保留范围内构建/测试证据，没有真实数据、提供方登录、付费开通、远端资源、部署、提交或推送。

### 尚未完成的生产边界

本机管理 CLI/模板/测试缺口已关闭；生产远端执行器仍是未实现，不是完整代码只差执行。
它仍需提供方账号/资源绑定、CPU/费用授权、数据位置与备份/基线/密钥保留决策，以及远端容量/故障验收。
全设备丢失重置/重新配对政策或可移植伴侣密钥恢复方案仍待用户决定并实施。
本轮没有新增恢复策略、大集合协议或远端执行。
中英文报告同步更新，并替换各自既有原生 Library 身份。

## 最新补验：实际 Settings 迁移入口

本节更新原有 Cloudflare 报告；此前协议层演练与下面两端真实应用入口验收分别列证，不将其混为同一次测试。
22:03 UTC 恢复检查时已有367项工作区变更和724份源文件；此前写好的 Settings 入口、弹层、六项桥接 action 与两端控制器没有重做。
本轮基线核对保留718份源文件，修改6份既有文件、新增7份范围内源码/测试文件；详细 SHA、行号与构建时间界限在 `evidence/migration-entry/`。
作用域仍为隔离虚构数据和 localhost，没有创建远端 Cloudflare 资源、开通付费、读取/上传真实健康数据、提交或推送。

### 入口与原生行为

Settings 的“Move to private cloud”由能力声明控制可见性。
六项桥接为 `companion.getMigrationState`、`previewMigration`、`startMigration`、`resumeMigration`、`pauseMigration`、`rollbackMigration`，配合真实原生状态事件及轮询。
预览显示源/目标地址、经认证目标服务ID、同一账号、操作ID及记录/原始照片数量，确认绑定原生预览身份和修订。
确认与继续均要求本次重新输入两项密码并明确同意；密码不进入状态投影，重启不会自动继续。
发布完成前原集合仍是来源；目标验证完成后才切换，并保留加密源备份及日志。
回退要求单独确认，保留设备当前本地健康数据再恢复源连接；不删除旧服务或目标资源。
修复了 iOS 初始阶段保存失败时可能留下锁/运行标记的问题；注入加密写入故障后，另一线程仍能读取检查点的测试通过。

### 两端真实 App 验收

| 平台 | 实际设备与数据 | 实际覆盖及结果 |
|---|---|---|
| iOS | iPhone SE第3代 / iOS26.5，模拟器 `F6A6C099-B04B-4DA2-A114-70A70E9DBB5B`，750×1334，隔离 `.uiqa` 包及独立文件路径 | 从 Me 点击进入 Settings；预览、未同意点击保护、确认、发布、请求暂停、暂停后终止/重开、重输凭据并继续、切换后重开、确认回退、回退后重开；两个实际 UI 用例均通过 |
| Android | 新建 Pixel4 / Android15 API35 arm64，`emulator-5582`，1080×2280，隔离 `.uiqa` 包 | 真实 Settings 入口及同一完整流程；额外在发布暂停请求等待期间实际 `am force-stop`，新进程从真实加密检查点恢复暂停并完成继续；通过 |

每个平台使用各自新建虚构源账号；范围为2条体重、1条饮水、1条运动、1条旧餐食、0条围度、1张原始公开 fixture 照片及完整偏好配置。
管理员本地夹具同时暂存第二个虚构账号；本轮用户入口只验收每个平台的一个已批准设备，不声称完成两人多设备并发迁移 UI 验收。
实际健康备份除导出时间/本地修订计数外完整一致，原始照片逐字节一致；重复 active 状态 start/resume 和 rolled-back 状态 rollback 幂等；加密源日志仍在。
两份旧服务各保留2账号和2份旧聚合密文，无源账号删除；检查只输出计数，没有把源验证器或运行密钥放入证据包。

本轮全仓 typecheck/build 通过；Rstest **467项通过**，新增3项投影/继续/轮询行为测试；最终 Worker/admin18项通过。
Android JVM为245项、0失败/错误、1项既有 opt-in 环境跳过；实际迁移 instrumentation 独立通过，不能把该跳过算作迁移验收。
两端实际嵌入 Lynx bundle SHA-256 均为 `991d46ce693e23794298f9658daa197f311e0bf389d79c5badb61c090fa75f92`。
iOS 预览至切换 UI 在狭窄异常解锁修复前执行；最终重建后验证该故障修复及 active 原生保全，实际回退/重启 UI 在最终签名版本执行，Lynx 字节全程相同。

![两端真实 Settings 迁移流程总览；完整截图和标签分离](migration-entry-overview.png)

28张真实截图（iOS12、Android16）及辅助树/原生只读检查点在 `evidence/migration-entry/`；原图没有重绘、修改状态或裁掉页面，总览仅等比排版并在图外标注。
部分 Android 可见阶段文案未出现在 Lynx 辅助树，因此以真实截图和只读原生检查点互证；未注入状态。
iOS 不可用按钮有 `Unavailable` 值，实际点击保护通过，但没有据此宣称原生 disabled trait 完善。
本轮 UI 为英文/浅色；中文、深色、大字、VoiceOver/TalkBack和真机尚未新增验收。

原生状态证据隐去了已失效预览令牌；截图与可见账号/服务/数量字段保持原样。
iOS总览第一张为Settings页面顶部；迁移行在下方，通过实际滚动、点击打开弹层。

### 操作工具边界

`server/companion-worker/scripts/migration-plan.mjs` 仅接受显式 `--dry-run`，输出验证后的数量、来源摘要和计划步骤，拒绝非HTTPS远端目标及错误服务身份格式。
纯 `planLegacyMigration` 没有 D1/R2/网络绑定，不输出密码验证器、证明或聚合密文；CLI没有远端执行模式。
`local-migration-entry-fixture.mjs` 只在127.0.0.1运行旧文件后端和官方 Miniflare/workerd D1/R2，故障代理仅延迟迁移完成路由以实际观察发布/暂停。
生产远端管理执行器、资源/凭据配置、运营备份目的地与容量验收仍待完成。

## 授权与工作区

父线程授权为恰好两人实现本地 Workers + D1 + 私有 R2，并使用隔离虚构数据验证。
未授权部署、开通付费、生产凭据、真实健康上传、提交或推送。
分支仍为 `main`，HEAD 为 `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`，origin 为 `https://github.com/Zzzode/LeanOn.git`。
17:31 UTC 检查点已有358项前序/并行变更，当前构建不是纯 HEAD 干净构建。
`scoped-change-audit.json` 记录源码指纹与范围核对；排除生成的 Pods/build/dist/工程文件。
新后端位于 `server/companion-worker`，既有双端伴侣协议和准入表单按本次授权扩展。
没有修改 Git 历史或远端。

## 实际验证结果

| 检查 | 实际环境与结果 | 证据 |
|---|---|---|
| 全仓构建 | 13个包通过，包含 Lynx 原生与 web bundle | `evidence/cloudflare-workspace-build.log` |
| 全仓类型检查 | 严格检查通过，保留 Pages 的 TypeScript 6 例外 | `evidence/cloudflare-workspace-typecheck.log` |
| TypeScript 行为 | 464项通过，0失败、0跳过，含旧文件后端32项和 Worker18项 | `evidence/cloudflare-workspace-test.log` |
| Worker/D1/R2 | 官方 Miniflare 5 / 实际 workerd，18项通过 | `evidence/cloudflare-test.log` |
| iOS 伴侣回归 | 22项通过、0失败/跳过；实际 iOS26.5 / SE第3代隔离模拟器 `24F40EDA-5E58-4D10-9192-75E8DF36F7DF` | `evidence/cloudflare-ios-final.log` |
| Android JVM | 27项通过、0失败/跳过，含实际本地 Worker HTTP | `evidence/cloudflare-android-final.log`及XML |
| 实际双端伴侣互通 | 同一 local workerd 的一个 iOS 所有者和一个 Android 伴侣：12阶段/15检查通过 | `cross-platform-checks.json`、`evidence/cross-platform/` |
| 原生旧聚合迁移 | iOS新增1项、Android8项通过；真实 Keychain/Keystore、保留原集合、中断重试、完整健康恢复 | `evidence/cloudflare-ios-migration.log`、`android-migration-checks.json` |
| Android 实际原生链路 | 自建 API35 arm64 `emulator-5580`、隔离 `.uiqa` 包，9项通过，实际 Keystore、Bitmap和事务日志 | `android-native-checks.json` |

仅使用公开虚构备份/照片 fixture 与新建虚构账号，没有读取用户健康记录。
双端覆盖：注册不自动附加数据、独立 AES-GCM R2照片、上传回包丢失后的原密文持久重试、配对/授权、收到数据持久化后才 ACK 鼓励、明确批准的新设备密钥恢复、撤销照片分享与清缓存、远端删除后保留所选本地数据。
Android 额外确认虚构文件与 Keystore 密钥均清理。
iOS 回归使用隔离目录和测试密钥；新增迁移演练使用本地 ad-hoc 签名和模拟器真实 Keychain，没有使用原有个人模拟器。
双端密码学输出匹配独立固定 Node 向量；实际配对测试分别使用各自平台的多个原生客户端。
后续已补完同一 local workerd 的 iOS→Android 和 Android→iOS 实际伴侣互通，见下方覆盖说明。
仍不宣称真机、生产 HTTPS、硬件权限或远端区域验收通过。

## 实际跨平台覆盖与剩余验收

补验使用同一官方 Miniflare/workerd 实例和同一 D1/私有 R2，宿主端口64045。
隔离 iOS SE第3代模拟器（iOS26.5，`E563015C-5EE9-4E73-8F65-89C8714BE540`）注册所有者；隔离 API35 arm64 Android `emulator-5580` 注册独立伴侣账号。
iOS 连接 `127.0.0.1:64045`，Android 通过模拟器宿主映射连接 `10.0.2.2:64045`，实际为同一 Worker。
分阶段原生进程使用真实 Keychain/Keystore、原生密码学和持久存储。
此前各端独立测试/固定向量本身不等于实际双端互通；本次补验提供实际链路证据。

| 方向 | 实际验证 |
|---|---|
| iOS→Android | 伴侣配对证明/确认、明确授权、81.0 kg体重、与原字节一致的公开 fixture JPEG、加密鼓励消息 |
| Android→iOS | 独立78.9 kg体重、另一张原生生成/清洗JPEG的完整SHA-256一致、加密鼓励消息 |
| 双向消息 | 接收持久化后ACK，使另一端发送状态变为 `delivered` |
| iOS撤权→Android | 清除共享体重/照片缓存；认证访问旧对象地址在密文清理后返回 `404 object_unavailable` |
| Android撤权→iOS | 清除共享体重/照片缓存；有效会话访问旧对象地址返回 `object_unavailable`，无法取回照片字节 |
| 清理 | 双端隔离文件及Keychain/Keystore密钥清除；本地运行时和自建模拟器停止/删除 |

两张JPEG摘要不同：iOS `902b88fb192ea99ddf99e5f2bd279afc0203dbbbb8ac79b5ee6356677d3d53c1`，Android `8cb4d535227e357f46caf0b15e09626db2473a5c59c607948b52e52364a68548`。
12个原生阶段和15项检查通过：iOS同一 opt-in 方法分7阶段执行，Android instrumentation分5阶段执行。
代表性跨端记录类别为精确体重，不将该结果扩展为全部健康类别、大集合或真机场景已验证。
仍待验收：生产HTTPS、真实移动网络、远端运行时额度/并发/大照片，以及真机。
本次补验变更限于QA入口和覆盖文档。

### 迁移入口与生产运营的当前边界

后端暂存导入/完成协议和原生 `CompanionCloudflareMigration.prepare/publish` helper 已实现，并通过虚构切换演练。
此前辅助层调用者是原生QA测试；最新补验已经通过实际 Settings 产品入口、六项桥接及两端原生编排。
本地入口现在支持预览、确认、阶段进度、暂停/继续及明确回退，详见报告顶部截图与保全检查。
生产远端管理/迁移/备份执行器，以及提供方资源/凭据配置也尚未完成。
剩余门槛包括运营执行器、提供方配置及生产验收，不是仅差部署开关。
本次补验没有实施新的全设备丢失恢复政策。

## 已实现行为

D1 使用规范化账号/设备/会话哈希、两个准入槽、授权/组/邀请、当前密文记录、重放/nonce/交付回执、私有对象引用与删除任务。
变更在读取权限前读取修订号，由有保护的 CAS batch 事务提交；冲突时整体回滚。
新 Worker 没有整库健康 JSON 单行或文件 fsync 热路径。
会话在 workerd 重启后持久有效，绑定设备证明，30分钟过期，注销/删除立即持久撤权。
注册必须提交过期时间和登录名绑定的哈希准入票据，原子消费、拒绝重放；删除不会自动重开名额。

新密码采用 scrypt `N=16384,r=8,p=5`、随机16字节盐及64字节结果。
该组合属于当前 [OWASP 最低参数组合](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。
导入旧 `p=1` 仅兼容验证，成功登录后才升级；错误密码不重写验证器。
全局/登录名预算与一分钟持久化租约限制跨 isolate 同时只运行一次会话密码验证。
过期预算会清理，崩溃租约过期后恢复。

照片由原生客户端用独立 HKDF 对象密钥、绑定路由的 AES-GCM AAD 加密。
D1 只收到绑定每个对象摘要/大小的小型认证清单；Worker 不持有 E2EE 密钥或照片明文。
R2 仅经认证、不可缓存的私有 Worker 路由访问。
先持久化预约，再条件创建不可变对象；重试复用加密本地 outbox 保存的完全相同密文包。
撤权将密文替换为经强一致验证的零字节栅栏，随后标记 D1 fenced 并清除摘要/大小。
栅栏有意保留，防止延迟条件 PUT 复活字节；它不含健康密文，不能设置生命周期删除。
已下载副本不能远程擦除；原生刷新会清理本应用已撤权伴侣缓存。

删除先原子撤销会话/设备/组成员，持久化 proof 哈希任务，再操作 R2。
全部密文完成清理前，回执和 ACK 均不可用。
故障/重启测试注入真实 R2 接口故障，随后通过官方 service binding 触发 workerd 的真实 scheduled 事件，确认任务完成后才取回回执。
恢复清理属于同一 Worker，没有引入额外生产队列或服务。

## 备份、恢复与迁移边界

独立32字节管理员密钥加密认证 D1 清单及对象索引；R2 仍是客户端密文。
恢复必须提供独立于历史快照保存的权威最新删除基线，写入前认证全部对象字节，保留撤销/栅栏并清除会话。
已验证删除 ACK 后恢复旧快照不会复活账号、对象字节或已 ACK 的任务。
篡改/缺失对象、错误密钥、过旧基线、已填充目标均被拒绝。
旧快照加旧基线不能证明之后没发生删除，最新基线保留属于运营责任。

离线 D1 导入每批最多32条数据语句加保护/检查点。
未完成时持久化维护门禁关闭 HTTP 和 cron。
注入中途故障后目标保持不可用，同一份已认证输入继续恢复101条设备记录，未重复身份。
管理模块目前在本地 Node 中使用官方 D1/R2 绑定；没有配置或实现生产远端备份执行器和存储目的地。
导出要求暂停客户端和 cron，目前在 Node 进程中物化有界表/对象清单；生产流式导出和容量验收仍待完成。

旧迁移验证真实文件后端格式，保留符合条件的账号/设备 ID 和兼容密码验证器。
默认聚合密文导入仍在写入前拒绝；显式分阶段迁移只导入身份/授权，提升全部组 epoch 并建立待完成任务，不复制旧聚合密文、回执、游标或 nonce 历史。
双端已实现 `prepare`/`publish`：同步解密旧聚合，复用现有带密码健康备份，按迁移操作派生新组密钥，持久化设备加密切换日志，在独立空原生集合恢复，再重新发布小型认证清单和独立 R2 照片。
原生同步及服务器对象/引用检查全部成功后，才标记完成。
旧集合和旧服务保持原样，可回退；目标端继续编辑后再回旧端，需明确处理新增数据的合并。
中断后使用同一日志和原密文包重试，阶段/检查点保护原集合不被覆盖。

iOS 真实 Keychain 与 Android 真实 Keystore 各完成两人公开虚构旧账号/照片迁移。
注入已成功上传的照片回包丢失后，重开加密日志并重试完成；明确批准的新设备随后恢复完整健康备份。
比较除导出时间和本地修订计数外的全部健康内容，不只比较体重和照片。
Android 迁移8项通过，包含虚构文件/密钥清理；iOS 新增迁移1项通过，与最终22项回归合计23项。
证据为 `android-migration-checks.json` 和 `evidence/cloudflare-ios-migration.log`。
上述为此前辅助层隔离演练；报告顶部另列本次实际 Settings 入口验收，远端管理执行器仍未完成，没有迁移真实账号。
超出清单/记录明确上限的集合会拒绝，不会截断。

服务器备份不含客户端 E2EE 密钥。
已授权原生设备可通过明确设备邀请恢复当前云端内容，已验证。
现有 PBKDF2/AES-GCM 带密码可移植健康备份也能恢复**备份时点**的记录和照片；本次迁移复用并验证了既有实现。
健康备份不导出伴侣组密钥；设备绑定的迁移日志也不是可移植密钥备份。
全部已授权设备丢失时，账户密码和服务器快照无法解密旧云端密文。
可用的健康备份仍可恢复其快照；恢复云端服务须采用新密钥并重新配对，且需明确授权的账号/设备重置流程，该流程本轮未实现。
最小剩余决策：是否接受“备份快照恢复＋新密钥/重新配对”，还是必须保留旧云端身份/历史，从而另行评审可移植伴侣密钥恢复设计。
两种方案都不承诺在没有密钥或可用健康备份时恢复数据。

## 真实本地性能与最小决策

可复现脚本 `scripts/local-profile.mjs` 测量**真实 workerd 子进程**，没有把父 Node CPU 或 HTTP 延迟冒充 Worker CPU。
20次预热后的顺序成功登录合计消耗1620 ms进程 CPU，即**81 ms/次**。
墙钟中位84.45 ms、p95为88.22 ms，采样进程 RSS 峰值**114.67 MiB**。
详见 `local-performance.json`；CPU 包含本地 D1/R2 子运行时，采样进程 RSS 不是 isolate heap，也不保证捕捉绝对峰值。
不能据此推断远端额度或真机延迟。

Cloudflare 当前规定 Free 每请求**10 ms CPU**，两种套餐内存均**128 MB**。[官方限制](https://developers.cloudflare.com/workers/platform/limits/)
不能认可该验证器已满足 Free，也没有为免费额度降低安全参数。
最小明确计费选择是授权 Workers Paid 后做远端验收；当前订阅从**5美元/月**起，其他用量/资源可能另计。[官方价格](https://developers.cloudflare.com/workers/platform/pricing/)
另一选择是另行评审外部身份方案，保留两人准入和原生 E2EE；尚未实现该替代方案。
没有开通任何选项、登录生产账号或支出费用。
Paid 不提高内存限制，远端大照片/并发与 cron CPU 仍需验收。

## 上线前剩余项

| 项目 | 当前可信状态 | 上线前要求 |
|---|---|---|
| CPU/费用 | 安全参数与本地测量完成 | 授权 CPU预算/身份方案，再远端验收 |
| 大集合 | 明确拒绝超限：512 KiB控制/响应、128 KiB小密文、同步/ACK/预约每批4项、64照片清单、20 MiB加28字节照片 | 既有更大集合导入前完成分块清单/记录、重试与容量提示 |
| 旧数据 | 双端聚合切换、新设备恢复，以及实际 Settings 暂停/继续/回退与源数据保全已通过 | 远端运营执行器/演练及更大集合设计 |
| 全设备丢失 | 已批准设备恢复和现有健康备份恢复已验证；云端密钥不可移植 | 决定快照/新密钥重置政策，或另审伴侣密钥恢复设计 |
| 运营 | 统一默认dry-run本机CLI、独立模板及认证快照/基线恢复已验证 | 远端执行器、提供方绑定、独立生产基线/密钥存储、保留策略及对象内存/负载验收 |
| 平台验收 | 各端回归、固定向量及同workerd双向伴侣记录/照片/撤权互通已通过 | 生产HTTPS、真机网络及远端容量/故障验收 |

完整代码文件行号和源码 SHA 见 `code-evidence.md`/`code-evidence.json`。
Library 证据包包含新后端、范围内双端/页面源码、RFC、检查日志和源码审计，不含运行数据、活测试 bearer 凭据、Pods、node_modules 或无关并行源码。
这是可评审的本地实现及明确部署门槛，不能标记为生产接入或真实账号迁移已完成。
