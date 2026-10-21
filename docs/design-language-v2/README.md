# LeanOn design language proposal — Soft Momentum

[简体中文](README.zh-CN.md)

**Decision for review:** build a quiet, expressive, multi-color language around “Lighter days. Together.”
Use deep plum as the brand anchor, coral for food, teal for movement, iris for weight, amber for hydration, and rose for the relationship.
Task hierarchy and page composition give these colors their meaning.
This is a design proposal, not an implemented app or a native screenshot.

## Scope and evidence

Prepared on 2026-10-06 against `main` at `89b5e157844d62933a5ebfa773e7aa7b8d076cb9` with existing local changes.
Read-only remote verification found the same commit at `origin/main`, `https://github.com/Zzzode/LeanOn.git`.
The starting workspace had 61 tracked modifications and seven untracked source/RFC files.
The tracked diff was compared byte-for-byte with the baseline after authoring this proposal; no application source was changed in this phase.
No commit, push, application build, installation, health-data mutation, or new runtime session occurred in this phase.
Repository `AGENTS.md` was read; `.agents` is absent.

The current visual baseline is the **2026-10-05 actual native capture**, taken after the input/SVG/modal/persistence fixes, on iPhone 17 Pro / iOS 26.5 at 1206 × 2622 px.
That baseline covers Today, Diary, Progress, Partner, Me and Settings, plus demonstrated food save and exercise edit/save/cancel/relaunch flows.
Its bundle SHA-256 is `2ace1e5f1e0984d1053cd8e02572014234c481be7b45aed35484eb29504b43b5`.
The raw screenshots are prior runtime evidence, **not fresh Oct 6 captures**.
Android runtime evidence remains limited; this proposal does not claim Android interaction parity or hardware verification.
The new SVG/PNG screens are static design mockups at 402 × 874 pt, with example data from the isolated QA fixture dated 2026-10-01.
The seed date is not the current wall-clock date.
No real user health data was used.

The approved light native bottom bar is reused as an unchanged static screenshot crop.
Its baked glass blur can contain faint old content; that is a property of the capture, not new page content.
The new dark board demonstrates the content theme only; the existing native bottom-bar theme and motion must be retained during implementation.
The keyboard drawing is a design illustration, not a screenshot of an operating-system keyboard.

## Five findings that drive the proposal

| Finding | Evidence | User impact | Design response | Classification / priority |
|---|---|---|---|---|
| Functional repairs now work, but equal white cards and one blue accent still carry almost every task. | Native baseline Today/Diary/Progress; `packages/pages/src/App.css:114`, `:142`; `screens/TodayScreen.tsx:22`. | A meal, a trend and a personal setting read with similar visual weight; the brand is weak. | One prominent block per view; category colors have stable roles; use compact rows where comparison matters. | Design judgment / P1 |
| Diary repeats the same food total above and below an explanatory card. | Native Diary; `screens/DiaryScreen.tsx:28`, `:46`, `:59`. | Users read the same number twice while searching for the add-food action. | One daily summary with one primary action, then nutrients and recent-food shortcuts. | Observed repetition / P1 |
| Progress has a real, calendar-based SVG graph after the fix; observation, trend and goal still need a unified visual convention. | Native Progress; `components/InsightsScreen.tsx:25`, `:109`. | People need to distinguish measured points from interpretation without reading a paragraph. | Solid observations, dashed fit, explicit sample count; keep a distant goal outside the local plot domain. | Proposed refinement / P1 |
| Partner now tells the truth, but its two outlined circles and stacked prose understate the “lean on each other” identity. | Native Partner; `screens/PartnerScreen.tsx:3`, `:8`, `:17`. | The product promise feels like a placeholder despite honest copy. | Paired shapes on a shared baseline and an editorial composition; keep the unavailable status and real Settings action. | Design judgment + capability gap / P1 |
| Me and Settings devote substantial space to unavailable integrations. | Native Me/Settings; `screens/MeScreen.tsx:66`, `:71`, `:88`; `components/SettingsScreen.tsx:58`. | Users must scan future capabilities to find the few usable controls. | Group tools by availability, concise platform-specific status, no chevrons on inactive rows. | Observed hierarchy + capability gap / P1 |

