import { foods, type FoodItem } from '@zzzode/food-data';
import { formatDate } from '@zzzode/i18n';
import { datePartsFor } from '../state/select.js';
import { summarizeDiary } from '../state/diary.js';
import { formatQuantity } from '../state/theme.js';
import type { TodayState } from '../state/types.js';
import type { ScreenProps } from './types.js';

/** Daily aggregates remain honest while meal-level record identities are unavailable. */
export function DiaryScreen({ hostData, state, locale, t, actions }: Omit<ScreenProps, 'state'> & { state: TodayState | null }) {
  const summary = summarizeDiary(hostData);
  const foodById = new Map<string, FoodItem>([...foods, ...hostData.customFoods].map(food => [food.id, food]));
  const recentFoods = hostData.recentFoodIds.map(id => foodById.get(id)).filter((food): food is FoodItem => food !== undefined).slice(0, 3);
  const macros = [
    { key: 'macros.protein' as const, value: summary.proteinG },
    { key: 'macros.carbs' as const, value: summary.carbsG },
    { key: 'macros.fat' as const, value: summary.fatG },
  ];
  return <view className="Tab-pane">
    <view className="ScreenTitle"><text className="ScreenTitle-text">{t('diary.title')}</text><text className="ScreenTitle-note">{formatDate(t, datePartsFor(hostData.today))}</text></view>
    <view className="Card Diary-primary Theme-food">
      <text className="Category-label food">{t(summary.recorded ? 'design.recorded' : 'design.noIntake')}</text>
      {summary.recorded ? <view className="Energy-figure"><text className="Energy-num">{formatQuantity(summary.kcal)}</text><text className="Energy-unit">kcal</text></view> : <text className="Empty-body">{t('review.noFoodBody')}</text>}
      <view className="Action-btn primary" accessibility-element={true} accessibility-traits="button" accessibility-label={t('action.logFood')} hover-class="tap-feedback-hover" bindtap={() => actions.logFood()}><text className="Action-label primary">{t('action.logFood')}</text></view>
    </view>
    <view className="Open-section">
      <text className="Section-heading">{t('macros.title')}</text>
      {summary.recorded ? macros.map(macro => <view key={macro.key} className="Diary-macro-row"><text className="List-label">{t(macro.key)}</text><view className="Metric-figure"><text className="List-number">{formatQuantity(macro.value, macro.value % 1 === 0 ? 0 : 1)}</text><text className="Metric-unit">g</text></view></view>) : <text className="Section-note">{t('design.noIntake')}</text>}
    </view>
    {recentFoods.length > 0 && <view className="Open-section"><text className="Section-heading">{t('design.recentFoods')}</text><text className="Section-note">{t('design.recentAction')}</text><view className="Meal-recents">{recentFoods.map(food => <view key={food.id} className="Meal-recent-chip" accessibility-element={true} accessibility-traits="button" accessibility-label={`${t('action.logFood')} · ${food.name[locale]}`} hover-class="tap-feedback-hover" bindtap={() => actions.logFood(food.id)}><text className="Meal-recent-label">{food.name[locale]}</text></view>)}</view></view>}
    <text className="Section-note">{t('design.aggregateNote')}</text>
    {summary.recorded && state !== null && <view className="Open-section DiaryTotals">
      <view className="DiaryTotals-row"><text className="List-label">{t('diary.exercise')}</text><text className="List-value">−{formatQuantity(state.exerciseKcal)} kcal</text></view>
      <view className="DiaryTotals-row"><text className="List-label">{t('diary.net')}</text><text className="List-value">{formatQuantity(summary.kcal - state.exerciseKcal)} kcal</text></view>
      <view className="DiaryTotals-row"><text className="List-label">{t('diary.remaining')}</text><text className="List-value">{formatQuantity(state.remainingKcal)} kcal</text></view>
      <text className="Section-note">{t('review.nutritionNote')}</text>
    </view>}
  </view>;
}
