# RFC 0018 — 编辑与删除运动条目

- 状态：Accepted
- 创建时间：2026-10-02
- 相关文档：RFC 0017（运动记录）、RFC 0014（管理自定义食物）

## 摘要

RFC 0017 让运动条目成为一等记录，但按设计只支持追加：无法纠正选错
类型或填错时长的条目，也无法删除重复记录。本 RFC 为每个 `ExerciseSample`
增加稳定 `id`，新增 `health.updateExercise` 与 `health.deleteExercise` RPC，
让运动弹层支持编辑模式，并在 Home 运动卡片上加入内联的编辑 / 删除控件
（删除需两击确认）。其他条目与过往日期不会被改写。

## 动机

一条错误条目并非无害。运动千卡会进入 eat-back 预算（RFC 0017），因此
高估或重复的锻炼会让当日剩余额度出错，且方向是鼓励多吃，并在历史中累积。
用户只有能在一两步内修正明显错误，才会信任预算。自定义食物已在 RFC 0014
获得同样能力，运动条目不应例外。

## 指南层说明

- **编辑。** 在 Home 运动卡片上，每个条目行提供编辑控件。点击后打开
  运动弹层，并预填该条目的类型与时长。千卡与正常记录一样实时重算；保存
  会整体替换该条目并返回更新后的 HostData。
- **删除。** 每行还提供删除。第一次点击把控件变为确认状态；在该行内
  再次点击才删除条目。当日总计与 eat-back 预算随之反映删除结果。点击
  其他位置（或等待）会取消确认。
- 本 RFC 之前创建的条目没有 `id`；宿主在首次读取记录时为其分配 id，
  使其同样可编辑、可删除。

## 参考层说明

### 模型变更

`ExerciseSample` 增加稳定标识：

```ts
interface ExerciseSample {
  /** 每条目稳定 id，例如 `ex-1a2b3c4d`。 */
  id: string;
  date: string;
  typeId: string;
  durationMin: number;
  kcal: number;
}
```

`id` 仅用于标识身份，不参与热量计算。

### 旧数据归一化

RFC 0017 持久化的条目缺少 `id`。宿主在加载记录时遍历 `exercises`，为
任何缺少非空 `id` 的条目分配 `ex-<uuid8>`，并将归一化后的数据持久化一次。
此后每个条目都可通过 `id` 定位。

### RPC

- `health.updateExercise`

  请求：

  ```ts
  { id: string; date: string; typeId: string; durationMin: number; kcal: number }
  ```

  响应：`{ success: true; hostData: HostDataDto }`。宿主按 `id` 定位条目，
  整体替换 `date` / `typeId` / `durationMin` / `kcal`，并保留原 `id`。
  与记录时一样，页面传入其计算好的千卡，宿主只做校验与持久化。`id`
  未知时以 `not-found` 拒绝；字段非法时以 `invalid-request` 拒绝。

- `health.deleteExercise`

  请求：`{ id: string }`。响应：`{ success: true; hostData: HostDataDto }`。
  宿主重建 `exercises`，去掉匹配条目。`id` 未知时以 `not-found` 拒绝。

两者在成功写入后都会派发 `records.changed` 并携带更新后的 HostData，与
其他健康写入路径一致。

### Android 持久化

- `RecordsRepository.addExercise` 生成 `ex-<uuid8>` 并存入新条目。
- 加载时执行归一化，为旧条目补 id。
- `updateExercise(id, date, typeId, durationMin, kcal)` 按 `id` 查找并
  原地替换，缺失时抛出 `NoSuchElementException`。
- `deleteExercise(id)` 重建数组、去掉匹配条目，缺失时抛出。
- `HealthModule` 暴露 `updateExercise` 与 `deleteExercise`，把
  `NoSuchElementException` 映射为 `not-found`，校验失败映射为
  `invalid-request`，其余映射为 `unavailable`。

### UI

- 运动弹层接受可选的初始条目。存在时预选类型、预填时长、显示编辑标题，
  并通过 `health.updateExercise` 保存；否则与此前一样通过
  `health.writeExercise` 记录。
- 运动卡片在每行渲染编辑与删除控件。删除采用与自定义食物相同的两击
  确认模式。

## 缺点

- 编辑或删除条目会改变当日运动千卡总量，进而改变 eat-back 额度。这是
  预期行为：被删除的锻炼不应再计入。
- `id` 字段与一次性归一化会带来少量存储与复杂度。

## 理由与备选方案

- **整体替换 vs. 部分 PATCH。** 编辑弹层始终持有完整类型、时长与重算
  千卡，因此提交整个条目。这与 `updateCustomFood` 一致，也避免了 `kcal`
  与 `typeId` / `durationMin` 不一致的歧义部分更新。
- **按 `id` 标识 vs. 数组下标。** 下标会随条目增删而移动；稳定 `id`
  在重渲染与 bridge 往返中都安全。
- **硬删除 vs. 软删除 / 撤销。** 条目被直接移除，与自定义食物一致。
  撤销交互或软删除 / 历史留待后续 RFC。
- **只编辑今日 vs. 任意日期。** 同一机制适用于任意带日期的条目；UI
  当前在 Home（今日）卡片上暴露，历史页面日后可复用。

## 未决问题

- 删除是否应提供短暂的撤销（snackbar），而不仅是两击确认？
- 是否应支持把条目移动到其他日期（例如记错日期）？
- 批量选择 / 多条删除不在本 RFC 范围内。

## 实施计划

- `core`：为 `ExerciseSample` 加 `id`。
- `bridge`：`health.updateExercise` / `health.deleteExercise` 契约与
  客户端测试。
- Android：id 生成、旧数据归一化、仓库更新 / 删除、`HealthModule` 方法、
  重新生成 seed。
- Pages：编辑模式弹层、卡片编辑 / 删除（两击确认）、select 与 preview
  更新、双语文案。
