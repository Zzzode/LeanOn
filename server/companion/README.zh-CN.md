# 本地伴侣中继

[English](README.md) · 简体中文

真实本机 HTTP 服务，持久化账户、独立设备授权、双方确认的两人邀请、按方向自愿共享及密文同步。
健康、照片及鼓励由客户端加密；服务不会收到群组/vault 解密密钥或邀请秘密。
实现 RFC 0034 的本地部分并遵守 RFC 0008 的服务端仅密文边界。

从仓库根目录运行：

```sh
pnpm --filter @zzzode/companion-server build
LEANON_RELAY_FILE=/tmp/leanon-companion-qa/state.json pnpm --filter @zzzode/companion-server start
```

默认 `http://127.0.0.1:8787`，Android 模拟器使用 `http://10.0.2.2:8787`，iOS 模拟器使用 loopback。
使用隔离虚构账户，不使用真实健康数据。
native 安全保存 token、deviceProof 和解密密钥，页面只获得解密后的 UI DTO。
完整契约见[协议](protocol.zh-CN.md)、[原生加密内容及互通契约](native-interop.zh-CN.md)及 [DTO](src/types.ts)。
丢失密钥且没有另一已配对设备时没有实现恢复通道，不能假称密码能恢复健康数据。

验证命令：

```sh
pnpm --filter @zzzode/companion-server typecheck
pnpm --filter @zzzode/companion-server test
```

32 个 Rstest 使用真实临时 TCP 监听、临时持久文件及虚构账户，不 mock 网络。
覆盖重启、密文持久化、会话撤销、两人限制/明确双向同意、客户端包裹密钥、双设备同步、越权/跨 vault、双向鼓励授权、先获取后 ACK、幂等、过期/取消、并发/墓碑、游标及 schema、解绑/账户删除、设备 ID 冒用拒绝、分页及 AAD 篡改。
删除覆盖无会话持久回执、响应丢失、重启、ACK、错误 proof/密码/设备、操作冲突、清除前容量拒绝、旧 schema 迁移、重新注册身份及未知字段拒绝。
真实 Content-Length 与 chunked 超限请求验证上限及账户状态不变。
失败写入测试制造实际文件 rename 失败，确认旧内存和文件保持一致。
提交后目录刷盘测试在真实 rename 后注入 fsync 屏障失败，通过真实 HTTP 验证 503 与安全幂等恢复，不宣称重现了物理存储故障。
Node 22.23.2、TypeScript 7、Rslib 1.0.3 构建及类型检查通过。
新原生意图/回执删除真实网络验收等待单独执行批准；此前完成 A/B/C 阶段使用旧算法，不能算新协议实际验证。
原生 UI、实际图片同步与客户端持久后 ACK/缓存清理由对应 owner 验证，服务测试不代表这些已验收。

状态文件保存路由/账户元数据和不透明密文，文件模式 0600，新目录模式 0700，以 PID 锁避免多进程同时写入。
会话最多 30 分钟、不持久化；解绑撤销权限并清除服务端内容，不能远程删除已下载副本。
容量上限及不确定提交后的恢复见协议。
服务仅 loopback 明文 HTTP 用于本地 QA；生产 HTTPS、身份验证/恢复、流式传输、滥用防护、独立安全审核及部署须另行决策。
不接入付费服务或创建生产账户。
