import { useEffect, useRef, useState } from '@lynx-js/react';
import { exercises } from '@zzzode/exercise-data';
import type { ExerciseSample, IntakeEntry, LegacyIntakeRecord, RecordKind, WaterRecord, WeightRecord } from '@zzzode/core';
import { diaryHistoryDates, shiftDiaryDate, summarizeDiary, validDiaryDate } from '../state/diary.js';
import { formatQuantity } from '../state/theme.js';
import type { TodayState } from '../state/types.js';
import type { ScreenProps } from './types.js';

export interface DiaryScreenProps extends Omit<ScreenProps, 'state'> {
  state: TodayState | null;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onEditIntake?: (entry: IntakeEntry) => void;
  onEditLegacyIntake?: (record: LegacyIntakeRecord) => void;
  onEditWeight?: (record: WeightRecord) => void;
  onEditWater?: (record: WaterRecord) => void;
  onEditExerciseRecord?: (record: ExerciseSample) => void;
  onLogWater?: () => void;
  onDelete?: (kind: RecordKind, id: string, label: string) => void;
  onRestore?: (token: string) => Promise<void>;
}

/** Selection never changes a draft's date; the host owns clocks and persistence. */
export function DiaryScreen({ hostData, selectedDate, onSelectDate, locale, t, actions,
  onEditIntake, onEditLegacyIntake, onEditWeight, onEditWater, onEditExerciseRecord, onLogWater, onDelete, onRestore }: DiaryScreenProps) {
  const summary = summarizeDiary(hostData, selectedDate);
  const [dateValue, setDateValue] = useState(selectedDate);
  const [dateError, setDateError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const restorePending = useRef(false);
  useEffect(() => {
    setDateValue(selectedDate); setDateError(false);
    lynx.createSelectorQuery().select('#diary-date').invoke({ method: 'setValue', params: { value: selectedDate } }).exec();
  }, [selectedDate]);
  const selectDate = (value: string) => {
    if (!validDiaryDate(value, hostData.today)) { setDateError(true); return; }
    setDateError(false); setDateValue(value); onSelectDate(value);
  };
  const entries = hostData.intakeEntries.filter(entry => entry.date === selectedDate);
  const legacy = hostData.legacyIntake.filter(entry => entry.date === selectedDate);
  const weight = hostData.weights.find(record => record.date === selectedDate);
  const water = hostData.water.find(record => record.date === selectedDate);
  const sessions = hostData.exercises.filter(record => record.date === selectedDate);
  const historyDates = diaryHistoryDates(hostData);
  const restore = async (token: string) => {
    if (restorePending.current || onRestore === undefined) return;
    restorePending.current = true; setRestoring(token); setRestoreError(false);
    try { await onRestore(token); } catch { setRestoreError(true); }
    finally { restorePending.current = false; setRestoring(null); }
  };
  const controls = (kind: RecordKind, id: string, label: string, edit: (() => void) | undefined, readOnly = false) =>
    readOnly ? <text className="Section-note">{t('daily.readOnly')}</text> : <view className="Sheet-actions" style={{ marginTop: '4px' }}>
      {edit !== undefined && <view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={`${t('daily.edit')} · ${label}`} hover-class="tap-feedback-hover" bindtap={edit}><text className="Sheet-btn-label">{t('daily.edit')}</text></view>}
      {onDelete !== undefined && <view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={`${t('daily.delete')} · ${label}`} hover-class="tap-feedback-hover" bindtap={() => onDelete(kind, id, label)}><text className="Sheet-btn-label">{t('daily.delete')}</text></view>}
    </view>;
  return <view className="Tab-pane">
    <view className="ScreenTitle"><text className="ScreenTitle-text">{t('diary.title')}</text><text className="ScreenTitle-note">{selectedDate}</text></view>
    <view className="Open-section">
      <text className="Form-label">{t('daily.date')}</text>
      <view className={`Sheet-field${dateError ? ' invalid' : ''}`}>
        <input id="diary-date" className="Sheet-input" style={{ fontSize: '18px' }} accessibility-element={true} accessibility-label={t('daily.date')} placeholder={t('daily.dateHint')} type="text" confirm-type="done" bindinput={(event: { detail: { value: string } }) => { setDateValue(event.detail.value); setDateError(false); }} bindconfirm={() => { selectDate(dateValue); lynx.createSelectorQuery().select('#diary-date').invoke({ method: 'blur' }).exec(); }} />
      </view>
      {dateError && <text className="Sheet-error">{t('daily.invalid')}</text>}
      <view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.showDay')} hover-class="tap-feedback-hover" bindtap={() => selectDate(dateValue)}><text className="Action-label">{t('daily.showDay')}</text></view>
      <view className="Sheet-actions" style={{ marginTop: '8px' }}>
        <view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.previous')} hover-class="tap-feedback-hover" bindtap={() => selectDate(shiftDiaryDate(selectedDate, -1))}><text className="Sheet-btn-label">{t('daily.previous')}</text></view>
        <view className="Sheet-btn" accessibility-element={true} accessibility-traits={selectedDate >= hostData.today ? 'disabled' : 'button'} accessibility-label={t('daily.next')} hover-class="tap-feedback-hover" bindtap={selectedDate >= hostData.today ? undefined : () => selectDate(shiftDiaryDate(selectedDate, 1))}><text className="Sheet-btn-label">{t('daily.next')}</text></view>
        <view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.today')} hover-class="tap-feedback-hover" bindtap={() => selectDate(hostData.today)}><text className="Sheet-btn-label">{t('daily.today')}</text></view>
      </view>
      <view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.history')} hover-class="tap-feedback-hover" bindtap={() => setHistoryOpen(!historyOpen)}><text className="Action-label">{t('daily.history')}</text></view>
      {historyOpen && <view className="Meal-recents">{historyDates.map(date => <view key={date} className="Meal-recent-chip" accessibility-element={true} accessibility-traits="button" accessibility-label={date} hover-class="tap-feedback-hover" bindtap={() => selectDate(date)}><text className="Meal-recent-label">{date === selectedDate ? '✓ ' : ''}{date}</text></view>)}</view>}
    </view>
    <view className="Card Diary-primary Theme-food">
      <text className="Category-label food">{t(summary.recorded ? 'design.recorded' : 'design.noIntake')}</text>
      {summary.recorded ? <view className="Energy-figure"><text className="Energy-num">{formatQuantity(summary.kcal)}</text><text className="Energy-unit">kcal</text></view> : <text className="Empty-body">{t('daily.emptyDay')}</text>}
      <view className="Action-btn primary" accessibility-element={true} accessibility-traits="button" accessibility-label={t('action.logFood')} hover-class="tap-feedback-hover" bindtap={() => actions.logFood()}><text className="Action-label primary">{t('action.logFood')}</text></view>
      {summary.recorded && <view className="DiaryMacros"><text className="DiaryMacros-item">{t('macros.protein')} {formatQuantity(summary.proteinG, 1)} g</text><text className="DiaryMacros-item">{t('macros.carbs')} {formatQuantity(summary.carbsG, 1)} g</text><text className="DiaryMacros-item">{t('macros.fat')} {formatQuantity(summary.fatG, 1)} g</text></view>}
    </view>
    {legacy.length > 0 && <view className="Open-section"><text className="Section-heading">{t('daily.legacyTotal')}</text><text className="Section-note">{t('daily.legacyNote')}</text>{legacy.map(record => <view key={record.id} className="Exercise-row-item"><text className="List-value">{formatQuantity(record.kcal)} kcal</text>{controls('legacy-intake', record.id, t('daily.legacyTotal'), onEditLegacyIntake === undefined ? undefined : () => onEditLegacyIntake(record))}</view>)}</view>}
    {entries.length > 0 && <view className="Open-section"><text className="Section-heading">{t('daily.meals')}</text>{entries.map(entry => <view key={entry.id} className="Exercise-row-item"><text className="List-label">{entry.name}</text><text className="Section-note">{t(`daily.${entry.meal}`)} · {formatQuantity(entry.grams, 1)} g · {formatQuantity(entry.kcal)} kcal</text>{controls('intake', entry.id, entry.name, onEditIntake === undefined ? undefined : () => onEditIntake(entry))}</view>)}</view>}
    <view className="Open-section"><text className="Section-heading">{t('daily.records')}</text>
      {weight !== undefined && <view className="Exercise-row-item"><text className="List-label">{t('daily.weight')} · {formatQuantity(weight.weightKg, 1)} kg</text>{controls('weight', weight.id, t('daily.weight'), onEditWeight === undefined ? undefined : () => onEditWeight(weight), weight.source !== undefined && weight.source !== 'leanon')}</view>}
      {water !== undefined && <view className="Exercise-row-item"><text className="List-label">{t('daily.water')} · {formatQuantity(water.amountMl)} ml</text>{controls('water', water.id, t('daily.water'), onEditWater === undefined ? undefined : () => onEditWater(water))}</view>}
      {sessions.map(session => { const label = exercises.find(type => type.id === session.typeId)?.name[locale] ?? session.typeId; return <view key={session.id} className="Exercise-row-item"><text className="List-label">{label}</text><text className="Section-note">{formatQuantity(session.durationMin)} {t('exerciseCard.min')} · {formatQuantity(session.kcal)} kcal</text>{controls('exercise', session.id, label, onEditExerciseRecord === undefined ? undefined : () => onEditExerciseRecord(session), session.source !== undefined && session.source !== 'leanon')}</view>; })}
      {weight === undefined && water === undefined && sessions.length === 0 && <text className="Section-note">{t('daily.emptyDay')}</text>}
      <view className="Sheet-actions" style={{ marginTop: '12px' }}><view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('action.logWeight')} hover-class="tap-feedback-hover" bindtap={actions.logWeight}><text className="Sheet-btn-label">{t('action.logWeight')}</text></view><view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('action.logExercise')} hover-class="tap-feedback-hover" bindtap={actions.logExercise}><text className="Sheet-btn-label">{t('action.logExercise')}</text></view></view>
      {water === undefined && onLogWater !== undefined && <view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.water')} hover-class="tap-feedback-hover" bindtap={onLogWater}><text className="Action-label">{t('daily.water')}</text></view>}
    </view>
    <view className="Open-section"><view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.recentlyDeleted')} hover-class="tap-feedback-hover" bindtap={() => setTrashOpen(!trashOpen)}><text className="Action-label">{t('daily.recentlyDeleted')} · {hostData.deletedRecords.length}</text></view>
      {trashOpen && <view>{hostData.deletedRecords.length === 0 && <text className="Section-note">{t('daily.emptyTrash')}</text>}{hostData.deletedRecords.map(item => {
        const typeId = item.kind === 'exercise' ? item.record.typeId : '';
        const label = item.kind === 'intake' ? item.record.name : item.kind === 'legacy-intake' ? t('daily.legacyTotal') : item.kind === 'exercise' ? exercises.find(type => type.id === typeId)?.name[locale] ?? typeId : t(item.kind === 'weight' ? 'daily.weight' : 'daily.water');
        return <view key={item.token} className="Exercise-row-item"><text className="List-label">{label}</text><text className="Section-note">{item.record.date}</text>{onRestore !== undefined && <view className={`Action-btn${restoring !== null ? ' disabled' : ''}`} accessibility-element={true} accessibility-traits={restoring !== null ? 'disabled' : 'button'} accessibility-label={`${t('daily.restore')} · ${label} · ${item.record.date}`} hover-class="tap-feedback-hover" bindtap={restoring !== null ? undefined : () => restore(item.token)}><text className="Action-label">{t(restoring === item.token ? 'daily.restoring' : 'daily.restore')}</text></view>}</view>;
      })}</view>}
      {restoreError && <text className="Sheet-error">{t('daily.restoreError')}</text>}
    </view>
  </view>;
}
