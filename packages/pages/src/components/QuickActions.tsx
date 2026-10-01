import type { Translator } from '@zzzode/i18n';

export function QuickActions({ t }: { t: Translator }) {
  return (
    <view className="Actions">
      <view className="Action-btn primary">
        <text className="Action-label primary">{t('action.logFood')}</text>
      </view>
      <view className="Action-btn">
        <text className="Action-label">{t('action.logWeight')}</text>
      </view>
    </view>
  );
}