The original missing input, invisible SVG, modal interception, fake local cheer and dead login affordance must not be reintroduced.
They are repaired or truthfully removed in the current baseline, rather than remaining defects claimed by this report.

## Page decisions

| Page | Preserve | Specific proposal | Priority |
|---|---|---|---|
| Today | Three immediate logging actions; safe energy calculation; visible units. | Make the food record the dominant number, show the reference budget and estimated movement as supporting context, place weight/movement in adjacent compact tiles, and keep nutrients readable. Keep micros, water, exercise rows and the safety notice below the first viewport; do not delete them. | P1 |
| Diary | Honest daily-aggregate model and real food entry. | Use a coral daily summary, one add action, neutral nutrient rows and recent selections. Do not draw meals, historical date editing or food-entry deletion before their data model exists. | P1 |
| Progress | Working SVG, real date spacing, local weight domain and 7/30-day controls. | Prioritize one weight plot; add a differentiated fitted line and its legend; display coverage alongside food averages. Treat missing records as gaps, never zero. | P1 |
| Partner | Explicit unlinked/unavailable state; no fake cheer, name, shared weight or invitation. | Use rose/iris paired geometry and calm supportive copy. Keep the only offered destination, Settings, real. A future linked design is outside this proposal. | P1 |
| Me | Read-only profile/goal; platform capability checks; real Settings/About destinations. | Compact local profile, separate available controls from future integrations, and use consistent vector strokes. Use a platform-neutral status model; the depicted unavailable states are specifically iOS. | P1 |
| Settings | Native back navigation; persisted locale; capability-dependent actions. | Make language the first usable control, retain the back affordance, and explain local storage separately. About may reuse its existing destination. No fake backup, account, sharing, appearance selector or HealthKit authorization. | P1 |
| Weight | Native editable input, one-decimal persistence, existing 20–300 kg validation and saving guard. | Large figure plus adjacent unit; one primary save action above the keyboard; inline validation and preserved draft after failure. Do not replace the native keyboard with a custom keypad. | P1 |
| Food | Real search and portion input; live nutrient calculation; capability gating. | Search → selected item → quantity → addition preview → fixed save. Clear selection is a 44 pt target. Searching/loading/no-results states keep the input and cancellation available. | P1 |
| Exercise | Add/edit distinction, selected type, duration input, calculated energy and same-record update. | Make the chosen type and editable duration the visual center; label energy as an estimate. Type selection and delete remain available below the first viewport, with destructive actions secondary. | P1 |
| States | Busy-write guard, inline error, retry, cancellation and platform honesty. | First-record empty state; stable read loading; saving disabled; failed writes preserve values; unsupported capabilities explain the boundary. Announce error/success to assistive technology during implementation. | P0 for truthful behavior; P1 for presentation |

## Brand, tokens and rules

