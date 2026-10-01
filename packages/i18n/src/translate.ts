import { en, type MessageKey } from './locales/en.js';
import { zhCN } from './locales/zh-CN.js';
import type { Locale } from './resolve-locale.js';

export type TranslateParams = Record<string, string | number>;
export type Translator = (key: MessageKey, params?: TranslateParams) => string;

type Catalog = Record<MessageKey, string>;

const catalogs: Record<Locale, Catalog> = {
  en,
  'zh-CN': zhCN,
};

const INTERPOLATION = /\{(\w+)\}/g;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }
  return template.replace(INTERPOLATION, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : token,
  );
}

/** Build a translator bound to a locale, with English then key fallback. */
export function createTranslator(locale: Locale): Translator {
  const active = catalogs[locale] ?? catalogs.en;
  return (key, params) => {
    const template = active[key] ?? en[key] ?? key;
    return interpolate(template, params);
  };
}
