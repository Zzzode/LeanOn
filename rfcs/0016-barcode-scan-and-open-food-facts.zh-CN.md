# RFC 0016 — 条码扫描与 Open Food Facts 查询

- 状态：Accepted
- 创建：2026-10-02
- 相关：RFC 0012（饮食记录）、RFC 0013（自定义食物）、RFC 0014（管理自定义食物）、RFC 0015（收藏与最近）

## 概述

为饮食记录器增加条码扫描能力。用户将摄像头对准包装食品的条码，App 通过网络在 **Open Food Facts**（OFF）数据库中查询该产品，将结果转换成与全局一致的 `FoodItem` 结构，作为用户食物持久化，并直接打开份量弹层以便记录。当产品未知、设备离线或用户取消时，流程优雅降级为手动创建。

## 动机

包装食品（蛋白棒、酸奶、速冻餐、零食）手工录入繁琐：需要阅读细小的营养成分表、创建自定义食物，然后才能记录。这种摩擦在那些对体重控制最关键的超加工、高热量食品上最高，因此它们恰恰最常被漏记。条码扫描把「看表 → 建食物 → 记录」变成「扫码 → 确认份量 → 记录」。

这也会快速扩充个人食物库，这正是 RFC 0015（收藏/最近）先行落地的原因：扫码得到的食物通过同样的快捷入口复用，而不是淹没搜索。

## 设计

### 流程总览

```text
FoodSheet（扫码按钮）
  └─ scanner.scanBarcode            原生 CameraX + ML Kit，返回条码
       ├─ 取消 ────────────────────► 停留在 FoodSheet
       └─ 条码
            ├─ 库中已存在？────────► 直接打开其详情
            └─ food.lookupProduct   原生 HTTP GET OFF v2
                 ├─ 离线/错误 ─────► 提示错误，提供手动创建
                 ├─ found: false ──► 提供手动创建
                 └─ found: product
                      └─ createFoodFromBarcode(barcode, product)  （TS，纯函数）
                           ├─ 非法（无能量）─► 提供手动创建
                           └─ health.writeScannedFood  （upsert，返回 hostData）
                                └─ 打开新食物的详情
```

扫码与网络调用是两个独立 RPC。扫码是设备能力、查询是网络能力；分开使各自可测，并让 UI 在每一步都能决策（复用、重试或降级）。

### Bridge 契约

新增三个 RPC。

**`scanner.scanBarcode`** —— request `{}`；response 为以下之一：

```ts
{ barcode: string }   // 已扫描到条码
{ cancelled: true }   // 用户未扫码即退出
```

相机权限缺失由原生扫描器内部处理（它会请求权限）；被永久拒绝时以错误码 `unavailable` reject。

**`food.lookupProduct`** —— request `{ barcode: string }`；response：

```ts
{ found: true; product: OffProduct }  // 原始 OFF “product” 对象，原样透传
{ found: false }                      // OFF 返回 status 0 / HTTP 404
```

网络故障（无连接、超时、响应体损坏）以错误码 `unavailable` reject。宿主**不**解析营养：它返回原始 product 对象，由 TypeScript 解析器负责转换，从而营养逻辑可在设备外单测。

**`health.writeScannedFood`** —— request：

```ts
{
  barcode: string;
  name: string;
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  defaultGrams?: number;
}
```

response `{ success: true, hostData }`。宿主以 `off-<barcode>` 构造 id，标记 `source: 'open-food-facts'`，并按 id **upsert**（重复扫码替换已存副本而非新增）。校验与自定义食物一致（名称非空、能量有限为正、宏量有限非负）；非法请求以 `invalid-request` reject。

### Open Food Facts 解析器（food-data）

`FoodItem.source` 增加 `'open-food-facts'`，`FoodItem` 增加可选 `barcode?: string`。新增纯工厂函数：

```ts
createFoodFromBarcode(barcode: string, product: OffProduct): FoodItem
```

映射规则：

- **id**：`off-<barcode>`；**source**：`'open-food-facts'`；**barcode**：保存。
- **名称**：`product_name`，否则 `generic_name`，再否则用条码本身。名称在各语言间镜像（OFF 多语，但 v2 调用只请求一个展示名；真正本地化留待未来）。
- **每 100 g 能量**：`nutriments['energy-kcal_100g']`；缺失时回退到 `nutriments['energy_100g']`（千焦）除以 4.184。若仍无可用能量，工厂抛出 `RangeError`——热量未知的食物无法支撑能量预算，UI 降级为手动创建。
- **每 100 g 宏量**：`proteins_100g`、`carbohydrates_100g`、`fat_100g`，缺失或非有限时各自默认为 0。
- **defaultGrams**：`serving_quantity` 为有限正数时采用，否则省略。

