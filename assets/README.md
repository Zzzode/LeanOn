# LeanOn brand assets

The LeanOn logo, colors and usage guidance. The default language is English; a Chinese mirror is available in [`README.zh-CN.md`](README.zh-CN.md).

## The mark

LeanOn helps two partners get healthier together — to **lean** down while always being able to **lean on** each other.

The symbol is two fresh leaves that meet to form a heart:

- the **leaves** stand for health, nature and growth;
- the **heart** stands for care and companionship;
- the two forms rest gently together, like two people side by side.

The mark is deliberately simple — a single, clear silhouette with no small symbols or fine details — so it stays legible at small sizes and remains timeless.

## Construction

- Smooth geometric forms defined on a 100×100 grid.
- The light version uses soft, translucent green gradients; the app icon uses a solid green tile with a white mark.
- No tiny accents that would disappear at small sizes.

## Color

| Token | HEX | Use |
| --- | --- | --- |
| Lean 700 | `#0E7A50` | Primary brand color, filled icon background |
| Lean 500 | `#2ABB7A` | Accent, leaf |
| Lean 100 | `#CDF3DE` | Light leaf highlight |
| White | `#FFFFFF` | Mark on the filled icon |

## Files

- [`app-icon.png`](app-icon.png) — **canonical**, full-fidelity app icon; this is the version shown in the README and used for marketing.
- [`app-icon-ios-1024.png`](app-icon-ios-1024.png) — iOS App Store icon (edge-to-edge, no rounded corners; iOS applies the mask).
- [`logo.svg`](logo.svg) — simplified, fully scalable vector leaf-heart on a white tile, for layouts that require an SVG.
- [`favicon.svg`](favicon.svg) — solid green tile with a white heart, for browser tabs.
- [`logo-mark.svg`](logo-mark.svg) — leaf-heart on a transparent background, for light layouts.
- [`logo-monochrome.svg`](logo-monochrome.svg) — single-color mark using `currentColor`.

## App icons

- **iOS** uses `app-icon-ios-1024.png`: 1024×1024, no rounded corners and no alpha channel; the system applies the corner mask.
- **Android** adaptive icons (foreground/background layers within the 66% safe zone) will be generated under `apps/android` during the native shell work.

## Usage

- Keep clear space roughly equal to the width of one leaf around the mark.
- Minimum digital size is 24 px; below that, prefer the filled icon.
- On photos or busy backgrounds, use the filled tile.
- Do not stretch, rotate, recolor outside this palette, add effects, or redraw the forms.
