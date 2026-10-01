- 开始日期：2026-10-02
- RFC 类型：feature
- 状态：Accepted
- 相关：0004, 0005, 0008, 0010, 0011

# RFC 0012：离线记录饮食

## 摘要

补齐能量闭环的摄入侧：随 Lynx bundle 一起分发的**离线双语食物数据库**、在新的
`@zzzode/food-data` 包中实现的纯本地搜索与份量计算，以及一条 `health.writeIntake`
写入路径——它把一餐累加到当日摄入，并复用既有 `records.changed` 事件刷新 Home。
整个过程不需要网络请求，也不需要原生侧实现食物搜索。

## 动机

- 减肥由能量缺口驱动。App 已能计算目标、TDEE 和剩余热量，也能记录体重和运动，但
  用户还无法记录真正吃了什么——这是体量最大、也最容易出错的输入。快捷、低摩擦的饮食
  记录是让每日数字可信的关键。
- 食物数据的变化远快于原生代码，且两人同时使用 Android 和 iOS。把数据库与搜索放在
  TypeScript、放进 bundle，可免费获得跨平台支持，并能在不发版的情况下动态更新食物表
  （RFC 0007）。
- 相比运行时云端搜索，离线内置数据集更符合隐私与可靠性：没有信号也能记录，且任何一餐
  都不会离开设备。

## 指南级说明

- 打开 **Log food（记录饮食）**，用英文或中文输入食材或菜品的几个字，匹配的食物会立即
  出现，并显示每 100 g 的热量。
- 选择一项，调整克数（预填一个合理的默认份量），核对这一餐的热量与宏量后保存。能量卡
  立即更新：剩余热量、目标拆解和宏量进度。
- 一天内的多餐会累加。一切离线、本地完成；手动记录与体重秤路径保持不变。

## 参考级说明

### 数据来源与许可

- 精选数据集源自 **USDA FoodData Central**，其以 **CC0 1.0** 释放到公共领域；本包与
  此处均提供署名。数值以每 100 g 表达，使用 FDC 营养素 ID：能量 `1008`、蛋白质
  `1003`、总脂质（脂肪）`1004`、按差值计的碳水 `1005`。
- FDC 未覆盖的常见本地（中式）菜品与混合餐，以明确标注的 curated/estimated（精选/
  估算）条目补充。数据集以确定性 JSON 发布；后续可用工具步骤从可下载的 FDC 归档重新
  生成大部分表格。
- 条码/包装食品数据（如 Open Food Facts，ODbL）与在线搜索明确不在本切片范围内。

### `@zzzode/food-data` 包

```ts
interface Macros { proteinG: number; carbsG: number; fatG: number; }
interface FoodItem {
  id: string;
  name: { en: string; 'zh-CN': string };
  /** 每 100 g。 */
  kcal: number;
  macros: Macros;
  /** 默认份量（克），可选。 */
  defaultGrams?: number;
  /** 'usda-fdc' | 'curated'。 */
  source: 'usda-fdc' | 'curated';
}
```

- `searchFoods(database, query, locale, limit?)`：大小写不敏感、去除首尾空白；同时匹配
  当前语言名称（前缀优先，其次子串），并回退到另一语言，返回按相关度排序、限量的列表。
  查询为空时返回少量常见主食。纯函数、同步。
- `portion(item, grams)`：返回该份量的 `{ kcal, macros }`，对每 100 g 数值按比例缩放并
  取整到合理精度；拒绝非正份量。
- 所有函数均为纯函数并有单测覆盖（双语匹配、排序、份量计算、累加取整）。

### 为什么搜索在本地（无 `food.search` RPC）

- 搜索完全在 JS 中对内置 JSON 执行，因此没有 bridge 方法、没有往返：结果即时，并在
  Android 与 iOS 上均可离线使用。原生侧只负责持久化。

### `health.writeIntake` 写入路径

- RPC `health.writeIntake`，请求 `{ date: string, kcal: number, macros: Macros }`，响应
  `{ success: true, hostData: HostDataDto }`——与 `writeWeight`（RFC 0010）相同的一次
  往返形态。
- Android `RecordsRepository.addIntake(date, kcal, macros)` 会**累加**到当日已有样本
  （多餐的热量与宏量相加），不存在则创建，然后返回刷新后的 HostData。
- 写入后宿主发出携带新 HostData 的 `records.changed`（RFC 0011），App 的全局订阅据此
  刷新 Home；RPC 响应也为 await 的调用方携带同一快照。非法（非有限值/非正）数值返回
  `invalid-request`。

### 记录饮食 UI

- 底部 **FoodSheet**：带实时本地结果的搜索框、结果行（名称与每 100 g 热量）；选中后出现
  克数输入（以 `defaultGrams` 预填），并显示计算出的餐食热量与宏量，外加取消/保存操作。
  它复用 sheet 样式与既有 `records.changed` 刷新。
- 当前无动作的 **Log food（记录饮食）** 快捷入口负责打开该弹层。所有字符串均以英文和
  简体中文加入 i18n 目录。

## 缺点

- 精选内置表是有限的；不常见或品牌食品在补充前可能缺失，且会让 bundle 略微增大。条码查询
  与自定义/新建食物延后处理。
- 精选菜品数值为估算而非实验室测量，已据此标注。
- 按日期累加摄入意味着 Home 视图不需要当天具体时段信息（以后可在模型中补充）。

## 理由与备选方案

- **运行时云端食物搜索（FDC API 或托管服务）**：始终最新，但需要网络、服务器/API 密钥，
  并把每餐发送到设备之外——违背离线/隐私立场。内置表足以覆盖日常记录；在线搜索以后可作为
  增强加入，而永不成为必需。
- **各平台原生搜索**：会在 Android 和 iOS 上重复数据集与解析器，并阻碍动态更新。放在 TS
  中可得到单一实现、即时结果与动态食物表更新。
- **保存时替换整天摄入**：会破坏多餐记录；累加让早、中、晚分别记录保持正确。
- **内置 Open Food Facts 用于条码**：该数据集非常庞大且为 ODbL 许可；更适合未来的条码
  切片，而非离线精选基础表。

## 未决问题

- 用户自建的自定义食物、收藏与食谱（多食材份量）。
- 通过 Open Food Facts 进行条码扫描以及包装照片。
- 饮水、微量营养素与每餐时间标签。
- 从 FDC 下载重新生成精选表的可复现导入器。
- Health Connect / HealthKit 的摄入互通。

## 实施计划

1. 新增 `@zzzode/food-data`：精选双语 JSON、类型、`searchFoods`、`portion` 与单测；
   像其他库一样用 Rslib 构建。
2. Bridge：新增 `health.writeIntake` 方法与 DTO；扩展内存 transport 与测试；更新 Android
   内存/preview bridge 以模拟该方法。
3. Android：`RecordsRepository.addIntake`（累加）、`writeIntake` 模块路径、发出
   `records.changed`；无新增权限。
4. Pages：带本地搜索与份量的 FoodSheet，接通 Log food 入口，新增 i18n key。
5. 重建 bundle 与 APK，在 web 预览上验证闭环，更新 RFC 索引，提交并 watch CI；iOS 无需
   新增原生代码。
