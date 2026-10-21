# 原生伴侣互通

[English](native-interop.md) · 简体中文

本文补充[中继协议](protocol.zh-CN.md)中的客户端加密内容契约。
中继永不解密这些信封。
本地 QA 仅使用虚构账号和生成或公开测试照片。

## 加密明文契约

| 类别 | 明文 | 记录标识 |
|---|---|---|
| `vault` | `{version:1,kind:"vault-snapshot",payload:BackupPayloadDto,clocks,tombstones:{customFoods:string[]}}` | `vault-snapshot-<deviceId>` |
| `vault-keyring` | `{version:1,kind:"account-keyring",familyKeys:{[activeFamilyId]:base64Raw32}}` | `keyring-<deviceId>` |
| 伴侣健康类别 | `{version:1,kind:"family-category",category,data,photoBytes?}` | `category-<category>` |
| `encouragement` | `{version:1,kind:"encouragement",text,createdAt}` | 随机不透明标识 |

个人快照和密钥环使用账号个人库密钥；伴侣类别及鼓励使用独立的伴侣密钥。
照片必须包含实际规范化 JPEG 字节和对应元数据。
对端的规范 JPEG 经过校验后逐字节保留，不再重新压缩。
密钥环仅携带当前有效伴侣组标识，且位于个人加密库内。
客户端拒绝恢复已观察到撤销的组密钥。
仍绑定伴侣时重新登录，应先读取个人库现有密钥环，再发布本机版本；内存缺少密钥不能用空密钥环覆盖唯一已保存副本。

## 数据归属与授权

注册和登录不会自动绑定、上传或合并已有健康数据。
`attachLocalData` 必须明确授权，并对记录和个人数据两份修订执行 CAS。
数据归属及账号密钥按服务地址和账号分别隔离，另一账号或中继不会继承原来的数据归属。
尚未绑定本机数据的设备只能处理个人密钥环，跳过健康快照的解密及合并。
每台新设备的本机共享选择默认为空。
实际导出取本机明确选择与中继当前方向授权的交集。
撤销选择与待发送队列清理先落盘，再请求网络撤销，网络失败不能恢复本机已撤销的导出。
鼓励须双方授权；即使未共享健康内容，当前入站授权类别仍会出现在状态中。
断网退出先清理本机身份、伴侣密钥、对端缓存及待发送内容，再尝试撤销服务端会话。
撤销失败保留待处理状态，后续重试或随短期会话到期。
只读状态刷新能够观察设备批准，不会自动绑定或上传健康数据。
身份拒绝和会话过期会清理本机会话与对端缓存。
身份、对端密钥及缓存先持久化撤销，再执行可能失败的预览文件清理。
预览清理失败保留待处理状态并重试，不恢复授权。

## 账户删除恢复

发送前持久化加密 `pendingAccountDeletion`，字段为 version、operationId、proof、endpoint、accountId、displayName、准确规范 login、deleteLocalData、两份 expected revision、phase、localDataCleared。
阶段为 prepared、confirmed、local-complete，旧私有状态缺少此可选字段仍可读取。
proof 与 login 永不进入运行时 DTO、事件、健康备份、日志或诊断报告。
首次准备拒绝未授权设备，意图写盘失败则不发送删除 HTTP。
prepared 在会话过期处理前查询固定 realm 回执；其他 Companion 修改暂停。
只有显式密码重试才取得新会话，检查原账户、设备 ID 和授权后重发同一操作。
旧会话缺准确 login 时首次准备失败，要求重新认证，不猜测 displayName。
匹配的 durable 回执将意图改为 confirmed，并撤销本机身份、账户/伴侣密钥及缓存。
清除健康数据须双修订 CAS，在同一原生 journal 中提交 records、personal、health ledger 清除与加密 localDataCleared 标记。
标记先发布，再执行可能失败的密钥清理；失败不得用旧状态覆盖标记。
标记后的重启仅重试密钥清理，不再次清除存储。
若新 records、personal 或 ledger 文件出现，保留其字节/密钥，返回 `account-deletion-key-cleanup-conflict` 且 localDataChanged=true。
用户可通过新双修订 CAS 明确 keep-local(false) 完成并保留新文件/密钥；标记后 true 不允许再次清除。
首次清除前修订变化亦需明确重新确认或保留本机数据。
持久化 local-complete 后才 ACK；响应丢失可无会话重试，不再次清除。
公开 runtime 仅包含 phase、accountId、displayName、deleteLocalData、localDataChanged。

