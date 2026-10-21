import type { ReactNode } from '@lynx-js/react';
import { IconBell, IconDiet, IconExport, IconHealth, IconInfo, IconScale, IconSettings } from '../components/MeIcons.js';
import type { ScreenProps } from './types.js';

interface MeRowProps { icon: ReactNode; label: string; val?: string; onTap?: () => void }
function MeRow({ icon, label, val, onTap }: MeRowProps) {
  return <view className="MeRow" flatten={onTap === undefined ? undefined : false}
    accessibility-element={true} accessibility-label={val === undefined ? label : `${label} · ${val}`}
    accessibility-traits={onTap === undefined ? 'text' : 'button'}
    hover-class={onTap === undefined ? undefined : 'tap-feedback-hover'} bindtap={onTap}>
    {icon}<text className="MeRow-label">{label}</text>{val !== undefined && <text className="MeRow-val">{val}</text>}{onTap !== undefined && <text className="MeRow-chev" accessibility-hidden={true}>›</text>}
  </view>;
}

/** Local read-only identity and available tools precede unavailable connections. */
export function MeScreen({ hostData, locale, t, actions, supports }: Omit<ScreenProps, 'state' | 'supports'> & { state: ScreenProps['state'] | null; supports: (method: string) => boolean }) {
  return <view className="Tab-pane">
    <view className="ScreenTitle"><text className="ScreenTitle-text">{t('me.title')}</text></view>
    <view className="Card MeProfile">
      <view className="Summary-heading"><text className="Section-heading">{t('design.localProfile')}</text><text className="Summary-status">{t('review.readOnly')}</text></view>
      <view className="MeProfile-stats"><view><text className="Metric-label">{t('me.profile')}</text><text className="MeProfile-value">{hostData.profile.heightCm} cm</text></view><view><text className="Metric-label">{t('me.goals')}</text><text className="MeProfile-value">{hostData.goalWeightKg} kg</text></view></view>
    </view>
    <view className="Open-section MeList"><text className="Section-heading">{t('design.appSection')}</text>
      <MeRow icon={<IconSettings />} label={t('me.settings')} val={locale === 'zh-CN' ? '中文' : 'English'} onTap={actions.openSettings} />
      <MeRow icon={<IconInfo />} label={t('me.about')} onTap={actions.openAbout} />
    </view>
    <view className="Open-section MeList"><text className="Section-heading">{t('design.connectionsSection')}</text>
      <MeRow icon={<IconHealth />} label={t('me.healthApp')} val={supports('healthConnect.getStatus') ? undefined : t('review.notAvailable')} onTap={supports('healthConnect.getStatus') ? actions.openHealthConnections : undefined} />
      <MeRow icon={<IconScale />} label={t('me.connectedScale')} val={supports('scale.scan') ? undefined : t('review.notAvailable')} onTap={supports('scale.scan') ? actions.openScale : undefined} />
      <MeRow icon={<IconBell />} label={t('me.reminders')} val={supports('notification.getSettings') ? undefined : t('review.notAvailable')} onTap={supports('notification.getSettings') ? actions.openReminders : undefined} />
      <MeRow icon={<IconDiet />} label={t('me.dietPrefs')} val={t('review.notAvailable')} />
      <MeRow icon={<IconExport />} label={t('me.dataExport')} val={t('review.notAvailable')} />
    </view>
    <text className="Section-note">{t('review.localModeBody')}</text>
    <text className="MeVersion">LeanOn v0.1.0 · Apache-2.0</text>
  </view>;
}
