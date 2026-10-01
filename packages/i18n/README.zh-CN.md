# @zzzode/i18n

[English](README.md) · 简体中文

LeanOn 的国际化层：类型化消息目录、语言解析与参数插值，不依赖 UI 或原生。

## 支持语言

| 语言 | 标识 | 来源 |
|---|---|---|
| 英文（默认） | `en` | `src/locales/en.ts` |
| 简体中文 | `zh-CN` | `src/locales/zh-CN.ts` |

## 用法

```ts
import { createTranslator, formatDate, resolveLocale } from '@zzzode/i18n';

const locale = resolveLocale(systemLanguageTag); // 'zh-Hans-CN' -> 'zh-CN'
const t = createTranslator(locale);
t('energy.title');                               // 'Energy' / '能量'
t('macros.ofGrams', { n: 115 });                 // 'of 115g' / '目标 115 克'

formatDate(t, { weekday: 4, month: 9, day: 1 }); // 'Thu, Oct 1' / '10月1日 周四'
```

## 约定

- 英文是权威目录：先在 `en.ts` 增加 key，再补其他目录；key 一致性测试会在漏翻或多出 key 时让 CI 失败。
- 查找依次回退到英文、原始 key；参数用 `{name}`。
- 日期通过目录格式化，不依赖 `Intl`；详见 RFC 0009。

参见 [`rfcs/0009-internationalization.zh-CN.md`](../../rfcs/0009-internationalization.zh-CN.md)。
