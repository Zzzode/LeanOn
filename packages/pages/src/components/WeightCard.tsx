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

export function WeightCard({ state }: { state: TodayState }) {
  const total = state.startWeightKg - state.goalWeightKg;
  const fraction = total > 0 ? state.weightLostKg / total : 0;
  return (
    <Card>
      <text className="Card-title">Weight</text>
      <view className="Weight-main">
        <view className="Weight-current-wrap">
          <text className="Weight-current">{state.currentWeightKg.toFixed(1)}</text>
          <text className="Weight-unit">kg</text>
        </view>
        <text className="Weight-trend">{state.trendLabel}</text>
      </view>
      <view className="Weight-rows">
        <Stat label="Start" value={state.startWeightKg.toFixed(1)} />
        <Stat label="Lost" value={state.weightLostKg.toFixed(1)} />
        <Stat label="To goal" value={state.weightToGoalKg.toFixed(1)} />
      </view>
      <ProgressBar fraction={fraction} />
    </Card>
  );
}
