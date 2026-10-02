- Start Date: 2026-10-02
- RFC Type: feature
- Status: Accepted
- Related: 0005, 0008, 0010, 0011, 0013

# RFC 0014：管理自定义食物（编辑与删除）

## 摘要

让用户维护其在 RFC 0013 中创建的自定义食物。新增两条写路径
`health.updateCustomFood` 与 `health.deleteCustomFood`，按 id 替换或移除已存储的
食物，并返回刷新后的 HostData。编辑复用与创建相同的整份表单（id 与 source 始终
不变）；删除需要两步确认。内置目录食物保持只读。无需网络，也无需账号。

## 动机

- 自定义食物常常是在吃饭时快速录入的，事后才发现有误——看错标签、热量打错字，
  或包装上有更准确的数值。若不能编辑，唯一的修复办法是删除后重建，而 RFC 0013
  根本无法删除，错误的食物会一直污染搜索结果。
- 品牌食品和菜谱会随时间变化；用户必须能够修正或停用某条记录，每日热量总量才
  可信。
- 管理能力补全了本地自定义食物的生命周期（创建 → 使用 → 编辑 → 删除），而后续
  切片通过条码创建的食物会让列表增长得更快，宜先具备管理能力。

## 指南级说明

- 打开「记录饮食」，找到某个自定义食物并进入。自定义食物显示「编辑」和「删除」
  操作；内置食物不显示。
- 「编辑」打开与创建相同的表单，所有字段均已预填。修改任意值后保存；该食物的
  身份保持不变，搜索仍能找到，此后记录的餐食使用新的营养数据。
- 「删除」会先请求确认（按钮变为确认动作）；确认后移除该食物。删除食物不会改变
  已经记录的餐食——过去各天的总量保留。

## 参考级说明

### 模型变更

- 无需新增字段。更新会替换现有 `FoodItem` 的可编辑内容，同时保留 `id` 与
  `source`；删除则把该条目从 `HostDataDto.customFoods` 中移除。
- 历史 `IntakeSample` 有意不引用食物 id，因此编辑/删除不会改动它们。过去的总量
  是不可变记录；该变更只影响今后的记录。

### `updateCustomFood` 工厂

`@zzzode/food-data` 暴露一个纯函数工厂，使 TypeScript 层与 preview transport 能
一致地应用并校验编辑：

```ts
interface EditCustomFoodInput {
  name: string;
  kcal: number;          // 每 100 克，有限且 > 0
  proteinG?: number;     // 每 100 克，缺省 0，非负
  carbsG?: number;
  fatG?: number;
  /** 正数表示设置；null 表示显式清除已存储的默认份量。 */
  defaultGrams?: number | null;
}
function updateCustomFood(item: FoodItem, changes: EditCustomFoodInput): FoodItem;
```

它返回一个 `id`/`source` 相同、名称在两个语言间重新镜像、并采用与
`createCustomFood` 相同校验的新条目。它只对用户所有的食物有意义（source 不是
`'usda-fdc'` 与 `'curated'`）；对内置食物应用会被拒绝。

### 写路径

- RPC `health.updateCustomFood`，request 为
  `{ id: string, name: string, kcal: number, proteinG?: number, carbsG?: number,
  fatG?: number, defaultGrams?: number | null }`，response 为
  `{ success: true, hostData: HostDataDto }`。
- RPC `health.deleteCustomFood`，request 为 `{ id: string }`，response 为
  `{ success: true, hostData: HostDataDto }`。
- 两者与其他写操作一样是一次往返。宿主按 id 查找食物；未知 id 返回 `not-found`，
  营养校验失败返回 `invalid-request`。成功变更后宿主发出 `records.changed`
  （RFC 0011）。采用整份替换而非部分字段补丁，可保持语义明确：表单始终提交完整
  的目标状态。

### Android 持久化

- `RecordsRepository.updateCustomFood(id, name, kcal, proteinG, carbsG, fatG,
  defaultGrams?)` 遍历 `customFoods`，就地替换匹配条目（保留其 id 与 `source`），
  当 id 不存在时抛出异常。
- `RecordsRepository.deleteCustomFood(id)` 重建不含匹配条目的数组并写文件；id 不
  存在即为错误。
- `HealthModule` 新增 `updateCustomFood` 与 `deleteCustomFood`，复用
  `writeCustomFood` 已有的营养校验。通用 JSON 到 Map 的转换无需改动。

### UI

- FoodSheet 的食物表单同时复用于创建与编辑模式；编辑模式下以命令式方式预填
  （Lynx 3.9 不支持受控 `value`），提交动作调用 `updateCustomFood`。
- 自定义食物的详情视图显示「编辑」和「删除」。删除使用内联确认状态，而非再开一
  个弹层，使破坏性操作绝不会因一次点击而触发。
- App 提供这两个处理函数；preview bridge 针对内存 sample 模拟它们。所有字符串都
  加入英文与简体中文目录。

## 缺点

- 编辑食物不会追溯修正已经记录的餐食；今天修正的数值会让更早的天数保留旧数字。这
  是有意为之——记录的总量是某一时点的记录，静默改写历史会使趋势不一致。
- 删除在本地存储中是永久的（没有回收站/撤销）。确认步骤是保障；后续切片可加入撤销
  或由同步支持的恢复。

## 理由与备选方案

- **部分字段补丁（带可选字段的 `PATCH` 风格）**：无法区分「未改」与「清除该值」
  （尤其是 `defaultGrams`），并使校验分散到宿主。预填表单的整份替换更简单，也符合
  用户对该食物的认知。
- **也允许编辑内置食物**：curated/USDA 表是生成的数据，应保持可复现；修正应放在
  用户所有的副本中，而不是改动随包发布的表。
- **把编辑/删除级联到过去的摄入**：需要在摄入上记录食物 id 并重写历史；为保持过去
  总量稳定而否决。
- **单独的管理页面**：食物已能通过搜索到达；内联操作避免再设第二个维护同一列表的
  地方。

## 未决问题

- 收藏与最近常用食物，以便快速录入。
- 撤销/软删除，以及按食物的编辑历史。
- 组合多种食材的食谱。
- 真正的各语言名称，而非镜像一个录入名称。
- 在 RFC 0008 加密模型下跨设备同步编辑/删除。

## 实施计划

1. Food-data：新增 `updateCustomFood` 工厂与单测。
2. Bridge：新增 `health.updateCustomFood`/`health.deleteCustomFood` 契约与测试。
3. Android：仓库 update/delete 及两个 HealthModule 方法；发出 `records.changed`。
4. Pages：表单复用于编辑，新增带确认的编辑/删除，接通 App 与 preview bridge，加入
   i18n 键与样式。
5. 重建 bundle 与 APK，在 web 预览上验证创建 → 编辑 → 删除，更新 RFC 索引，提交并
   观察 CI；iOS 无需新增原生代码。
