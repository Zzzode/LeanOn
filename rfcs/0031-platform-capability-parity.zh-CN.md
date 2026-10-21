# RFC 0031：平台能力对齐

[English](0031-platform-capability-parity.md)

- 状态：Proposed
- 日期：2026-10-06
- 基于：RFC 0011、0013–0016、0020、0025、0027

## 决策

将 Android 已有的本地能力补到 iOS，不删除已工作的 Android 功能。
共享桥接是唯一原生入口，只声明真正实现的方法。
本地饮水、自建食物增删改、收藏和最近快捷入口保留既有契约。
原生宿主提供当前本地日期、小时与按记录推导的连续天数，不再使用打包演示值。
测试与模拟器 QA 显式隔离时钟和存储。

HealthKit 采用独立的 `healthKit.*` 域，进入同一共享健康设置流程。
状态区分写入授权与未知读取权限，因为 HealthKit 故意不透露读取拒绝。
同步覆盖体重与运动，包含稳定导出身份、外部只读镜像、回声抑制及诚实的失败反馈。
每日热量、蛋白质、碳水、脂肪、纤维、糖、饱和脂肪和钠作为只写的 HealthKit quantity 导出，与 Android 既有日营养导出对应。
每种类型独立对账，拒绝某项不阻断其他已授权写入，修改及删除保留稳定身份和持久版本。
权限汇总表示所请求类型全部获准，因此 false 也可能表示部分授权。
导入室内骑行保留动感单车活动映射，本地日期按运行中的时区重新计算。
开启同步和申请权限均需用户明确操作；初始化不申请权限或访问健康记录。

iOS 分别使用 AVFoundation、URLSession、CoreBluetooth 与 UserNotifications 实现相机扫码、既有 Open Food Facts 查询、标准 SIG 秤与提醒。
这些是平台框架，不引入新服务账号或后端。
相机、蓝牙与健康链路须经真机验收，才声明硬件就绪。

为了提醒的智能静默，iOS 预排有限滚动日历区间，在进入前台、设置及记录变化时重建。
该方式保持本地时间并取消已完成任务，不声称 iOS 有无限制后台 worker。
预排期限和重新打开应用的要求在设置与能力矩阵中说明。
权限拒绝和调度失败返回错误，不伪装成功。

Android 提醒与 Health Connect 设置从旧 SharedPreferences 延迟迁移到应用私有的原子 JSON 文件。
读取保留既有偏好，写入失败保持权威设置并返回不可用错误。
除了共享 UI，原生开启操作也验证权限。
WorkManager 完成及偏好失败均有明确回调，并尽力回滚。
Health Connect 导出在插入 provider 之前，为稳定记录 ID 原子预留单调递增版本。
首次版本2覆盖旧固定版本1；内容不变的重试保持已预留版本，内容变化才递增。
串行导出防止旧快照取得更高版本。

## 边界

工作区实现已获授权但未提交，此 RFC 不标记为 Accepted 或 Implemented。
本轮不新增账号后端、伴侣云同步、建档或逐餐历史数据模型。
体重按日覆盖、摄入按日累计，不等于完整记录增删改。
构建与注入 SDK 测试证明源码行为；模拟器截图只证明实际运行过的状态。

## 依据

[Apple HealthKit 授权隐私](https://developer.apple.com/documentation/healthkit/hkauthorizationstatus)说明读取权限为何未知。
[Apple 本地通知调度](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app)说明系统投递及取消待处理请求。
[Android Health Connect 插入](https://developer.android.com/reference/androidx/health/connect/client/HealthConnectClient#insertRecords(java.util.List))定义稳定 client ID 与高版本优先规则。
