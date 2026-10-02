import { useState } from '@lynx-js/react';
import { getExerciseById } from '@zzzode/exercise-data';
import type { Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types';

type CardLocale = 'en' | 'zh-CN';

interface ExerciseCardProps {
  state: TodayState;
  locale: CardLocale;
  t: Translator;
  onEdit: (session: {
    id: string;
    typeId: string;
    durationMin: number;
  }) => void;
  onDelete: (id: string) => Promise<void>;
}

/** Home card listing today's exercise sessions with totals (RFC 0017/0018). */
export function ExerciseCard({
  state,
  locale,
  t,
  onEdit,
  onDelete,
}: ExerciseCardProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  if (state.exerciseSessions.length === 0) return null;

  const handleDeleteTap = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(id);
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  };

  return (
    <view className="Card Exercise-card">
      <view className="Exercise-head">
        <text className="Exercise-head-title">
          {t('exerciseCard.title')}
        </text>
        <text className="Exercise-head-total">
          {state.exerciseKcal} {t('exerciseCard.kcal')} · {state.exerciseMin}
          {t('exerciseCard.min')}
        </text>
      </view>
      {state.exerciseSessions.map((session) => {
        const type = getExerciseById(session.typeId);
        const name = type ? type.name[locale] : session.typeId;
        const confirming = confirmId === session.id;
        const isMirror = session.source === 'health_connect';
        return (
          <view key={session.id} className="Exercise-row-item">
            <view className="Exercise-row-titleline">
              <text className="Exercise-row-name">{name}</text>
              {isMirror ? (
                <text className="Exercise-row-badge">
                  {t('healthConnect.badge')}
                </text>
              ) : null}
            </view>
            <text className="Exercise-row-meta">
              {Math.round(session.durationMin)} {t('exerciseCard.min')} ·{' '}
              {Math.round(session.kcal)} {t('exerciseCard.kcal')}
            </text>
            {isMirror ? null : (
              <view className="Exercise-row-actions">
                <text
                  className="Exercise-row-btn"
                  bindtap={() =>
                    onEdit({
                      id: session.id,
                      typeId: session.typeId,
                      durationMin: session.durationMin,
                    })
                  }
                >
                  {t('exerciseCard.edit')}
                </text>
                <text
                  className={`Exercise-row-btn danger${
                    confirming ? ' confirm' : ''
                  }`}
                  bindtap={
                    deleting ? undefined : () => handleDeleteTap(session.id)
                  }
                >
                  {confirming
                    ? t('exerciseCard.confirmDelete')
                    : t('exerciseCard.delete')}
                </text>
              </view>
            )}
          </view>
        );
      })}
    </view>
  );
}
