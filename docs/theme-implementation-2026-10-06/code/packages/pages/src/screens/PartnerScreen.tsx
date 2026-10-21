import { BrandHeader } from '../components/BrandHeader.js';
import { useTheme } from '../components/ThemeContext.js';
import type { ScreenProps } from './types.js';

/** A local unavailable state; no invented partner, shared record or sent message. */
export function PartnerScreen({ t, actions }: Pick<ScreenProps, 't' | 'actions'>) {
  const palette = useTheme();
  const motif = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 144"><circle cx="64" cy="30" r="10" fill="${palette.weight}"/><circle cx="88" cy="27" r="10" fill="${palette.partner}"/><rect x="36" y="46" width="48" height="86" rx="24" fill="${palette.weightTint}" transform="rotate(8 60 89)"/><rect x="76" y="42" width="48" height="90" rx="24" fill="${palette.partnerTint}" transform="rotate(-8 100 87)"/><path d="M24 137h112" fill="none" stroke="${palette.brand}" stroke-width="1.75" stroke-linecap="round"/></svg>`;
  return <view className="Tab-pane Partner-page">
    <BrandHeader />
    <view className="ScreenTitle"><text className="ScreenTitle-text">{t('partner.title')}</text><text className="ScreenTitle-note">{t('review.notAvailable')}</text></view>
    <view className="Partner-motif" accessibility-hidden={true}><svg className="Partner-motif-svg" content={motif} /></view>
    <text className="Partner-heading">{t('review.partnerWelcome')}</text>
    <text className="Partner-body">{t('review.partnerBody')}</text>
    <view className="Open-section Partner-status"><text className="Section-heading">{t('design.currentStatus')}</text><text className="Partner-local">{t('review.localMode')}</text><text className="Section-note">{t('review.partnerUnavailable')}</text></view>
    <view className="Partner-settings" accessibility-element={true} accessibility-traits="link" accessibility-label={t('design.viewSettings')} hover-class="tap-feedback-hover" bindtap={actions.openSettings}><text className="Partner-settings-label">{t('design.viewSettings')}  →</text></view>
    <view className="Open-section Partner-ideas"><text className="Section-heading">{t('review.togetherIdeas')}</text><text className="Section-note">{t('review.walkTogether')}</text><text className="Section-note">{t('review.mealTogether')}</text><text className="Section-note">{t('review.encourageTogether')}</text></view>
  </view>;
}
