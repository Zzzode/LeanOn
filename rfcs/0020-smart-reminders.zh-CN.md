# RFC 0020 — 智能提醒

- 状态：Accepted
- 创建：2026-10-02
- 相关：RFC 0005（类型化桥接）、RFC 0010（记录写入路径）、RFC 0019（进度洞察）

## 摘要

为最能预测减肥成功的两个习惯增加本地每日提醒：早晨称重与记录当天饮食。提醒通过 WorkManager 以**自我重新调度的一次性任务（self-rescheduling one-time work）**方式调度，在当天任务已完成时保持静默（“智能静默”），点击通知会打开 LeanOn。偏好（每类提醒的开关与时间）持久化在宿主上，通过提供预设时段的 ReminderSheet 编辑。整个能力不涉及服务器、账号或网络。iOS 使用相同设置配合 `UNUserNotificationCenter`；实现先落在 Android。

## 动机

- 高频自我监测（称重、记录）与减重及维持强相关；典型的失败原因是*忘记*，而非不愿意。
- 提醒能提升依从性，但不加区分的每日通知会打扰已经记录的用户，反而让他们养成划掉 LeanOn 通知的习惯。
- App 已依赖 WorkManager，并注册了一个（当前为空的）`notification` 模块。缺的是调度、通知本身和设置界面。

## 目标

1. 在用户选择的本地时间，为两类提醒——**体重**（早晨）与**饮食**（晚间）——提供可靠的每日本地通知，且各自可独立开关。
2. 智能静默：任务触发时若当天体重（或任意摄入）已存在，则不发通知。
3. 点击通知打开 LeanOn。
4. 设置跨重启持久化、可在 App 内编辑；在合适时机请求 Android 13+ 通知权限。
5. 完全离线；无需精确闹钟权限。

## 非目标

- v1 不做分钟级自定义时间选择（仅预设时段）；任意时间选择器可后续再做。
- 不做情境/AI 调度、免打扰时段、每周摘要、运动提醒（可作为后续）。
- 不做“立即记录”通知动作按钮，或点击打开之外的回复能力。
- 不做设置的跨设备同步（保持本地；同步随 RFC 0008 到来）。

## 设计

### 设置模型（core）

```ts
type ReminderKind = 'weight' | 'meals';

interface ReminderSlot {
  enabled: boolean;
  hour: number;   // 0-23 整数
  minute: number; // 0-59 整数
}

interface ReminderSettings {
  weight: ReminderSlot; // 默认 { enabled: true,  7:30 }
  meals: ReminderSlot;  // 默认 { enabled: true, 21:00 }
}
```

Core 拥有类型、`DEFAULT_REMINDER_SETTINGS` 以及纯函数 `normalizeReminderSettings(input)`：补齐缺失字段，对非法 hour/minute 或非布尔 enabled 抛 `RangeError`。Core 不含时钟；计算下一次触发时刻是宿主的工作。

UI 提供的预设时段：

- **体重**：06:30、07:00、07:30、08:00
- **饮食**：20:00、21:00、22:00

### 桥接契约

- `notification.getSettings`：`void` → `{ settings: ReminderSettings }`
- `notification.updateSettings`：`{ settings }` → `{ success: true, settings }`（宿主校验、持久化并重新调度）
- `notification.requestPermission`：`void` → `{ granted: boolean }`（Android 13+ 的 `POST_NOTIFICATIONS`；更早版本与 web 返回 `granted: true`）

现有通用的 `notification.schedule`（一次性、绝对 triggerAt）保留作未来使用，不属于本流程。

### 调度（Android，WorkManager）

- `ReminderScheduler` 使用 `enqueueUniqueWork(kind, ExistingWorkPolicy.UPDATE)`，配合一个 `OneTimeWorkRequest`，其 `initialDelay` 为距离该本地 hour:minute 下一次出现的毫秒数。
- `ReminderWorker` 运行时：(a) 应用智能静默；(b) 到期则通过 `Notifier` 发通知；(c) 为同类 enqueue **第二天**的一次性任务。自我重新调度让触发时刻保持锚定（不累积漂移），同时 WorkManager 仍负责 Doze、重启持久化与延迟。
- 关闭某类会取消其唯一任务；修改时间会取消并重新 enqueue。
- 不需要 `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`；底层闹钟由 WorkManager 持有。

### 智能静默（纯函数，单测覆盖）

纯 Kotlin 函数 `shouldNotify(kind, today, hostData): Boolean`：

- `weight` → 不存在 `date == today` 的 `WeightSample`
- `meals` → 不存在 `date == today` 的 `IntakeSample`

`ReminderWorker` 针对 `RecordsRepository.loadHostData()` 调用它；返回 `false` 时跳过通知，但仍重新调度。

### 通知

- 在首次发送前创建一个 id 为 `reminders` 的 `NotificationChannel`（`IMPORTANCE_HIGH`）。
- 标题/正文取自各类的本地化字符串资源；小图标使用专用单色矢量 drawable；`contentIntent` 为 `PendingIntent.getActivity(MainActivity, FLAG_IMMUTABLE | FLAG_UPDATE_CURRENT)`。
- 每类通知 id 稳定。

### 权限

- 声明 `POST_NOTIFICATIONS`（不设 maxSdk），在 API 33+ 运行时再请求。
- `requestPermission` 走与 BLE 相同的 `Activity.onRequestPermissionsResult` 桥接（专用 request code 与结果持有者）；当用户开启某提醒且尚未授权时，由 sheet 发起请求。

### 持久化

- `SettingsRepository` 基于 `SharedPreferences`（`leanon_settings`），与健康记录分离；缺失值回退到默认。

### UI（pages）

- Header 增加一个小的 Reminders 按钮（铃铛字形 pill），打开 `ReminderSheet`。
- `ReminderSheet`：每类提醒一个 On/Off 分段控件和一行预设时段分段（当前时间高亮）；Save / Cancel。首次开启时请求权限并反映结果；再次打开显示已持久化的值。
- 预览桥（web）在内存中保存 `ReminderSettings`，并返回 `granted: true`。

### iOS

相同的 `ReminderSettings`；`UNUserNotificationCenter` 配合按日期组件的每日触发器，通过 `requestAuthorization(options: [.alert])` 授权，用 `notificationSettings` 获取权限状态。后续在 macOS 上实现；本 RFC 先交付 Android。

## 备选方案

- **AlarmManager `setExactAndAllowWhileIdle` + 开机广播**：精确，但需要 `SCHEDULE_EXACT_ALARM`（Android 14+ 默认拒绝）并需在重启后手动重新注册。v1 不采用；若未来需要精确定时，`ReminderScheduler` 可替换，WorkManager 作为降级。
- **PeriodicWork（24 小时）**：更简单，但周期从首次执行起算，Doze 漂移会让每日时间移动；自我重新调度的一次性任务可避免。
- **总是通知**：更简单，但会打扰已记录用户，损害习惯养成。
- **把设置放进 HostData**：便于未来同步，但会把 App 偏好与健康记录耦合；暂放专用 prefs（同步落地时可迁移）。

## 待解决问题

- 是否增加“立即记录”通知动作或基于回复的快速添加？
- 是否增加每周回顾 / 连续天数里程碑的庆祝通知？
- 饮食的智能静默是否应要求达到最低记录千卡，而非任意摄入即可？
- 是否把运动 / 活动提醒作为第三类？
