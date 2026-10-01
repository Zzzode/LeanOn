import { expect, test } from '@rstest/core';
import { en, type MessageKey } from './locales/en.js';
import { zhCN } from './locales/zh-CN.js';

test('catalogs have identical key sets', () => {
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zhCN).sort();
  expect(zhKeys).toEqual(enKeys);
});

test('no catalog message is empty', () => {
  for (const [key, value] of Object.entries(en)) {
    expect(value, `en ${key}`).not.toBe('');
  }
  for (const [key, value] of Object.entries(zhCN)) {
    expect(value, `zh-CN ${key}`).not.toBe('');
  }
});

test('parameterized messages declare the same placeholders in every locale', () => {
  const placeholders = (s: string): string[] =>
    (s.match(/\{(\w+)\}/g) ?? []).slice().sort();
  for (const key of Object.keys(en) as MessageKey[]) {
    expect(placeholders(zhCN[key]), key).toEqual(placeholders(en[key]));
  }
});
