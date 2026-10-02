import type { MessageKey, Translator } from '@zzzode/i18n';
import {
  microsForDate,
  recommendMicroGoals,
  type IntakeSample,
} from '@zzzode/core';
import { Card } from './Card.js';

interface MicrosCardProps {
  today: string;
  intake: IntakeSample[];
  energyGoalKcal: number;
  t: Translator;
}

type Status = 'good' | 'bad' | 'neutral';

interface MicroRow {
  key: string;
  labelKey: MessageKey;
  value: number;
  goal: number;
  unit: 'g' | 'mg';
  status: Status;
}

/**
 * Daily diet-quality summary (RFC 0024): fiber is a goal to reach (green at the
 * target), while sugar, saturated fat and sodium are ceilings (red over the
 * limit). Reuses the macro column grid for a compact four-up layout.
 */
export function MicrosCard({
  today,
  intake,
  energyGoalKcal,
  t,
}: MicrosCardProps) {
  const current = microsForDate(intake, today);
  const goals = recommendMicroGoals(energyGoalKcal);

  const rows: MicroRow[] = [
    {
      key: 'fiber',
      labelKey: 'micros.fiber',
      value: current.fiberG,
      goal: goals.fiberG,
      unit: 'g',
      status: current.fiberG >= goals.fiberG ? 'good' : 'neutral',
    },
    {
      key: 'sugar',
      labelKey: 'micros.sugar',
      value: current.sugarG,
      goal: goals.sugarG,
      unit: 'g',
      status: current.sugarG > goals.sugarG ? 'bad' : 'neutral',
    },
    {
      key: 'satFat',
      labelKey: 'micros.saturatedFat',
      value: current.saturatedFatG,
      goal: goals.saturatedFatG,
      unit: 'g',
      status: current.saturatedFatG > goals.saturatedFatG ? 'bad' : 'neutral',
    },
    {
      key: 'sodium',
      labelKey: 'micros.sodium',
      value: current.sodiumMg,
      goal: goals.sodiumMg,
      unit: 'mg',
      status: current.sodiumMg > goals.sodiumMg ? 'bad' : 'neutral',
    },
  ];

  return (
    <Card>
      <text className="Card-title">{t('micros.title')}</text>
      <view className="Macro-grid">
        {rows.map((r) => (
          <view className="Macro-col" key={r.key}>
            <text className={`Micros-val ${r.status}`}>{r.value}</text>
            <text className="Macro-label">{t(r.labelKey)}</text>
            <text className="Macro-target">
              {r.unit === 'g'
                ? t('micros.ofGrams', { n: r.goal })
                : t('micros.ofMg', { n: r.goal })}
            </text>
          </view>
        ))}
      </view>
    </Card>
  );
}

// Re-exported for type-checking of the label key union (kept in sync with i18n).
export type MicrosLabelKey = Extract<MessageKey, `micros.${string}`>;
