# 私有 Cloudflare 后端：本地实现

简体中文 · [English](README.md)

独立后端使用官方本地 workerd、规范化 D1 表与私有 R2 照片桶。
只有两个与登录名绑定、会过期的准入槽能创建账号；不开放公共注册。
保留 `server/companion` 文件后端用于回归。
参见 [RFC 0035](../../rfcs/0035-private-cloudflare-companion.zh-CN.md) 与[验证报告](../../docs/cloudflare-local-2026-10-07/report.zh-CN.md)。

## 本地运行

使用仓库固定的 pnpm 11.7.0 与 Node >=22.13，在仓库根目录运行：

```sh
pnpm --filter @zzzode/companion-worker build
pnpm --filter @zzzode/companion-worker typecheck
pnpm --filter @zzzode/companion-worker test
```

在本包目录运行：

```sh
node scripts/local-fixture.mjs 64036
node scripts/local-profile.mjs
```

fixture 仅包含公开虚构凭据和两个短期测试准入票据。
持久化目录为 `.tmp-tool-results/cloudflare-fixture-<port>`，启动时必须为空。
通过 SIGINT/SIGTERM 停止时会移除虚构数据。
性能脚本创建并删除独立官方模拟实例，将真实子进程 CPU/RSS 写入验证目录。
这些命令不登录 Cloudflare，不创建远端资源。
配置只含本地占位 ID、关闭公共预览、使用本地绑定；不能用作远端迁移/部署配置。

## 合约与容量

会话只持久化 SHA-256 token 哈希，30 分钟过期并绑定设备证明；注销和撤权持久化。
新密码使用 scrypt `N=16384,r=8,p=5`、随机16字节盐与64字节结果；兼容旧 `p=1`，成功登录后升级。
全局/登录名预算与一分钟持久化租约限制同时只运行一次密码验证。
变更在读取权限前读取修订号，通过有保护的 D1 CAS 事务提交。
请求/响应上限512 KiB、同步/ACK/预约每批4项、小密文128 KiB、每份清单64张照片，照片最多20 MiB加28字节头。
超限明确拒绝；更大的既有集合需要分块清单设计后才能切换。

双端从 `/v1/me` 协商 `protocol: 2`，登录仍不自动绑定健康数据。
照片使用独立 HKDF 密钥、绑定路由的 AES-GCM AAD；D1 仅存小型认证清单。
私有二进制 PUT 为不可变条件创建；重试复用加密本地 outbox 中的原始密文。
撤权将密文替换为永久零字节栅栏，不能设置删除栅栏的生命周期规则。
全部密文完成清理并验证后才返回删除回执/允许 ACK。
同一 Worker 的 scheduled handler 每批最多清理4个对象。
已下载副本不能远程擦除；本应用在刷新撤权时清除伴侣缓存。

## 备份与迁移

Node 管理模块用独立32字节管理员密钥认证加密清单、密文对象索引及另行保留的最新删除基线。
它不是公共 Worker 接口，也不是生产远端备份执行器。
导出前暂停客户端和 cron；恢复前认证全部对象字节及当前删除基线。
恢复清除会话，保留账号/授权撤销与栅栏。
每个导入事务最多32条数据语句及保护/检查点；未完成时 HTTP 与 cron 均关闭。
中断恢复只能使用同一份已认证输入继续。
最新删除基线必须独立于历史备份保存；旧基线不能证明之后没有发生删除。
测试覆盖中断恢复、篡改、丢失对象与删除 ACK 后恢复旧快照。

