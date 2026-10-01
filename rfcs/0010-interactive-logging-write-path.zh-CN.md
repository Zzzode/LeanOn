- 开始日期：2026-10-02
- RFC 类型：feature
- 状态：Accepted
- 相关：0005、0006、0008、0009

# RFC 0010：交互式记录写入链路

## 摘要

建立第一条写入链路：native 侧是持久化的唯一权威，页面通过 `initData` 引导，记录今日
体重的流程经 Lynx → typed bridge → native 仓库，并**返回更新后的 HostData**，让 UI 在一次
往返内完成刷新。

## 动机

- Home 目前是只读的、渲染内置示例；App 还无法记录每日体重，而体重驱动着每一条反馈回路
  （趋势、自适应能量、距目标差距）。没有写入链路，它只是预览，而不是支撑减肥目标的工具。
- 希望用最简单的命令（一个数字）端到端打通双向通道，让后续更复杂的命令（记录饮食）复用
  一套已验证的形态，而不是另起炉灶。

## Guide 级说明

- 点击「记录体重」，底部弹层出现并预填当前体重；调整后点击「保存」，弹层关闭，当前体重、
  趋势和距目标差距立即更新。
- 非法输入在输入处即被拦截；若保存失败，会提示并保留弹层，不丢失已填内容。
- 整个流程完全离线可用，数据保存在本机。

## Reference 级说明

### 通过 initData 引导

- host 以 `renderTemplateUrl(url, initDataJson)` 渲染，`initData` 为
  `{ hostData: HostDataDto, locale: string }`。
- ReactLynx 用 `useInitData()` 读取；`App` 据此初始化 state，缺失时回退到内置示例（web
  预览与测试）。
- `HostDataDto` 是 `contracts.ts` 中声明的跨边界结构，由 core 的 `Profile`、
  `WeightSample`、`IntakeSample` 加上目标/连续打卡字段组合而成，与页面的 `HostData`
  结构一致。

### 命令与响应

```ts
'health.writeWeight': {
  request: { date: string; weightKg: number };
  response: { success: true; hostData: HostDataDto };
};
```

- host 校验输入（有限数值、合理范围，例如 20–300 kg），按日期 upsert 到仓库、持久化，并
  返回刚解析出的 `HostData`。
- 在响应中直接返回聚合视图，避免二次读取，并保证由 host 拥有的单一一致快照。
- 校验失败映射为 `RpcError` 的 `invalid-request`（details 带原因）；存储问题映射为
  `unavailable`。JS client 统一归一为 `BridgeError`。

### Lynx transport

`createLynxTransport()` 实现 `BridgeTransport`：

- `call` 把 `"<domain>.<action>"` 映射为
  `NativeModules[domain][action](request, callback)`，并用 Promise 包装。native callback
  以结果 map 回调；错误 map `{ code, message }` 会让 Promise reject。
- `on(event, handler)` 使用
  `lynx.getJSModule('GlobalEventEmitter').addListener(event, handler)`，并返回对应的
  `removeListener`。
- pages 选择 transport：存在 `NativeModules` 时用真实 Lynx transport，否则用以示例播种的
  内存 transport，使同一流程在 web 预览和离线测试中都可运行。

### 仓库（先做 Android）

- `RecordsRepository` 在 App 私有存储中保存一个 JSON 文档；首次启动时拷贝种子资产
  `seed/hostData.json`，该资产由 TypeScript 示例生成以保持一致。
  `addWeight(date, kg)` 执行 upsert 并返回解析后的 `HostData`。
- 本刀使用普通 App 私有 JSON。加密与 envelope/同步模型仍是 RFC 0008 的工作，不回退、仅
  推迟。
- iOS 遵循同一契约；其实现需要 macOS，稍后落地。

### 国际化

新增 key `weightSheet.title`、`weightSheet.save`、`weightSheet.cancel`、
`weightSheet.hint`，均提供英文与简体中文；`kg` 保持国际符号（见 RFC 0009）。

## 缺点

- `writeWeight` 返回聚合视图，响应略大，并让单个命令与视图结构产生轻微耦合——换来一次往返
  和 host 拥有的一致性。
- 种子同时存在于 TypeScript 与 Android 资产中；由示例生成资产可缓解漂移。
- 在 RFC 0008 落地前，本地 JSON 未加密；早期切片可接受，但公开发布版不能如此。
- 本刀不实现 iOS。

## 理由与备选

- **发送 `records.changed`，再通过 `records.getToday` 重新读取**：是干净的发布订阅模型，也
  支持外部写入（BLE 体重秤、多设备），但需要额外方法和事件时序。推迟到真正需要它的体重秤/
  同步切片；契约已设计为可在不破坏 `writeWeight` 的前提下加入。
- **JS 乐观更新**：感觉快，但可能与 host 的校验和聚合产生偏差。以 host 响应为权威；本地弹层
  交互本身已经很快。
- **用 `storage.set` JSON 把仓库放在 TypeScript 侧**：把持久化推入 JS，但 host 必须为加密、
  HealthKit 和体重秤拥有存储。否决。
- **用通用 `storage.set` KV 存体重**：丢失类型化校验、upsert 语义和实体含义。
  `health.writeWeight` 才是类型化的领域命令。

## 未决问题

- `records.changed` 事件与 `records.getToday` 的时序（体重秤切片）。
- 记录饮食的命令形态（meal DTO、食物搜索）——下一条写入切片。
- 仓库如何迁移到加密/envelope 模型（RFC 0008 的排序）。
- 语言偏好覆盖的持久化（一个小型 settings 切片）。

## 实施计划

1. Bridge：新增 `HostDataDto`、扩展 `writeWeight` 响应、新增 Lynx transport 与测试。
2. Pages：initData 引导、`WeightSheet`、i18n key、transport 选择。
3. Android：种子资产、`RecordsRepository`、`writeWeight`、initData 注入。
4. 验证、重建 APK、更新 RFC 索引、盯 CI；iOS 在具备 macOS 后跟进。
