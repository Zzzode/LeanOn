import { useState } from '@lynx-js/react';
import {
  buildProgressInsights,
  type ProgressInsights,
} from '@zzzode/core';
import type { Translator } from '@zzzode/i18n';
import type { HostData } from '../state/types';

interface InsightsScreenProps {
  hostData: HostData;
  budgetKcal: number;
  t: Translator;
}

/** Signed one-decimal value with an explicit sign, e.g. -1.2 / +0.4. */
function signed1(value: number): string {
  return `${value < 0 ? '-' : '+'}${Math.abs(value).toFixed(1)}`;
}

/**
 * Compact weight trend as horizontal bars, one per day. Bar width is
 * normalized within the window, so a downward trend reads as shortening bars.
 * The outer flow is the default column and each line is an inner row, which
 * renders reliably on both the Lynx web runtime and native.
 */
function TrendChart({
  points,
}: {
  points: ProgressInsights['weight']['points'];
}) {
  if (points.length === 0) return null;
  const ys = points.map((point) => point.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min;
  return (
    <view className="Trend-hbars">
      {points.map((point, index) => {
        const ratio = span === 0 ? 1 : (point.y - min) / span;
        const width = 26 + ratio * 74;
        return (
          <view key={index} className="Trend-hrow">
            <view
              className="Trend-hbar"
              style={{ width: `${width.toFixed(1)}%`, height: '12rpx' }}
            />
          </view>
        );
      })}
    </view>
  );
}

/** Progress / Insights screen: weight trend, adherence and consistency (RFC 0019). */
export function InsightsScreen({
  hostData,
  budgetKcal,
  t,
}: InsightsScreenProps) {
  const [windowDays, setWindowDays] = useState<number>(7);
  const insights = buildProgressInsights({
    endDate: hostData.today,
    windowDays,
    weights: hostData.weights,
    intake: hostData.intake,
    exercises: hostData.exercises,
    dailyBudgetKcal: budgetKcal,
  });
  const { weight, nutrition, exercise } = insights;

  const tone =
    weight.changeKg === null || weight.changeKg === 0
      ? ''
      : weight.changeKg < 0
        ? ' loss'
        : ' gain';

  return (
    <view className="Insights">
      <view className="LangSwitch Insights-range">
        {[7, 30].map((days) => {
          const active = windowDays === days;
          return (
            <view
              key={days}
              className={
                active ? 'LangSwitch-item active' : 'LangSwitch-item'
              }
              bindtap={() => setWindowDays(days)}
            >
              <text
                className={
                  active
                    ? 'LangSwitch-label active'
                    : 'LangSwitch-label'
                }
              >
                {days === 7
                  ? t('insights.range7')
                  : t('insights.range30')}
              </text>
            </view>
          );
        })}
      </view>

      <view className="Card Insights-card">
        <text className="Insights-card-title">{t('insights.weight')}</text>
        {weight.changeKg === null ? (
          <text className="Insights-empty">{t('insights.notEnough')}</text>
        ) : (
          <view className="Insights-weight-body">
            <view className="Insights-weight-main">
              <text className={`Insights-big${tone}`}>
                {signed1(weight.changeKg)}
              </text>
              <text className="Insights-big-unit">{t('insights.kg')}</text>
            </view>
            <text className="Insights-slope">
              {weight.slopeKgPerWeek === null
                ? t('insights.notEnough')
                : `${signed1(weight.slopeKgPerWeek)} ${t('insights.kgPerWeek')}`}
            </text>
            <TrendChart points={weight.points} />
          </view>
        )}
      </view>

      <view className="Card Insights-card">
        <text className="Insights-card-title">{t('insights.nutrition')}</text>
        {nutrition.averageKcal === null ? (
          <text className="Insights-empty">{t('insights.notEnough')}</text>
        ) : (
          <view>
            <view className="Insights-row">
              <text className="Insights-row-label">
                {t('insights.average')}
              </text>
              <text className="Insights-row-value">
                {Math.round(nutrition.averageKcal)} {t('insights.kcal')}
              </text>
            </view>
            <view className="Insights-row">
              <text className="Insights-row-label">
                {t('insights.onTarget')}
              </text>
              <text className="Insights-row-value">
                {nutrition.onTargetDays}/{nutrition.loggedDays}
              </text>
            </view>
            <view className="Insights-row">
              <text className="Insights-row-label">
                {t('insights.deficit')}
              </text>
              <text className="Insights-row-value">
                {Math.round(
                  Math.max(0, nutrition.averageDeficitKcal ?? 0),
                )}{' '}
                {t('insights.kcal')}
              </text>
            </view>
          </view>
        )}
      </view>

      <view className="Card Insights-card">
        <text className="Insights-card-title">{t('insights.exercise')}</text>
        <view className="Insights-row">
          <text className="Insights-row-label">
            {t('insights.activeDays')}
          </text>
          <text className="Insights-row-value">{exercise.activeDays}</text>
        </view>
        <view className="Insights-row">
          <text className="Insights-row-label">
            {t('insights.exerciseTotal')}
          </text>
          <text className="Insights-row-value">
            {exercise.totalKcal} {t('insights.kcal')} · {exercise.totalMin}{' '}
            {t('insights.min')}
          </text>
        </view>
      </view>

      <view className="Card Insights-card">
        <text className="Insights-card-title">
          {t('insights.consistency')}
        </text>
        <view className="Insights-row">
          <text className="Insights-row-label">
            {t('insights.weightLogged')}
          </text>
          <text className="Insights-row-value">
            {weight.loggedDays}/{windowDays}
          </text>
        </view>
        <view className="Insights-row">
          <text className="Insights-row-label">
            {t('insights.foodLogged')}
          </text>
          <text className="Insights-row-value">
            {nutrition.loggedDays}/{windowDays}
          </text>
        </view>
      </view>
    </view>
  );
}
