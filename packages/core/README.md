# @zzzode/core

跨端领域引擎，**纯 TypeScript、零 UI、零原生依赖**。

## 职责

- 能量平衡：自适应 TDEE 反推、每日热量目标
- 体重信号：趋势去噪、平台期 / 代谢适应识别
- 营养：宏量目标、食物密度评分、结构诊断
- 预测：目标日期、减重→维持期过渡

## 边界

- 不依赖 Lynx、React 或任何原生模块，保证可在 Lynx 后台线程与服务端复用。
- 不直接采集数据；输入为结构化记录，输出为计算结果。

## 命令

```bash
pnpm --filter @zzzode/core typecheck
pnpm --filter @zzzode/core build
```

设计文档：`rfcs/0001`（基线）、`rfcs/0002`（命名与开源治理）、RFC 0003（待编写）。
