import { foods } from '@zzzode/food-data';
import type { FoodItem } from '@zzzode/food-data';
import type { ScreenProps } from './types.js';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

/** How many recent foods to offer as quick-add chips on empty meals. */
const RECENT_FOOD_LIMIT = 3;

/**
 * Food journal: meal sections for the day and a bottom energy summary.
 * Per-meal food entries arrive with the food-entries data model; until then
 * each meal shows an add action and the day totals use the aggregated intake.
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
            <view
              className="Meal-add"
              hover-class="tap-feedback-hover"
              bindtap={() => actions.logFood()}
            >
              <text className="Meal-add-text">+ {t('diary.addFood')}</text>
            </view>
          </view>
          <view
            className="Meal-empty-body"
            hover-class="tap-feedback-hover"
            bindtap={() => actions.logFood()}
          >
            <text className="Meal-empty-icon">+</text>
            <text className="Meal-empty-text">{t('diary.tapToAdd')}</text>
            {recentFoods.length > 0 && (
              <view className="Meal-recents">
                {recentFoods.map((food) => (
                  <view
                    key={food.id}
                    className="Meal-recent-chip"
                    hover-class="tap-feedback-hover"
                    catchtap={() => actions.logFood(food.id)}
                  >
                    <text className="Meal-recent-label">{food.name[locale]}</text>
                  </view>
                ))}
              </view>
            )}
          </view>
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
