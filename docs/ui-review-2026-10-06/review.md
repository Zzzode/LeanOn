# LeanOn UI design review

[English](review.md) · [简体中文](review.zh-CN.md) · [Annotated overview](annotated-overview.png)

The content is readable and more honest than the earlier prototype, but its hierarchy remains a stack of equally weighted metric cards. The approved native bottom bar is the strongest design reference: restrained shape, consistent icons, and one clear selected destination. Bring that discipline into content rather than adding more effects.

## Evidence and scope

Read-only review on 2026-10-06. main@89b5e157844d62933a5ebfa773e7aa7b8d076cb9; remote origin https://github.com/Zzzode/LeanOn.git and remote HEAD independently confirmed equal. The working tree contains 61 existing tracked modifications plus untracked tests, RFCs and design proposals; these were preserved. New iOS captures cover five primary tabs; Settings uses explicitly dated prior native evidence. Android covers Today only. No browser was used. No business/UI source edits, commits, pushes, application builds, or health record writes were made. Existing simulated QA data only; all five tabs opened through the existing debug initial-route hook, which does not validate gestures.

Installed iOS/Android bundle SHA-256: `2ace1e5f1e0984d1053cd8e02572014234c481be7b45aed35484eb29504b43b5`.
The bundle matches dist; no fresh rebuild is claimed.

## Five leading findings

1. P1 — Today has a task entry, but too many equally important metrics. Remaining energy, weight, macros and repeated progress bars flatten the hierarchy; movement appears after several nutrition areas.
2. P1 — Diary is an aggregate, not an item journal. It repeats 1310 kcal, puts a storage limitation at the visual centre, and leaves the rice shortcut unlabeled as a new action.
3. P1 — Missing data and unsupported actions need distinct treatments. The empty food state still presents zero and a remaining budget; water/scale entry points can lead to an unavailable dialog.
4. P1/P2 — Me and Partner spend their best space explaining unavailable features. Available tools should come first; support between two people needs a small, purposeful identity and an honest empty state.
5. P2 — Progress now renders a real chart. Its local weight domain is good, but dates and the distinction between observed points and a fitted rate need clearer labeling.

## Screen-by-screen decisions

### Today · P1

Design judgment / 设计判断

Two rows of record buttons followed by repeated energy, weight, macros, micronutrients, water and exercise containers turn a daily companion into a metric inventory. Keep the three recording actions, use one compact action group and one main daily summary, put weight and movement in two open rows, and move detailed nutrition below. Make logged intake the main descriptive value; remaining budget stays a secondary estimate with completeness context. Do not remove the safety-floor notice.

`packages/pages/src/screens/TodayScreen.tsx:22–55`; `packages/pages/src/components/EnergyCard.tsx:16–41`; `packages/pages/src/App.css:1415–1430`

Screenshot: [today](screens/today.png), 2026-10-06.

### Today · P1

Explicit capability mismatch / 明确能力错配

WaterCard always exposes write controls, while the app rejects unavailable health.writeWater on iOS. The weight form similarly exposes scale pairing without a capability prop. Users get a plausible action followed by a dead end. Gate the controls by actual host capability, keep read-only values, explain availability inline, and never simulate success.

`packages/pages/src/components/WaterCard.tsx:59–73`; `packages/pages/src/App.tsx:180–186`; `packages/pages/src/components/WeightSheet.tsx:119–126`

### Diary · P1

Observed repetition + unimplemented model / 实见重复＋未实现模型

1310 kcal appears twice; the longest paragraph describes missing meal and portion storage. A recent rice chip resembles content but creates another record. Merge the total and add-food action, label the date and recent-use shortcuts, reduce the limitation to a short disclosure. Item history, meal attribution and editing a logged portion require real persisted identities; that is product/data work, not a cosmetic patch.

`packages/pages/src/screens/DiaryScreen.tsx:28–81`

Screenshot: [diary](screens/diary.png), 2026-10-06.

### Diary / empty · P1

