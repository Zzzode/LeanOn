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
      <text className="MeRow-chev">›</text>
    </view>
  );
}

/** Profile tab: identity, sign-in, goals, integrations and settings. */
export function MeScreen({ state, locale, t, actions }: ScreenProps) {
  return (
    <view className="Tab-pane">
      <view className="Card MeProfile">
        <view className="MeProfile-head">
          <text className="MeProfile-avatar">D</text>
          <view className="MeProfile-id">
            <text className="MeProfile-name">{t('me.guest')}</text>
            <text className="MeProfile-sub">
              {state.startWeightKg} → {state.goalWeightKg} kg
            </text>
          </view>
        </view>
      </view>

      <view className="Card MeSignin">
        <view className="MeSignin-text">
          <text className="MeSignin-title">{t('me.signIn')}</text>
          <text className="MeSignin-body">{t('me.signInBody')}</text>
        </view>
        <view className="MeSignin-btn">
          <text className="MeSignin-btn-text">{t('me.signIn')}</text>
        </view>
      </view>

      <view className="Card MeList">
        <MeRow icon={<IconProfile />} label={t('me.profile')} />
        <MeRow
          icon={<IconGoal />}
          label={t('me.goals')}
          val={`${state.goalWeightKg} kg`}
        />
        <MeRow icon={<IconDiet />} label={t('me.dietPrefs')} />
        <view className="MeList-line"></view>
        <MeRow
          icon={<IconHealth />}
          label={t('me.healthApp')}
          onTap={actions.openHealthConnections}
        />
        <MeRow icon={<IconScale />} label={t('me.connectedScale')} />
        <MeRow
          icon={<IconBell />}
          label={t('me.reminders')}
          onTap={actions.openReminders}
        />
        <view className="MeList-line"></view>
        <MeRow
          icon={<IconSettings />}
          label={t('me.settings')}
          val={locale === 'zh-CN' ? '中文' : 'English'}
          onTap={actions.openSettings}
        />
        <MeRow icon={<IconExport />} label={t('me.dataExport')} />
        <MeRow icon={<IconInfo />} label={t('me.about')} />
      </view>
      <text className="MeVersion">LeanOn v0.1.0 · Apache-2.0</text>
    </view>
  );
}
