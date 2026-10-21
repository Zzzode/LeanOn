import type { ScreenProps } from './types.js';

/** Account linking has not shipped; never imply shared data or message delivery. */
export function PartnerScreen({ t, actions }: Pick<ScreenProps, 't' | 'actions'>) {
  return (
    <view className="Tab-pane">
      <view className="ScreenTitle"><text className="ScreenTitle-text">{t('partner.title')}</text></view>
      <view className="Card PartnerWelcome">
        <view className="Pair-mark" accessibility-hidden={true}>
          <view className="Pair-circle" /><view className="Pair-circle Pair-second" />
        </view>
        <text className="Empty-title">{t('review.partnerWelcome')}</text>
        <text className="Empty-body">{t('review.partnerBody')}</text>
        <text className="Section-kicker">{t('review.notAvailable')}</text>
        <text className="Section-note">{t('review.partnerUnavailable')}</text>
      </view>
      <view className="Card">
        <text className="Card-title">{t('review.togetherIdeas')}</text>
        <text className="Section-note">{t('review.walkTogether')}</text>
        <text className="Section-note">{t('review.mealTogether')}</text>
        <text className="Section-note">{t('review.encourageTogether')}</text>
      </view>
      <view className="Action-btn" bindtap={actions.openSettings} accessibility-label={t('me.settings')}>
        <text className="Action-label">{t('me.settings')}</text>
      </view>
    </view>
  );
}
