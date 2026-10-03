import { InsightsScreen } from '../components/InsightsScreen.js';
import type { ScreenProps } from './types.js';

/** Weight curve, deficit, adherence and reports (upgraded insights). */
export function ProgressScreen({ hostData, state, t }: ScreenProps) {
  return (
    <view className="Tab-pane">
      <view className="ScreenTitle">
        <text className="ScreenTitle-text">{t('progress.title')}</text>
      </view>
      <InsightsScreen
        hostData={hostData}
        budgetKcal={state.energyGoalKcal}
        t={t}
      />
    </view>
  );
}
