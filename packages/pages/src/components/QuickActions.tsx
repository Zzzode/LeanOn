import type { Translator } from '@zzzode/i18n';

interface QuickActionsProps {
  t: Translator;
  onLogFood: () => void;
  onLogWeight: () => void;
  onLogExercise: () => void;
}

export function QuickActions({
  t,
  onLogFood,
  onLogWeight,
  onLogExercise,
}: QuickActionsProps) {
  return (
    <view className="Actions">
      <view className="Action-btn primary tap-feedback" hover-class="tap-feedback-hover" bindtap={onLogFood}>
        <text className="Action-label primary">{t('action.logFood')}</text>
      </view>
      <view className="Action-row">
        <view className="Action-btn tap-feedback" hover-class="tap-feedback-hover" bindtap={onLogWeight}>
          <text className="Action-label">{t('action.logWeight')}</text>
        </view>
        <view className="Action-btn tap-feedback" hover-class="tap-feedback-hover" bindtap={onLogExercise}>
          <text className="Action-label">{t('action.logExercise')}</text>
        </view>
      </view>
    </view>
  );
}
