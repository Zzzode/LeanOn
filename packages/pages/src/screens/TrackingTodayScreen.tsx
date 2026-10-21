import { exercises } from '@zzzode/exercise-data';
import { microsForDate } from '@zzzode/core';
import type { Locale, Translator } from '@zzzode/i18n';
import { QuickActions } from '../components/QuickActions.js';
import { WaterCard } from '../components/WaterCard.js';
import { BrandHeader } from '../components/BrandHeader.js';
import { formatQuantity } from '../state/theme.js';
import type { HostData } from '../state/types.js';
import type { ScreenActions } from './types.js';

/** Factual records stay useful when personal loss guidance is unavailable or unsafe. */
export function TrackingTodayScreen({hostData,locale,t,actions,waterAvailable}:{hostData:HostData;locale:Locale;t:Translator;actions:ScreenActions;waterAvailable:boolean}) {
  const meals=hostData.intake.filter(item=>item.date===hostData.today);
  const kcal=meals.reduce((sum,item)=>sum+item.kcal,0);
  const macros=meals.reduce((sum,item)=>({proteinG:sum.proteinG+item.macros.proteinG,carbsG:sum.carbsG+item.macros.carbsG,fatG:sum.fatG+item.macros.fatG}),{proteinG:0,carbsG:0,fatG:0});
  const micros=microsForDate(hostData.intake,hostData.today);
  const weights=hostData.weights.filter(item=>item.date<=hostData.today).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const last=weights[weights.length-1];
  const sessions=hostData.exercises.filter(item=>item.date===hostData.today);
  return <view>
    <BrandHeader/>
    <QuickActions t={t} onLogFood={()=>actions.logFood()} onLogWeight={actions.logWeight} onLogExercise={actions.logExercise}/>
    <view className="Card Theme-food"><view className="Summary-heading"><text className="Category-label food">{t('design.foodToday')}</text><text className="Summary-status">{t(meals.length>0?'design.recorded':'design.noIntake')}</text></view>
      {meals.length>0?<view className="Energy-figure"><text className="Energy-num">{formatQuantity(kcal)}</text><text className="Energy-unit">kcal</text></view>:<text className="Empty-body">{t('design.noIntake')}</text>}
      <text className="Section-note">{t('review.nutritionNote')}</text>
    </view>
    <view className="Open-section"><text className="Section-heading">{t('closure.recordedWeight')}</text><text className="List-value">{last===undefined?t('closure.noWeight'):`${formatQuantity(last.weightKg,1)} kg`}</text>{last!==undefined&&<text className="Section-note">{last.date}</text>}</view>
    <WaterCard today={hostData.today} water={hostData.water} t={t} available={waterAvailable} onSetTotal={actions.setWaterTotal}/>
    {meals.length>0&&<view className="Open-section"><text className="Section-heading">{t('macros.title')}</text>{(['proteinG','carbsG','fatG'] as const).map((key,index)=><view key={key} className="Diary-macro-row"><text className="List-label">{t((['macros.protein','macros.carbs','macros.fat'] as const)[index]!)}</text><text className="List-value">{formatQuantity(macros[key],1)} g</text></view>)}</view>}
    <view className="Open-section"><text className="Section-heading">{t('daily.exercise')}</text>{sessions.length===0?<text className="Section-note">{t('daily.emptyDay')}</text>:sessions.map(item=><view key={item.id} className="Exercise-row-item"><text className="List-label">{exercises.find(type=>type.id===item.typeId)?.name[locale]??item.typeId}</text><text className="Section-note">{item.durationMin} {t('exerciseCard.min')}{item.kcal>0?` · ${formatQuantity(item.kcal)} kcal`:''}</text>{item.source !== undefined && item.source !== 'leanon' ? <text className="Section-note">{t('daily.readOnly')}</text> : <view className="Sheet-actions"><view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.edit')} bindtap={()=>actions.editExercise(item)}><text className="Sheet-btn-label">{t('daily.edit')}</text></view><view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.delete')} bindtap={()=>void actions.deleteExercise(item.id)}><text className="Sheet-btn-label">{t('daily.delete')}</text></view></view>}</view>)}</view>
    {meals.length>0&&<view className="Open-section"><text className="Section-heading">{t('micros.title')}</text>{(['fiberG','sugarG','saturatedFatG','sodiumMg'] as const).map((key,index)=><view key={key} className="Diary-macro-row"><text className="List-label">{t((['micros.fiber','micros.sugar','micros.saturatedFat','micros.sodium'] as const)[index]!)}</text><text className="List-value">{formatQuantity(micros[key],1)} {key==='sodiumMg'?'mg':'g'}</text></view>)}</view>}
    <text className="Footer">{t('footer.disclaimer')}</text>
  </view>;
}
