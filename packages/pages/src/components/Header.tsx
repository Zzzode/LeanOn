import { formatDate, type Locale, type Translator } from '@zzzode/i18n';
import type { TodayState } from '../state/types.js';

interface HeaderProps {
  state: TodayState;
  locale: Locale;
  t: Translator;
  onLocaleChange: (locale: Locale) => void;
  onOpenReminders: () => void;
  onOpenHealthConnect: () => void;
}

const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'zh-CN', label: '中' },
];

export function Header({
  state,
  locale,
  t,
  onLocaleChange,
  onOpenReminders,
  onOpenHealthConnect,
}: HeaderProps) {
  return (
    <view className="Header">
      <view className="Header-text">
        <text className="Header-greeting">
          {t(`home.greeting.${state.dayPart}`)}
        </text>
        <text className="Header-date">{formatDate(t, state.dateParts)}</text>
      </view>
      <view className="Header-side">
        <view className="Header-bell" bindtap={onOpenReminders}>
          <text className="Header-bell-glyph">🔔</text>
        </view>
        <view className="Header-bell" bindtap={onOpenHealthConnect}>
          <text className="Header-bell-glyph">🔗</text>
        </view>
        <view className="LangSwitch">
          {LOCALE_OPTIONS.map((option) => {
            const active = option.value === locale;
            return (
              <view
                key={option.value}
                className={active ? 'LangSwitch-item active' : 'LangSwitch-item'}
                bindtap={() => onLocaleChange(option.value)}
              >
                <text
                  className={
                    active ? 'LangSwitch-label active' : 'LangSwitch-label'
                  }
                >
                  {option.label}
                </text>
              </view>
            );
          })}
        </view>
        <view className="Header-streak">
          <text className="Header-streak-num">{state.streak}</text>
          <text className="Header-streak-label">{t('home.dayStreak')}</text>
        </view>
      </view>
    </view>
  );
}
