# RFC 0015 — 收藏与最近常吃食物

- 状态：Accepted
- 创建：2026-10-02
- 相关：RFC 0012（饮食记录）、RFC 0013（自定义食物）、RFC 0014（管理自定义食物）

## 摘要

为饮食记录器增加两个一键快速复用入口：**收藏**（用户主动置顶的食物）与
**最近**（最近记录过的食物）。两者都以有序 id 列表存放在 `HostData` 上，与食物
定义解耦，因此内置目录食物与用户自建食物的处理方式完全一致。

## 动机

吃饭时录入时间紧张，而少数食物往往占了大多数记录（每日主食、早餐、常吃的零
食）。目前每次记录都要先文字搜索。等条码建食物（后续切片）上线后，列表会快速变
长，恰好在用户想最快操作时让搜索变慢。

- **收藏**覆盖*主动*场景：“这个我常吃，置顶它”。
- **最近**覆盖*隐式*场景：无需打理，最近吃过的食物自动浮到顶部。

两者都把“打开弹层”到“确认份量”的路径缩短到几次点击，直接支撑持续记录，进而支撑
驱动体重控制的能量预算。

## 设计

### 数据模型

`HostData`（及 `HostDataDto`）新增两个有序的食物 id 数组：

```ts
favoriteFoodIds: string[]; // 用户置顶，顺序稳定
recentFoodIds: string[];   // 最近记录在前，有上限
```

它们按 id 引用两类来源的食物：

- 内置目录食物在 `@zzzode/food-data` 中具有稳定 id；
- 用户自建食物具有宿主生成的 id。

列表刻意只存 **id，不存食物对象**。食物定义仍归目录 / `customFoods` 所有；这两个
数组是纯粹的用户偏好与便利索引，绝不参与营养计算。

### RPC：设置收藏

```ts
'health.setFoodFavorite': {
  request: { id: string; favorite: boolean };
  response: { success: true; hostData: HostDataDto };
}
```

- `favorite: true`：若 id 不存在则追加（不重复）；
- `favorite: false`：移除所有匹配；
- 该调用不校验 id 当前是否能解析到某个食物。先收藏、后食物消失是无害的（见下文清
  理），接受未知 id 也让宿主无需了解目录。

### 通过 writeIntake 追踪最近

`health.writeIntake` 请求新增可选 `foodId`：

```ts
request: { date: string; kcal: number; macros: Macros; foodId?: string };
```

当存在 `foodId` 时，宿主在同一次写入中：

1. 若 `recentFoodIds` 已含该 id 则先移除；
2. 将其插到最前；
3. 截断到 `RECENT_LIMIT = 12`。

不带 `foodId` 记录一餐（未来的多食物或自由录入）不会改动 `recentFoodIds`。最近列表
是派生自记录动作的 UI 便利数据，不是营养历史。

### 删除自定义食物时清理

`deleteCustomFood`（RFC 0014）同时把被删 id 从 `favoriteFoodIds` 和
`recentFoodIds` 中移除，避免列表为用户明确删除的食物累积悬空 id。编辑自定义食物
保留其 id，因此收藏/最近在编辑后保持不变。

### 向后兼容

较早的持久化记录没有这两个数组。仓库把缺失数组视为空（`optJSONArray` 兜底，与
`customFoods` 相同的模式），并在下次变更时写回。seed 与确定性 sample 都把两个数组
置空。

### UI

- 搜索词为空时，食物弹层在空结果列表上方显示两个分区：
  - **收藏**：每个置顶食物为可点行（星标 + 名称 + kcal/100g）；
  - **最近**：最多 12 个最近记录的食物，最近在前。
  点击某行进入既有的份量/详情视图。
- 有搜索词时行为不变：只显示搜索结果（及创建行）。
- 详情视图新增收藏切换：已置顶显示实心星（`★`，主绿），否则空心星（`☆`，中性
  色）。点击调用 `health.setFoodFavorite` 并就地更新，不离开当前视图。
- 从详情视图记录份量时把该食物的 `foodId` 传给 `writeIntake`，使其成为最近列表的第
  一项。

刻意使用星标而非心形：心形是 LeanOn 的品牌标志，星标才能无歧义地表达“已收藏/置
顶”。

## 备选方案

- **在 `FoodItem` 上加 `favorite: boolean`。** 内置食物是随离线包发布的共享只读数
  据；无法在不把整个目录复制进宿主状态的情况下按用户修改。独立 id 列表能统一置顶
  内置与自定义食物，且体积极小。
- **在 `IntakeSample` 上加 `foodId` 来推导最近。** RFC 0012 有意让营养历史保持为与
  食物定义解耦的时点总量，因此编辑/删除食物绝不会改写历史。给摄入样本挂 foodId 会重
  新耦合两者，而且仍需排序/去重逻辑。专用且有上限的 `recentFoodIds` 用对历史零影响
  的方式表达了意图（快速复用）。
- **在 `writeIntake` 之后再调一个 `touchRecentFood` RPC。** 两次往返可能不一致（摄入
  已存、最近未更新），还增加延迟。把可选 `foodId` 并入既有的一次往返 `writeIntake`，
  让摄入与最近保持原子。
- **最近不设上限。** 上限让分区保持精简且相关；很久没吃的食物不太可能是下一条记录。

## 影响

- 契约：新增 `health.setFoodFavorite`；`health.writeIntake` 新增可选 `foodId`；
  `HostDataDto` 新增两个数组。
- Android：仓库收藏/最近变更与删除清理；新增 `HealthModule.setFoodFavorite`；
  `writeIntake` 透传 `foodId`。
- Pages：收藏/最近分区、详情星标切换、保存时带 `foodId`。
- 营养计算与历史记录不变。
