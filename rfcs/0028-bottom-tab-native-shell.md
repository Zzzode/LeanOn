- Start Date: 2026-10-03
- RFC Type: architecture
- Status: Proposed
- Related: 0005, 0006, 0007, 0008, 0009, 0019, 0027

> English | [简体中文](0028-bottom-tab-native-shell.zh-CN.md)

# Bottom-Tab Navigation and Native Shell

## Summary

Reorganize the app around a native bottom tab bar with five destinations — Today, Diary,
Progress, Partner, Me — where each screen is a route-parameterized Lynx container and the
native host owns navigation, moving settings and sign-in into Me.

## Motivation

Today the whole app runs in one LynxView; top-level navigation is a Lynx-drawn segmented
control plus a gear that overlays a settings screen. This diverges from platform conventions:
primary destinations are not reachable from a persistent, system-standard place; the language
switcher sits on every page; sign-in has no home; switching destinations loses in-screen
state; and there is no per-screen back stack.

Leading health and fitness apps use a native bottom tab bar for the four or five primary
roles, preserve each tab's navigation stack and scroll position, and place settings and
account inside a profile tab. Without this change, adding the diary, partner and profile
surfaces would pile more modes into one container, increasing cognitive load as the app gains
capabilities.

## Guide-level explanation

- The app opens on Today. A persistent bottom bar shows five tabs: Today, Diary, Progress,
  Partner, Me. Tapping a tab switches instantly and preserves that tab's state (scroll
  position, entered data, its own back stack).
- Today is the at-a-glance dashboard: energy ring, macros, water, weight snapshot, activity
  and diet quality.
- Diary is the food journal: meals for the day, add food (search, barcode, custom) and a
  bottom summary of Food minus Exercise equals Net/Remaining.
- Progress is the upgraded insights surface: weight curve with the goal line, energy deficit,
  adherence, milestones, goal projection and weekly/monthly reports.
- Partner is the two-person surface: both people's today, shared goals, gentle comparison and
  cheer/hug/note actions.
- Me is the profile tab: avatar and profile, goals, dietary preferences, health app,
  connected scale, reminders, settings (language, units, theme, about) and data export. When
  signed out it shows a guest-first sign-in card; the app remains fully usable locally without
  an account.
- Language switching lives only in Me then Settings, not on every page.

## Reference-level explanation

### Route-driven Lynx containers

- Every screen is one native screen object that hosts a LynxView loading the same bundle. The
  screen to render is chosen by a `route` string passed in bootstrap data, not by in-Lynx tab
  state.
- Bootstrap data gains a `route` field, generalizing the existing `initialRoute` test hook:
  `BootstrapData = { hostData, locale, route }`.
- The pages root reads `route`:
  - a known route renders exactly that screen;
  - an absent or unknown route (web preview, older host) renders a developer shell with a
    Lynx-drawn tab bar used only for local development and web preview. This keeps the web
    bundle and older single-container hosts working during migration.
- Modal quick-logging tasks (weight, exercise, food, water sheets) stay as in-screen Lynx
  modals on the screen that launched them. Whole destinations (Settings, Goals, food search)
  are pushed by the native navigation stack as new route containers instead of toggling an
  in-Lynx mode.

### Routing table

- Primary tabs: `today`, `diary`, `progress`, `partner`, `me`.
- Pushed pages, initial set: `settings`, `goals`, `profile-edit`, `health-connections`,
  `food-search`. Others (metric detail, scale pairing) are added as their features land; scale
  pairing may remain a sheet.

### iOS

- Root is a `RootTabBarController: UITabBarController` with five tabs. Each tab is a
  `UINavigationController` whose root is `LynxContainerViewController(route:)`. Pushed pages
  are additional `LynxContainerViewController(route:)` on that navigation stack.
- Tabs are built lazily; each container owns an independent LynxView (same bundle) laid out in
  the safe area as today. The system provides the tab bar, transitions, swipe-back and per-tab
  state.
- `SceneDelegate` sets the tab bar controller as `rootViewController` instead of a single
  container.
- `ServiceRegistry` remains the shared singleton holding the records store. The event
  dispatcher keeps the list of mounted LynxViews and fans `records.changed` out to all of
  them; containers bind on load and unbind on deallocation. Each container reads a fresh
  HostData on load, then updates from fan-out events.

