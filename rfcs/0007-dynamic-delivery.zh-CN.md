- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0005, 0006, 0008

# 动态化下发

[English](0007-dynamic-delivery.md) · 简体中文

## Summary

设计 Lynx bundle（页面与卡片）如何不发版地交付与更新：

- 签名的**清单（manifest）**，列出带版本的 bundle 工件
- 下载并做 SHA-256 与签名校验、原子化本地缓存
- 离线优先加载（立即渲染已缓存 bundle）
- 通过确定性的按用户分桶做灰度
- 按宿主版本与能力做兼容性门控
- 自动回滚到上一可用（last-known-good）bundle

更新**决策**是新包 `@zzzode/delivery` 中的纯 TypeScript；宿主通过注入的端口执行网络、文件与
加密操作。

## Motivation

- Lynx 的价值在于动态 UI，但 Lynx 不抓取资源。安全的下发通道才真正让修复与特性免于应用商店
  审核。
- App 必须离线可用，且绝不能安装损坏或被篡改的 bundle。
- 坏版本必须自愈：加载失败的 bundle 应无需用户操作即回滚。
- 对双人 App，后端应极简：静态托管一个清单加若干 bundle。

## Guide-level explanation

- 启动时宿主立即渲染某路由的缓存 bundle。
- 后台拉取清单，与持久化的本地状态对比，让下发引擎对每个 bundle 给出动作：下载、回滚或
  跳过。
- 符合条件的 bundle 下载到临时文件，校验（checksum + 签名）通过后原子替换当前工件。
- 新版本按（用户、bundle）的稳定哈希逐步灰度；已拥有某版本的用户，即使百分比后来下调也保留
  该版本。
- 若 bundle 被标记 yanked 或反复加载失败，宿主从缓存恢复上一可用版本。

## Reference-level explanation

### 清单与工件模型

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-01T00:00:00Z",
  "bundles": {
    "home": {
      "version": 7,                 // 每个 bundle id 的单调整数版本
      "url": "https://cdn/bundles/home@7.lynx",
      "sha256": "<hex>",
      "signature": "<分离式签名>",
      "minHostVersion": "0.1.0",
      "requiredCapabilities": ["health.readSamples", "app.getCapabilities"],
      "size": 184320,
      "rolloutPercentage": 25,      // 缺省 = 100
      "yanked": false
    }
  }
}
```

### 更新决策（纯函数）

`decideUpdate(id, manifest, localState, context)` 返回其一：

- `download`——本地缺失/更旧，且兼容性与灰度通过
- `rollback`——当前版本损坏或被撤回，且本地缓存有上一可用版本
- `skip`，原因：`up_to_date`、`incompatible_host`、`missing_capability`、
  `not_in_rollout`、`yanked_no_alternative`、`not_listed`

规则：

- 兼容性：宿主 semver 必须满足 `minHostVersion`，且每个 required capability 方法都必须出现在
  `app.getCapabilities` 中。
- 灰度只门控**新下载/升级**；已在某版本的用户不会因百分比下调而被撤回。
- 清单中缺失的 bundle，本地保持不动（不做远端删除）。
- 清单不会让健康用户降级。

### 灰度

`rolloutBucket(userId, bundleId)` 用稳定字符串哈希（FNV-1a）得到 0–99 的确定性桶。当
`bucket < p` 时才提供 `rolloutPercentage: p` 的版本。同一用户跨启动映射到同一桶；不同用户
分散到不同桶。

### 完整性与安全

- 使用前校验 SHA-256，并用内置在 App 中的公钥校验分离式签名。
- 写入临时文件，两项检查都通过后再原子移动到位。
- 下发走 HTTPS；模块鉴权 validator（RFC 0006）是独立边界。
- 引擎提供 checksum 比对与结果类型；哈希与签名校验通过端口使用平台加密能力。

### 缓存与回滚

- 保留当前与上一可用工件，以及按 id 持久化的状态（`version`、`lastGoodVersion`、`broken`）。
- 加载失败（或崩溃信号）把版本标记为 broken；下一次决策回滚到 `lastGoodVersion`。设置缓存
  容量预算并淘汰更旧工件。

### 端口与托管

引擎被赋予由宿主支撑的端口：拉取清单/bundle（`resource.fetch`）、读写本地状态（`storage.*`）。
包内不含任何网络或文件系统代码。后端是静态的：CDN 或 GitHub Pages 提供清单与签名 bundle；
清单示例与签名说明放在 `server/`。

## Drawbacks

- 签名引入密钥管理与每次发布签名的步骤。
- 每个 bundle 保留两份工件会多占磁盘；若首次安装就是坏的，则没有上一可用版本、无法回滚。
- 百分比灰度对用户整体是概率性的；按用户确定，而非按设备。

## Rationale and alternatives

- **立即全量发布给所有用户**：更简单但坏 bundle 会到达每个人；否决。
- **把决策放进原生代码**：不可测且重复；纯 TS + 注入 IO 端口可确定、可单测。
- **由有状态后端计算每用户更新**：在此规模没有必要；静态托管 + 客户端分桶即可。
- **不做签名、首次使用即信任**：减少运维但允许篡改；否决。

## Unresolved questions

- 各平台的签名方案与密钥存储/轮换（内置公钥格式）。
- 把 bundle 标记为 broken 的确切崩溃/失败信号与失败阈值。
- 缓存预算与淘汰策略默认值。
- 卡片与页面共用一个清单还是使用独立通道。

## Implementation plan

- [x] 下发设计（本 RFC）
- [x] `@zzzode/delivery` 包：类型、semver、灰度、兼容性、决策、完整性辅助与 Rstest 套件
- [ ] `server/` 下的清单示例与静态托管/签名说明
- [ ] 宿主端口：真实资源 provider 与持久化状态（配合 RFC 0006/0008）
- [ ] 原生 checksum/签名校验与原子缓存

## References

- Lynx 资源 provider 与 bundle loader（RFC 0006）；`resource.fetch` 与 `storage.*`（RFC 0005）。
- 确定性哈希（FNV-1a）；用于宿主兼容性的语义化版本。
