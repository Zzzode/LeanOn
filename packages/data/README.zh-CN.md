# @zzzode/data

[English](README.md) · 简体中文

LeanOn 的版本化 schema、确定性合并/同步与加密存储契约。纯 TypeScript，不含加密、网络或文件
系统代码；平台 Keychain/Keystore 与同步中继通过端口注入。

## 组成

- **信封与实体**——每条记录带 id、owner、kind、schema 版本、时间戳、device id 与删除标记；
  日志不可变，派生值由 core 重算。
- **迁移**——`Migrator` 应用纯的版本链；`migrateEnvelope` 更新记录。
- **合并**——墓碑优先，否则按 `updatedAt` 的 last-write-wins、`deviceId` 决胜；
  `mergeCollection` 按 id 分组解决。
- **同步**——`selectOutgoing` 依据对端向量计算变更；`applyBatch` 合并端到端加密变更集。
- **隐私**——数据默认私有；共享按类别、默认关闭。
- **CipherPort**——由宿主实现的加解密与包裹数据密钥契约。

## 用法

```ts
import {
  applyBatch,
  defaultShareSettings,
  mergeCollection,
  Migrator,
  selectOutgoing,
} from '@zzzode/data';

// schema 升级
const migrator = new Migrator().add({
  from: 1,
  to: 2,
  migrate: (d) => ({ ...(d as Record<string, unknown>), upgraded: true }),
});

// 合并远端状态并计算回传内容
const merged = mergeCollection(localRecords, remoteRecords);
const outgoing = selectOutgoing(merged, peerVector);

// 未显式开启类别前，共享是关闭的
const sharing = defaultShareSettings();
```

## 相关

- RFC 0008 数据模型、加密存储与同步；RFC 0005 桥（`storage.*`）；RFC 0006 原生安全硬件；
- RFC 0004 core 重算。

## 本地个人数据与可移植备份

`PersonalStateDto` 版本 1 独立保存饮食偏好、围度和照片元数据，不改变 core 的 schema 2 记录。
个人数据写入校验修订号并保留操作回执；相同操作重试先重放，再检查修订号。
饮食偏好保留未知 JSON 属性、拒绝凭证，不承诺过敏安全，也不自动猜测目录食物的类别。
围度至少提供一个 20–300 cm 的值；趋势按日历日期排序，缺失测量保持未知。
照片元数据对应用户明确导入后去除敏感元数据的 JPEG 衍生图，文件位置和密钥留在宿主。
编辑照片元数据时保留文件身份、MIME、尺寸和创建时间。

`BackupPayloadDto` 包含完整 schema 2 记录、自建食品、收藏/最近食物 ID、个人数据，以及以 base64 表示的持久 JPEG 精确字节。
其中不包含账户、会话、认证 token、设备密钥或系统权限状态。
同一天的历史营养聚合保持独立，并检查派生每日总量是否与投影一致。
`preflightRestore` 返回独立的已校验恢复计划与统计，不写入数据。
原生宿主必须重新检查记录和个人数据两类修订号，先认证、取得明确确认，再原子提交所有存储与照片文件。
纯模型预检不能替代原生事务与重启恢复验证。

备份格式 1 使用 AES-256-GCM、12 字节 nonce、16 字节 salt，以及固定 600,000 次 PBKDF2-HMAC-SHA256。
密文包含 16 字节认证 tag，关联数据为精确 UTF-8 字符串 `LeanOn backup v1`。
口令按未经 Unicode 归一化的精确 UTF-8 字节处理，长度为 12–1,024 字节。
序列化信封上限 64 MiB；单张 JPEG 上限 20 MiB、总 JPEG 字节上限 32 MiB，照片元数据最多 1,000 项。
密码学、安全随机数和 JSON/UTF-8 编解码器通过端口注入，本包不导入原生或 Node API。
密码学原语和跨平台文件需要原生测试，纯编排测试不能证明这些能力。

## Partner 契约

`CompanionResponseDto` 包含无凭证 UI 状态和明确的运行状态，包括可信原生时钟及设备授权。
邀请只有在创建者明确确认真实接收账户和设备 ID 后才生效。
消息只有在接收端持久化并返回回执后才显示已送达。
所有分享类别，包括围度和鼓励，默认私有。
对端快照字段必须有对应类别授权；原生与服务端落实接收方授权，鼓励要求双方分别主动开启。
加密照片字节和本人设备保险库复制由原生传输/存储负责；仅有元数据不能宣称照片已同步。

## 公开密码学互通夹具

`backup-crypto.test.ts` 使用真实 Node PBKDF2 与 AES-GCM 验证共享流程，以及认证失败时不解析 JSON。
[PUBLIC 夹具](src/fixtures/public-backup-v1.json) 包含合成且无元数据的 4×4 JPEG、精确明文字节、公开固定密码/盐/nonce、派生密钥及 SHA-256。
[便携 envelope](src/fixtures/public-backup-v1.envelope.json) 是供原生导入测试使用的精确备份文件。
这些固定输入仅用于测试，不能用于生产加密。
先构建 data，再从仓库根目录运行 `node packages/data/scripts/generate-public-backup-fixture.mjs` 重新生成（使用根目录开发依赖 `sharp`）。
密码包含分解的 `e` + U+0301；跨平台以 `passwordUtf8Hex` 为精确输入，不做 Unicode 归一化。
原生测试仍须独立验证平台密码学、恢复持久化和事务。

## 确定性保险库合并

`VaultSnapshotDto` 包含可移植 payload、逐实体时钟与自建食品墓碑。
`mergeVaultSnapshots` 合并独立离线新增，竞争版本依次按时间戳、设备 ID 与变更 ID 决胜。
体重和饮水每个日历日期保留一个获胜值；不同记录类型拥有独立的身份空间。
匹配的恢复回执只取消自己的删除 token，不取消后来发生的删除。
相同时钟对应不同内容会校验失败，不会静默挑选 payload。
照片元数据与精确 JPEG 字节来自同一个获胜实体。
[PUBLIC 合并夹具](src/fixtures/public-vault-merge-v1.json) 给出八组原生/TypeScript 共用样例，包括标量时钟、因果撤销和精确照片字节。
原生 adapter 还须校验修订号，在推进同步游标或发送接收回执前原子持久化全部存储。
