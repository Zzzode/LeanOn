import type { MessageKey, Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types.js';
import { Card } from './Card.js';

interface MacroItem {
  key: 'protein' | 'carbs' | 'fat';
  labelKey: MessageKey;
  grams: number;
  targetGrams: number;
}

export function MacroCard({ state, t }: { state: TodayState; t: Translator }) {
  const items: MacroItem[] = [
    { key: 'protein', labelKey: 'macros.protein', ...state.macros.protein },
    { key: 'carbs', labelKey: 'macros.carbs', ...state.macros.carbs },
    { key: 'fat', labelKey: 'macros.fat', ...state.macros.fat },
  ];
  return (
    <Card className="Open-section Macro-card">
      <text className="Card-title">{t('macros.title')}</text>
      <view className="Macro-grid">
        {items.map((it) => (
          <view className="Macro-col" key={it.key}>
            <text className="Macro-grams">{it.grams}</text>
            <text className="Macro-label">{t(it.labelKey)}</text>
            <text className="Macro-target">
              {t('macros.ofGrams', { n: it.targetGrams })}
            </text>
          </view>
        ))}
      </view>
    </Card>
  );
}