- **Voice:** “Lighter days. Together.” / “轻一点，靠近一点。” Favor invitations and observation; avoid guilt, competition, compensatory exercise or celebrating low intake.
- **Color:** the palette budget is 70–80% quiet canvas/surface, 15–20% category tint and 5–10% strong accent. These are composition targets, not measured pixel ratios. At most one large filled brand block per viewport. Always pair color with a label, icon or line style.
- **Light:** canvas `#F8F5F0`, paper `#FFFDFA`, ink `#28242C`, secondary `#69616B`, brand `#573C58`. Category full colors: coral `#C35445`, teal `#177D89`, iris `#7563B1`, amber `#BD8532`, rose `#B75B7B`. Darker category text colors are separate tokens.
- **Dark:** canvas `#201D26`, surface `#2B2731`, ink `#FAF5F3`, secondary `#CEC3CE`; category foregrounds are softened and their surfaces stay dark. `tokens.json` contains both complete token sets.
- **Type:** native system UI fonts and PingFang for Chinese; titles 28–32 pt / 600, sections 20 / 600, body 16–17 / 400, meaningful auxiliary text 14. Display numbers 48–56 with lining/tabular digits; preserve `kg`, `kcal`, `g` and `min`. Short chart ticks may be 11–12; they require native large-type validation.
- **Localization:** preserve locale word order and local date formatting. Examples: “记录体重” / “Log weight”, “本机模式” / “On this device”, “运动估算” / “Estimated movement”. English labels need expansion allowance; no fixed-height truncation. Application copy must be authored through `packages/i18n`, not copied as hardcoded component text.
- **Geometry:** 4 pt spacing grid; 24 pt horizontal margins at 402 pt; 24 pt major section gaps; hero radius 24, content 20, controls 12–16; quiet 1 px borders only where boundaries are useful.
- **Icons:** 24 px grid, about 1.8–2 px rounded stroke. Pair icons with text. Reuse the existing logo path, including monochrome adaptations; paired decorative geometry never replaces the logo.
- **Interaction:** iOS targets at least 44 × 44 pt; Android at least 48 × 48 dp. Press 120 ms, sheet 180–220 ms, chart about 300 ms; reduced motion uses opacity rather than travel. Keep the approved native bar behavior.
- **Charts:** exact observations are solid points/lines; missing dates break observation lines; trend is a dashed calendar-based fit; goal is a neutral dotted guide or text if outside the plot. Weight rises and falls use the same hue. Tooltip/accessibility values must expose dates and units.
- **Cards and lists:** a card groups a task, not every individual value. Use row separators for comparison; avoid nested cards and repeated totals. Expanded detail gets its own heading rather than another equally loud hero.

Calculated text-pair contrast ranges are **5.57–14.00:1 in light mode** and **5.53–15.35:1 in dark mode** for the 16 principal pairs listed in `tokens.json`.
This validates those chosen color pairs only, not the full accessibility of an unimplemented UI.
Dynamic Type, VoiceOver/TalkBack, reduced motion, keyboard focus, small screens, screen-reader chart descriptions and native toolbar safe areas still require runtime verification.

## Implementation order after direction approval

1. Centralize the approved tokens and typography, then adjust shared cards, rows and icons; retain all native transport, input, SVG and modal contracts.
2. Implement Today and Progress to validate density, chart conventions, localization and first-viewport priorities on both native hosts.
3. Apply the relationship composition and capability-sensitive hierarchy to Partner, Diary, Me and Settings.
4. Apply the form layout and all states without changing existing persistence or validation rules.
5. Verify small/large devices, keyboard transitions, cancellation, save/error/relaunch, large text, reduced motion and platform-specific unavailable states. Native bar motion is a regression boundary.

Food entry histories, onboarding/profile editing, current-date rollover, account/partner delivery, HealthKit, cloud sync and device integrations remain separate product/engineering work.
Their absence cannot be fixed with a new color palette and is not hidden by these mockups.

## References and deliverables

Apple’s official [Health overview](https://www.apple.com/health/) demonstrates category-specific color and visible units in its real summary imagery.
The official [Fitness page](https://www.apple.com/apple-fitness-plus/) illustrates clear activity categories; LeanOn does not inherit its rings or completion framing.
Keep’s developer-authored [App Store screenshots](https://apps.apple.com/cn/app/keep-ai-%E8%BF%90%E5%8A%A8%E6%95%99%E7%BB%83/id952694580) include category-colored tools and direct actions.
The inspected Keep home image is a marketing panel, so it is not treated as proof of an actual app home layout.
These references support organizational principles, not an imitation of their colors, logo, layout or health claims.

- `01-brand-components.png`: brand and component board.
- `02-first-checkpoint.png`: Today, Progress and Partner.
- `03-six-screens.png`: full first-viewport system.
- `04-forms.png`: weight, food and exercise.
- `05-states-dark.png`: dark content, empty/loading/invalid/saving/error/unavailable.
- `review.zh-CN.html`: self-contained visual report with the native baseline kept separate from mockups.
- `tokens.json`: complete light/dark tokens and measured contrast.
- `render.cjs` and SVGs: editable design source. Run `node docs/design-language-v2/render.cjs` with repository dependencies installed and the documented prior QA captures available.

The generator depends on existing captures in `/tmp/leanon-ui-review-20261005/after` for bottom-bar reuse; it does not claim a portable native build.
The delivery archive also preserves the raw baseline screenshots so an independent reviewer can verify the source evidence.
