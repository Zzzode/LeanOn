# @zzzode/i18n

English · [简体中文](README.zh-CN.md)

LeanOn's internationalization layer — typed message catalogs, locale resolution and
parameter interpolation, with no UI or native dependencies.

## Supported locales

| Locale | Tag | Source |
|---|---|---|
| English (default) | `en` | `src/locales/en.ts` |
| 简体中文 | `zh-CN` | `src/locales/zh-CN.ts` |

## Usage

```ts
import { createTranslator, formatDate, resolveLocale } from '@zzzode/i18n';

const locale = resolveLocale(systemLanguageTag); // 'zh-Hans-CN' -> 'zh-CN'
const t = createTranslator(locale);
t('energy.title');                               // 'Energy' / '能量'
t('macros.ofGrams', { n: 115 });                 // 'of 115g' / '目标 115 克'

formatDate(t, { weekday: 4, month: 9, day: 1 }); // 'Thu, Oct 1' / '10月1日 周四'
```

## Conventions

- English is the canonical catalog: add a key in `en.ts` first, then every other catalog.
  A key-parity test fails CI on missing or extra keys.
- Lookup falls back to English and then the raw key; use `{name}` for parameters.
- Dates are formatted through the catalog with no `Intl` dependency; see RFC 0009.

See [`rfcs/0009-internationalization.md`](../../rfcs/0009-internationalization.md).