旧迁移验证真实文件后端格式，保留符合条件的身份/设备证明和兼容密码验证器。
默认聚合密文导入在写入前拒绝；操作方显式调用 `migrateLegacy(db, legacyState, {operationId})`，仅暂存身份/授权、提升全部组 epoch，并建立每账号迁移任务。
不复制旧记录、回执、游标或 nonce 历史。
有密钥原生客户端通过 `CompanionCloudflareMigration.prepare/publish` 解密旧聚合、制作现有加密健康备份，在独立空本地集合恢复，以操作绑定的新密钥重新发布。
设备加密阶段日志可恢复中断并复用完全相同的密文包。
`POST /v2/migrations/complete` 检查清单/照片引用后才完成任务。
两人都完成前保留旧集合/服务；目标端继续编辑后回退需处理新增数据合并。
没有迁移真实账号或记录。
Settings 已通过六个 bridge action 提供原生预览、明确确认、进度、安全暂停/恢复及回退。
有时效的预览绑定已授权源设备、目标身份和本地版本；启用目标使用已有原生事务。
独立目标集合及加密源检查点保留，重启不会自动恢复上传；64照片及小清单等上限明确拒绝，不截断。
离线管理入口为 `node scripts/migration-plan.mjs --dry-run --source FILE --target ORIGIN --service-id VERIFIED_ID --operation ID`。
它校验旧格式与所提供身份的格式，输出不含凭据或密文的计划；目标的实际身份由原生预览认证。
该独立规划脚本没有 execute 模式或远端管理执行器。
新增的统一合成数据运营 CLI 只提供显式本机执行；见[本机管理指南](local-admin.zh-CN.md)和[独立参数模板](templates/local-admin.example.json)。
六个子命令默认 dry-run，拒绝远端地址/参数，仅使用带标记的临时 Miniflare D1/R2 目录。
备份、独立删除基线、恢复和迁移暂存复用既有管理模块；不提供生产凭据或全设备丢失策略。

Settings 专项夹具为 `node scripts/local-migration-entry-fixture.mjs`，仅用于新的隔离 `.uiqa` 模拟器。
本机控制器可以暂缓完成响应以测试暂停和进程中断；目标代理会移除已解码的传输头。
iOS 使用显式开启的 `MigrationEntryUITests`/原生检查点测试，Android 使用 `-e scenario migration-entry-ui` instrumentation。
测试数据为公开备份及虚构的体重、饮水、运动与餐记录，不安装伪造迁移状态。
真实 UI 覆盖及生产边界见迁移入口证据与报告。

隔离演练为 `node scripts/local-migration-fixture.mjs`：旧 localhost64041、虚构控制64042、目标 workerd64043。
仅创建/清理自己的临时目录；控制端点只属于本地测试进程，不属于 Worker。
只运行 `.uiqa` 入口：Android endpoint `http://10.0.2.2:64043`；iOS 测试环境 `LEANON_CLOUDFLARE_MIGRATION_QA=isolated-64041-64043`，模拟器 ad-hoc 签名保证真实 Keychain 可用。
每平台从新 fixture 开始，SIGINT/SIGTERM 结束。
双平台原生演练已通过原集合保留、丢回包重试、新授权设备完整健康恢复。

服务器快照不含客户端 E2EE 密钥。
既有带密码可移植健康备份可恢复备份时点的记录/照片，但不导出伴侣密钥；设备绑定迁移日志不是可移植密钥备份。
全部已授权设备丢失后，账户密码/服务器备份不能解密旧云端。
可用健康备份仍可恢复其数据；恢复云端服务需明确的新密钥/设备重置及重新配对政策，或另行评审可移植伴侣密钥恢复。
本地迁移 helper 尚未实现这种重置流程或可移植密钥导出。

## 部署边界

本地通过不证明远端免费额度可行。
实测成功登录约消耗81 ms本机 workerd 进程 CPU，方法及边界见报告。
不能为了免费额度削弱密码参数。
上线前需选择付费 CPU 预算或另行评审的身份提供方，并完成备份目的地/基线保留、密钥恢复、集合容量及私有对象内存/负载验收。
本地流程不授权部署、开通付费、登录生产账号、提交或推送。

## 实际原生双端QA

一个iOS所有者与独立Android伴侣已通过同一localhost64045 workerd的双向体重/照片/消息/ACK及分享撤权。
准确范围见报告和 `cross-platform-checks.json`；各端独立测试不等于这次互通验收。
iOS opt-in方法为 `testStagedCloudflareCrossPlatformPartnerInteroperability`，设置 `LEANON_CLOUDFLARE_CROSS_STAGE` 和 `LEANON_CLOUDFLARE_CROSS_DIR` 提供的私有 `/tmp/leanon-cloudflare-cross-*` 目录。
Android `.uiqa` instrumentation使用 `-e scenario cloudflare-interop -e stage <stage>`，不路由生产存储。
真机、生产HTTPS、真实移动网络和远端容量/故障验收仍待完成。
