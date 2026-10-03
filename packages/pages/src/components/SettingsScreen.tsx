import type { Locale, Translator } from '@zzzode/i18n';

interface SettingsScreenProps {
  t: Translator;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onOpenReminders: () => void;
  onOpenHealthConnect: () => void;
}

const LANG_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
];

export function SettingsScreen({
  t,
  locale,
  onLocaleChange,
  onOpenReminders,
  onOpenHealthConnect,
}: SettingsScreenProps) {
  return (
    <view className="Settings">
      <text className="Settings-section">{t('settings.sectionGeneral')}</text>
      <view className="Card Settings-card">
        <view className="Settings-row">
          <text className="Settings-label">{t('settings.language')}</text>
          <view className="LangSwitch">
            {LANG_OPTIONS.map((option) => {
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
        </view>
      </view>

      <text className="Settings-section">{t('settings.sectionHealth')}</text>
      <view className="Card Settings-card">
        <view className="Settings-row Settings-tappable" bindtap={onOpenReminders}>
          <text className="Settings-label">{t('settings.reminders')}</text>
          <text className="Settings-chevron">›</text>
        </view>
        <view className="Settings-divider" />
        <view
          className="Settings-row Settings-tappable"
          bindtap={onOpenHealthConnect}
        >
          <text className="Settings-label">{t('settings.healthConnect')}</text>
          <text className="Settings-chevron">›</text>
        </view>
      </view>

      <view className="Settings-footerWrap">
        <text className="Settings-footer">{t('footer.disclaimer')}</text>
      </view>
    </view>
  );
}
