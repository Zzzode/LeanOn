# LeanOn brand assets

The LeanOn logo, colors and usage guidance. The default language is English; a Chinese mirror is available in [`README.zh-CN.md`](README.zh-CN.md).

## The mark

LeanOn helps two partners get healthier together — to **lean** down while always being able to **lean on** each other.

The symbol is two balanced botanical-green forms that lean into one another to form a softly rounded heart:

- the **two forms and two colors** represent the two partners;
- the **heart** stands for care and companionship;
- a single **flowing shared curve** runs between them, suggesting mutual support.

The mark is a single, clear silhouette with no small symbols or fine details, so it stays legible at small sizes and in a single color.

## Construction

- Smooth, editable vector paths defined on a 1254×1254 grid (unitless; scale freely).
- Two soft botanical gradients; the app icon sits on a white tile.
- No tiny accents that would disappear at small sizes.

## Color

| Token | HEX | Use |
| --- | --- | --- |
| Botanical 700 | `#218967` | Primary brand color, deeper partner form, favicon background |
| Botanical 600 | `#26916F` | Deep form highlight |
| Eucalyptus 400 | `#54A68F` | Lighter partner form |
| Eucalyptus 300 | `#5BAA92` | Lighter form highlight |
| White | `#FFFFFF` | App icon tile, mark on the favicon |

## Files

- [`app-icon.png`](app-icon.png) — **canonical**, full-fidelity app icon shown in the README and used for marketing.
- [`app-icon-ios-1024.png`](app-icon-ios-1024.png) — iOS App Store icon: edge-to-edge white tile, no rounded corners and no alpha; iOS applies the mask.
- [`logo.svg`](logo.svg) — scalable app icon on a white rounded tile.
- [`favicon.svg`](favicon.svg) — solid botanical tile with a white heart, for browser tabs.
- [`logo-mark.svg`](logo-mark.svg) — mark on a transparent background, for light layouts.
- [`logo-monochrome.svg`](logo-monochrome.svg) — single-color mark using `currentColor`.

## App icons

- **iOS** uses `app-icon-ios-1024.png`: 1024×1024 on an edge-to-edge white tile, with no rounded corners and no alpha channel; the system applies the corner mask.
- **Android** adaptive icons (foreground/background layers within the 66% safe zone) will be generated under `apps/android` during the native shell work.

## Usage

- Keep clear space roughly equal to the width of one form around the mark.
- Minimum digital size is 24 px; below that, prefer the solid favicon.
- On photos or busy backgrounds, use the solid tile.
- Do not stretch, rotate, recolor outside this palette, add effects, or redraw the forms.
