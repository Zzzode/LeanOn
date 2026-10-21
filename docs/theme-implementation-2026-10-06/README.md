# Light and dark appearance implementation

[简体中文](README.zh-CN.md)

Implementation checkpoint for the complete [v3 dual-mode design](../design-language-v3-dual/README.md).
Native verification is complete within the boundaries below.
Read the [implementation review](implementation-review.html), [actual 24-screen overview](native-24-screen-overview.png) and [evidence manifest](evidence-manifest.json).

The native host persists `system`, `light` or `dark`, and injects its resolved appearance before mounting each Lynx page.
Settings exposes all three choices, pending and failure feedback, and the current resolved mode.
Pages use one palette for content, forms and SVG graphics.
The approved native bottom-bar geometry and motion are retained.
Partner linking, delivered encouragement and account sign-in remain unavailable features.

## Evidence boundaries

Static design boards and real native screenshots are separate artifacts.
The first native integration exposed missing CSS variable colors on both platforms; those screenshots are failure evidence, not approved output.
Build and palette tests alone cannot establish native rendering, keyboard, touch or screen-reader behavior.
All native QA records use isolated synthetic stores.
The normal user record store is not opened or modified by the verification workflow.

Workspace typecheck, build and 222 tests passed.
Android has 60 passing native tests, twelve final screenshots and five final appearance checks.
iOS has 23 passing native tests, five complete UI tests on the preceding bundle, final keyboard continuity and final six-screen/persistence checks.
Final iOS read failures were captured in both modes.
Per-image manifests identify prior form and empty-state builds; they are not presented as final-bundle captures.
Android form interactions, screen-reader traversal, enlarged text, loading/write failures and pending-save native Back remain unverified.
Static boards use fixed example content; actual pages use native safe areas, platform chrome, localized content and QA records.

No commit, push or deployment is part of this checkpoint.
