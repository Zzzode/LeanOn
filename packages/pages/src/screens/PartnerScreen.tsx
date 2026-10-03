import { useState } from '@lynx-js/react';
import type { ScreenProps } from './types.js';

/**
 * Two-person surface. Real partner records arrive with account linking/sync
 * (RFC 0008); until then the partner card shows a not-linked state and the
 * shared goal reflects the local user's contribution.
 */
export function PartnerScreen({ state, t }: ScreenProps) {
  const [cheered, setCheered] = useState(false);
  const totalGoalKg = state.weightLostKg + state.weightToGoalKg;
  const pct = totalGoalKg > 0 ? (state.weightLostKg / totalGoalKg) * 100 : 0;

  return (
    <view className="Tab-pane">
      <view className="ScreenTitleRow">
        <text className="ScreenTitle-text">{t('partner.title')}</text>
        <view className="PartnerDays">
          <text className="PartnerDays-text">
            {t('partner.partnerDays', { n: state.streak })}
          </text>
        </view>
      </view>

      <view className="Card PersonCard">
        <view className="Person-head">
          <view className="Person-id">
            <text className="Person-avatar Person-avatar-you">D</text>
            <view>
              <text className="Person-name">{t('partner.you')}</text>
              <text className="Person-sub">
                {state.remainingKcal} kcal left · streak {state.streak}
              </text>
            </view>
          </view>
          <text className="Person-trend Person-trend-good">
            ▼ {Math.abs(state.trendKgPerWeek).toFixed(1)}
          </text>
        </view>
        <view className="Person-line"></view>
        <view className="Person-foot">
          <text className="Person-foot-label">
            Weight {state.currentWeightKg} kg
          </text>
          <text className="Person-foot-meta">{t('weight.kgPerWeek')}</text>
        </view>
      </view>

      <view className="Card PersonCard">
        <view className="Person-head">
          <view className="Person-id">
            <text className="Person-avatar Person-avatar-empty">?</text>
            <view>
              <text className="Person-name">{t('partner.partner')}</text>
              <text className="Person-sub">{t('partner.notLinked')}</text>
            </view>
          </view>
        </view>
        <view className="Person-line"></view>
        <text className="Person-linkbody">{t('partner.linkBody')}</text>
        <view className="Person-linkbtn">
          <text className="Person-linkbtn-text">
            {t('partner.linkPartner')}
          </text>
        </view>
      </view>

      <view className="Card">
        <text className="Card-title">{t('partner.sharedGoal')}</text>
        <view className="Person-goalrow">
          <text className="Person-goallabel">
            {t('partner.togetherLost')}
          </text>
          <text className="Person-goalval">
            {state.weightLostKg.toFixed(1)} kg
          </text>
        </view>
        <view className="GoalBar">
          <view
            className="GoalBar-fill"
            style={{ width: `${pct.toFixed(0)}%` }}
          ></view>
        </view>
      </view>

      <view className="Card">
        <view className="Support-row">
          <view className="Support-btn" bindtap={() => setCheered(true)}>
            <text className="Support-btn-text">
              {cheered ? `✓ ${t('partner.cheerSent')}` : `❤ ${t('partner.cheer')}`}
            </text>
          </view>
          <view className="Support-btn">
            <text className="Support-btn-text">🤗 {t('partner.hug')}</text>
          </view>
          <view className="Support-btn">
            <text className="Support-btn-text">✎ {t('partner.note')}</text>
          </view>
        </view>
      </view>
    </view>
  );
}
