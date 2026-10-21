# LeanOn current UI: design review

[English](review.md) · [简体中文](review.zh-CN.md) · [Native overview](annotated-main-overview.png) · [Forms overview](annotated-forms-overview.png)

The app now has substantive record and recovery flows, but its daily task hierarchy is still weak.
The gap is information ordering, state communication and interaction consistency, rather than missing visual effects.
Preserve the approved native bottom bar and use its clear, restrained organization as the content baseline.
This phase only reviews and collects evidence: no business/UI source changes, commits, pushes or deployment.

## Five priorities

1. **P1 — Diary is dominated by date controls.** Date title, a large input, confirmation, previous/next/today and history occupy most of the SE viewport before the diary appears. Replace this with one previous/date/next row; expand a date picker when requested and place history/trash in secondary navigation. Keep usable touch areas while reducing container whitespace. Evidence: `ios-en-light-diary.png`, `android-en-dark-diary.png`; `DiaryScreen.tsx:60–75`.
2. **P1 — One weight becomes a prominent +0.0 kg change.** The actual screen combines +0.0, insufficient data and `1 weights`. This is a communication defect, rather than a wrong subtraction. Show the recorded value/date and wait for another dated observation before presenting change. Evidence: `ios-en-light-progress.png`, `android-en-dark-progress.png`; `core/src/insights.ts:103–111`, `InsightsScreen.tsx:117–139`.
3. **P1 — Android accessibility actions do not match visible controls.** Settings in Me has a name/focus but `clickable=false` and no `ACTION_CLICK`; an official accessibility click failed, followed by successful ordinary touch. Today quick actions also lack named nodes in the exported hierarchy. Verify host-exposed roles/actions and state before polishing. Evidence: `accessibility/android-en-dark-me.json`, `android-en-forms-today.json`, `android-accessibility-click-failure.json`; `MeScreen.tsx:17–21`, `QuickActions.tsx:5–20`. This does not certify an entire TalkBack flow as broken; TalkBack was not run.
4. **P1 — Forms preserve the action while losing decision context.** With the portion keyboard open, 150 g and Add meal remain visible while the selected food and full meal choices are outside the visible area. New exercise begins with a long catalog before duration. Keep a short food/date/meal context visible; place duration next to the chosen activity and estimate. Evidence: `ios-en-food-portion-keyboard.png`, `ios-en-exercise-new.png`; `FoodSheet.tsx:768–846`, `ExerciseSheet.tsx:128–181`.
5. **P1/P2 — Relationship branding is not yet tied to the daily task.** Partner artwork/welcome precede connection state and action; Today layers title, mode, brand, colored actions and a large calorie summary. Make the next small action and consent-based support the organizing structure, with a lighter brand presence. Evidence: `ios-en-light-partner.png`, `ios-zh-light-today.png`; `PartnerScreen.tsx:28–52`, `App.tsx:769–778`, `TrackingTodayScreen.tsx:20–28`.

## Evidence and version

Branch `main`, HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`; origin `https://github.com/Zzzode/LeanOn.git`.
A read-only remote HEAD query returned the same commit.
The app represents the existing dirty workspace above that commit, not a clean release.
Starting status and source hashes are in `baseline.json`; a final scope check preserves unrelated/parallel work.

The existing signed iOS app and Android APK contain the same Lynx bundle SHA-256: `c0d0c9e96b8e0d520770b1f24070ceeecda6238e4b24f78d3cc6b81de2812b2b`, also matching local dist.
No app was rebuilt; only a private review XCTest runner was compiled.
Captures use separate disposable `.uiqa` environments: iPhone SE 3, iOS 26.5, 750×1334 / 375×667pt; Pixel 4 configuration, Android 15 API35, 1080×2280 / 440dpi.
All records are fictional fixtures dated 2026-10-07.
No browser recreation was used; the HTML deliverable is a report, not an app screenshot.

iOS coverage includes all six screens in English light/dark, five Chinese light tabs, empty states, native read failure, new/invalid weight, food search/portion keyboard, new exercise, aggregate/weight/profile edits, delete confirmation, actual meal edit/invalid portion and multi-point 7/30-day charts.
The filename `weight-invalid-keyboard` names a capture whose actual pixels have the keyboard closed.
Retained Android evidence covers six English dark screens, light Today/Partner/Settings, and later synthetic-fixture read errors. Later fixture reloads failed and the form session/device became unavailable; these are not claimed as successful Android form coverage. See `coverage.json`.
Initial native routing proves rendering, not a tab gesture; Settings ordinary touch is separately verified.

Connected Partner/shared content/delivery/photos/offline/permission denial, production migration, saving/network loading, large text, physical devices and complete VoiceOver/TalkBack flows were not comprehensively rerun here.
Current code contains real account/invitation/consent/sync actions; these are no longer uniformly placeholders.
Code or older backend tests still cannot prove those UI flows passed this review.
October 6 review findings and v2/v3 mockups are excluded as current visual evidence.

