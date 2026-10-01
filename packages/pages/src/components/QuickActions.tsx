import type { Translator } from '@zzzode/i18n';

interface QuickActionsProps {
  t: Translator;
  onLogWeight: () => void;
}

export function QuickActions({ t, onLogWeight }: QuickActionsProps) {
  return (
    <view className="Actions">
      <view className="Action-btn primary">
        <text className="Action-label primary">{t('action.logFood')}</text>
      </view>
      <view className="Action-btn" bindtap={onLogWeight}>
        <text className="Action-label">{t('action.logWeight')}</text>
      </view>
    </view>
  );
}