Observed historical state + current code / 历史实见＋当前代码

No food records still shows 0 kcal, −0 exercise and 1757 remaining in the dated empty-state capture. Although its explanatory text is honest, the numbers invite a false completeness reading. Render not-yet-recorded as a state, suppress net/remaining summaries until sufficient context exists, and put a single gentle add action first. Zero recorded intake must not imply zero actual intake.

`packages/pages/src/screens/DiaryScreen.tsx:28–79`; `packages/pages/src/state/select.ts:70–82`

Screenshot: [empty-diary](screens/empty-diary.png), 2026-10-05.

### Progress · P2

Observed data communication / 实见数据表达

The observed-point line and local vertical range are clear; no x-axis date ticks or legend explain that the displayed weekly rate is fitted rather than the line itself. Add three calendar ticks, accessible period/change text, and a small observed/trend legend only if a genuine fitted line is shown. Keep calendar spacing and real gaps; never insert zeros for missing days. Consolidate secondary nutrition/activity/coverage into rows. Thirty-day and sparse-data rendering need a new runtime check.

`packages/pages/src/components/InsightsScreen.tsx:25–42`; `packages/pages/src/components/InsightsScreen.tsx:92–175`; `packages/pages/src/state/chart.ts:1–90`

Screenshot: [progress](screens/progress.png), 2026-10-06.

### Partner · P2

Design judgment + unimplemented feature / 设计判断＋未实现功能

Two generic circles, two explanatory cards and a full-width Settings action make the tab a noticeboard. Retain the honest unavailable text and noncompetitive language. Use one small paired motif and one concise supportive statement, then one local-data status. Settings becomes a secondary link. Linking, shared records, consent and delivered encouragement are unimplemented: do not add imaginary partners, local fake cheer or a false connection action.

`packages/pages/src/screens/PartnerScreen.tsx:3–25`; `packages/pages/src/App.css:1449–1452`

Screenshot: [partner](screens/partner.png), 2026-10-06.

### Me · P1

Observed task priority / 实见任务优先级

The guest/weight-goal card and local-mode card take the top; several unavailable tools precede Settings and About. Profile and goal rows look like familiar settings but are read-only. Put the available Settings/About group first, make the local profile a compact explicit read-only summary, and collapse or group unavailable connections after it. Align neutral icon strokes with the bottom bar; the scale icon currently reads as balance scales. Do not portray sign-in as shipped.

`packages/pages/src/screens/MeScreen.tsx:42–89`; `packages/pages/src/components/MeIcons.tsx:1–120`

Screenshot: [me](screens/me.png), 2026-10-06.

### Settings · P2

Historical observation + platform inconsistency / 历史实见＋平台不一致

The simple grouped list and language labels are worth keeping. The dated iOS pushed page retains the tab bar, while Android hides it on secondary routes; this is an inconsistent navigation contract, not a demand to redraw the accepted bar. Decide one secondary-page rule and verify return restoration. Locale writes currently have no visible pending state and map errors to generic unavailable content; add a saving state, disable repeated taps and retain the previous language on failure. Appearance selection is currently unimplemented, not an observed dark-mode bug.

`packages/pages/src/components/SettingsScreen.tsx:29–87`; `packages/pages/src/App.tsx:103–108`; `apps/ios/LeanOn/Bridge/NativeRouter.swift:15–27`; `apps/android/app/src/main/java/com/zzzode/leanon/MainActivity.kt:212–223`

Screenshot: [settings](screens/settings.png), 2026-10-05.

### Weight form · P1

Historical observation + code / 历史实见＋代码

The invalid-value capture correctly keeps the entered 0 and gives a localized range message. The underline does not visibly identify focus/error, and pairing a scale distracts from completing the manual task. Retain the real editable input, unit, validation and cancel/save; add a distinct labeled field boundary and inline error state, keep write errors at form level, and gate pairing. There is no separate historical weight-record editor here; adding it needs date/identity semantics.