## 合并与提交

规范算法位于 [`packages/data/src/vault-merge.ts`](../../packages/data/src/vault-merge.ts)。
实体时钟键为 `profile`、`preferences`、`favorites`、`recent`，以及 `weight:`、`water:`、`exercise:`、`legacy-intake:`、`intake:`、`measurement:`、`photo:`、`custom-food:` 加实体标识。
只有实体内容变化才产生新单调时钟，首次未修改的空默认值使用零时钟。
记录独立合并，体重与饮水先过滤删除墓碑，再处理日期身份冲突。
删除标记优先于实时记录，只有精确对应的因果恢复回执才能撤销该标记。
操作回执标识冲突、相同时钟对应不同内容均拒绝。
照片字节与元数据遵循同一胜出时钟。
合并内容变化时，两份修订仅推进一次。
接收内容、时钟、游标和待 ACK 内容必须经原生多存储事务落盘，之后才能发送 ACK。
CAS 或写盘失败不得确认送达。
发送方依匹配接收者回执显示送达，不假定双方设备时钟一致。

## 公开证据与边界

共享[八场景合并样例](../../packages/data/src/fixtures/public-vault-merge-v1.json)涵盖离线新增、日期身份、无关编辑、删除、因果恢复、JPEG 字节、食物删除及复用时钟冲突。
[公开加密样例](../../apps/android/app/src/test/resources/companion/public-companion-crypto-v1.json)使用合成密钥，对比 Node 与 Kotlin 的 HKDF、AES-GCM、原始密钥包装、完整 AAD 及邀请编码。
公开密钥不得用于实际数据。
Android 显式启用的 JVM HTTP 集成要求单独批准的随机端口 loopback 中继、临时虚构账号、加密临时文件及测试数据端口。
它证明真实 HTTP 和加密行为，不证明 Android Keystore、Bitmap 解码或实际多存储事务。
分阶段 Android instrumentation 使用真实 Keystore、Bitmap、RecordsRepository、PersonalRepository 与 BackupCoordinator，但仅操作缓存隔离目录。
它与 iOS 测试协调执行 `accept`、`sync`、`verify`、`revoked` 及隔离 `cleanup` 阶段。
独立的 `deletion-fail` 和 `deletion-recover` 阶段验证真实远端删除、本机清理故障注入及进程重启恢复。
此前完成的 A/B/C 阶段使用旧响应后意图算法，不证明新发送前意图/回执协议实际执行覆盖。
新协议已有中继真实 TCP 和原生纯故障/schema 证据；新的原生真实网络删除与重启验收等待单独执行批准。
Android 十二项定向纯测试包含八项 Repository 恢复场景，以内存 transport 和加密临时文件验证 DELETE 已提交后响应丢失、过期会话下重新打开、ACK 丢失、confirmed 状态写盘失败、修订 CAS、标记后密钥清理重试、新 ledger 保留、缺失/错误身份回执及错误密码拒绝。
这些测试执行真实 Repository 状态机，但测试事务与模拟中继响应不证明 HTTP、Android Keystore、真实进程死亡或生产三存储 journal。
独立 BackupCoordinator authority 测试覆盖旧 CAS、密钥失败前已提交标记、重试及新 records/密钥保留。
重启检查须强制停止应用并核实目标进程标识变化，仅重新创建 Repository 不算重启证据。
只有设备报告成功才能算执行通过，编译不算执行证据。
凭据交接文件权限为 0600，永不进入日志、报告、截图或 Library。
原生 UI 按钮、实际文档或图片选择器、健康权限、生产身份服务及部署需要独立验证。

中继仍是有界本地 QA：单份密文解码后 64 MiB、HTTP 96 MiB、持久状态 128 MiB。
原生状态和 HTTP 批次亦有上限，容量失败明确返回，不以仅保存元数据冒充成功。
不承诺所有设备与伴侣组合同时容纳最大照片容量。
