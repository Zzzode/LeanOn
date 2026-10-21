import type { Translator } from '@zzzode/i18n';
import type { HostData } from '../state/types.js';
import type { RecordDraft } from '../state/record-mutation.js';

export interface ConflictReview {draft:RecordDraft;latest:HostData|null;loading:boolean;error:boolean}
/** A definite stale-write rejection requires a visible review before using a newer revision. */
export function ConflictReviewSheet({review,t,onClose,onRefresh,onContinue}:{review:ConflictReview;t:Translator;onClose:()=>void;onRefresh:()=>void;onContinue:()=>void}) {
  const {latest,draft}=review;
  const mutation=draft.request?.mutation;
  const dates=new Set([draft.date]);
  if(mutation?.type==='set-weight'||mutation?.type==='set-water')dates.add(mutation.date);
  if(mutation?.type==='save-intake')dates.add(mutation.entry.date);
  if(mutation?.type==='save-exercise')dates.add(mutation.exercise.date);
  if(mutation?.type==='save-legacy-intake')dates.add(mutation.sample.date);
  return <view className="Sheet-overlay"><view className="Sheet" catchtap={()=>{}}>
    <text className="Sheet-title">{t('closure.reviewTitle')}</text>
    <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
      <text className="Empty-body">{t('closure.conflict')}</text>
      <text className="Section-note">{[...dates].join(' · ')}</text>
      {latest!==null&&<view>
        <text className="Section-heading">{t('closure.latestRecords')}</text>
        {mutation?.type==='save-profile'&&<view><text className="List-label">{t('profile.height')} · {latest.profile?.heightCm ?? '—'} cm</text><text className="List-label">{t('profile.birthDate')} · {latest.profile?.birthDate ?? '—'}</text><text className="List-label">{t('profile.goalWeight')} · {latest.goalWeightKg ?? '—'} kg</text><text className="Section-note">{t(latest.guidanceMode==='tracking-only'?'profile.trackingOnly':'profile.weightLoss')}</text></view>}
        {latest.intakeEntries.filter(item=>dates.has(item.date)).map(item=><view key={item.id} className="Exercise-row-item"><text className="List-label">{item.name} · {item.grams} g · {item.kcal} kcal</text><text className="Section-note">{item.date} · {t(`daily.${item.meal}`)}</text><text className="Section-note">{t('macros.protein')} {item.macros.proteinG} g · {t('macros.carbs')} {item.macros.carbsG} g · {t('macros.fat')} {item.macros.fatG} g</text></view>)}
        {latest.legacyIntake.filter(item=>dates.has(item.date)).map(item=><text key={item.id} className="List-label">{t('daily.legacyTotal')} · {item.date} · {item.kcal} kcal</text>)}
        {latest.weights.filter(item=>dates.has(item.date)).map(item=><text key={item.id} className="List-label">{t('daily.weight')} · {item.date} · {item.weightKg} kg</text>)}
        {latest.water.filter(item=>dates.has(item.date)).map(item=><text key={item.id} className="List-label">{t('daily.water')} · {item.date} · {item.amountMl} ml</text>)}
        {latest.exercises.filter(item=>dates.has(item.date)).map(item=><text key={item.id} className="List-label">{t('daily.exercise')} · {item.date} · {item.durationMin} {t('exerciseCard.min')} · {item.kcal} kcal</text>)}
        <text className="Section-note">{t('closure.reviewDraft')}</text>
      </view>}
      {review.error&&<text className="Sheet-error">{t('closure.refreshError')}</text>}
    </scroll-view>
    <view className="Sheet-actions">
      <view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.cancel')} bindtap={onClose}><text className="Sheet-btn-label">{t('daily.cancel')}</text></view>
      <view className={`Sheet-btn primary${review.loading?' disabled':''}`} accessibility-element={true} accessibility-traits="button" accessibility-label={t(latest===null?'closure.retry':'closure.keepDraft')} bindtap={review.loading?undefined:latest===null?onRefresh:onContinue}><text className="Sheet-btn-label primary">{t(review.loading?'closure.loading':latest===null?'closure.retry':'closure.keepDraft')}</text></view>
    </view>
  </view></view>;
}
