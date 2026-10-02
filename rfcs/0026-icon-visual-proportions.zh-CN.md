- 开始日期：2026-10-02
- RFC 类型：process
- 状态：Proposed
- 替代：仅 RFC 0022 中的几何与比例说明
- 相关：[RFC 0022](0022-adaptive-launcher-icon.zh-CN.md)

# RFC 0026 — 图标视觉占比

[English](0026-icon-visual-proportions.md) · 简体中文

## 摘要

将现有心形统一调整为 Android、iOS 和静态底版图标**可见宽度的 80%**。
保留两条原始路径、中央流动曲线、既有渐变和 Android 既有纯色填充。
独立透明 Logo 文件保持原有几何。

## 原因与测量

RFC 0022 将 Android 心形设为 108dp 图层上的约 66dp 宽度。
[AdaptiveIconDrawable](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/master/graphics/java/android/graphics/drawable/AdaptiveIconDrawable.java) 只显示中央 **72dp** 区域：子图层向 drawable 边界的每一侧延伸 25%。
所以旧心形占**可见宽度的 91.67%**，而不是 61.11%。
资源引用链中不存在第二次 inset 或重复留白。
按旧变换采样原始三次曲线，轮廓距中心最远为 **37.315dp**，超过圆形遮罩的 36dp 半径，外侧心瓣有轻微裁切。
iOS PNG 和静态 SVG 则占整个底版宽度的 **85.17%**（包含抗锯齿后的位图测量约为 85.35%）。

直接沿用静态底版会使 Android 轮廓的最大半径为 **34.621dp**。
它能放进 72dp 圆形遮罩，但超出更保守的 **66dp 直径安全圆**。
按安全圆并保留约 0.5dp 余量计算，可见宽度占比约为 80%。
取整后的 80% 目标使采样最大半径为 **32.520dp**，在 33dp 安全半径内留下 **0.480dp** 余量。
这一选择依据实际曲线，而不是把矩形包围盒误当成圆形安全区。
参见 [Android 自适应图标指南](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)。

## 实现

心形原始 x 范围为 94–1162，即 1068 个源坐标单位。
源底版中心是 (627, 627)。

- Android：`s = (72 × 0.8) / 1068 = 0.053932584…`，`tx = ty = 54 − 627 × s = 20.184269663…`。
- 彩色前景和单色层采用相同变换；两层都不预置遮罩或白色底版。
- 静态 SVG/PNG 底版：`s = (1254 × 0.8) / 1068 = 0.939325843…`，`tx = ty = 627 × (1 − s) = 38.042696629…`。
- iOS 仍为 1024×1024、RGB、不透明正方形，系统负责圆角。
- 宣传 SVG 保留原有白色圆角底版，PNG 保留方形白底；favicon 保留植物绿底版和白色轮廓。
- `logo-mark.svg` 和 `logo-monochrome.svg` 仍是源形状，保留原有留白。

`scripts/generate-icons.mjs` 从上述源文件生成全部底版资源，使用固定版本 Sharp 将 SVG 栅格化。
检查模式验证源轮廓一致性、采样曲线是否在安全圆内，并逐一检查生成资源是否发生漂移。
CI 在普通包构建前执行此检查。
`scripts/preview-icons.mjs` 将任意已提交基线与本地资源对比，包含代表性的圆形、圆角方形和 squircle 遮罩、主题着色、完整图层参考线，以及实际 24/32/48/64px 渲染。
它同时对比静态导出和 16/24/32px favicon。
这些是几何预览；各厂商启动器的归一化和动画仍需真机验证。

## 验证

```bash
pnpm icons:generate
pnpm icons:check
pnpm icons:preview 416d142 /tmp/leanon-icons-comparison.svg
pnpm build
pnpm typecheck
pnpm test
cd apps/android
./gradlew :app:testDebugUnitTest :app:assembleDebug --no-daemon --max-workers=2
```

检查 SVG 和 PNG 对比图，确认代表性遮罩没有裁掉心形像素、彩色和主题层位置一致，且 iOS 导出没有 alpha 通道。
在真实启动器安装 APK 验证，以及 iOS 资源目录构建，仍是独立验证步骤。
当前 iOS 骨架尚未将导出接入 AppIcon 资源目录；此校正不修改原生集成。
