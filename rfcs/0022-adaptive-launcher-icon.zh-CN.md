# RFC 0022 — 自适应启动图标

- 状态：Accepted
- 创建时间：2026-10-02
- 相关：品牌系统（`assets/` 下的 logo 资源）、RFC 0021（Health Connect）

## 摘要

基于现有的双色心形品牌标志，为 LeanOn 打造正式的 Android **自适应启动图标**。
图标由三个矢量图层构成——白色背景、缩放到自适应图标安全区内的双色心形前景，
以及用于 Android 13 及以上主题化图标的单色层——通过 `mipmap-anydpi-v26` 接入。
iOS 应用图标已经采用相同的「白底 + 双色心形」处理，因此品牌在两个平台上呈现一致。
在此变更之前，应用根本没有声明任何启动图标。

## 动机

- 一款需要用户每天打开的健康应用，在主屏上必须看起来可信；对业内顶尖产品而言，
  使用系统默认图标是不可接受的。
- 自适应图标是在各类启动器（Pixel、三星、第三方）之间保持外观一致、适配各种形状
  遮罩以及支持主题化图标的必要条件。单张静态位图会被不一致地裁切，也无法支持单色主题。
- 我们已经拥有清晰、与分辨率无关的矢量标志（`assets/logo-mark.svg`、
  `assets/logo-monochrome.svg`），因此图标可以完全以 VectorDrawable XML 产出，
  无需任何位图资源。

## 目标

1. 提供 `@mipmap/ic_launcher` 与 `@mipmap/ic_launcher_round` 自适应图标，并在
   manifest 中引用。
2. 用两种 botanical 色调忠实还原品牌心形，在任何受支持的启动器遮罩下都不被裁切。
3. 通过单色层支持 Android 13 及以上的**主题化图标**。
4. 保持图标完全矢量化（不签入 PNG），并与 iOS 应用图标的背景和构图保持一致。

## 非目标

- 重新设计品牌标志本身——本 RFC 只适配已确定的心形。
- 宣传物料、启动屏或产品内插画。
- 为 API-26 之前的设备提供位图/PNG 兜底：`minSdk` 为 26，正是支持自适应图标的首个
  平台版本，因此 `mipmap-anydpi-v26` 覆盖所有受支持设备。
- 修改 iOS 图标（iOS 图标已存在于 `assets/app-icon.png`）。

## 设计

### 自适应图标图层

自适应图标是一块 108dp × 108dp 的画布，由背景和前景（在 Android 13 及以上还可包含
单色层）组成。每个启动器会施加遮罩，只有居中的安全区保证可见。两个 XML 条目除资源名外
完全相同：

- `res/mipmap-anydpi-v26/ic_launcher.xml`
- `res/mipmap-anydpi-v26/ic_launcher_round.xml`

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
  <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
```

### 几何与安全区

`logo-mark.svg` 中源心形位于 `0 0 1254 1254` viewBox，可视包围盒约为：

- x：94 → 1162（宽 1068，中心 628）
- y：177 → 1115（高 938，中心 646）

前景 VectorDrawable 使用 `108 × 108` viewport，并用一个 `<group>` 包裹源 path，对心形
缩放并居中，使其宽度为 66dp，从而把整个标志保持在自适应图标 72dp 直径的安全区内（即
最坏情况下的圆形遮罩）：

- 统一缩放 `s = 66 / 1068 ≈ 0.0618`
- `translateX = 54 − 628·s ≈ 15.2`
- `translateY = 55 − 646·s ≈ 15.1`（1dp 的视觉居中补偿，因为心形的重量与尖端略偏下）

变换后心形约占据 x 21 → 87、y 26 → 84，完全位于安全区内，并留有舒适的内边距，使标志既不
显得拥挤，也不会因留白过多而显得空荡。

### 前景

`res/drawable/ic_launcher_foreground.xml` 是一个 108dp 的 VectorDrawable。心形的两片
叶子即两条源 path，分别填充纯色品牌色：

- 左（eucalyptus）叶：`#58AB8D`
- 右（botanical）叶：`#218967`

源 SVG 使用了非常细微的线性渐变，但在启动图标尺寸下渐变差异不可察觉；纯色填充更干净、文件
更小，也符合标志在小尺寸下的实际观感。path 以原始 1254 坐标输出，仅由上述单个 `<group>`
负责变换，因此 path 数据原样复制，几何信息只存在于 group 中。

### 背景

`res/drawable/ic_launcher_background.xml` 是白色（`#FFFFFF`）的 `ColorDrawable`，与 iOS
应用图标背景一致。白色为两种绿色调提供最强烈、最干净的对比，并保持两个平台一致。该颜色同时
声明在 `res/values/colors.xml`（`ic_launcher_background`）中，以引用方式使用而非重复书写。

注意：这片白色是应用图标的背景，必须不透明；它不同于保持透明背景的独立 logo。

### 单色层（主题化图标）

`res/drawable/ic_launcher_monochrome.xml` 把两片叶子（取自 `logo-monochrome.svg`）合并为
单一白色填充，并使用相同的定位 group。在 Android 13 及以上，系统会用用户的主题色为该层着色，
渲染出主题化图标；在更低版本上该层被忽略。

### Manifest

`<application>` 元素新增：

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

### 资源文件清单

- `res/values/colors.xml` —— `ic_launcher_background`（白色）。
- `res/drawable/ic_launcher_background.xml` —— 白色 ColorDrawable。
- `res/drawable/ic_launcher_foreground.xml` —— 双色心形，108dp viewport。
- `res/drawable/ic_launcher_monochrome.xml` —— 单色心形。
- `res/mipmap-anydpi-v26/ic_launcher.xml`、`ic_launcher_round.xml`。

## 验证

- `assembleDebug` 能编译所有矢量与自适应图标 XML，无资源或 lint 错误。
- 安装后的 APK 报告 `android:icon` / `android:roundIcon`，启动器渲染白底心形；通过对前景矢量
  的目视检查确认心形居中且未被裁切。
- CI 的 Android job（构建 + 单测 + APK 打包）保持全绿。

## 缺点与后续工作

- 使用激进圆形遮罩的启动器，其前景可见部分仍比 squircle 启动器略少；66dp 的尺寸已考虑这一点，
  如有需要可在后续按形状微调内边距。
- 删除 LeanOn 记录后尚不会移除对应的 Health Connect 记录（另行跟踪）；与图标无关。
- 未来品牌升级必须同时更新前景与单色矢量，以保持主题化图标一致。

## 待解决问题

- 本版本无；背景色调与安全区尺寸遵循 iOS 图标与平台指南。
