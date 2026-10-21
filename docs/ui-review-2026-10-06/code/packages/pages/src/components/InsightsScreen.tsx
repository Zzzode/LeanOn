import { useState } from '@lynx-js/react';
import {
  buildProgressInsights,
  type ProgressInsights,
} from '@zzzode/core';
import { formatDate, type Translator } from '@zzzode/i18n';
import { buildWeightChartGeometry } from '../state/chart.js';
import { datePartsFor } from '../state/select.js';
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


const r1 = (value: number): number => Math.round(value * 10) / 10;

/** Native SVG graph with a local trend domain and calendar-spaced observations. */
function TrendChart({ points, windowDays }: {
  points: ProgressInsights['weight']['points'];
  windowDays: number;
}) {
  if (points.length === 0) return null;
  const geometry = buildWeightChartGeometry(points, windowDays);
  const xAt = (fraction: number) => 46 + fraction * 286;
  const yAt = (fraction: number) => 20 + fraction * 126;
  const line = geometry.points.map(p => `${r1(xAt(p.x))},${r1(yAt(p.y))}`).join(' ');
  const ticks = geometry.ticks.map(tick => {
    const y = r1(yAt(tick.y));
    return `<line x1="46" y1="${y}" x2="332" y2="${y}" stroke="#e3e5e8" stroke-width="1"/>` +
      `<text x="2" y="${y + 4}" font-size="12" fill="#646970">${tick.value.toFixed(1)}</text>`;
  }).join('');
  const dots = geometry.points.map(p => `<circle cx="${r1(xAt(p.x))}" cy="${r1(yAt(p.y))}" r="4" fill="#456781" stroke="#fff" stroke-width="2"/>`).join('');
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 170">${ticks}<polyline points="${line}" fill="none" stroke="#456781" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
  return <view className="TrendChart"><svg className="TrendChart-svg" content={content} /></view>;
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
              hover-class="tap-feedback-hover"
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
              <text className="Insights-big">
                {signed1(weight.changeKg)}
              </text>
              <text className="Insights-big-unit">{t('insights.kg')}</text>
            </view>
            <text className="Insights-slope">
              {weight.slopeKgPerWeek === null
                ? t('insights.notEnough')
                : `${signed1(weight.slopeKgPerWeek)} ${t('insights.kgPerWeek')}`}
            </text>
            <text className="Section-note">{t('review.chartDates', { start: formatDate(t, datePartsFor(insights.startDate)), end: formatDate(t, datePartsFor(insights.endDate)), n: weight.loggedDays })}</text>
            <TrendChart
              points={weight.points}
              windowDays={windowDays}
            />
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
            <text className="Section-note">{t('review.nutritionNote')}</text>
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
