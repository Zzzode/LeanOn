# LeanOn design language v3 — quieter hierarchy

[简体中文](README.zh-CN.md) · [Preserved v2 proposal](../design-language-v2/README.md)

V3 refines the approved multi-color direction by reducing filled surfaces, repeated containers and branding frequency.
It is a **static design proposal**, not an implemented or newly captured native app.
No application source, business logic, user records, native bar, commit or push was changed in this phase.

## What changed

| Area | V2 | V3 |
|---|---|---|
| Today | Deep-plum 354 × 194 pt hero, three tinted actions, two tinted metric cards, nutrient card. | White 354 × 176 pt hero; one coral food action; open weight/movement columns and nutrients; category lines and icons retain color. |
| Color semantics | Teal/amber also labeled fat/carbohydrates; amber was reused for reminders. | Food coral, movement teal, weight iris, hydration amber, relationship rose; macro values and utility icons are neutral. Brand plum is identity/navigation rather than another data category. |
| Containers | Most groups received a rounded surface. | One principal surface on Today, Progress, Diary, Me and Settings; Partner has none. Open rows and spacing separate supporting content. Input controls remain bounded where necessary. |
| Partner | Large figure, two-line heavy declaration, status pill, explanation card and filled Settings button. | About 140 pt paired figure, one 26 pt/500 line, direct unavailable status, open explanation and a secondary Settings link. No fabricated relationship or delivery. |
| Me / Settings | Motivational subtitle/banner and many equally weighted tools. | Direct functional headings; Settings/About precede unavailable tools in Me; no motivational banner, extra avatar logo or disabled chevrons. |
| Forms | Selected items and estimated energy appeared in colored cards. | Open selection rows, explicit input boundaries and one filled save. Portion/duration are the main input figures; estimated energy is smaller. Native editing and existing validation/persistence remain implementation requirements. |
| States / dark | Tinted status pills and full-width secondary actions. | Plain state labels, inline validation, restrained links and visibly disabled saving; dark content has neutral surfaces and category accents. |

The native bottom bar is an unchanged static crop of the existing approved capture.
Its original glass blur contains faint prior content; that is preserved screenshot evidence, not text in the proposed layout.
The dark board deliberately shows content only; native bar theme/motion must remain intact.

## Rules and tokens

- Light canvas `#F8F7F4`, paper `#FFFFFF`, ink `#28242C`, secondary `#69616B`.
- Keep the existing category hues: brand `#573C58`, food `#C35445`, movement `#177D89`, weight `#7563B1`, hydration `#BD8532`, relationship `#B75B7B`.
- Use separate deeper text/action tokens; do not lighten meaningful text to manufacture refinement.
- Dark canvas `#201D26`, surface `#2B2731`, ink `#FAF5F3`, secondary `#CEC3CE`; full token sets and semantic rules are in `tokens.json`.
- Aim for 80–90% neutral composition and roughly 3–5% strong color. These are design heuristics, not measured pixel claims; they are not required on a palette/component catalog board.
- Page titles 27 pt/600, regular rows 16 pt/400–500, main display 48–52 pt/500, supporting figures 26–32 pt/500, meaningful auxiliary text 14 pt. Weight entry uses 56 pt to support native numeric editing.
- Hero radius 22, content 20, controls 12, inputs 11; 4 pt grid, 24 pt page margins, 24–32 pt main gaps. Avoid assigning a card to every metric.
- iOS targets at least 44 × 44 pt; Android at least 48 × 48 dp. The smaller icon drawing is not the hit area.
- Use solid observed points, a dashed calendar-based trend and a neutral target; leave missing dates empty, never zero. Weight direction does not determine a good/bad color.
- Brand warmth belongs in Today, Partner and appropriate empty states. Utility screens use direct language. Preserve “Lighter days. Together.” / “轻一点，靠近一点。” without repeating a slogan on every page.
- Press 120 ms, sheet 180–220 ms, reduced motion via opacity; no change to native bar behavior.

## Checks and limits

The branch/HEAD remains `main` at `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`.
The existing tracked application diff was snapshotted and compared byte-for-byte after this work; it is unchanged.
V2 sources are preserved in their directory and in the archive.
V3 uses isolated QA example values dated 2026-10-01, not real user health data or the current wall-clock date.
Underlying native evidence was captured on 2026-10-05, iPhone 17 Pro / iOS 26.5, 1206 × 2622 px; no new native run is claimed.
Android capture/interaction coverage remains limited; hardware was not verified.

The 32 principal text pairs in `tokens.json` pass 4.5:1 contrast; the minimums are recorded in the manifest.
Actual rendered PNGs were inspected, including Today/Partner comparisons, the six-screen board, inputs, dark theme and state copy.
This checks static presentation and declared colors, not complete accessibility or native behavior.
Dynamic Type, VoiceOver/TalkBack, small devices, English expansion, keyboard transitions, focus order, save/error/relaunch, modal cancellation and platform capability differences still need native validation after implementation.
Daily aggregate food storage, the 20–300 kg guard, exercise estimates and unavailable account/partner/cloud/HealthKit states are retained rather than redesigned as shipped features.
Micros, detailed activity, unsupported tools and safety notices belong below the shown first viewport; they are not removed from product scope.

## Deliverables and reproduction

- `00-before-after.png`: new Today/Partner comparison, with v2 and v3 labeled.
- `01-brand-components.png`, `02-first-checkpoint.png`, `03-six-screens.png`, `04-forms.png`, `05-states-dark.png`: revised versions of the original Library items.
- `review.html` / `review.zh-CN.html`: self-contained visual review; v3, v2 and actual native evidence are separately labeled.
- `render.cjs`, SVGs, `tokens.json`, `evidence-manifest.json`: editable sources and verification metadata.

Run `node docs/design-language-v3/render.cjs` from this repository with dependencies installed.
Set `LEANON_DESIGN_EVIDENCE` to the extracted `native-evidence` directory when the original `/tmp/leanon-ui-review-20261005/after` captures are unavailable.
The archive retains v2, v3, the original logo asset and native screenshots; it is not an application build.
The reference principles remain category organization and legible units from [Apple Health](https://www.apple.com/health/) and action/category organization in the developer's [Keep App Store screenshots](https://apps.apple.com/cn/app/keep-ai-%E8%BF%90%E5%8A%A8%E6%95%99%E7%BB%83/id952694580), as documented in v2; this refinement performs no new reference research.
