import { SheetFeedback } from './SheetFeedback.js';
import { useEffect, useRef, useState } from '@lynx-js/react';
import type { ExerciseSample, LegacyIntakeRecord, RecordMutation, WaterRecord, WeightRecord } from '@zzzode/core';
import { exercises } from '@zzzode/exercise-data';
import type { Locale, Translator } from '@zzzode/i18n';
import { resizeExerciseSession, validDiaryDate } from '../state/diary.js';
import { isRecordConflict } from '../state/record-mutation.js';
import { formatQuantity } from '../state/theme.js';

type ValueDailyRecord = { kind: 'weight'; value: WeightRecord } | { kind: 'water'; value: WaterRecord } | { kind: 'exercise'; value: ExerciseSample };
export type EditableDailyRecord = ValueDailyRecord | { kind: 'legacy-intake'; value: LegacyIntakeRecord };
export interface RecordEditSheetProps {
  record: EditableDailyRecord;
  today: string;
  locale: Locale;
  t: Translator;
  /** A new dated water total has no persisted identity yet. */
  creating?: boolean;
  onClose: () => void;
  onSave: (mutation: RecordMutation) => Promise<void>;
}

/** Lynx 3.9 native inputs require setValue for their initial text. */
export function RecordEditorField({ id, label, initial, onChange, numeric = false, disabled = false }: {
  id: string; label: string; initial: string; onChange: (value: string) => void; numeric?: boolean; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    lynx.createSelectorQuery().select(`#${id}`).invoke({ method: 'setValue', params: { value: initial } }).exec();
  }, []);
  return <view style={{ marginBottom: '16px' }}><text className="Form-label">{label}</text><view className={`Sheet-field${focused ? ' focused' : ''}`}><input id={id} className="Sheet-input" style={{ fontSize: '18px' }} accessibility-element={true} accessibility-label={label} type={numeric ? 'digit' : 'text'} disabled={disabled} confirm-type="done" bindinput={(event: { detail: { value: string } }) => onChange(event.detail.value)} bindfocus={() => setFocused(true)} bindblur={() => setFocused(false)} bindconfirm={() => lynx.createSelectorQuery().select(`#${id}`).invoke({ method: 'blur' }).exec()} /></view></view>;
}

/** Explicit edits retain identity and use the native host's collision checks. */
export function RecordEditSheet({ record, today, locale, t, creating = false, onClose, onSave }: RecordEditSheetProps) {
  return record.kind === 'legacy-intake'
    ? <LegacyTotalEditSheet sample={record.value} today={today} t={t} onClose={onClose} onSave={onSave} />
    : <ValueRecordEditSheet record={record} today={today} locale={locale} t={t} creating={creating} onClose={onClose} onSave={onSave} />;
}

