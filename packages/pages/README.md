# @zzzode/pages

Lynx 页面集合，是 App 的主要界面载体。

## 规划页面

今日首页 / 记餐（结果与编辑）/ 体重与体成分 / 运动 / 周报 / 课程 / 双人 / 设置。

## 边界

- 页面只做组装与交互：领域计算用 `@zzzode/core`，原生能力用 `@zzzode/bridge`，组件用 `@zzzode/ui`。
- 后续由 Rspeedy 构建为可动态下发的 Lynx bundle。
