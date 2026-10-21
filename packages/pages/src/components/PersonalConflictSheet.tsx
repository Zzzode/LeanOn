import {MEASUREMENT_FIELDS,type PersonalStateDto,type PersonalMutationRequestDto} from '@zzzode/data';
import type {Translator} from '@zzzode/i18n';
import type {PhotoPickRequest} from '../state/personal-ui.js';
import {WorkflowSheet,WorkflowButton} from './WorkflowSheet.js';
export interface PersonalConflictReview {request:PersonalMutationRequestDto|PhotoPickRequest;latest:PersonalStateDto|null;error:boolean}
export function PersonalConflictSheet({review,t,onClose,onRefresh,onContinue}:{review:PersonalConflictReview;t:Translator;onClose:()=>void;onRefresh:()=>void;onContinue:()=>void}) {
  const latest=review.latest;const mutation='mutation' in review.request?review.request.mutation:null;
  const recordId=mutation!==null&&'id' in mutation?mutation.id:mutation?.type==='save-measurement'?mutation.measurement.id:mutation?.type==='update-photo'||mutation?.type==='add-photo'?mutation.photo.id:null;
  const measurements=latest?.measurements.filter(row=>row.id===recordId)??[];
  const photos=latest?.photos.filter(row=>row.id===recordId)??[];
  return <WorkflowSheet t={t} title={t('closure.reviewTitle')} feedback={review.error?t('personal.loadError'):null} onClose={onClose} onSave={latest===null?undefined:onContinue} saveLabel={t('closure.keepDraft')}>
    <text className="Section-note">{t('personal.reviewConflict')}</text>
    {latest!==null&&<view><text className="Section-heading">{t('closure.latestRecords')}</text>
      <text className="List-label">{t('personal.measurements')} : {latest.measurements.length} · {t('personal.photos')} : {latest.photos.length}</text>
      {mutation?.type==='set-dietary-preferences'&&<view><text className="List-label">{t(`personal.${latest.dietaryPreferences.pattern}`)}</text><text className="Section-note">{latest.dietaryPreferences.notes}</text>{latest.dietaryPreferences.excludedFoodIds.map(id=><text className="Section-note" key={id}>{id}</text>)}</view>}
      {measurements.map(row=><view key={row.id}><text className="List-label">{row.date}</text>{MEASUREMENT_FIELDS.filter(key=>row[key]!==undefined).map(key=><text className="Section-note" key={key}>{t(`personal.${key}`)} : {row[key]} cm</text>)}<text className="Section-note">{row.note}</text></view>)}
      {photos.map(row=><view key={row.id}><text className="List-label">{row.date} · {t(`personal.${row.view}`)}</text><text className="Section-note">{row.note}</text></view>)}
      {recordId!==null&&measurements.length===0&&photos.length===0&&<text className="Section-note">{t('personal.recordMissing')}</text>}
    </view>}
    <WorkflowButton t={t} label={t('closure.retry')} onTap={onRefresh}/>
  </WorkflowSheet>;
}
