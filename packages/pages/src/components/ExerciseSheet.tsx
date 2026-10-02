import { useEffect, useState } from '@lynx-js/react';
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
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
  if (selectedType !== null && Number.isFinite(minutes) && minutes > 0) {
    try {
      kcal = calculateExerciseKcal(selectedType, minutes, currentWeightKg);
    } catch {
      kcal = null;
    }
  }

  const handleSave = async () => {
    if (selectedType === null || kcal === null) {
      setError(t('exerciseSheet.invalid'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        typeId: selectedType.id,
        durationMin: Math.round(minutes),
        kcal,
      });
    } catch {
      setError(t('exerciseSheet.error'));
      setSaving(false);
    }
  };

  return (
    <view className="Sheet-overlay" bindtap={onClose}>
      <view className="Sheet" catchtap={() => {}}>
        <text className="Sheet-title">
          {isEdit
            ? t('exerciseSheet.editTitle')
            : t('exerciseSheet.title')}
        </text>

        <scroll-view scroll-y className="Exercise-type-list">
          {exercises.map((type) => (
            <view
              key={type.id}
              className={`Exercise-type${
                type.id === selectedId ? ' selected' : ''
              }`}
              bindtap={() => setSelectedId(type.id)}
            >
              <text className="Exercise-type-label">
                {type.name[locale]}
              </text>
            </view>
          ))}
        </scroll-view>

        <view className="Sheet-field">
          <input
            id="exercise-duration"
            className="Sheet-input Exercise-duration-input"
            type="number"
            bindinput={(event: InputEvent) => setDuration(event.detail.value)}
            placeholder={t('exerciseSheet.durationHint')}
          />
          <text className="Sheet-unit">{t('exerciseSheet.minutes')}</text>
        </view>

        {kcal !== null && (
          <view className="Exercise-kcal-row">
            <text className="Exercise-kcal">{kcal}</text>
            <text className="Exercise-kcal-unit">
              {t('exerciseSheet.kcal')}
            </text>
          </view>
        )}
        {error !== null && <text className="Sheet-error">{error}</text>}

        <view className="Sheet-actions">
          <view className="Sheet-btn" bindtap={onClose}>
            <text className="Sheet-btn-label">
              {t('exerciseSheet.cancel')}
            </text>
          </view>
          <view
            className={`Sheet-btn primary${saving ? ' disabled' : ''}`}
            bindtap={saving ? undefined : handleSave}
          >
            <text className="Sheet-btn-label primary">
              {t('exerciseSheet.save')}
            </text>
          </view>
        </view>
      </view>
    </view>
  );
}
