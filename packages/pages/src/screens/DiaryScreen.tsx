import type { ScreenProps } from './types.js';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

/**
 * Food journal: meal sections for the day and a bottom energy summary.
 * Per-meal food entries arrive with the food-entries data model; until then
 * each meal shows an add action and the day totals use the aggregated intake.
 */
export function DiaryScreen({ state, t, actions }: ScreenProps) {
  const netKcal = state.foodKcal - state.exerciseKcal;
  return (
    <view className="Tab-pane">
      <view className="ScreenTitle">
        <text className="ScreenTitle-text">{t('diary.title')}</text>
      </view>

      <view className="Card">
        <view className="DiarySummary-head">
          <text className="DiarySummary-label">{t('diary.food')}</text>
          <text className="DiarySummary-kcal">{state.foodKcal}</text>
        </view>
        <view className="DiaryMacros">
          <text className="DiaryMacros-item">
            {state.macros.protein.grams}g {t('macros.protein')}
          </text>
          <text className="DiaryMacros-item">
            {state.macros.carbs.grams}g {t('macros.carbs')}
          </text>
          <text className="DiaryMacros-item">
            {state.macros.fat.grams}g {t('macros.fat')}
          </text>
        </view>
      </view>

      {MEALS.map((meal) => (
        <view key={meal} className="Card MealCard">
          <view className="Meal-head">
            <text className="Meal-name">{t(`diary.${meal}`)}</text>
            <view className="Meal-add" bindtap={actions.logFood}>
              <text className="Meal-add-text">+ {t('diary.addFood')}</text>
            </view>
          </view>
          <text className="Meal-empty">{t('diary.emptyMeal')}</text>
        </view>
      ))}

      <view className="Card DiaryTotals">
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label">{t('diary.food')}</text>
          <text className="DiaryTotals-value">{state.foodKcal}</text>
        </view>
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label">{t('diary.exercise')}</text>
          <text className="DiaryTotals-value">−{state.exerciseKcal}</text>
        </view>
        <view className="DiaryTotals-line"></view>
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label">{t('diary.net')}</text>
          <text className="DiaryTotals-value">{netKcal}</text>
        </view>
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label DiaryTotals-strong">
            {t('diary.remaining')}
          </text>
          <text className="DiaryTotals-value DiaryTotals-strong">
            {state.remainingKcal}
          </text>
        </view>
      </view>
    </view>
  );
}
