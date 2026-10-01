# @zzzode/pages

[English](README.md) · 简体中文

Lynx 页面集合，是 App 的主要界面载体。

## 页面

- **今日首页 Home**（第一条垂直切片）：今日能量预算、体重趋势、宏量进度与快捷记录入口。
- 规划中：记餐（结果与编辑）、体重与体成分、运动、周报、课程、双人、设置。

## 工作方式

- 页面只做组装与交互：领域计算用 `@zzzode/core`，原生能力用 `@zzzode/bridge`，组件用 `@zzzode/ui`。
- 入口从 `lynx.__globalProps.hostData` 读取宿主原始记录；未注入时回退到内置的确定性示例数据，因此页面始终能带着数据渲染。
- 由 Rspeedy 构建为可动态下发的 Lynx bundle。

## 构建与预览

```sh
pnpm --filter @zzzode/pages build       # 产出 dist/main.lynx.bundle 与 dist/main.web.bundle
pnpm --filter @zzzode/pages dev         # 开发服务器（Lynx Explorer + web 预览）
pnpm --filter @zzzode/pages typecheck
```

Android 的 Gradle 任务 `prepareLynxAssets` 会把 `main.lynx.bundle` 拷入 APK 的 assets。

> 注意：本包锁定 TypeScript 6.0.x，因为 Rspeedy 0.18 尚不支持 TypeScript 7；Monorepo 其余部分使用 TypeScript 7。
