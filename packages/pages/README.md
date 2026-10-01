# @zzzode/pages

English · [简体中文](README.zh-CN.md)

The Lynx page collection — the app's primary UI surface.

## Pages

- **Home** (first vertical slice): today's energy budget, weight trend, macro progress and
  quick logging actions.
- Planned: meal logging (result & edit), weight & body composition, exercise, weekly report,
  lessons, couple, settings.

## How it works

- Pages only compose and interact: domain computation via `@zzzode/core`, native capabilities
  via `@zzzode/bridge`, components via `@zzzode/ui`.
- The entry reads raw host records from `lynx.__globalProps.hostData`; when none are injected
  it falls back to a bundled deterministic sample, so the screen always renders with data.
- Rspeedy builds the dynamically delivered Lynx bundles.

## Build & preview

```sh
pnpm --filter @zzzode/pages build       # dist/main.lynx.bundle + dist/main.web.bundle
pnpm --filter @zzzode/pages dev         # dev server (Lynx Explorer + web preview)
pnpm --filter @zzzode/pages typecheck
```

The Android Gradle task `prepareLynxAssets` stages `main.lynx.bundle` into the APK's assets.

> Note: this package pins TypeScript 6.0.x because Rspeedy 0.18 does not yet support
> TypeScript 7; the rest of the monorepo uses TypeScript 7.
