<div align="center">

<img src="assets/logo.svg" width="84" height="84" alt="LeanOn logo" />

# LeanOn

**Get healthy together — track meals and movement with the person you love.**

English · [简体中文](README.zh-CN.md)

[![CI](https://img.shields.io/github/license/Zzzode/LeanOn)](LICENSE)
[![CI](https://github.com/Zzzode/LeanOn/actions/workflows/ci.yml/badge.svg)](https://github.com/Zzzode/LeanOn/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](.github/CONTRIBUTING.md)

</div>

## About

**LeanOn** is a personal health companion built for **two people** — you and your partner.
It helps you log daily meals, exercise, weight and body measurements, with a clear focus on
**sustainable weight loss and long-term health**, rather than short-term crash dieting.

The name says it all: getting **lean**, while being able to **lean on** each other.

## Why LeanOn

- **Built for two, by design** — shared goals and challenges, with privacy levels so it
  feels like support, not surveillance.
- **Logging that takes seconds** — AI photo logging, voice/text quick entry, barcodes and a
  personal food library tuned to Chinese home cooking and takeout.
- **A metabolism engine that learns your body** — your real calorie burn is inferred from
  your own data (not a static formula), with plateau detection and trend smoothing.
- **Dynamic UI** — pages and cards are built with [Lynx](https://lynxjs.org) and can be
  updated over the air without an app-store release.
- **Health before the number on the scale** — waist circumference, body composition,
  sleep and non-scale wins keep you going through plateaus.

## Features

- Meal tracking: AI photo recognition, cooking-oil & portion estimation, barcode scanning,
  takeout-order import, simple/detailed logging modes, water intake
- Weight & body composition: smart-scale sync, daily weigh-in, body fat / muscle mass,
  weekly circumference measurements, monthly progress photos
- Exercise & activity: step sync, strength and cardio logging, smartwatch integration
- Recovery: sleep stages, resting heart rate / HRV, stress and mood
- Insights: today dashboard, instant meal feedback, weekly review, CBT mini-lessons,
  AI coach, trajectory forecast and a dedicated weight-maintenance phase
- Together: privacy tiers, shared & individual goals, reactions, joint challenges,
  shared recipes and split-portion logging for home meals

## Architecture

LeanOn uses a **Lynx × Native hybrid architecture**:

- **Lynx** renders pages and cards that iterate quickly and can be delivered dynamically.
- **Native** (Swift / Kotlin) owns the health-data lifeline: HealthKit / Health Connect,
  Bluetooth scales, background tasks, notifications, widgets and watch apps.
- A pure-TypeScript domain core (`@zzzode/core`) holds the metabolism and nutrition logic,
  reusable on device and server.

See [`rfcs/`](rfcs/) for design decisions, starting with
[RFC 0001](rfcs/0001-monorepo-and-tooling.md) and
[RFC 0002](rfcs/0002-project-naming-and-open-source-governance.md).

## Project structure

| Path | Description |
|---|---|
| `apps/ios` | iOS native host (Swift) |
| `apps/android` | Android native host (Kotlin) |
| `packages/core` | Pure-TS domain engine (TDEE, trends, nutrition) |
| `packages/bridge` | Lynx ↔ Native communication |
| `packages/ui` | Design system & components (built on lynx-ui) |
| `packages/pages` | Lynx page bundles |
| `packages/cards` | Dynamically delivered card bundles |
| `native/` | Cross-cutting native capabilities |
| `server/` | Manifest, sync and intelligence backends |
| `rfcs/` | Design documents |

## Getting started

**Prerequisites:** Node.js >= 20 and pnpm >= 9

```bash
corepack enable
pnpm install
pnpm typecheck   # type-check all packages
pnpm build        # build all packages
```

## Roadmap

- [ ] Domain engine: adaptive TDEE, trend smoothing, plateau detection
- [ ] Bridge protocol and native module registry
- [ ] Native host and Lynx container integration
- [ ] Dynamic delivery channel (manifest, signing, offline fallback)
- [ ] Data model, encrypted local storage and cloud sync

See the RFC roadmap in [RFC 0001](rfcs/0001-monorepo-and-tooling.md).

## Contributing

Contributions are welcome! Please read the [contributing guide](.github/CONTRIBUTING.md),
and note that significant changes go through the [RFC process](rfcs/README.md).

This project follows the [Contributor Covenant Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, please review the [security policy](.github/SECURITY.md) and use
private vulnerability reporting instead of public issues.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

## Acknowledgements

- [Lynx](https://lynxjs.org) — the cross-platform native UI framework
- [lynx-ui](https://lynxjs.org/zh/blog/lynx-ui) — official component library
