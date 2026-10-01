import type { TodayState } from '../state/types.js';
import { Card } from './Card.js';
import { ProgressBar } from './ProgressBar.js';

function Row({ label, value }: { label: string; value: number }) {
  const text = value > 0 ? `+${value}` : `${value}`;
  return (
    <view className="Energy-row">
      <text className="Energy-row-label">{label}</text>
      <text className="Energy-row-value">{text}</text>
    </view>
  );
}

export function EnergyCard({ state }: { state: TodayState }) {
  const usedFraction = 1 - state.remainingFraction;
  const accent = state.overBudget ? '#E0594B' : '#218967';
  return (
    <Card>
      <text className="Card-title">Energy</text>
      <view className="Energy-main">
        <view className="Energy-headline">
          <text
            className="Energy-num"
            style={state.overBudget ? { color: '#E0594B' } : undefined}
          >
            {Math.abs(state.remainingKcal)}
          </text>
          <text className="Energy-unit">
            {state.overBudget ? 'kcal over' : 'kcal left'}
          </text>
        </view>
        <view className="Energy-rows">
          <Row label="Goal" value={state.energyGoalKcal} />
          <Row label="Food" value={-state.foodKcal} />
          <Row label="Exercise" value={state.exerciseKcal} />
        </view>
      </view>
      <ProgressBar fraction={usedFraction} color={accent} />
    </Card>
  );
}
