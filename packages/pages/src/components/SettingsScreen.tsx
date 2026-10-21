import { useRef, useState } from '@lynx-js/react';
import type { AppearancePreference, AppearanceState } from '@zzzode/bridge';
import type { Locale, Translator } from '@zzzode/i18n';

interface SettingsScreenProps {
  t: Translator;
  locale: Locale;
  appearance: AppearanceState;
  onAppearanceChange: (preference: AppearancePreference) => Promise<void>;
  onLocaleChange: (locale: Locale) => Promise<void>;
  onOpenReminders: () => void;
  onOpenHealthConnect: () => void;
  remindersAvailable?: boolean;
  healthAvailable?: boolean;
  migrationAvailable?: boolean;
  onOpenMigration?: () => void;
}

const LANG_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
];
const APPEARANCES = ['system', 'light', 'dark'] as const;

export function SettingsScreen({ t, locale, appearance, onAppearanceChange,
  onLocaleChange, onOpenReminders, onOpenHealthConnect,
  remindersAvailable = true, healthAvailable = true, migrationAvailable = false, onOpenMigration }: SettingsScreenProps) {
  const pending = useRef(false);
  const [saving, setSaving] = useState<'appearance' | 'locale' | null>(null);
  const [error, setError] = useState<'appearance' | 'locale' | null>(null);
  const save = async (kind: 'appearance' | 'locale', action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(kind);
    setError(null);
    try { await action(); } catch { setError(kind); }
    finally { pending.current = false; setSaving(null); }
  };
  return (
    <view className="Settings">
      <view className="ScreenTitle"><text className="ScreenTitle-text">{t('me.settings')}</text></view>
      <text className="Settings-section">{t('design.appearance')}</text>
      <view className="Card Settings-card Appearance-card">
        {APPEARANCES.map(preference => {
          const selected = preference === appearance.preference;
          const label = t(`design.appearance.${preference}`);
          return <view key={preference}
            className={`Settings-row Appearance-row${selected ? ' selected' : ''}`}
            accessibility-element={true} accessibility-label={label}
            accessibility-traits="button" accessibility-value={selected ? '✓' : ''}
            hover-class={saving === null ? 'tap-feedback-hover' : undefined}
            bindtap={saving === null ? () => void save('appearance', () => onAppearanceChange(preference)) : undefined}>
            <text className="Settings-label">{label}</text>
            <text className="Appearance-check" accessibility-hidden={true}>{selected ? '✓' : ''}</text>
          </view>;
        })}
        <text className="Settings-status" accessibility-element={true} accessibility-label={saving === 'appearance' ? t('review.saving') : t('design.appearanceResolved', { mode: t(`design.appearance.${appearance.resolved}`) })}>{saving === 'appearance' ? t('review.saving') : t('design.appearanceResolved', { mode: t(`design.appearance.${appearance.resolved}`) })}</text>
        {error === 'appearance' && <text className="Sheet-error">{t('design.settingError')}</text>}
      </view>

      <text className="Settings-section">{t('settings.language')}</text>
      <view className="Card Settings-card">
        <view className="LangSwitch Settings-language">
          {LANG_OPTIONS.map(option => {
            const active = option.value === locale;
            return <view key={option.value}
              className={`LangSwitch-item${active ? ' active' : ''}`}
              accessibility-element={true} accessibility-label={option.label}
              accessibility-traits="button" accessibility-value={active ? '✓' : ''}
              hover-class={saving === null ? 'tap-feedback-hover' : undefined}
              bindtap={saving === null ? () => void save('locale', () => onLocaleChange(option.value)) : undefined}>
              <text className={`LangSwitch-label${active ? ' active' : ''}`}>{active ? '✓ ' : ''}{option.label}</text>
            </view>;
          })}
        </view>
        {saving === 'locale' && <text className="Settings-status">{t('review.saving')}</text>}
        {error === 'locale' && <text className="Sheet-error">{t('design.settingError')}</text>}
      </view>

      <text className="Settings-section">{t('design.connectionsSection')}</text>
      <view className="Settings-connections">
        <view className="Settings-row Settings-tappable" bindtap={healthAvailable ? onOpenHealthConnect : undefined}>
          <text className="Settings-label">{t('me.healthApp')}</text>
          <text className={healthAvailable ? 'Settings-chevron' : 'Settings-value'}>{healthAvailable ? '›' : t('review.notAvailable')}</text>
        </view>
        <view className="Settings-divider" />
        <view className="Settings-row Settings-tappable" bindtap={remindersAvailable ? onOpenReminders : undefined}>
          <text className="Settings-label">{t('settings.reminders')}</text>
          <text className={remindersAvailable ? 'Settings-chevron' : 'Settings-value'}>{remindersAvailable ? '›' : t('review.hostUnsupported')}</text>
        </view>
      </view>
      <text className="Settings-section">{t('migration.title')}</text>
      <view id="migration-open" flatten={false} className="Settings-row Settings-tappable" accessibility-element={true} accessibility-traits="button" accessibility-label={t('migration.title')} bindtap={migrationAvailable?onOpenMigration:undefined}>
        <text className="Settings-label">{t('migration.title')}</text><text className={migrationAvailable?'Settings-chevron':'Settings-value'}>{migrationAvailable?'›':t('review.notAvailable')}</text>
      </view>
      <text className="Section-note">{t('review.localModeBody')}</text>
      <view className="Settings-footerWrap"><text className="Settings-footer">{t('footer.disclaimer')}</text></view>
    </view>
  );
}
