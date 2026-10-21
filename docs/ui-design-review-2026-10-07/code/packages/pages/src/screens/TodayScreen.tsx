import { EnergyCard } from '../components/EnergyCard.js';
import { ExerciseCard } from '../components/ExerciseCard.js';
import { GreetingHeader } from '../components/GreetingHeader.js';
import { MacroCard } from '../components/MacroCard.js';
import { MicrosCard } from '../components/MicrosCard.js';
import { QuickActions } from '../components/QuickActions.js';
import { WaterCard } from '../components/WaterCard.js';
import { WeightCard } from '../components/WeightCard.js';
import { BrandHeader } from '../components/BrandHeader.js';
import { formatQuantity } from '../state/theme.js';
import type { ScreenProps } from './types.js';

/** One daily summary, open secondary metrics, then detailed records. */
export function TodayScreen({ state, hostData, locale, t, actions, supports }: ScreenProps) {
  const hasIntake = hostData.intake.some(record => record.date === hostData.today);
  return <view className="Tab-pane">
    <BrandHeader />
    <GreetingHeader state={state} t={t} />
    <QuickActions t={t} onLogFood={actions.logFood} onLogWeight={actions.logWeight} onLogExercise={actions.logExercise} />
    <EnergyCard state={state} t={t} hasIntake={hasIntake} />
    {!state.safe && <view className="Notice"><text className="Notice-text">{t('notice.safeFloor')}</text></view>}
    <view className="Today-metrics">
      <WeightCard state={state} t={t} compact />
      <view className="Metric-activity">
        <text className="Category-label exercise">{t('exerciseCard.title')}</text>
        <view className="Metric-figure"><text className="Metric-number">{formatQuantity(state.exerciseMin)}</text><text className="Metric-unit">{t('exerciseCard.min')}</text></view>
        <text className="Metric-note exercise">{formatQuantity(state.exerciseKcal)} kcal · {t('review.estimatedEnergy')}</text>
      </view>
    </view>
    <WaterCard today={hostData.today} water={hostData.water} currentWeightKg={state.currentWeightKg} t={t} available={supports?.('records.mutate') ?? false} onSetTotal={actions.setWaterTotal} />
    <MacroCard state={state} t={t} />
    <ExerciseCard state={state} locale={locale} t={t} onEdit={actions.editExercise} onDelete={actions.deleteExercise} />
    <MicrosCard today={hostData.today} intake={hostData.intake} energyGoalKcal={state.energyGoalKcal} t={t} />
    <WeightCard state={state} t={t} />
    <text className="Footer">{t('footer.disclaimer')}</text>
  </view>;
}
