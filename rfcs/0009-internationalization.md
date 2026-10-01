- Start Date: 2026-10-02
- RFC Type: feature
- Status: Accepted
- Related: 0006, 0007

# RFC 0009: Internationalization (i18n)

## Summary

Introduce a pure-TypeScript `@zzzode/i18n` package with typed message catalogs, locale
resolution and parameter interpolation, and wire the UI to render in **English** and
**Simplified Chinese**, following the device language by default with an in-app switch.

## Motivation

- The app is open source and targets both English- and Chinese-speaking users; the two
  founders are Chinese speakers. Hardcoded English excludes Chinese users and makes every
  future language an expensive, error-prone hunt for strings.
- Strings are currently hardcoded in `packages/pages`, and some are even composed inside
  the selector (`greeting`, the trend unit `kg/week`, the date label). Locale is a
  cross-cutting concern and needs one coherent home.
- Locale also changes date order and some units; doing it ad hoc later guarantees
  inconsistent screens.

If we do not do this now, the first real screen bakes English in and the retrofit cost
grows with every page.

## Guide-level explanation

- On first launch the UI follows the device language. The user can override it; the first
  slice exposes an **EN / 中** switch on Home, and a full Settings entry follows. The choice
  is per-device and is never part of any couple comparison.
- Every user-visible string is obtained through a `t(key, params?)` call; there are no raw
  sentences in components.
- Adding a language means adding one catalog with the same keys. A key-parity test fails CI
  if a translation is missing or has extra keys, so a screen can never silently render a
  fallback language.

Example:

```ts
const t = createTranslator('zh-CN');
t('macros.ofGrams', { n: 115 }); // "目标 115 克"
```

## Reference-level explanation

### Package layout

A new package `@zzzode/i18n` is pure TypeScript with no UI or native dependencies (same
constraints as `core`), built with Rslib and covered by Rstest.

```
packages/i18n/src/
  locales/en.ts        # canonical (source) catalog, `as const`
  locales/zh-CN.ts     # Simplified Chinese, identical keys
  translate.ts         # createTranslator + interpolation
  resolve-locale.ts    # system tag -> supported Locale with fallback
  format-date.ts       # locale-aware date parts formatter
  index.ts
```

### Types and catalogs

```ts
export type Locale = 'en' | 'zh-CN';
export const defaultLocale: Locale = 'en';

export const en = {
  'home.greeting.morning': 'Good morning',
  'home.greeting.afternoon': 'Good afternoon',
  'home.greeting.evening': 'Good evening',
  'home.dayStreak': 'day streak',
  'energy.title': 'Energy',
  'energy.kcalLeft': 'kcal left',
  'energy.kcalOver': 'kcal over',
  'energy.goal': 'Goal',
  'energy.food': 'Food',
  'energy.exercise': 'Exercise',
  'weight.title': 'Weight',
  'weight.kgPerWeek': 'kg/week',
  'weight.start': 'Start',
  'weight.lost': 'Lost',
  'weight.toGoal': 'To goal',
  'macros.title': 'Macros',
  'macros.protein': 'Protein',
  'macros.carbs': 'Carbs',
  'macros.fat': 'Fat',
  'macros.ofGrams': 'of {n}g',
  'action.logFood': 'Log food',
  'action.logWeight': 'Log weight',
  'notice.safeFloor': 'Your target was raised to the safe minimum.',
  'footer.disclaimer': 'LeanOn · not medical advice',
  'date.weekday.0': 'Sun', /* ... 6 */
  'date.month.0': 'Jan',   /* ... 11 */
  'date.format': '{weekday}, {month} {day}',
} as const;

export type MessageKey = keyof typeof en;
```

`zh-CN.ts` declares `satisfies Record<MessageKey, string>` so a missing/renamed key is a
compile error. The Chinese `date.format` is `'{month}月{day}日 {weekday}'`, illustrating why
the format string itself (not just words) is translated.

### Translator and interpolation

```ts
export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(locale: Locale): Translator;
```

