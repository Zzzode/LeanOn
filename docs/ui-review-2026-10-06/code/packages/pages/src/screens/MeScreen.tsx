import type { ReactNode } from '@lynx-js/react';
import {
  IconBell,
  IconDiet,
  IconExport,
  IconGoal,
  IconHealth,
  IconInfo,
  IconProfile,
  IconScale,
  IconSettings,
} from '../components/MeIcons.js';
import type { ScreenProps } from './types.js';

interface MeRowProps {
  icon: ReactNode;
  label: string;
  val?: string;
  onTap?: () => void;
}

function MeRow({ icon, label, val, onTap }: MeRowProps) {
  return (
    <view
      className="MeRow"
      flatten={onTap === undefined ? undefined : false}
      hover-class={onTap === undefined ? undefined : 'tap-feedback-hover'}
      bindtap={onTap}
    >
      {icon}
      <text className="MeRow-label">{label}</text>
      {val !== undefined ? <text className="MeRow-val">{val}</text> : null}
      {onTap !== undefined ? <text className="MeRow-chev">›</text> : null}
    </view>
  );
}

/** Profile tab: identity, sign-in, goals, integrations and settings. */
export function MeScreen({ state, hostData, locale, t, actions, supports }: Omit<ScreenProps, 'state'> & { state: ScreenProps['state'] | null; supports: (method: string) => boolean }) {
  return (
    <view className="Tab-pane">
      <view className="Card MeProfile">
        <view className="MeProfile-head">
          <view className="MeProfile-avatar"><IconProfile /></view>
          <view className="MeProfile-id">
            <text className="MeProfile-name">{t('me.guest')}</text>
            <text className="MeProfile-sub">
              {state === null ? t('review.weightFirst') : `${state.startWeightKg} → ${state.goalWeightKg} kg`}
            </text>
          </view>
        </view>
      </view>

      <view className="Card">
        <text className="Card-title">{t('review.localMode')}</text>
        <text className="Section-note">{t('review.localModeBody')}</text>
      </view>

      <view className="Card MeList">
        <MeRow icon={<IconProfile />} label={t('me.profile')} val={`${hostData.profile.heightCm} cm`} />
        <MeRow
          icon={<IconGoal />}
          label={t('me.goals')}
          val={`${hostData.goalWeightKg} kg`}
        />
        <MeRow icon={<IconDiet />} label={t('me.dietPrefs')} val={t('review.notAvailable')} />
        <view className="MeList-line"></view>
        <MeRow
          icon={<IconHealth />}
          label={t('me.healthApp')}
          val={supports('healthConnect.getStatus') ? undefined : t('review.notAvailable')}
          onTap={supports('healthConnect.getStatus') ? actions.openHealthConnections : undefined}
        />
        <MeRow icon={<IconScale />} label={t('me.connectedScale')} val={supports('scale.scan') ? undefined : t('review.notAvailable')} onTap={supports('scale.scan') ? actions.openScale : undefined} />
        <MeRow
          icon={<IconBell />}
          label={t('me.reminders')}
          val={supports('notification.getSettings') ? undefined : t('review.notAvailable')}
          onTap={supports('notification.getSettings') ? actions.openReminders : undefined}
        />
        <view className="MeList-line"></view>
        <MeRow
          icon={<IconSettings />}
          label={t('me.settings')}
          val={locale === 'zh-CN' ? '中文' : 'English'}
          onTap={actions.openSettings}
        />
        <MeRow icon={<IconExport />} label={t('me.dataExport')} val={t('review.notAvailable')} />
        <MeRow icon={<IconInfo />} label={t('me.about')} onTap={actions.openAbout} />
      </view>
      <text className="MeVersion">LeanOn v0.1.0 · Apache-2.0</text>
    </view>
  );
}