function ValueRecordEditSheet({ record, today, locale, t, creating = false, onClose, onSave }: Omit<RecordEditSheetProps, 'record'> & { record: ValueDailyRecord }) {
  const [date, setDate] = useState(record.value.date);
  const initialAmount = record.kind === 'weight' ? record.value.weightKg : record.kind === 'water' ? record.value.amountMl : record.value.durationMin;
  const initialText = creating && record.kind === 'water' ? '' : String(initialAmount);
  const [amount, setAmount] = useState(initialText);
  const [typeId, setTypeId] = useState(record.kind === 'exercise' ? record.value.typeId : '');
  const [choosingType, setChoosingType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const close = () => { if (!pending.current) onClose(); };
  const save = async () => {
    if (pending.current) return;
    const value = amount.trim() === '' ? NaN : Number(amount);
    const editable = record.kind !== 'exercise' || record.value.source === undefined || record.value.source === 'leanon';
    const rangeValid = record.kind === 'weight' ? value >= 20 && value <= 300 : record.kind === 'exercise' ? value >= 1 && value <= 1440 : value >= 0;
    if (!editable || !Number.isFinite(value) || !rangeValid || !validDiaryDate(date, today)) { setError(t('daily.invalid')); return; }
    let mutation: RecordMutation;
    if (record.kind === 'weight') {
      if (record.value.source !== undefined && record.value.source !== 'leanon') { setError(t('daily.readOnly')); return; }
      mutation = { type: 'set-weight', id: record.value.id, date, weightKg: Math.round(value * 10) / 10 };
    } else if (record.kind === 'water') {
      mutation = { type: 'set-water', ...(creating ? {} : { id: record.value.id }), date, amountMl: value };
    } else {
      const corrected = resizeExerciseSession(record.value, typeId, value);
      if (corrected === null) { setError(t('daily.activityEstimateUnavailable')); return; }
      mutation = { type: 'save-exercise', exercise: { ...corrected, date } };
    }
    pending.current = true; setSaving(true); setError(null);
    try { await onSave(mutation); } catch (failure) { setError(t(isRecordConflict(failure) ? 'closure.conflict' : 'daily.saveError')); }
    finally { pending.current = false; setSaving(false); }
  };
  const amountLabel = t(record.kind === 'weight' ? 'daily.weight' : record.kind === 'water' ? 'daily.water' : 'daily.duration');
  const selectedType = exercises.find(type => type.id === typeId);
  const exercisePreview = record.kind === 'exercise' ? resizeExerciseSession(record.value, typeId, amount.trim() === '' ? NaN : Number(amount)) : null;
  return <view className="Sheet-overlay" bindtap={close}><view className={`Sheet Theme-${record.kind === 'weight' ? 'weight' : record.kind === 'water' ? 'water' : 'exercise'}`} catchtap={() => {}}>
    <text className="Sheet-title">{t(creating && record.kind === 'water' ? 'daily.water' : 'daily.editRecord')}</text>
    <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
      {record.kind === 'exercise' && <>
        <view className="Exercise-current" accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={`${t('exerciseSheet.changeActivity')}: ${selectedType?.name[locale] ?? typeId}`} hover-class="tap-feedback-hover" bindtap={saving ? undefined : () => setChoosingType(previous => !previous)}><text className="Exercise-current-label">{selectedType?.name[locale] ?? typeId}</text><text className="Exercise-current-action">{t('exerciseSheet.changeActivity')}</text></view>
        {choosingType && <view className="Exercise-type-list">{exercises.map(type => <view key={type.id} className={`Exercise-type${type.id === typeId ? ' selected' : ''}`} accessibility-element={true} accessibility-traits={saving ? 'disabled' : type.id === typeId ? 'selected' : 'button'} accessibility-label={type.name[locale]} hover-class="tap-feedback-hover" bindtap={saving ? undefined : () => {
          if (resizeExerciseSession(record.value, type.id, record.value.durationMin) === null) { setChoosingType(false); setError(t('daily.activityEstimateUnavailable')); return; }
          setTypeId(type.id); setChoosingType(false); setError(null);
        }}><text className="Exercise-type-label">{type.id === typeId ? '✓ ' : ''}{type.name[locale]}</text></view>)}</view>}
      </>}
      <RecordEditorField id="record-edit-date" label={t('daily.date')} initial={record.value.date} onChange={value => { setDate(value); setError(null); }} disabled={saving} />
      <RecordEditorField id="record-edit-amount" label={`${amountLabel}${record.kind === 'weight' ? ' (kg)' : ''}`} initial={initialText} onChange={value => { setAmount(value); setError(null); }} numeric disabled={saving} />
      {exercisePreview !== null && <text className="Section-note">{t('review.estimatedEnergy')} · {formatQuantity(exercisePreview.kcal)} kcal</text>}
    </scroll-view>
    <SheetFeedback message={error} />
    <view className="Sheet-actions"><view className="Sheet-btn" accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={t('daily.cancel')} hover-class="tap-feedback-hover" bindtap={saving ? undefined : close}><text className="Sheet-btn-label">{t('daily.cancel')}</text></view><view className={`Sheet-btn primary${saving ? ' disabled' : ''}`} accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={saving ? t('review.saving') : t('daily.save')} hover-class="tap-feedback-hover" bindtap={saving ? undefined : save}><text className="Sheet-btn-label primary">{saving ? t('review.saving') : t('daily.save')}</text></view></view>
  </view></view>;
}

/** Aggregates are corrected directly, without creating fictitious meal/portion metadata. */
function LegacyTotalEditSheet({ sample, today, t, onClose, onSave }: {
  sample: LegacyIntakeRecord; today: string; t: Translator; onClose: () => void; onSave: (mutation: RecordMutation) => Promise<void>;
}) {
  const [date, setDate] = useState(sample.date);
  const initial = { kcal: String(sample.kcal), proteinG: String(sample.macros.proteinG), carbsG: String(sample.macros.carbsG), fatG: String(sample.macros.fatG), fiberG: String(sample.micros.fiberG), sugarG: String(sample.micros.sugarG), saturatedFatG: String(sample.micros.saturatedFatG), sodiumMg: String(sample.micros.sodiumMg) };
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const close = () => { if (!pending.current) onClose(); };
  const fields: readonly { key: keyof typeof initial; label: string }[] = [
    { key: 'kcal', label: 'kcal' }, { key: 'proteinG', label: `${t('macros.protein')} (g)` },
    { key: 'carbsG', label: `${t('macros.carbs')} (g)` }, { key: 'fatG', label: `${t('macros.fat')} (g)` },
    { key: 'fiberG', label: `${t('micros.fiber')} (g)` }, { key: 'sugarG', label: `${t('micros.sugar')} (g)` },
    { key: 'saturatedFatG', label: `${t('micros.saturatedFat')} (g)` }, { key: 'sodiumMg', label: `${t('micros.sodium')} (mg)` },
  ];
  const save = async () => {
    if (pending.current) return;
    const number = (key: keyof typeof values) => values[key].trim() === '' ? NaN : Number(values[key]);
    if (!validDiaryDate(date, today) || fields.some(field => !Number.isFinite(number(field.key)) || number(field.key) < 0)) { setError(t('daily.invalid')); return; }
    const corrected: LegacyIntakeRecord = { ...sample, date, kcal: number('kcal'),
      macros: { proteinG: number('proteinG'), carbsG: number('carbsG'), fatG: number('fatG') },
      micros: { fiberG: number('fiberG'), sugarG: number('sugarG'), saturatedFatG: number('saturatedFatG'), sodiumMg: number('sodiumMg') } };
    pending.current = true; setSaving(true); setError(null);
    try { await onSave({ type: 'save-legacy-intake', sample: corrected }); }
    catch (failure) { setError(t(isRecordConflict(failure) ? 'closure.conflict' : 'daily.saveError')); }
    finally { pending.current = false; setSaving(false); }
  };
  return <view className="Sheet-overlay" bindtap={close}><view className="Sheet Theme-food" catchtap={() => {}}><text className="Sheet-title">{t('daily.legacyTotal')}</text>
    <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll"><text className="Section-note">{t('daily.legacyNote')}</text><RecordEditorField id="legacy-edit-date" label={t('daily.date')} initial={sample.date} onChange={value => { setDate(value); setError(null); }} disabled={saving} />
      {fields.map(field => <RecordEditorField key={field.key} id={`legacy-edit-${field.key}`} label={field.label} initial={initial[field.key]} onChange={value => { setValues(previous => ({ ...previous, [field.key]: value })); setError(null); }} numeric disabled={saving} />)}
    </scroll-view><SheetFeedback message={error} /><view className="Sheet-actions"><view className="Sheet-btn" accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={t('daily.cancel')} hover-class="tap-feedback-hover" bindtap={saving ? undefined : close}><text className="Sheet-btn-label">{t('daily.cancel')}</text></view><view className={`Sheet-btn primary${saving ? ' disabled' : ''}`} accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={saving ? t('review.saving') : t('daily.save')} hover-class="tap-feedback-hover" bindtap={saving ? undefined : save}><text className="Sheet-btn-label primary">{saving ? t('review.saving') : t('daily.save')}</text></view></view>
  </view></view>;
}
