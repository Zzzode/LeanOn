# RFC 0022 — Adaptive launcher icon

- Status: Accepted
- Created: 2026-10-02
- Related: Brand system (logo assets under `assets/`), RFC 0021 (Health Connect)

## Summary

Give LeanOn a proper Android **adaptive launcher icon** built from the existing
two-tone heart brand mark. The icon uses three vector layers — a white
background, a two-tone heart foreground sized inside the adaptive-icon safe
zone, and a monochrome layer for Android 13+ themed icons — wired through
`mipmap-anydpi-v26`. The same white-background, two-tone-heart treatment is
already used by the iOS app icon, so the brand reads identically on both
platforms. Before this change the app declared no launcher icon at all.

## Motivation

- A health app that asks to be opened every day must look trustworthy on the
  home screen; shipping the system default icon is not acceptable for an
  industry-best product.
- Adaptive icons are mandatory for a consistent look across launchers
  (Pixel, Samsung, third-party) and for support of shaped masks and themed
  icons. A single static bitmap would be clipped inconsistently and would not
  support monochrome theming.
- We already own a clean, resolution-independent vector mark
  (`assets/logo-mark.svg`, `assets/logo-monochrome.svg`), so the icon can be
  produced entirely as VectorDrawable XML with no raster assets.

## Goals

1. Provide `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round` as adaptive
   icons and reference them from the manifest.
2. Reproduce the brand heart faithfully with the two botanical tones, with no
   clipping under any supported launcher mask.
3. Support Android 13+ **themed icons** via a monochrome layer.
4. Keep the icon fully vector (no checked-in PNGs) and consistent with the iOS
   app icon background and composition.

## Non-goals

- Redesigning the brand mark itself — this RFC adapts the accepted heart.
- Promotional artwork, splash screens, or in-product illustration.
- Raster/PNG fallbacks for pre-API-26 devices: `minSdk` is 26, the first
  platform version that supports adaptive icons, so `mipmap-anydpi-v26`
  covers every supported device.
- iOS icon changes (the iOS icon already exists at `assets/app-icon.png`).

## Design

### Adaptive icon layers

An adaptive icon is a 108dp × 108dp canvas composed of a background and a
foreground (and, on Android 13+, an optional monochrome layer). Each launcher
applies a mask; only the centered safe zone is guaranteed visible. The two XML
entries are identical apart from their resource name:

- `res/mipmap-anydpi-v26/ic_launcher.xml`
- `res/mipmap-anydpi-v26/ic_launcher_round.xml`

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
  <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
```

### Geometry and safe zone

The source heart in `logo-mark.svg` lives in a `0 0 1254 1254` viewBox with a
visual bounding box of approximately:

- x: 94 → 1162 (width 1068, center 628)
- y: 177 → 1115 (height 938, center 646)

The foreground VectorDrawable uses a `108 × 108` viewport and wraps the source
paths in a `<group>` that scales and centers the heart so its width is 66dp,
which keeps the entire mark inside the 72dp-diameter adaptive-icon safe zone
(the worst-case circular mask):

- uniform scale `s = 66 / 1068 ≈ 0.0618`
- `translateX = 54 − 628·s ≈ 15.2`
- `translateY = 55 − 646·s ≈ 15.1` (a 1dp visual-centering offset, since the
  heart's weight and tip sit slightly low)

After the transform the heart spans roughly x 21 → 87 and y 26 → 84, well
within the safe zone, with comfortable padding so the mark does not feel
cramped or, conversely, lost in excessive whitespace.

### Foreground

`res/drawable/ic_launcher_foreground.xml` is a 108dp VectorDrawable. The two
heart leaves are the two source paths, each filled with a solid brand tone:

- left (eucalyptus) leaf: `#58AB8D`
- right (botanical) leaf: `#218967`

The source SVG applies very subtle linear gradients, but at launcher-icon
size the gradient delta is imperceptible; solid fills are cleaner, smaller,
and match how the mark is seen at small sizes. The paths are emitted in their
original 1254 coordinates and transformed by the single `<group>` above, so
the path data is copied verbatim and only the group carries geometry.

### Background

`res/drawable/ic_launcher_background.xml` is a white `ColorDrawable`
(`#FFFFFF`), matching the iOS app icon background. White gives the strongest,
cleanest contrast for the two green tones and keeps the two platforms
identical. The color is also declared in `res/values/colors.xml`
(`ic_launcher_background`) so it is referenced rather than duplicated.

Note: this white field is the app-icon background, which must be opaque; it is
not the standalone logo, which keeps a transparent background.

### Monochrome (themed icons)

`res/drawable/ic_launcher_monochrome.xml` merges both leaves (from
`logo-monochrome.svg`) under a single white fill and the same positioning
group. On Android 13+ the system tints this layer with the user's theme color
to render a themed icon; on older versions the layer is ignored.

### Manifest

The `<application>` element gains:

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

### Resource file summary

- `res/values/colors.xml` — `ic_launcher_background` (white).
- `res/drawable/ic_launcher_background.xml` — white ColorDrawable.
- `res/drawable/ic_launcher_foreground.xml` — two-tone heart, 108dp viewport.
- `res/drawable/ic_launcher_monochrome.xml` — single-color heart.
- `res/mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml`.

## Verification

- `assembleDebug` compiles every vector and the adaptive-icon XML without
  resource or lint errors.
- The installed APK reports `android:icon` / `android:roundIcon`, and the
  launcher renders the white-background heart; a visual check of the foreground
  vector confirms the heart is centered and unclipped.
- CI Android job (build + unit tests + APK assembly) stays green.

## Drawbacks and future work

- Launchers that use an aggressive circular mask still show slightly less of
  the foreground than squircle launchers; the 66dp sizing accounts for this,
  but a future tweak can tune per-shape padding if needed.
- Deletion of a LeanOn record does not yet remove the corresponding Health
  Connect record (tracked separately); unrelated to the icon.
- A future brand refresh must update the foreground and monochrome vectors
  together to keep themed icons consistent.

## Open questions

- None for this version; background tone and safe-zone sizing follow the iOS
  icon and platform guidance.
