- 开始日期：2026-10-02
- RFC 类型：feature
- 状态：Accepted
- 相关：0005、0006、0008、0010

# RFC 0011：BLE 体重秤与 `records.changed`

## 摘要

新增蓝牙低功耗（BLE）体重秤链路：发现并连接符合标准 **Weight Scale Service（体重秤
服务）** 的秤，解析其体重测量值，并通过既有仓库持久化该读数。同时引入 `records.changed`
事件，作为宿主在**任何**记录写入后统一发出的通道，事件携带刷新后的 HostData，使页面无需
二次请求即可更新。

## 动机

- 手动输入存在用户可以跳过的摩擦，而且自报数值很容易被往“好看”的方向取整。秤自动记录可
  消除这一摩擦并提升数据真实性，二者对减肥目标都至关重要。
- 秤的写入并非来自拥有 UI 的页面命令（读数由硬件异步到达）。因此需要一条宿主 → 页面的
  “记录已变更”通道。该通道未来同样服务于同步、多设备与 Health Connect 写入，值得现在就
  正确建立，而不是为秤单独开特例。

## 指南级说明

- 首次使用：打开**配对体重秤**，授予蓝牙权限，从实时设备列表中选择秤，然后站上秤。读数出
  现后会自动保存，Home 随之刷新（当前体重、趋势、距目标）。
- 此后会记住已配对的秤；打开秤视图会自动重连，新一次称重以同样方式记录。
- 全流程离线、本地化。若蓝牙关闭、权限被拒或秤未暴露标准服务，UI 会说明情况，并提供手动
  弹层作为兜底。

## 参考级说明

### 标准 GATT 配置

- 服务 **Weight Scale** `0x181D`；特征 **Weight Measurement** `0x2A9D`，以
  *indication（指示）* 方式上报（需使能 CCC 描述符 `0x2902`）。
- Weight Measurement 布局（Bluetooth SIG）：
  - Flags（标志）字节：bit 0 单位（0 = 公制，1 = 英制）；bit 1 是否含时间戳；bit 2 是否含
    用户 ID；bit 3 是否含 BMI 与身高。
  - 公制：体重为 `uint16` × **0.005 kg**。英制：`uint16` × **0.01 lb**，再换算为 kg。
    可选时间戳（年/月/日/时/分/秒）、用户 ID，以及 BMI（`uint16` × 0.1）与身高。
- 扫描按服务 UUID `0x181D` 过滤；结果按设备地址去重，并携带名称与 RSSI 上报。
- 秤通常在读数稳定后才会 indication Weight Measurement，因此宿主直接持久化每次收到的
  indication；页面不实现稳定判定。

### 权限与能力处理（Android）

- Android 12+（API 31）：运行时权限 `BLUETOOTH_SCAN` 与 `BLUETOOTH_CONNECT`。
- Android 6–11（API 23–30）：要收到扫描结果需 `ACCESS_FINE_LOCATION`。
- 无适配器或蓝牙关闭：返回 `unavailable`（`retriable: true`），引导用户开启蓝牙。已连接的
  秤若不提供 `0x181D`，返回 `unavailable`，details 为 `unsupported-scale`。连接/服务发现
  超时映射为 `unavailable`；权限缺失或被拒映射为 `not-authorized`。
- 秤视图在进入时预先请求权限；无需蓝牙时仍可使用手动记录体重弹层。

### `records.changed` 事件

```ts
'records.changed': { payload: { hostData: HostDataDto } };
```

- 事件携带刚解析出的 HostData（与 `writeWeight` 响应所用的、宿主拥有的快照形态一致），页
  面直接替换状态——无需重新拉取，也没有重复的一致性逻辑。
- 事件的发出由宿主在每次仓库成功写入后统一负责：手动 `writeWeight`、持久化的秤读数，以及
  后续的 `writeIntake`/同步。仓库是产生快照的唯一位置，保证时序可预测。
- `scale.reading` 仍会发出，用于配对/实时反馈；持久化与 Home 刷新以 `records.changed`
  为准。

### Scale 契约补充

- 保留 `scale.scan`（无参 → `{ scanning }`）与 `scale.connect`（`{ deviceId }` →
  `{ connected }`）。新增 `scale.disconnect`（→ `{ connected: false }`）与
  `scale.getStatus`（→ `{ state: 'idle' | 'scanning' | 'connecting' | 'connected',
  pairedDeviceId: string | null }`），用于驱动重连与 UI。
- 已配对设备地址属于设备设置，通过原生偏好持久化（不作为健康记录），用于自动重连。
- `scale.discovered` 与 `scale.reading` 的 payload 维持既有声明（`ScaleDeviceDto`、
  `ScaleReadingDto`）。

### 无硬件下的测试

- Weight Measurement 解析器是针对字节数组的纯 Kotlin 函数，由 JVM 单测覆盖：公制与英制
  解码、标志位组合、取整以及畸形输入。BLE 扫描/GATT 层是很薄的 Android 封装，通过编译以及
  后续真机测试验证。
- Android CI job 额外运行 `testDebugUnitTest`，即便没有蓝牙硬件也能在 CI 中执行解析器。

## 缺点

- 仅支持标准 SIG 服务。许多廉价体脂秤（以及多数厂商 app）使用厂商自定义服务（如小米），需
  后续 RFC 支持。
- 完整 BLE 流程无法在云电脑或 CI 中执行（无蓝牙适配器）。解析器单测与编译覆盖其逻辑；端到
  端链路在真机上确认。
- 运行时权限及其版本差异增加了复杂度。

## 理由与备选方案

- **让页面检测读数稳定并确认保存**：把不可靠的时序和额外 UI 推给 JS。秤本身上报的就是稳定
  测量值，因此由宿主直接持久化。
- **只发“脏”标志，再通过 `records.getToday` 重新拉取**：是干净的发布/订阅形态，但增加一次
  往返和一个方法。在 `records.changed` 上直接携带 HostData，与写入响应保持一致，并维持快
  照的唯一事实来源。`records.getToday` 仍然不需要，故不新增。
- **通过 Health Connect 间接读取秤**：部分厂商会把秤同步到 Health Connect，但这依赖第三方
  app 与账号。直连 BLE 自包含；Health Connect 集成作为独立切片，可与之共存。
- **仅手动输入**：最简单，但保留了本方案要消除的摩擦与真实性缺口。

## 未决问题

- 厂商自定义秤协议，以及体阻抗/身体成分的映射（impedance 已是可选字段，但体脂推导尚未定
  义）。
- 通过 Weight Measurement 的用户 ID 字节实现多人共用一台秤（目前夫妻使用各自的设备/账
  号）。
- iOS CoreBluetooth 实现（需 macOS）。
- 已配对设备偏好放在 `storage` 模块还是原生 SharedPreferences 之后；二者行为一致，选择属
  于实现细节。

## 实施计划

1. Bridge：新增 `scale.disconnect`/`scale.getStatus`、`records.changed` 事件、BLE 错误
   映射；更新内存 transport 与测试。
2. Android：BLE 扫描器与 GATT 客户端、Weight Measurement 解析器及 JVM 单测、
   `ScaleModule`、运行时权限、通过仓库持久化读数、派发 `records.changed`、记住已配对设
   备。
3. Pages：配对/秤视图（扫描、设备列表、实时读数），订阅 `records.changed` 以刷新 Home，
   i18n 文案（英文 + 简体中文）。
4. CI：在 Android job 中运行 `testDebugUnitTest`；重建 APK、更新 RFC 索引、提交并观察
   CI；iOS 待 macOS 可用后跟进。
