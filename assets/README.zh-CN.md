# LeanOn 品牌资产

LeanOn 的 Logo、配色与使用规范。默认语言为英文，中文镜像见 [`README.md`](README.md)。

## 标志含义

LeanOn 帮助两位伴侣一起变得更健康——既能变“**瘦（lean）**”，又能随时彼此“**依靠（lean on）**”。

标志由两片均衡的植物绿形态相靠、共同构成一颗柔和圆润的心：

- **两个形态、两种颜色**代表两位伴侣；
- **心**代表关爱与陪伴；
- 两形之间一条**流畅的共享曲线**，寓意相互扶持。

标志只有一个清晰的整体轮廓，没有小符号或细碎细节，从而在小尺寸、单色下都清晰可辨。

## 制图逻辑

- 流畅、可编辑的矢量路径，在 1254×1254 网格上定义（无单位，可自由缩放）。
- 两组柔和的植物绿渐变；App 图标置于白色底版上。
- 不使用在小尺寸下会消失的细小点缀。

## 配色

| 令牌 | 色值 | 用途 |
| --- | --- | --- |
| Botanical 700 | `#218967` | 主品牌色、较深的伴侣形态、favicon 底色 |
| Botanical 600 | `#26916F` | 深形态高光 |
| Eucalyptus 400 | `#54A68F` | 较浅的伴侣形态 |
| Eucalyptus 300 | `#5BAA92` | 浅形态高光 |
| White | `#FFFFFF` | App 图标底版、favicon 上的标志 |

## 文件

- [`app-icon.png`](app-icon.png)——**权威（canonical）**、完整质感的 App 图标，README 展示与宣传使用的就是这一版。
- [`app-icon-ios-1024.png`](app-icon-ios-1024.png)——iOS App Store 图标：满版白底、无圆角、无 alpha，圆角由系统裁切。
- [`logo.svg`](logo.svg)——白色圆角底版上的可缩放 App 图标。
- [`favicon.svg`](favicon.svg)——满版植物绿底白心，用于浏览器标签页。
- [`logo-mark.svg`](logo-mark.svg)——透明底标志，用于浅色排版。
- [`logo-monochrome.svg`](logo-monochrome.svg)——使用 `currentColor` 的单色标志。

## App 图标

- **iOS** 使用 `app-icon-ios-1024.png`：1024×1024、满版白底、无圆角、无透明通道，圆角由系统统一裁切。
- **Android** 使用 108dp 自适应图层，中央 72dp 是可见区域，保守安全区为直径 66dp 的圆。
- 两个平台及静态图标导出中，心形均占**可见底版宽度的 80%**；不要用 Android 完整 108dp 图层计算这个比例。
- 彩色前景与主题化单色层共用同一变换，没有额外 inset 或预置遮罩。
- 为使填充面积与颜色视觉重量居中，心形统一向下偏移可见高度的 3.82%（Android 中为 2.75dp）；宽度仍为 80%。
- 实际轮廓测量及 RFC 0022 的校正见 [RFC 0026](../rfcs/0026-icon-visual-proportions.zh-CN.md)。

### 重新生成与预览

执行 `pnpm install` 后，运行 `pnpm icons:generate`，从未修改的源标志生成 Android 矢量、带底版 SVG 和 PNG。
渲染器固定为 Sharp 0.35.4。
运行 `pnpm icons:check`，检查导出资源、安全圆及填充面积/亮度差加权重心；CI 会执行此检查。
运行 `pnpm icons:preview 7bcaaa0 /tmp/leanon-optical-centering-comparison.svg`，将基线提交与本地资源对比，输出 SVG 和 PNG，包含代表性遮罩、主题图标和实际小尺寸。
这些预览模拟几何；启动器特有的归一化与动画仍需真机检查。
若本地存在 `AppIcon.appiconset/Contents.json`，生成器会同步其默认 iOS 1024px PNG，并保留目录元数据及其他外观；不会创建或重建资源目录。
当前本地生成的 Xcode 项目尚未收录该资源目录；宿主集成仍由 iOS 项目生成流程负责。
宣传 PNG 保留满版方形白底；`logo.svg` 保留圆角底版。

## 使用规范

- 独立标志四周保留约一个形态宽度的安全区。
- App 图标使用生成后的构图，不再重复叠加独立 Logo 的留白。
- 最小数字尺寸为 24 px；更小请优先使用满版 favicon。
- 在照片或杂乱背景上使用满版色块图标。
- 不得拉伸、旋转、使用本规范之外的颜色、添加特效，或重绘形态。
