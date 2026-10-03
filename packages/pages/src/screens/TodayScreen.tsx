import { EnergyCard } from '../components/EnergyCard.js';
import { ExerciseCard } from '../components/ExerciseCard.js';
import { GreetingHeader } from '../components/GreetingHeader.js';
import { MacroCard } from '../components/MacroCard.js';
import { MicrosCard } from '../components/MicrosCard.js';
import { QuickActions } from '../components/QuickActions.js';
import { WaterCard } from '../components/WaterCard.js';
import { WeightCard } from '../components/WeightCard.js';
import type { ScreenProps } from './types.js';

/** At-a-glance dashboard: energy, weight, macros, water, activity, quality. */
export function TodayScreen({ state, hostData, locale, t, actions }: ScreenProps) {
  return (
    <view className="Tab-pane">
      <GreetingHeader state={state} t={t} />
      <EnergyCard state={state} t={t} />
      {!state.safe && (
        <view className="Notice">
          <text className="Notice-text">{t('notice.safeFloor')}</text>
        </view>
      )}
      <WeightCard state={state} t={t} />
      <MacroCard state={state} t={t} />
      <MicrosCard
        today={hostData.today}
        intake={hostData.intake}
        energyGoalKcal={state.energyGoalKcal}
        t={t}
      />
      <WaterCard
        today={hostData.today}
        water={hostData.water}
        currentWeightKg={state.currentWeightKg}
        t={t}
        onSetTotal={actions.setWaterTotal}
      />
      <ExerciseCard
        state={state}
        locale={locale}
        t={t}
        onEdit={actions.editExercise}
        onDelete={actions.deleteExercise}
      />
      <QuickActions
        t={t}
        onLogFood={actions.logFood}
        onLogWeight={actions.logWeight}
        onLogExercise={actions.logExercise}
      />
      <text className="Footer">{t('footer.disclaimer')}</text>
    </view>
  );
}
