import { getExerciseById } from '@zzzode/exercise-data';
import type { Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types';

type CardLocale = 'en' | 'zh-CN';

interface ExerciseCardProps {
  state: TodayState;
  locale: CardLocale;
  t: Translator;
}

/** Home card listing today's exercise sessions with totals (RFC 0017). */
export function ExerciseCard({ state, locale, t }: ExerciseCardProps) {
  if (state.exerciseSessions.length === 0) return null;
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
      {state.exerciseSessions.map((session, index) => {
        const type = getExerciseById(session.typeId);
        const name = type ? type.name[locale] : session.typeId;
        return (
          <view
            key={`${session.typeId}-${index}`}
            className="Exercise-row-item"
          >
            <text className="Exercise-row-name">{name}</text>
            <text className="Exercise-row-meta">
              {Math.round(session.durationMin)} {t('exerciseCard.min')} ·{' '}
              {Math.round(session.kcal)} {t('exerciseCard.kcal')}
            </text>
          </view>
        );
      })}
    </view>
  );
}