- Lookup order: active catalog → English catalog → the raw key (so an unknown key is visible
  during development rather than rendering blank).
- Interpolation replaces `{name}` tokens; an unreferenced token is left as `{name}`.
- The translator is a pure function; ReactLynx memoizes it per locale.

### Locale resolution

```ts
export function resolveLocale(input: string | null | undefined): Locale;
```

Normalizes underscores to hyphens and lowercases; `zh` and any `zh-*` map to `zh-CN`,
`en` and `en-*` map to `en`; anything else (and null/undefined) falls back to `en`.
Traditional Chinese (`zh-TW`, `zh-HK`) maps to Simplified for now and is tracked as an open
question.

### Dates, numbers and units

- Dates are formatted from numeric parts (weekday/month/day) through `date.*` keys and the
  localized `date.format`; we do **not** depend on `Intl.DateTimeFormat`, whose coverage in
  the primjs runtime is not guaranteed.
- `kg` and `kcal` are kept as international symbols in both languages; the trend rate unit is
  localized (`kg/week` vs `公斤/周`).
- The selector stops returning pre-composed strings. It returns a `dayPart`
  (`morning|afternoon|evening`), numeric date parts, and `trendKgPerWeek`; the view composes
  localized text. This keeps `core`/selectors language-neutral.

### UI wiring

- `packages/pages` depends on `@zzzode/i18n`. The entry reads an optional `locale` from
  `lynx.__globalProps` (falling back via `resolveLocale`, then `en`), holds it in state, and
  builds the translator with `useMemo`.
- Header gains a compact **EN / 中** segmented control; switching re-renders immediately.
  Persistence of the override lands with the native settings slice.
- All components receive what they need and render via `t`; no component hardcodes a
  sentence.

### Bundle and delivery interaction

- The first slice bundles both catalogs (the message volume is a few hundred bytes), so
  switching is instant and offline.
- Later, per-locale catalogs can be split into chunks and delivered through the RFC 0007
  pipeline exactly like page bundles (signed manifest, selected by locale), keeping the base
  bundle small. The translator's fallback contract already assumes a catalog may be absent.

## Drawbacks

- Bundling both catalogs adds a small fixed size and requires per-key discipline.
- We reimplement a small subset of date/number formatting instead of using `Intl`, and must
  maintain it.
- Traditional-Chinese and other-script (e.g. RTL) users are not served yet; `zh-TW/HK` see
  Simplified Chinese.

## Rationale and alternatives

- **i18next / FormatJS**: feature-rich but heavier, with ICU machinery and runtime assumptions
  that are unproven inside Lynx; overkill for two languages. Rejected for now; the
  `createTranslator` API is intentionally small and close enough that adopting one later is
  localized to this package.
- **Rely on `Intl.DateTimeFormat` / `Intl.NumberFormat`**: simplest on paper, but primjs Intl
  coverage is uncertain and version-dependent. Rejected until verified; `format-date` is the
  deterministic bridge.
- **Per-locale bundles from day one**: correct at scale but adds manifest/build complexity
  before a second screen exists. Deferred; the fallback design keeps the door open.
- **Keep strings inside `pages`**: not reusable by cards, widgets or native surfaces and hard
  to test for parity. Rejected in favor of a standalone package.

## Unresolved questions

- Where is the language override persisted (native settings storage), and is it synced?
  Locale is a per-device preference and should default to **not** shared between partners.
- When do we add Traditional Chinese and a real plural/CLDR rule set (relevant once a string
  needs a true singular/plural form)?
- Do we later standardize on `Intl` once primjs coverage is verified, and how do we handle RTL
  languages?

## Implementation plan

1. Add `@zzzode/i18n` (catalogs, translator, resolver, date formatter), Rslib config, Rstest
   suite including en/zh-CN key parity, README (en + zh-CN).
2. Wire `packages/pages`: replace hardcoded strings, change selector outputs, add locale
   state and the Header switcher; rebuild the Lynx bundle and the Android APK.
3. Index the RFC and note the catalog location in `AGENTS.md`; verify the full CI pipeline.
