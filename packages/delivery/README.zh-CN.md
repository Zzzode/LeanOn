# @zzzode/delivery

[English](README.md) · 简体中文

用于不发版交付与更新 Lynx bundle 的纯确定性决策引擎。不含网络、文件系统、时间或加密代码；
宿主通过端口执行这些操作，并由本包决定该做什么。

## 决策内容

给定签名清单、持久化本地状态与设备/用户上下文，`decideUpdate` 对每个 bundle id 返回一个
动作：

- `download`——缺失/更旧、兼容且在灰度内
- `rollback`——当前版本损坏或被撤回，且存在上一可用版本
- `skip`——带稳定原因（`up_to_date`、`incompatible_host`、`missing_capability`、
  `not_in_rollout`、`yanked_no_alternative`、`not_listed`）

## 用法

```ts
import { decideAll, type BundleManifest, type DeliveryContext, type LocalState } from '@zzzode/delivery';

const manifest: BundleManifest = await fetchManifest();          // 宿主端口（resource.fetch）
const local: LocalState = await readLocalState();                // 宿主端口（storage.*）
const context: DeliveryContext = {
  hostVersion: '0.1.0',
  userId: 'stable-user-id',
  hostCapabilities: ['app.getCapabilities', 'health.readSamples'],
  platform: 'ios',
};

for (const action of decideAll(manifest, local, context)) {
  if (action.kind === 'download') {
    // 下载到临时文件，校验 checksum + 签名，原子移入缓存
  } else if (action.kind === 'rollback') {
    // 从缓存恢复 action.toVersion
  }
}
```

## 组成

- `version`——用于 `minHostVersion` 的 semver 比较
- `rollout`——确定性 FNV-1a 按用户分桶与百分比门控
- `manifest`——工件查找与宿主兼容性检查
- `integrity`——checksum 比对与组合完整性结果
- `decision`——`decideUpdate` / `decideAll`

## 相关

- RFC 0007 动态化下发；RFC 0005 桥（`resource.fetch`、`storage.*`）；RFC 0006 原生宿主与
  容器。
