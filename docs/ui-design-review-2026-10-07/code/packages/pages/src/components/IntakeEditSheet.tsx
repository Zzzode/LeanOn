import { SheetFeedback } from './SheetFeedback.js';
import { useRef, useState } from '@lynx-js/react';
import type { IntakeEntry, MealType } from '@zzzode/core';
import type { Translator } from '@zzzode/i18n';
import { resizeIntakeEntry, validDiaryDate } from '../state/diary.js';
import { isRecordConflict } from '../state/record-mutation.js';
import { formatQuantity } from '../state/theme.js';
import { RecordEditorField } from './RecordEditSheet.js';

export interface IntakeEditSheetProps {
  entry: IntakeEntry;
  today: string;
  t: Translator;
  onClose: () => void;
  onSave: (entry: IntakeEntry) => Promise<void>;
}
const meals: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** A historical meal keeps its own name and nutrient snapshot even if its food was deleted. */
export function IntakeEditSheet({ entry, today, t, onClose, onSave }: IntakeEditSheetProps) {
  const [date, setDate] = useState(entry.date);
  const [meal, setMeal] = useState(entry.meal);
  const [grams, setGrams] = useState(String(entry.grams));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const close = () => { if (!pending.current) onClose(); };
  const resized = resizeIntakeEntry(entry, grams.trim() === '' ? NaN : Number(grams));
  const save = async () => {
    if (pending.current) return;
    if (!validDiaryDate(date, today) || resized === null) { setError(t('daily.invalid')); return; }
    pending.current = true; setSaving(true); setError(null);
    try { await onSave({ ...resized, date, meal }); }
    catch (failure) { setError(t(isRecordConflict(failure) ? 'closure.conflict' : 'daily.saveError')); }
    finally { pending.current = false; setSaving(false); }
  };
  return <view className="Sheet-overlay" bindtap={close}><view className="Sheet Theme-food" catchtap={() => {}}>
    <text className="Sheet-title">{t('daily.editMeal')}</text>
    <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
      <text className="Form-label">{t('daily.name')}</text><text className="List-value">{entry.name}</text>
      <RecordEditorField id="intake-edit-date" label={t('daily.date')} initial={entry.date} onChange={value => { setDate(value); setError(null); }} disabled={saving} />
      <text className="Form-label">{t('daily.meal')}</text><view className="Meal-recents" style={{ marginBottom: '16px' }}>{meals.map(value => <view key={value} className="Meal-recent-chip" accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={t(`daily.${value}`)} hover-class="tap-feedback-hover" bindtap={saving ? undefined : () => setMeal(value)}><text className="Meal-recent-label">{meal === value ? '✓ ' : ''}{t(`daily.${value}`)}</text></view>)}</view>
      <RecordEditorField id="intake-edit-grams" label={t('daily.portion')} initial={String(entry.grams)} onChange={value => { setGrams(value); setError(null); }} numeric disabled={saving} />
      {resized !== null && <text className="Section-note">{formatQuantity(resized.kcal)} kcal · {t('macros.protein')} {formatQuantity(resized.macros.proteinG, 1)} g · {t('macros.carbs')} {formatQuantity(resized.macros.carbsG, 1)} g · {t('macros.fat')} {formatQuantity(resized.macros.fatG, 1)} g</text>}
    </scroll-view>
    <SheetFeedback message={error} />
    <view className="Sheet-actions"><view className="Sheet-btn" accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={t('daily.cancel')} hover-class="tap-feedback-hover" bindtap={saving ? undefined : close}><text className="Sheet-btn-label">{t('daily.cancel')}</text></view><view className={`Sheet-btn primary${saving ? ' disabled' : ''}`} accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={saving ? t('review.saving') : t('daily.save')} hover-class="tap-feedback-hover" bindtap={saving ? undefined : save}><text className="Sheet-btn-label primary">{saving ? t('review.saving') : t('daily.save')}</text></view></view>
  </view></view>;
}