## Screen decisions

| Screen/state | Problem and user impact | Concrete direction | Priority / evidence |
|---|---|---|---|
| Today, recorded tracking mode | Several openings and the calorie card displace weight/water/activity. Sustainable health reads as a calorie dashboard. | Short date/greeting and mode label; three direct actions; one daily summary with small next actions. Open secondary water/activity rows; detailed nutrition later. | P1, observed + judgment; `TrackingTodayScreen.tsx:20–40`, `App.tsx:769–778` |
| Today, fresh/empty | Setup card, three actions and repeated unlogged copy compete. | Separate first setup from an unlogged day. One useful next step; no missing-as-zero representation. | P1/P2, observed |
| Today, loss guidance | Code renders compact weight and a later full WeightCard. This mode was not newly viewed. | One weight summary; detail in Progress/records; preserve safety-floor guidance. | P2, code only; `TodayScreen.tsx:26–42` |
| Diary, first viewport | Calendar tools dominate; Previous day wraps; today's Next day lacks clear visual differentiation. | Compact date navigation with expandable selection/history; visible disabled state without unreadable labels. | P1, observed; `DiaryScreen.tsx:62–75` |
| Diary, records/aggregate | Large equal edit/delete actions per record add density; legacy explanation is long. | Compact name/meal/portion/kcal row, primary edit and secondary delete with confirmation. Keep aggregate identity truthful. | P2, observed + code; `DiaryScreen.tsx:54–59,83–113` |
| Progress, empty/single | Single-point change appears meaningful; empty screen repeats global setup and multiple insufficient-data sections. | Independent 0/1/sparse/multi-point presentations; factual single value; one explanation/action for empty. | P1, observed communication defect |
| Progress, multi-point | Dates, fitted line and gaps are useful; long vertical spacing separates summary/chart/legend. English singular is unpolished. | Period near heading, change and secondary fitted rate, adjacent legend, plural-aware copy and visible coverage. | P2, observed; `InsightsScreen.tsx:29–65,117–158` |
| Partner, signed out | Artwork and introduction precede status/action; relay jargon creates unnecessary infrastructure work. | Small paired mark, one line, clear connection state and one primary step; technical connection settings inside a contextual flow. | P1, observed + judgment; `PartnerScreen.tsx:28–52` |
| Partner, connected/error | Code respects consent/authorization; raw IDs/time and administrative controls can overshadow support. Not newly run. | Shared updates/support first, management details collapsed; format time; distinguish no consent/no data/offline/queued/delivered. Never fake delivery. | P1/P2, code only; `PartnerScreen.tsx:56–141` |
| Me | Local profile repeats; Profile shows only height; a large summary/mode paragraph delays tools. | One short summary with Height and Target weight labels; stable edit row; group records/connections/data while keeping Settings easy to find. | P2, observed; `MeScreen.tsx:31–57` |
| Settings | Theme states genuinely work, but large section gaps delay connections/data. Saving locks handlers while options remain ordinary buttons. | Compact secondary header/list rhythm; retain checkmarks; expose busy/disabled and keep old selections on failure. Preserve bottom bar. | P2, layout observed, saving semantics code only; `SettingsScreen.tsx:31–82` |
| Read failure/loading | Honest failure avoids fake examples, but Me also becomes the error page, blocking Settings/backup recovery housed there. Reopen and Retry instructions conflict. | Keep Settings and safe existing-backup recovery reachable from failure without replacing the failed source; retry first, recovery guidance after persistence. Distinguish loading/empty/failure/cache. | P1, Android Me failure observed + `App.tsx:754–767`; initial loading code only |

## Forms and continuity

| Flow | Finding and change | Priority / source |
|---|---|---|
| New/edit weight | New uses 48px numeric input/right-side kg; edit uses 18px and generic Edit record. Standardize field/unit/type hierarchy and specific title. Preserve red range validation; add field-specific edit errors. Scale pairing remains secondary. | P2 / validation P1; `WeightSheet.tsx:90–151`, `RecordEditSheet.tsx:32–41,90–105`, `App.css:1652–1655` |
| Food search | Large barcode button competes with search and consumes keyboard-height viewport. Make search primary, barcode a compact secondary control, and keep a clear keyboard-dismiss path. Initial automation could not hit a result; closing the keyboard completed selection, so this is not reported as a blocking app failure. | P1/P2; `FoodSheet.tsx:625–660` |
| Portion/meal edit | Keep food identity/date/meal visible near amount and fixed action. Numeric estimate should be secondary; align new/edit fields, preserve query/selection when returning, distinguish task Back from Cancel. | P1; `FoodSheet.tsx:768–846`, `IntakeEditSheet.tsx:44–58` |
| Exercise | Catalog comes first and Choose activity repeats. Show current/recent activity, duration and estimate together; change activity opens a search/list. Explain missing choice rather than relying on a strong Save action. | P1/P2; `ExerciseSheet.tsx:128–181`, `RecordEditSheet.tsx:92–101` |
| Aggregate/profile | Group long forms and locate errors at fields. Preserve aggregate identity and health-screening constraints; use a full page for long tasks if needed. Keyboard/focus/return require native acceptance, not cosmetic assumptions. | P2, partially code only; `RecordEditSheet.tsx:112–148`, `ProfileSheet.tsx` |
| Delete/recovery | Keep clear reversible-deletion explanation, confirmation, undo and trash. Use a distinct danger action and show record name/date to disambiguate history. | P2, observed confirmation + code; deleteTarget in `App.tsx`, `DiaryScreen.tsx:98–113` |

