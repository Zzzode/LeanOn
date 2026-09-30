# @zzzode/core

English · [简体中文](README.zh-CN.md)

Cross-platform domain engine — **pure TypeScript, zero UI and zero native dependencies**.

## Responsibilities

- Energy balance: adaptive TDEE inference, daily calorie targets
- Weight signals: trend smoothing, plateau / metabolic-adaptation detection
- Nutrition: macro targets, food-density scoring, structure diagnosis
- Forecasting: target date, weight-loss → maintenance transition

## Boundaries

- No Lynx, React or native-module dependencies, so it can be reused on a Lynx background
  thread and on the server.
- It does not collect data; inputs are structured records and outputs are computed results.

## Commands

```bash
pnpm --filter @zzzode/core dev
pnpm --filter @zzzode/core build
pnpm --filter @zzzode/core typecheck
```

Design docs: `rfcs/0001` (baseline), `rfcs/0002` (naming & governance), RFC 0004 (planned).
