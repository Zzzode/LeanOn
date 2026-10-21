import { useEffect, useRef, useState } from '@lynx-js/react';
import {
  calculateExerciseKcal,
  exercises,
  type ExerciseType,
} from '@zzzode/exercise-data';
import type { Translator } from '@zzzode/i18n';

interface InputEvent {
  detail: { value: string };
}

type SheetLocale = 'en' | 'zh-CN';

interface ExerciseSheetProps {
  currentWeightKg: number;
  locale: SheetLocale;
  t: Translator;
  canSave?: boolean;
  /** When provided the sheet edits this session instead of logging a new one. */
  initialSession?: { typeId: string; durationMin: number };
  onClose: () => void;
  onSave: (session: {
    typeId: string;
    durationMin: number;
    kcal: number;
  }) => Promise<void>;
}

/**
 * Bottom sheet for logging an exercise session (RFC 0017). Pick a type, enter
 * duration in minutes, and the kilocalories update live from the current weight
 * via MET x kg x hours. Save runs the typed bridge write.
 */
export function ExerciseSheet({
  currentWeightKg,
  locale,
  t,
  canSave = true,
  initialSession,
  onClose,
  onSave,
}: ExerciseSheetProps) {
  const isEdit = initialSession !== undefined;
  const initialDuration = isEdit
    ? String(initialSession.durationMin)
    : '30';
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSession?.typeId ?? null,
  );
  const [duration, setDuration] = useState<string>(initialDuration);
  const pending = useRef(false);
  const handleClose = () => { if (!pending.current) onClose(); };
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [choosingType, setChoosingType] = useState(initialSession === undefined);

  // `default-value` needs Android 4.0; prefill imperatively on 3.9.
  useEffect(() => {
    lynx
      .createSelectorQuery()
      .select('#exercise-duration')
      .invoke({ method: 'setValue', params: { value: initialDuration } })
      .exec();
  }, []);

  const selectedType: ExerciseType | null =
    exercises.find((type) => type.id === selectedId) ?? null;

  let kcal: number | null = null;
  const minutes = Number(duration);
  const invalidDuration = error !== null &&
    (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440);
  if (selectedType !== null && Number.isFinite(minutes) && minutes > 0) {
    try {
      kcal = calculateExerciseKcal(selectedType, minutes, currentWeightKg);
    } catch {
      kcal = null;
    }
  }

  const handleSave = async () => {
    if (pending.current || !canSave) return;
    if (selectedType === null || kcal === null || minutes < 1 || minutes > 1440) {
      setError(t('exerciseSheet.invalid'));
      return;
    }
    pending.current = true;
    setError(null);
    setSaving(true);
    try {
      await onSave({
        typeId: selectedType.id,
        durationMin: minutes,
        kcal,
      });
    } catch {
      setError(t('exerciseSheet.error'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <view
      className="Sheet-overlay"
      hover-class="tap-feedback-hover"
      bindtap={saving ? undefined : handleClose}
    >
      <view className="Sheet Theme-exercise" catchtap={() => {}}>
        <text className="Sheet-title">
          {isEdit
            ? t('exerciseSheet.editTitle')
            : t('exerciseSheet.title')}
        </text>

        <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
        <view
          className="Exercise-current"
          accessibility-element={true}
          accessibility-traits={saving ? 'disabled' : 'button'}
          accessibility-label={selectedType === null ? t('exerciseSheet.chooseActivity') : `${t('exerciseSheet.changeActivity')}: ${selectedType.name[locale]}`}
          hover-class="tap-feedback-hover"
          bindtap={saving ? undefined : () => setChoosingType((previous) => !previous)}
        >
          <text className="Exercise-current-label">{selectedType?.name[locale] ?? t('exerciseSheet.chooseActivity')}</text>
          <text className="Exercise-current-action">{selectedType === null ? t('exerciseSheet.chooseActivity') : t('exerciseSheet.changeActivity')}</text>
        </view>
        {choosingType && <view className={`Exercise-type-list${error !== null && selectedType === null ? ' invalid' : ''}`}>
          {exercises.map((type) => (
            <view
              key={type.id}
              className={`Exercise-type${type.id === selectedId ? ' selected' : ''}`}
              accessibility-element={true}
              accessibility-traits={saving ? 'disabled' : type.id === selectedId ? 'selected' : 'button'}
              accessibility-label={type.name[locale]}
              hover-class="tap-feedback-hover"
              bindtap={saving ? undefined : () => { setSelectedId(type.id); setChoosingType(false); setError(null); }}
            >
              <text className="Exercise-type-label">{type.id === selectedId ? '✓ ' : ''}{type.name[locale]}</text>
            </view>
          ))}
        </view>}
        <text className="Form-label">{t('review.duration')}</text>
        <view className={`Sheet-field${focused ? ' focused' : ''}${invalidDuration ? ' invalid' : ''}`}>
          <input
            accessibility-element={true}
            accessibility-label={t('review.duration')}
            id="exercise-duration"
            className="Sheet-input Exercise-duration-input"
            type="number"
            disabled={saving}
            confirm-type="done"
            bindconfirm={() => lynx.createSelectorQuery().select('#exercise-duration').invoke({ method: 'blur' }).exec()}
            bindinput={(event: InputEvent) => { setDuration(event.detail.value); setError(null); }}
            bindfocus={() => setFocused(true)}
            bindblur={() => setFocused(false)}
            placeholder={t('exerciseSheet.durationHint')}
          />
          <text className="Sheet-unit">{t('exerciseSheet.minutes')}</text>
        </view>

        {kcal !== null && (
          <view className="Estimate-block">
            <text className="Estimate-label">{t('review.estimatedEnergy')}</text>
            <view className="Estimate-row">
              <text className="Estimate-value">{kcal}</text>
              <text className="Estimate-unit">
                {t('exerciseSheet.kcal')}
              </text>
            </view>
          </view>
        )}
        {error !== null && <text className="Sheet-error" accessibility-element={true}>{error}</text>}

        {!canSave && <text className="Section-note">{t('review.unavailableBody')}</text>}
        </scroll-view>
        <view className="Sheet-actions">
          <view
            className="Sheet-btn"
            accessibility-element={true}
            accessibility-traits={saving ? 'disabled' : 'button'}
            accessibility-label={t('exerciseSheet.cancel')}
            hover-class="tap-feedback-hover"
            bindtap={saving ? undefined : handleClose}
          >
            <text className="Sheet-btn-label">
              {t('exerciseSheet.cancel')}
            </text>
          </view>
          <view
            className={`Sheet-btn primary${saving || !canSave ? ' disabled' : ''}`}
            accessibility-element={true}
            accessibility-traits={saving || !canSave ? 'disabled' : 'button'}
            accessibility-label={saving ? t('review.saving') : t('exerciseSheet.save')}
            hover-class="tap-feedback-hover"
            bindtap={saving || !canSave ? undefined : handleSave}
          >
            <text className="Sheet-btn-label primary">
              {saving ? t('review.saving') : t('exerciseSheet.save')}
            </text>
          </view>
        </view>
      </view>
    </view>
  );
}
