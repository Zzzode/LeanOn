import { formatDate, type Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types.js';

interface HeaderProps {
  state: TodayState;
  t: Translator;
  settingsOpen: boolean;
  onGear: () => void;
}

export function Header({ state, t, settingsOpen, onGear }: HeaderProps) {
  return (
    <view className="Header">
      <view className="Header-text">
        <text className="Header-greeting">
          {t(`home.greeting.${state.dayPart}`)}
        </text>
        <text className="Header-date">{formatDate(t, state.dateParts)}</text>
      </view>
      <view className="Header-side">
        <view className="Header-streak">
          <text className="Header-streak-num">{state.streak}</text>
          <text className="Header-streak-label">{t('home.dayStreak')}</text>
        </view>
        <view className="Header-gear" bindtap={onGear}>
          {settingsOpen ? (
            <text className="Header-gear-done">{t('settings.done')}</text>
          ) : (
            <text className="Header-gear-glyph">⚙️</text>
          )}
        </view>
      </view>
    </view>
  );
}
