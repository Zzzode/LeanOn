import { foods } from '@zzzode/food-data';
import type { FoodItem } from '@zzzode/food-data';
import type { ScreenProps } from './types.js';


/** How many recent foods to offer as quick-add chips on empty meals. */
const RECENT_FOOD_LIMIT = 3;

/**
 * Food journal backed by the existing daily aggregates.
 * Meal-level attribution is unavailable; never render fabricated empty meals.
 */
export function DiaryScreen({ hostData, state, locale, t, actions }: ScreenProps) {
  const netKcal = state.foodKcal - state.exerciseKcal;
  const foodById = new Map<string, FoodItem>(
    [...foods, ...hostData.customFoods].map((food) => [food.id, food]),
  );
  const recentFoods = hostData.recentFoodIds
    .map((id) => foodById.get(id))
    .filter((food): food is FoodItem => food !== undefined)
    .slice(0, RECENT_FOOD_LIMIT);
  return (
    <view className="Tab-pane">
      <view className="ScreenTitle">
        <text className="ScreenTitle-text">{t('diary.title')}</text>
      </view>

      <view className="Card">
        <view className="DiarySummary-head">
          <text className="DiarySummary-label">{t('diary.food')}</text>
          <text className="DiarySummary-kcal">{state.foodKcal} {t('insights.kcal')}</text>
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

      <view className="Card">
        <text className="Card-title">{t('review.dailySummary')}</text>
        <text className="Section-note">{t(state.foodKcal > 0 ? 'review.aggregateBody' : 'review.noFoodBody')}</text>
        <view className="Action-btn primary" bindtap={() => actions.logFood()}>
          <text className="Action-label primary">{t('action.logFood')}</text>
        </view>
        {recentFoods.length > 0 && <view className="Meal-recents">{recentFoods.map(food => (
          <view key={food.id} className="Meal-recent-chip" bindtap={() => actions.logFood(food.id)}>
            <text className="Meal-recent-label">{food.name[locale]}</text>
          </view>
        ))}</view>}
      </view>

      <view className="Card DiaryTotals">
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label">{t('diary.food')}</text>
          <text className="DiaryTotals-value">{state.foodKcal} {t('insights.kcal')}</text>
        </view>
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label">{t('diary.exercise')}</text>
          <text className="DiaryTotals-value">−{state.exerciseKcal} {t('insights.kcal')}</text>
        </view>
        <view className="DiaryTotals-line"></view>
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label">{t('diary.net')}</text>
          <text className="DiaryTotals-value">{netKcal} {t('insights.kcal')}</text>
        </view>
        <view className="DiaryTotals-row">
          <text className="DiaryTotals-label DiaryTotals-strong">
            {t('diary.remaining')}
          </text>
          <text className="DiaryTotals-value DiaryTotals-strong">
            {state.remainingKcal} {t('insights.kcal')}
          </text>
        </view>
      </view>
    </view>
  );
}
