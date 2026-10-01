import type { Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types.js';
import { Card } from './Card.js';
import { ProgressBar } from './ProgressBar.js';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <view className="Weight-stat">
      <text className="Weight-stat-value">{value}</text>
      <text className="Weight-stat-label">{label}</text>
    </view>
  );
}

export function WeightCard({ state, t }: { state: TodayState; t: Translator }) {
  const total = state.startWeightKg - state.goalWeightKg;
  const fraction = total > 0 ? state.weightLostKg / total : 0;
  const value = state.trendKgPerWeek;
  const sign = value > 0 ? '+' : '';
  const trendText = `${sign}${value.toFixed(1)} ${t('weight.kgPerWeek')}`;
  return (
    <Card>
      <text className="Card-title">{t('weight.title')}</text>
      <view className="Weight-main">
        <view className="Weight-current-wrap">
          <text className="Weight-current">
            {state.currentWeightKg.toFixed(1)}
          </text>
          <text className="Weight-unit">kg</text>
        </view>
        <text className="Weight-trend">{trendText}</text>
      </view>
      <view className="Weight-rows">
        <Stat label={t('weight.start')} value={state.startWeightKg.toFixed(1)} />
        <Stat label={t('weight.lost')} value={state.weightLostKg.toFixed(1)} />
        <Stat label={t('weight.toGoal')} value={state.weightToGoalKg.toFixed(1)} />
      </view>
      <ProgressBar fraction={fraction} />
    </Card>
  );
}
