import { formatDate, type Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types.js';

interface GreetingHeaderProps {
  state: TodayState;
  t: Translator;
}

/** Lightweight top header for Today: greeting, date and streak (no gear). */
export function GreetingHeader({ state, t }: GreetingHeaderProps) {
  return (
    <view className="GreetingHeader">
      <view className="GreetingHeader-text">
        <text className="GreetingHeader-greeting">
          {t(`home.greeting.${state.dayPart}`)}
        </text>
        <text className="GreetingHeader-date">
          {formatDate(t, state.dateParts)}
        </text>
      </view>
      <view className="GreetingHeader-streak">
        <text className="GreetingHeader-streak-num">{state.streak}</text>
        <text className="GreetingHeader-streak-label">
          {t('home.dayStreak')}
        </text>
      </view>
    </view>
  );
}