`packages/pages/src/components/WeightSheet.tsx:32–70`; `packages/pages/src/components/WeightSheet.tsx:80–126`; `packages/pages/src/App.css:480–505`

Screenshot: [weight-invalid](screens/weight-invalid.png), 2026-10-05.

### Food new / portion / custom edit · P1/P2

Current code only; old food screenshot superseded / 当前仅代码；旧食物截图已过期

Search, selection, portion and custom-food management share one large component. In portion detail the calorie preview is visually stronger than the editable grams; the save/cancel row lives inside the detail scroll. Top cancel, back-to-results and bottom cancel compete. Make grams the main input, kcal a smaller live estimate, separate back within the task from dismissing it, and keep a fixed action area above the keyboard. Preserve query/selection when backing up. Custom create/edit should use compact labeled fields and a distinct destructive confirmation. A custom-food definition editor is not an editor for a consumed item. The earlier green screenshot with absent input must not be used to allege a current defect.

`packages/pages/src/components/FoodSheet.tsx:388–410`; `packages/pages/src/components/FoodSheet.tsx:544–678`; `packages/pages/src/components/FoodSheet.tsx:681–833`

### Exercise new / edit · P1

Historical observation + current code / 历史实见＋当前代码

Editing shows the existing activity and duration, then a tall catalog that separates the current task from its estimate. Show the selected activity first and make change-activity a disclosure/search task; duration and estimate stay together. Keep fixed actions, input prefill, pending guards and failure-preserved draft. Because save is not disabled for invalid/unselected draft, its state must explain what is required. Selection should use a check and text, not color alone. Do not assume Android Back/save is validated from an iOS screenshot.

`packages/pages/src/components/ExerciseSheet.tsx:53–98`; `packages/pages/src/components/ExerciseSheet.tsx:115–180`

Screenshot: [exercise-edit](screens/exercise-edit.png), 2026-10-05.

### Empty / loading / failure / modal · P1

Code gaps, not newly observed states / 代码缺口；本轮未新实测

When there is no weight, App gates Today, Diary and Progress behind the same weight-first card: recording food should not require calculating TDEE. Separate food logging from estimates; use a route-specific empty state. Bootstrap falls back to sampleHostData if absent; native failures must not become apparently real demo records. Introduce loading, load-error/retry, confirmed-empty and unavailable as distinct states. Pending save remains one action, prevents duplicate mutations, retains values on failure and reports completion from actual host results. Dismissing during mutation needs a defined Back/cancel rule. Verify overlay focus restoration and keyboard occlusion with native tools before claiming solved.

`packages/pages/src/App.tsx:48–56`; `packages/pages/src/App.tsx:83–101`; `packages/pages/src/App.tsx:455–464`; `packages/pages/src/components/WeightSheet.tsx:53–70`

Screenshot: [no-weight](screens/no-weight.png), 2026-10-05.

### Typography / accessibility / theme · P1/P2

Observed styling + code audit; assistive technology untested / 实见样式＋代码；辅助技术未测

Content and native bar use unrelated blue/green accents; equal card radii and mostly heavy numerals flatten meaning. The final CSS override references .Weight-value and .Macro-val, while actual numbers use .Weight-current and .Macro-grams, so the intended weight reduction misses them. Most fields have labels but many clickable views lack explicit button/disabled/selected semantics; opacity feedback dims their labels. Use a compact type scale, regular body text, medium tabular numerals, baseline-aligned units and Chinese/English-specific wrapping. Centralize palette roles including SVG/native hosts, readable disabled text and 3:1 field/focus boundaries. Check iOS 44pt/Android48dp targets on actual devices; rpx is not pt. Verify both locales, large fonts, VoiceOver/TalkBack, reduced motion and dark mode before any accessibility claim.

`packages/pages/src/App.css:206–209`; `packages/pages/src/App.css:264–267`; `packages/pages/src/App.css:1415–1431`; `packages/pages/src/App.css:25–27`; `packages/pages/src/components/InsightsScreen.tsx:37–41`

