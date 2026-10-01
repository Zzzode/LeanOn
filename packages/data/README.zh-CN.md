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