OFF 端点为
`https://world.openfoodfacts.org/api/v2/product/<barcode>.json`，并用 `fields` 参数限定解析器所需字段（`product_name,generic_name,nutriments,serving_quantity,serving_size`），同时使用标识本 App 的自定义 User-Agent。

### Android

- **依赖**：CameraX（`camera-core`、`camera-camera2`、`camera-lifecycle`、`camera-view`）与 ML Kit `barcode-scanning`；`INTERNET` 权限已存在，新增 `CAMERA` 权限，并将 `android.hardware.camera` feature 设为非必需，以便无相机设备仍可安装。
- **BarcodeScanActivity**：全屏 CameraX 预览 + `ImageAnalysis` 分析器，将帧送入 ML Kit 的 `BarcodeScanning`。识别到首个条码即设置结果并 finish；返回/取消动作返回 cancelled。
- **ScannerModule.scanBarcode**：通过 Activity Result API 启动该 Activity，resolve `{barcode}` 或 `{cancelled}`，需要时先请求相机权限。
- **OpenFoodFactsClient**：基于 `HttpURLConnection` 的轻量客户端（不引入新网络依赖），执行 v2 GET，`status == 1` 时返回 product `JSONObject`，status 0 / 404 返回 null，传输错误抛异常。
- **FoodModule.lookupProduct**：在主线程外运行客户端、按上述契约映射结果与错误的薄封装。
- **RecordsRepository.upsertUserFood(item)**：在用户食物数组中按 id 插入或替换。**HealthModule.writeScannedFood** 解析并校验请求，构造 `off-<barcode>` 条目，经 upsert 持久化，然后像其他写入一样发出 `records.changed`。

扫码食物与自定义食物同处一个用户食物数组，因此天然继承编辑/删除（RFC 0014）、收藏/最近（RFC 0015）与搜索。

### Pages

- FoodSheet 搜索行增加扫码入口，点击调用 App 层扫码处理。
- `App.tsx` 编排上述流程：扫码 → 已存在则复用 → 查询 → `createFoodFromBarcode` → `writeScannedFood` → 更新宿主数据并打开新食物详情。FoodSheet 接受 `initialSelectedId`，使编排者可直接落在被扫描项上。
- 失败状态内联呈现：产品未找到 / 无能量数据时提供「手动创建」（打开创建表单）；离线/传输错误显示可重试错误；取消则原样返回弹层。

### 隐私、许可与署名

- 扫码会触发一次网络请求，仅向 Open Food Facts 发送**条码**，不含任何个人数据，且该功能明确由用户发起。
- Open Food Facts 数据 © 贡献者，基于 ODbL 许可；App 提供署名以及数据库与其许可的链接。
- OFF 营养数据为众包、可能有误；UI 保持食物可编辑，Home 免责声明（“非医疗建议”）不变。

## 备选方案

- **内置本地产品库**：OFF 有数百万产品且持续变化，打包体积过大且会过时。在线查询保持 App 小巧；离线存储的是个人库（实际扫到的极小集合）。
- **把扫码/HTTP/解析合为一个原生 RPC**：往返更少，但把营养转换埋进 Kotlin，无法复用 TS 食物模型、也无法与 food-data 其余部分一起单测。拆分扫码与查询、用 TS 解析，使领域逻辑集中一处。
- **扫码食物与自定义食物分开存储**：会重复实现编辑/删除、收藏/最近与搜索。单一用户食物数组 + 不同 `source` 可全部复用。
- **在宿主解析营养并返回 FoodItem**：与合并 RPC 同理被否——转换应位于 TypeScript 并由共享测试覆盖。
- **使用商业条码/营养 API**：为开源个人项目带来成本、API key 与更严格条款。OFF 开放（ODbL）、免费且全球覆盖广。

## 未决 / 未来

- 真正的多语产品名（按当前语言请求 OFF 产品，而非镜像一个名称）。
- 向 OFF 回存产品（贡献）以及更丰富字段（糖、纤维、饱和脂肪、Nutri-Score、品牌、图片）。
- 条码手动录入兜底（相机不可用时手输编码）以及 QR/其他码处理。
- 缓存查询结果，并为离线时的扫码提供排队重试。
