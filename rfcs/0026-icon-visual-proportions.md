- Start Date: 2026-10-02
- RFC Type: process
- Status: Proposed
- Supersedes: Geometry and sizing guidance in RFC 0022 only
- Related: [RFC 0022](0022-adaptive-launcher-icon.md)

# RFC 0026 — Icon visual proportions

English · [简体中文](0026-icon-visual-proportions.zh-CN.md)

## Summary

Fit the existing heart to **80% of the visible icon width** across Android, iOS and static tile exports.
Preserve both original paths, the flowing shared curve, the existing gradients and Android's existing solid colors.
Standalone transparent logo files retain their original geometry.

## Motivation and measurements

RFC 0022 sized the Android heart to approximately 66dp on its 108dp layer.
[AdaptiveIconDrawable](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/master/graphics/java/android/graphics/drawable/AdaptiveIconDrawable.java) exposes the central **72dp** area: its child layers extend by 25% on each side of the drawable bounds.
Consequently, the old heart filled **91.67% of the visible width**, not 61.11%.
There was no second inset or repeated padding in the resource chain.
Sampling the source cubic outline with the old transform gives a maximum distance of **37.315dp** from the center, outside a 36dp-radius circular mask: the outer lobes are slightly clipped.
The iOS PNG and static SVG exports instead filled **85.17%** of their full tile width (about 85.35% measured in raster pixels, including antialiasing).

Using the existing static tile unchanged would put the contour at radius **34.621dp** on Android.
It fits the 72dp circle, but exceeds the more conservative **66dp-diameter safe circle**.
Sizing to the latter with approximately 0.5dp clearance yields about 80% visible width.
The rounded 80% target gives a sampled maximum radius of **32.520dp**, leaving **0.480dp** clearance inside the 33dp safe radius.
This choice comes from the actual curve, rather than fitting its rectangular bounding box inside a circle.
See [Android adaptive-icon guidance](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).

## Implementation

The heart's original x extent is 94–1162, or 1068 source units.
Its source tile center is (627, 627).

- Android: `s = (72 × 0.8) / 1068 = 0.053932584…`, `tx = ty = 54 − 627 × s = 20.184269663…`.
- Foreground and monochrome use the identical transform; neither layer contains a baked-in mask or white tile.
- Static SVG/PNG tiles: `s = (1254 × 0.8) / 1068 = 0.939325843…`, `tx = ty = 627 × (1 − s) = 38.042696629…`.
- iOS remains 1024×1024, RGB, opaque and square; the operating system applies its corners.
- Marketing SVG retains its rounded white tile and PNG retains its square white tile; favicon retains its botanical tile and white silhouette.
- `logo-mark.svg` and `logo-monochrome.svg` remain the source shapes and keep their original clear space.

`scripts/generate-icons.mjs` derives all tile resources from these sources, using pinned Sharp for SVG rasterization.
The check mode verifies source silhouette agreement, samples cubic contours against the safe circle and checks every generated output for drift.
CI runs this check before the normal package build.
`scripts/preview-icons.mjs` compares any committed baseline to the local resources through representative circle, rounded-square and squircle masks, themed coloring, full layer guides and actual 24/32/48/64px renders.
It also compares static exports and 16/24/32px favicon renders.
These are geometry previews; OEM launcher normalization and animation still require device verification.

## Verification

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

Inspect both SVG and PNG previews; verify that no heart pixels are removed by the representative masks, that both theme layers share placement and that iOS has no alpha channel.
An installed APK check on real launchers and an iOS asset-catalog build remain separate validation steps.
The current iOS skeleton does not yet wire the export to an AppIcon asset catalog; this correction does not change native integration.
