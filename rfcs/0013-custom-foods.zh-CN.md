- 开始日期：2026-10-02
- RFC 类型：feature
- 状态：Accepted
- 相关：0004, 0005, 0008, 0010, 0011, 0012

# RFC 0013：自定义食物

## 摘要

当内置食物库没有用户所吃的食物时，允许用户创建自己的食物条目。自定义食物由
**原生宿主持久化**，通过 `HostData.customFoods` 暴露，并与内置的 `@zzzode/food-data`
食物库合并进同一套离线搜索。新增 `health.writeCustomFood` 写入路径用于保存条目并返回
刷新后的 HostData；创建完成后，弹层会直接进入记录该食物今日份量的步骤。全程无需网络、
无需账号。

## 动机

- RFC 0012 提供的是有限的精选食物表（约 48 条）。真实饮食包含外卖、品牌食品、餐厅菜品
  和家常菜，是这张表永远无法完全覆盖的。当搜索没有结果时，记录不能走进死胡同——否则每日
  热量总量会有缺口，能量缺口数字便不可信。
- 用户反复吃的食物应当只录入一次、以后永远能找到，并且在应用重启后依然存在。这需要原生
  持久化（宿主是持久化权威，RFC 0010），而不是页面内存状态。
- 创建与搜索仍保留在 TypeScript 层，维持即时、离线、跨平台的体验；只有存储是原生的。

## 指南级说明

- 打开「记录饮食」，照常搜索。若没有匹配项，点击「创建自定义食物」。
- 输入名称和每 100 克的热量（蛋白/碳水/脂肪和默认份量为可选），然后保存。弹层会打开新建
  的食物并准备好份量输入；像内置食物一样记录今天的克数即可。
- 此后该自定义食物会出现在搜索结果中（中英文均可），保存在设备上，并在重启后保留。多条
  自定义食物会与其他餐食一起累加。

## 参考级说明

### 模型变更

- `FoodItem.source` 增加第三种取值：`'usda-fdc' | 'curated' | 'custom'`。
- `HostDataDto` 增加 `customFoods: FoodItem[]`（全新安装时为空）。页面的 `HostData`
  自动继承该字段。
- 自定义食物会把用户输入的名称同时存入**两个**语言字段
  （`{ en: name, 'zh-CN': name }`）：离线环境没有翻译，把字符串镜像可保证无论当前是哪种
  语言都能搜索和显示。后续切片可加入真正的翻译。

### `createCustomFood` 工厂

`@zzzode/food-data` 提供一个纯工厂，供 preview transport 和测试使用：

```ts
interface CreateCustomFoodInput {
  id: string;
  name: string;
  /** 每 100 克；必须为有限值且 > 0。 */
  kcal: number;
  proteinG?: number; // 每 100 克，默认 0，非负
  carbsG?: number;
  fatG?: number;
  defaultGrams?: number;
}
function createCustomFood(input: CreateCustomFoodInput): FoodItem;
```

它会把名称镜像到各语言、用 0 补齐缺省的宏量、设置 `source: 'custom'`，并拒绝非法
（非有限/负数）营养值。原生宿主自行构造相同结构（它拥有持久化与 id 生成）。

### `health.writeCustomFood` 写入路径

- RPC `health.writeCustomFood`，请求为
  `{ name: string, kcal: number, proteinG?: number, carbsG?: number, fatG?: number,
  defaultGrams?: number }`，响应为 `{ success: true, hostData: HostDataDto }`——与
  `writeWeight`/`writeIntake` 相同的一次往返形态。
- 宿主生成唯一 id（如 `custom-<uuid>`），构造 `FoodItem`，追加到 `customFoods`，持久化后
  返回刷新后的 HostData。写入后发出 `records.changed`（RFC 0011），与其他仓库写入一致。
- 校验：名称非空、`kcal` 为有限值且 > 0；可选宏量为有限值且非负；`defaultGrams` 若提供须
  为正。失败返回 `invalid-request`。

### Android 持久化

- `RecordsRepository.addCustomFood(...)` 追加到 `customFoods` 数组并写文件；读取时使用
  `optJSONArray("customFoods")`，使本切片之前创建、缺少该字段的记录被视为空列表。
- 内置 seed 增加 `"customFoods": []`。`HealthModule.writeCustomFood` 负责校验并委托仓库；
  无需新权限。通用的 JSON 到 Map 转换已能处理嵌套的食物对象。

### UI

- FoodSheet 将搜索数据库构造为 `[...内置食物, ...hostData.customFoods]`，因此自定义食物
  通过现有 `searchFoods` 参与排序与匹配，无需新增搜索代码。
- 当非空搜索没有匹配时，出现「创建自定义食物」行；创建表单收集名称、每 100 克热量、可选
  宏量和默认克数。保存时页面调用 `writeCustomFood`，应用返回的 HostData，并选中新建的食物，
  以便立即记录其份量。
- 所有新文案均加入英文和简体中文目录。

## 缺点

- 用户输入的营养值可能不准确，应用无法核验。它们会明确呈现为用户创建；按每 100 克录入可
  保证份量缩放的一致性。
- 将一个输入名称镜像到各语言意味着在后续切片之前没有真正的翻译。
- 本切片只创建和列出自定义食物，尚不支持编辑或删除。

## 理由与备选方案

- **只把自定义食物保存在页面状态**：重启即丢失、无法复用；用户期望长期保留的食物必须原生
  持久化。
- **通过云端账号同步自定义食物**：可多设备共享，但需要账号、后端，并把食物数据送出设备，与
  离线立场相悖。先做本地持久化，同步以后遵循 RFC 0008 模型。
- **强制用户输入整餐总量**：失去每 100 克缩放，同一食物不同份量必须重复录入。按每 100 克的
  自定义食物可复用现有份量计算器。
- **在同一切片里做编辑/删除、收藏和食谱**：各自都会增加表面积；先做创建以闭合记录缺口，管理
  功能延后。

## 未决问题

- 自定义食物的编辑与删除，以及用于快速录入的收藏/最近食物。
- 食谱（由多种食材组成的份量）。
- 真正的名称翻译（而非镜像）以及按语言分别命名。
- 条码扫描时自动创建自定义食物（依赖条码切片）。
- 在 RFC 0008 加密模型下跨设备同步自定义食物。

## 实施计划

1. Food-data：在 source 联合类型中加 `'custom'`，新增 `createCustomFood` 工厂与单测。
2. Bridge：在 `HostDataDto` 加 `customFoods`、新增 `health.writeCustomFood` 契约与测试；
   增加对 food-data 的 workspace 类型依赖。
3. Android：`RecordsRepository.addCustomFood`（含 `optJSONArray` 兼容）、
   `HealthModule.writeCustomFood`、seed `customFoods: []`，发出 `records.changed`。
4. Pages：把自定义食物合并进搜索，新增空结果的创建行与创建表单，接通 App 与 preview bridge，
   加入 i18n 文案。
5. 重建 bundle 与 APK，在 web preview 上验证创建 + 记录，更新 RFC 索引，提交并 watch CI；
   iOS 无需新增原生代码。
