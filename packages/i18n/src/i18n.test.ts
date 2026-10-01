import { expect, test } from '@rstest/core';
import {
  createTranslator,
  defaultLocale,
  formatDate,
  resolveLocale,
} from './index.js';

test('default locale is English', () => {
  expect(defaultLocale).toBe('en');
});

test('createTranslator returns English and Chinese messages', () => {
  expect(createTranslator('en')('energy.title')).toBe('Energy');
  expect(createTranslator('zh-CN')('energy.title')).toBe('能量');
});

test('interpolates parameters', () => {
  expect(createTranslator('en')('macros.ofGrams', { n: 115 })).toBe('of 115g');
  expect(createTranslator('zh-CN')('macros.ofGrams', { n: 115 })).toBe(
    '目标 115 克',
  );
});

test('leaves a missing placeholder intact', () => {
  expect(createTranslator('en')('macros.ofGrams')).toBe('of {n}g');
});

const resolverCases: Array<[string | null | undefined, string]> = [
  ['en', 'en'],
  ['en-US', 'en'],
  ['en_US', 'en'],
  ['zh', 'zh-CN'],
  ['zh-CN', 'zh-CN'],
  ['zh_Hans_CN', 'zh-CN'],
  ['zh-TW', 'zh-CN'],
  ['fr', 'en'],
  [undefined, 'en'],
  [null, 'en'],
];

for (const [input, expected] of resolverCases) {
  test(`resolveLocale(${input ?? 'null'}) -> ${expected}`, () => {
    expect(resolveLocale(input)).toBe(expected);
  });
}

test('formats dates with locale-specific order', () => {
  const parts = { weekday: 4, month: 9, day: 1 };
  expect(formatDate(createTranslator('en'), parts)).toBe('Thu, Oct 1');
  expect(formatDate(createTranslator('zh-CN'), parts)).toBe('10月1日 周四');
});
