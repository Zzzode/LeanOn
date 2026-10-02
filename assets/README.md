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
- **Android** uses 108dp adaptive layers with a central 72dp visible viewport and a conservative 66dp-diameter safe circle.
- The heart fills **80% of the visible tile width** on both platforms and in static icon exports; do not calculate this percentage against Android’s full 108dp layer.
- The foreground and themed-icon layer share one transform, with no extra inset or baked-in mask.
- See [RFC 0026](../rfcs/0026-icon-visual-proportions.md) for contour measurements and the correction to RFC 0022.

### Regeneration and previews

After `pnpm install`, run `pnpm icons:generate` to derive the Android vectors, tiled SVGs and PNGs from the unchanged source mark.
The renderer is pinned to Sharp 0.35.4.
Run `pnpm icons:check` to verify generated outputs and the sampled safe-circle fit; CI runs this check.
Run `pnpm icons:preview 416d142 /tmp/leanon-icons-comparison.svg` to compare the baseline commit with local assets as SVG and PNG, including representative masks, themed icons and actual small sizes.
These previews model geometry; launcher-specific normalization and animation still need device checks.
The iOS host currently has no AppIcon asset catalog wired to the export.
Marketing PNGs retain their full square white tile; `logo.svg` retains its rounded tile.

## Usage

- For standalone marks, keep clear space roughly equal to the width of one form.
- For app-icon tiles, use the generated composition instead of adding standalone-logo clear space again.
- Minimum digital size is 24 px; below that, prefer the solid favicon.
- On photos or busy backgrounds, use the solid tile.
- Do not stretch, rotate, recolor outside this palette, add effects, or redraw the forms.