## Preserve

Keep the approved native bottom bar's shape, icons, labels, selection capsule, feedback and navigation.
Keep warm canvas, graphite text, open secondary sections, clear units and direct record actions.
Both theme modes now render across platforms; a new palette overhaul is unnecessary.
Retain truthful unlogged/read-error states, tracking-only mode, incomplete-food-total explanation, local validation, fixed form actions, draft/conflict protections and reversible deletion.
Keep calendar-based chart geometry, real fitted trend and marked gaps.
This review does not assess health formulas or change safety limits.
Keep Partner private-by-default/explicit consent; account, sharing or migration completion must be proven by actual flow acceptance, never by appearance.

## Restrained direction and starting tokens

Aim for a quiet everyday companion for two: complete one small action, understand recorded data, and support each other with consent.
One main task/summary per screen; use cards for meaningful boundaries and open rows elsewhere.
Warmth comes from words, state and a small paired mark, not glass panels, celebrations or competitive scores.
Keep the bottom bar untouched.
For content, consider reusing its navigation green for primary actions; reserve current category colors for labels/chart lines and plum for identity/relationship.
This is a design proposal to validate, not an implemented or approved palette change.

| Role | Light proposal | Dark proposal | Treatment |
|---|---|---|---|
| Canvas / surface | #F8F7F4 / #FFFFFF | #201D26 / #2B2731 | Keep current |
| Ink / secondary | #28242C / #69616B | #FAF5F3 / #CEC3CE | Keep; no opacity-based text weakening |
| Primary action | #176B50 | #84D2AF | Proposed navigation reuse; dark action text #201D26 |
| Identity / relationship | #573C58 | #D3B2D8 | Keep brand, use less often |
| Border / focus | #8B808E / #176B50 | #8B7B91 / #84D2AF | Distinguish focus from error |
| Danger | #B63D46 | #FF949C | Separate destructive role |
| Category accents | Existing food/weight/exercise/water | Existing dark equivalents | Labels/lines, fewer competing primary actions |

Spacing 4/8/12/16/24/32; screen gutters 20–24pt/dp, section gaps 24, inner gaps 8–12, field gaps 12–16.
Titles 24–27/600, sections 18/500–600, body 16/400, auxiliary 14/400; main display 36–44/500, ordinary numeric input 18–24/400–500.
Use tabular digits and aligned unit baselines; avoid KPI-scale input text.
Card radius 18–22, field/button 10–12; preserve bottom-bar radius.
CSS px/rpx are not automatically physical pt/dp/sp; validate host sizing and text scaling.

The current [Android accessibility guide](https://developer.android.com/guide/topics/ui/accessibility/apps) recommends 48×48dp mobile touch areas, 4.5:1 contrast for smaller text, and descriptions/roles conveying purpose and result.
These constrain acceptance rather than dictate a generic Material layout.
Apple HIG returned only its JavaScript requirement; no unread HIG text is cited as evidence.
44pt is a proposed iOS acceptance target, not a complete measurement here.
Screenshots do not certify full contrast/accessibility: overlay, SVG, focus, disabled, keyboard and assistive use need separate checks.

## Implementation order after authorization

1. Trust/state and native accessibility: single-point semantics, missing/loading/error/cache distinctions, real roles/actions/selected/disabled.
2. Diary/Today hierarchy: compact date navigation, one daily summary, direct recording, less repeated opening/status copy.
3. Shared new/edit fields and actions: food context, activity selection, units, keyboard viewport, local errors; preserve drafts/conflicts.
4. Partner/Me/Settings: state before welcome, shorter profile, layered management details, consistent list rhythm.
5. Chart and localization refinement: zero/one/sparse/multiple points, dates/plurals; native light/dark, Chinese/English, small screen/large text, reduced motion and assistive acceptance.

P1 means next-iteration understanding/task/usability work; P2 means expression/consistency refinement.
No observed evidence establishes a blocking P0.
Content below the fold is not proof of permanent clipping or failed scrolling.
No full redesign or implementation is delivered.
Exact screenshot timestamps/hashes, bounded automation outcomes and source anchors are in `evidence-manifest.json`, `coverage.json`, `code-anchors.json` and the evidence archive.