Screenshot: [today](screens/today.png), 2026-10-06.

## Preserve

Keep the original native bottom bar shape, icon vocabulary, selected pill and motion. Keep direct logging entry points, warm paper, good units, actual editable inputs, inline validation, draft retention, duplicate-submit guards, the rendered weight chart with calendar geometry, and honest local/unavailable states. The latest Partner no longer claims a sent cheer; the latest Me has no functioning sign-in claim. Earlier invisible-input/blank-chart/modal-interception evidence belongs to older revisions and is not a current P0.

## Unified visual direction

A quiet daily companion for two people: warm canvas, graphite text, white surfaces only for the primary summary or a bounded task, and the existing botanical navigation accent for actions. Content should feel lighter than the bar, with one dominant number per screen and open divider rows for secondary information. Relationship identity appears lightly on Today/Partner; utility pages stay functional. Category colors, if used, identify a small icon or chart series rather than painting every card. Avoid competitive scores, confetti, glass panels and comparison leaderboards. This is a review direction, not a complete redesign.

## Implementation order, when authorized

1. Trust and state semantics: distinguish missing/zero/unavailable, remove dead-end actions, preserve modal/input/persistence behavior. 2. Today and Diary task hierarchy: one daily summary, compact logging, eliminate duplicate totals. 3. Shared primitives: tokens, type, buttons, form fields, list rows, and real light/dark host coordination if appearance becomes scope. 4. Progress dates/legend and form task continuity. 5. Me/Partner editorial reduction and relationship identity. Accept each slice against the approved bar using fresh iOS and Android screenshots, empty/populated/failure cases, both languages and large type. New journal storage, linking and login must be separate capability work with repository RFCs.

## Coverage limits

No new touch interaction was possible because no supported screen-control tool is currently exposed. Fresh evidence: iOS five tabs in Chinese/light; Android Today in Chinese/light. Dated evidence: iOS Settings, empty diary, missing weight, invalid weight and exercise edit. Food current layout/search/custom editor, other integration sheets, loading/error/permission denial, English, dark, large fonts, screen readers and Android navigation/forms are code-only or unobserved. No health advice or formula review is claimed. Existing v2/v3 mockups are proposals and are excluded from current-runtime evidence. The report makes no full accessibility or interaction-pass claim.

## Proposed tokens

Starting values, not implemented. See [tokens.json](tokens.json).

| Role | Light | Dark |
| --- | --- | --- |
| canvas | #F8F7F4 | #201D26 |
| surface | #FFFFFF | #2B2731 |
| ink | #28242C | #FAF5F3 |
| muted | #69616B | #CEC3CE |
| action | #176B50 | #84D2AF |
| actionTint | #E7F1EB | #263D34 |
| divider | #E5DED8 | #443D48 |
| fieldOutline | #8B808E | #8B7B91 |
| error | #B63D46 | #FF949C |

Spacing 4/8/12/16/24/32/40; title27, section18, body16, auxiliary14, main number44, secondary32; body400/number500/title600.
One main summary per screen; open secondary rows. Physical values are pt/dp or sp, not rpx.
Contrast checks apply only to the listed token pairs, not complete accessibility.

## Official references and priorities

P1: prioritize trust, task or usability in the next iteration. P2: subsequent communication and consistency refinement. No blocking P0 is established by these fresh captures; a static-code risk is not a reproduced failure.

- [Android Developers: accessibility, 48dp targets and semantic descriptions](https://developer.android.com/guide/topics/ui/accessibility/apps)
- [W3C: normal text contrast 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C: non-text contrast and necessary control boundaries](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

The Apple HIG page returned only a JavaScript requirement, so no specific Apple provision is quoted. iOS44pt is a proposed acceptance target, not a measurement. AGENTS.md was read; local .agents/skills was inspected and no applicable native-review skill was found. Codex memory was searched for history and supplied no LeanOn evidence.
