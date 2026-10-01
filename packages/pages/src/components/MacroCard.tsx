import type { TodayState } from '../state/types.js';
import { Card } from './Card.js';
import { ProgressBar } from './ProgressBar.js';

const COLORS = {
  protein: '#218967',
  carbs: '#58AB8D',
  fat: '#8FC2AE',
} as const;

export function MacroCard({ state }: { state: TodayState }) {
  const items = [
    { key: 'protein', ...state.macros.protein },
    { key: 'carbs', ...state.macros.carbs },
    { key: 'fat', ...state.macros.fat },
  ] as const;
  return (
    <Card>
      <text className="Card-title">Macros</text>
      <view className="Macro-grid">
        {items.map((it) => (
          <view className="Macro-col" key={it.key}>
            <text className="Macro-grams">{it.grams}</text>
            <text className="Macro-label">{it.label}</text>
            <ProgressBar
              fraction={it.targetGrams > 0 ? it.grams / it.targetGrams : 0}
              color={COLORS[it.key]}
            />
            <text className="Macro-target">of {it.targetGrams}g</text>
          </view>
        ))}
      </view>
    </Card>
  );
}
