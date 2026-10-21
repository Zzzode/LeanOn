# 本地伴侣中继协议 v1

[English](protocol.md) · 简体中文

这是实际本地 HTTP 服务，默认监听 `127.0.0.1:8787`，不代表生产身份服务已经完成。
Android 模拟器使用 `http://10.0.2.2:8787`，iOS 模拟器使用 `http://127.0.0.1:8787`。
完整冻结 DTO、端点及字段见英文协议与 `src/types.ts`；两者是跨端契约。
活会话全局最多 1000、每账户最多 32（超限 429 session_capacity），每次发行新 token 前清理过期会话。
会话最多 30 分钟，仅内存保存，重启、退出及删除账户后失效。
健康、照片、个人内容和鼓励只存 AES-256-GCM 密文，服务只看到路由元数据。

邀请秘密和群组密钥全部由客户端随机生成。
HKDF-SHA256 使用邀请 ID 为 salt，分别以 `leanon-invite-proof-v1` 和 `leanon-invite-wrap-v1` 为 info 派生 proof 与包裹密钥。
包裹明文是原始 32 字节群组密钥，不是 base64 文本，AAD 为 UTF8(id)。
服务创建邀请时只保存 SHA256(proof) 和包裹密文；接受时收到 proof，永远不收到 inviteSecret 或解密密钥。
邀请有效期最长 10 分钟，创建→对方接受 pending→创建者核实身份并确认 active。
家庭最多两人，默认不共享，授权按发送方、接收方和类别分别设置。
鼓励要求双方方向授权均包含 encouragement；撤销任一方即清除已保存的鼓励密文，其余健康类别仍按单向授权。
类别严格限制为 goal/progress_band/checkin_streak/meals/photos/menstrual/exact_weight/body_measurements/encouragement。
单个密文解码后最多 64MiB，HTTP 请求体最多 96MiB；照片必须实际传输加密图像字节，不能把元数据当成照片同步完成。
内容 AAD 为 UTF8 JSON 固定顺序数组 ["leanon-change-v1",groupId,epoch,ownerId,deviceId,id,recordId,category,kind,updatedAt,deleted]，无空白，毫秒整数时间与布尔删除标志，不含 server sequence。
注册和登录 HTTP 请求包含 native 安全存储生成的独立随机 32 字节 deviceProof（base64），服务只保存 SHA256；已知设备 ID 的错误 proof 返回 401，不能凭密码及公开 ID 冒用原设备。
同账户设备配对接受时绑定 pending session 的准确 proofHash，确认只授权该 ID 与 proof，另一份同 ID 的 pending session 仍无权限。
同账户设备配对采用相同邀请流程；新登录设备没有数据访问权，原已授权设备确认后获得权限。

同步游标、幂等 ID、墓碑、确定性冲突排序和 epoch 均由服务校验。
同步响应同时返回同一事务 group/grants 快照，客户端据此先清除已撤销类别的缓存；结果按 100 条或 95MiB 分页，继续使用返回游标。
本地上限为并发 8、超过 1MiB 或 chunked 请求体同时 1 个、状态文件 128MiB、账户 100、邀请 500、设备每账户 32、每组记录 1000/幂等 ID 10000；超限明确失败而非假成功。
断开客户端的请求仍占处理槽直到实际处理结束；这些是本地接受负载边界，不代表生产抗滥用已完成。
服务要求同一接收设备先获取鼓励内容，之后的请求才允许 ACK。
客户端必须先持久化收到的内容及游标，再发送 ACK；鼓励只有收到接收方 ACK 才能显示已送达。
解绑删除群组密文并提高 epoch，重新配对必须生成新密钥；已下载内容不能靠中继远程抹除。
账户删除清除账户、vault、家庭、邀请，并撤销所有会话。

## 可恢复账户删除

`DELETE /v1/accounts/current` 请求严格为 `{password,operationId,proof}`，要求已授权设备和正确密码。
返回严格回执 `{version:1,operationId,accountId,status:"deleted",deletedAt:number}`，时间为安全范围内整数毫秒。
客户端发送前持久化加密 prepared 意图、随机操作 ID 和独立随机 32 字节规范 base64 proof。
中继只保存 UTF8 紧凑 JSON `["leanon-account-deletion-v1",operationId,accountId,proof]` 的 SHA256，不保存 proof。
账户清除与回执在同一事务提交，并在事务内重新检查会话、设备 proof 与密码验证值。
无会话的 `POST /v1/account-deletions/:operationId/receipt` 请求为 `{proof}`，通过串行事务持久性屏障查询，包括 rename 后目录 fsync 失败的恢复。
不存在或 proof 不符均为通用 404 `deletion_not_found`；401、404 和网络错误均不能证明删除成功。
操作冲突为 409；回执最多 10000 条、不设 TTL，容量拒绝发生在清除前。
相同登录名重新注册产生新账户 ID，不改变旧回执身份。
客户端严格检查回执身份；显式密码重试保留原操作/proof，不保存或自动重发密码。
未确认的 prepared 意图继续待恢复，不自动结束或清除本机数据。
本机 durable `local-complete` 后才发送 `POST /v1/account-deletions/:operationId/ack` `{proof}`，返回 `{version:1,operationId,status:"acknowledged"}` 并删除回执。
仅本机已经 local-complete 时可接受 ACK 重试的 `deletion_not_found`，绝不再次清除本机数据。
详见[原生恢复与 CAS 规则](native-interop.zh-CN.md)。
原子文件事务在 rename 前失败不修改内存；rename 是提交点，此后内存立即跟随磁盘。
提交后的目录 fsync 失败返回 503 durability_uncertain_retry_same_ids，需要以相同 ID 幂等重试，不可假定完全未提交。

持久文件由 PID 锁限定单个进程使用，拒绝活进程冲突并恢复已退出进程遗留的锁；启动前完整校验嵌套状态。
密码使用 Node 内建 scrypt，密钥比较使用 timingSafeEqual；密码和会话不写日志。
依据：[Node crypto](https://nodejs.org/download/release/v22.15.0/docs/api/crypto.html)、[HKDF RFC 5869](https://www.rfc-editor.org/rfc/rfc5869)。
生产 HTTPS、身份验证/恢复、滥用防护与部署仍需单独决策。
