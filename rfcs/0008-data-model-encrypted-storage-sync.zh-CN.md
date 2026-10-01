- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0005, 0006, 0007

# 数据模型、加密存储与同步

[English](0008-data-model-encrypted-storage-sync.md) · 简体中文

## Summary

定义 LeanOn 数据如何组织、保护与共享：

- 带版本的实体模型与通用记录信封（身份、时间戳、墓碑）
- 由 iOS Keychain / Android Keystore 支撑的静态加密，位于 `storage.*` 模块之后
- 双人家庭组的端到端加密同步；服务端只见密文
- 确定性冲突解决（日志 append-only、可变状态 last-write-wins、集合 union + 墓碑）
- 粒度可控、默认关闭的隐私边界：每个人的数据默认私有

Schema、迁移与合并/同步决策是新包 `@zzzode/data` 中的纯 TypeScript；平台加密与网络通过端口
注入。

## Motivation

- 健康数据（体重、饮食、照片、月经数据）高度敏感；必须在磁盘加密，且未经明确选择绝不暴露给
  服务端或伴侣。
- 两人多设备需要在不信任服务器的前提下保持数据一致。
- 离线时冲突不可避免；解决必须确定、可测，删除必须能同步（墓碑）。
- 情侣健康产品必须避免指责/压力：共享是按类别选择，绝不做共享"热量池"或愧疚式连坐。

## Guide-level explanation

- 每条记录是一个信封，含稳定 id、owner、时间戳、schema 版本与删除标记。日志 append-only；
  可变状态小而带版本。
- 设备存储加密集合。安全硬件中的密钥保护用于加密记录的数据密钥。
- 家庭组是端到端加密通道。成员交换密文；服务端只中转并跟踪每设备游标。
- 同步时，不可变条目按 id 合并，可变字段取最新写入，集合按 union + 墓碑合并。当日汇总始终由
  明细重算，绝不作为数值合并。
- 每人按类别选择共享内容（如目标与打卡连续天数）；饮食、照片、月经数据与精确体重默认私有，
  除非显式共享。

## Reference-level explanation

### 记录信封与身份

```ts
interface RecordEnvelope<T> {
  id: string;            // 创建时分配的稳定 UUID
  ownerId: string;       // 记录归属的人
  schemaVersion: number; // 实体 schema 版本
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601；驱动 last-write-wins
  deviceId: string;      // updatedAt 相同时的决胜因子
  deleted: boolean;      // 墓碑
  data: T;               // 实体负载
}
```

### 实体与 schema 版本化

核心实体：`Profile`、`WeightLog`、`MealEntry`（含 `FoodItem` 与 AI 猜测状态）、
`ActivityEntry`、`MenstrualLog`、`GoalState`、`Settings`、`FamilyGroup`。

- 每个实体有整数 schema 版本。迁移链把每个版本映射到下一版本；数据库记录当前版本，迁移是
  纯的全函数。
- 日志（`WeightLog`、`MealEntry`、`ActivityEntry`、`MenstrualLog`）创建后不可变，仅支持软删；
  派生值（当日汇总、趋势）由 `@zzzode/core` 重算，绝不作为权威存储。

### 本地加密存储与密钥层级

- 集合以静态加密形式存储，位于 `storage.get/set/remove` 之后。
- 密钥层级：硬件支撑密钥（Keychain/Keystore）包裹随机数据加密密钥（DEK）；DEK 加密记录字节。
  被包裹的 DEK 与数据一起存储；解包裹密钥永不离开安全边界。
- 加密通过 `CipherPort`（加解密、密钥生成/包裹）；实现使用平台 API。data 包定义类型与信封
  序列化，不定义原语。
- 支持加密的、用户可控的导出/导入；本地数据可被完全擦除。

### 端到端加密家庭同步

- 家庭组有仅成员设备可知的组密钥；增删成员时轮换或重新包裹密钥。每成员或 sender 密钥支持
  未来在不信任服务器的情况下加入成员。
- 同步协议交换加密变更集，使用每设备游标；操作按记录 id 幂等，墓碑复制删除。
- 服务器不可信且"哑"化：存储密文、投递变更集、跟踪游标。除路由所需外，无法读取记录或元数据。

### 冲突解决（确定性）

- 不可变日志：按 `id` union；相同 id 保留一份；墓碑优先于存活条目。
- 可变状态（`Profile`、`GoalState`、`Settings`）：比较 `updatedAt` 的 last-write-wins，
  `deviceId` 作为稳定决胜。
- 集合（自定义 `FoodItem` 库）：成员 union，应用墓碑。
- 绝不合并派生产物；通过 `@zzzode/core` 从合并后的明细重算。
- `mergeRecord` 与 `mergeCollection` 是纯函数并有单测。

### 隐私边界

- 数据默认私有。共享按类别与方向（单向或双向）：建议共享目标、进度区间与打卡连续天数。
- 建议默认私有：单餐、照片、月经数据、精确体重、AI 猜测。
- 不做把一方饮食从另一方额度中扣除的共享预算，也不做羞辱性排行榜；鼓励默认关闭，并可按要求
  非数值化。

### 导出、保留与删除

- 用户可导出自己的数据（机器可读）并删除账户，删除会复制墓碑并移除服务端密文。
- 保留最小化；照片与 AI 负载遵循单独、已披露的策略。

## Drawbacks

- E2EE 使备份、密钥恢复与添加新设备更复杂；丢失密钥可能意味着丢失数据。
- 墓碑与保留上一可用副本增加存储；LWW 可能丢失对可变状态的并发编辑（在本领域可接受）。
- 哑服务器无法提供服务端分析或明文的网页恢复。

## Rationale and alternatives

- **让服务器持有明文（如普通 Firebase/Supabase）**：更容易但暴露健康数据、削弱伴侣隐私保障；
  改为 E2EE。
- **完整 CRDT**：强大但对"append-only 日志 + 少量可变文档"过重；定向规则（union/LWW/墓碑）
  足够且可审计。
- **SQLCipher 式加密 SQL 与加密文档集合**：两者都可支撑 CipherPort；data 包保持中立，按平台
  选择。
- **默认开启共享以"督促"**：增加压力、有诱发失调风险；否决；共享粒度可控且默认关闭。

## Unresolved questions

- 具体同步后端（自建中继 vs 托管服务）及其鉴权模型。
- 密钥备份/恢复与组密钥轮换体验；设备丢失时如何处理。
- 各平台确切的加密算法、AEAD 与元数据填充选择。
- 照片是否同步，还是仅保留引用、留在设备本地。
- 原生存储模块向本 schema 的迁移。

## Implementation plan

- [x] 数据模型、存储与同步设计（本 RFC）
- [x] `@zzzode/data` 包：信封/实体类型、迁移框架、合并/集合解决、同步变更集计划、CipherPort
      类型与 Rstest 套件
- [ ] 平台 CipherPort 实现（Keychain/Keystore）与加密集合
- [ ] 同步中继与端到端密钥交换
- [ ] 隐私/共享设置 UI 与账户导出/删除

## References

- RFC 0005（`storage.*`）、RFC 0006 原生模块与安全硬件、RFC 0007 下发。
- 端到端加密模式（组/sender 密钥）、基于墓碑的同步、last-write-wins 与集合 union 冲突解决。