### Android

- `MainActivity` hosts a Material 3 `NavigationBar` driven by Jetpack Navigation: a
  `NavHostFragment` with a navigation graph of five primary destinations. Each destination is
  a `LynxContainerFragment` that builds a LynxView parameterized by route. Pushed pages are
  additional destinations or fragments.
- `NavigationUI` wires the bar, labels, per-tab back stacks and state preservation; fragments
  retain their view state.
- Shared singletons stay on `LeanOnApplication` (records, events, capabilities). The
  dispatcher fans change events to mounted fragment views, binding on view creation and
  unbinding on destruction.

### State and data fan-out

- Native writes already dispatch `records.changed` with a fresh HostData. With multiple
  containers, the host broadcasts that event to every mounted LynxView so all tabs stay
  consistent; the foreground tab reflects the change immediately.
- Containers created after a write read the latest snapshot on load, so ordering is safe.

### Sign-in and Me

- The app is guest-first and local-first: no account is required to log. Me shows a sign-in
  card explaining backup, cross-device sync and partner linking; signing in is a Me action,
  never a blocking gate. Account and sync mechanics follow RFC 0008.

## Drawbacks

- Five LynxViews, one per mounted tab, cost more memory and have a first-visit load cost
  versus a single reused view; lazy construction and system reuse mitigate this.
- Native navigation is less dynamically reconfigurable than a fully Lynx-drawn shell: the set
  and order of primary tabs ship with the app. Dynamic delivery still applies to the content
  within each tab (RFC 0007).
- It is a larger, cross-platform refactor of hosts that currently assume one container, and it
  temporarily requires a developer-shell fallback.

## Rationale and alternatives

- Native tab shell versus a single LynxView with a Lynx-drawn tab bar: native gives
  platform-standard appearance and motion, accessibility (Dynamic Type, large content,
  VoiceOver/TalkBack focus), guaranteed per-tab state and back stacks, and correct
  safe-area/keyboard handling. A Lynx-drawn bar is retained only for web and developer
  preview.
- Versus a top-level segmented control or hamburger menu: bottom tabs make all primary roles
  one tap away; a segmented control only supports two peers and a drawer hides destinations.
- Versus per-platform fully native screens: that would duplicate the UI twice and lose shared
  Lynx rendering and dynamic content; route containers keep one UI codebase while native owns
  navigation.
- Flutter or another cross-platform shell was previously rejected; Lynx by Native is the
  established architecture.

## Unresolved questions

- Exact memory and startup behavior of five simultaneous LynxViews on low-end Android
  (validate; consider view recycling or keeping only the most recent tabs alive).
- Whether primary-tab configuration ever needs remote control and, if so, the safe fallback
  policy (default: fixed tabs for v1).
- Partner tab data source before account/sync lands: a local second profile versus a
  clearly-labeled preview state.

## Implementation plan

Vertical slices; each is type-checked, built and verified on both platforms where applicable.

1. Pages route architecture: add `route` to bootstrap and contracts; create TodayScreen,
   DiaryScreen, ProgressScreen, PartnerScreen and MeScreen and migrate existing content
   (Today = current dashboard; Progress = current insights; Me = profile plus current
   settings); render a single screen by route and keep a Lynx tab bar only in the
   developer/web shell. Verify web preview and no regression on current hosts.
2. iOS native shell: RootTabBarController, five navigation stacks with route containers,
   Settings push and multi-view event fan-out; verify five tabs in the simulator.
3. Android native shell: NavigationBar plus Navigation graph, route fragments and per-tab back
   stacks; verify on the emulator.
4. Cross-platform polish: pushed sub-pages, state preservation, accessibility and CI
   updates; full dual-platform verification.

Follow-up work:

- Food entries and meals: the current `IntakeSample` stores only daily totals
  (kcal/macros/micros) with no meal or per-food entries; the full Diary (per-meal food items,
  servings, edit) needs a data-model extension in a later RFC.
- Partner data: real two-person records depend on account linking and sync (RFC 0008); until
  then Partner shows the framework with local or preview content.
- Persisted locale, unit and theme preferences read at launch and applied through Me then
  Settings.
