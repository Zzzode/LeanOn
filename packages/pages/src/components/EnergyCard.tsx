import type { Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types.js';
import { formatQuantity } from '../state/theme.js';
import { Card } from './Card.js';
import { ProgressBar } from './ProgressBar.js';
import { useTheme } from './ThemeContext.js';

export function EnergyCard({ state, t, hasIntake = true }: { state: TodayState; t: Translator; hasIntake?: boolean }) {
  const palette = useTheme();
  return <Card className="Energy-card">
    <view className="Summary-heading">
      <text className="Category-label food">{t('design.foodToday')}</text>
      <text className="Summary-status">{t(hasIntake ? 'design.recorded' : 'design.noIntake')}</text>
    </view>
    {hasIntake ? <view className="Energy-figure">
      <text className="Energy-num">{formatQuantity(state.foodKcal)}</text><text className="Energy-unit">kcal</text>
    </view> : <text className="Empty-title">{t('design.noIntake')}</text>}
    {hasIntake && <ProgressBar fraction={state.foodKcal / Math.max(1, state.energyGoalKcal + state.exerciseKcal)} color={palette.food} />}
    <view className="Energy-reference-row">
      <text className="Energy-reference">{t('design.reference', { n: formatQuantity(state.energyGoalKcal) })}</text>
      <text className="Energy-reference exercise">{t('design.movementEstimate', { n: formatQuantity(state.exerciseKcal) })}</text>
    </view>
    {hasIntake ? <text className="Energy-remaining">{formatQuantity(Math.abs(state.remainingKcal))} {t(state.overBudget ? 'energy.kcalOver' : 'energy.kcalLeft')}</text>
      : <text className="Section-note">{t('review.noFoodBody')}</text>}
  </Card>;
}
