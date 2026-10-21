# LeanOn v3 complete light and dark designs

[简体中文](README.zh-CN.md)

Static design checkpoint dated 2026-10-06, completed before application implementation.
These images are proposals, not native runtime screenshots.

- [Six screens in both modes](03-six-screens-dual.png): Today, Diary, Progress, Partner, Me and Settings.
- [Three forms in both modes](04-forms-dual.png): weight, food and exercise.
- [Twelve corresponding states in both modes](05-states-dual.png): empty, no weight, loading, read failure, search, no results, focus, validation, saving, save failure, unavailable and disabled/selected.
- [Light overview](06-light-six-screens.png) and [dark overview](07-dark-six-screens.png) retain the accepted v3 semantic colors and lighter content hierarchy.
- [Tokens](tokens.json) share canvas, paper, ink, muted, outlines and semantic categories.

Settings defaults to following the system and offers persisted light/dark overrides.
Native chrome, input keyboard and each cached route must receive the same resolved appearance.
The approved native bottom-bar geometry and motion remain the baseline.
Light bar imagery is cropped from actual native evidence; dark bar geometry and keyboard imagery are explicit static adaptation examples.
Appearance preferences and actual resolved appearance are separate values.

The read-only [current-runtime review](../ui-review-2026-10-06/review.md) is an independent dated checkpoint.
Its optional green-action suggestion is superseded by the authorized v3 semantic-color direction for this implementation.
No linking, delivered cheer, account sign-in or item-level journal history is implied.
Empty, unavailable and loading states do not masquerade as real records.
Transient Back/cancel/save states require native verification after implementation.

Implementation decisions are recorded in [RFC 0030](../../rfcs/0030-persisted-appearance.md).
Do not infer accessibility, keyboard or startup transition conformance from these static boards.
