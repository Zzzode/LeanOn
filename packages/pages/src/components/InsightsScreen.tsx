import { useState } from '@lynx-js/react';
import {
  buildProgressInsights,
  type ProgressInsights,
} from '@zzzode/core';
import { formatDate, type Translator } from '@zzzode/i18n';
import { buildWeightChartGeometry } from '../state/chart.js';
import { datePartsFor } from '../state/select.js';
import { fitChartTrend } from '../state/chart-trend.js';
import { formatQuantity } from '../state/theme.js';
import { useTheme } from './ThemeContext.js';
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

/** Actual points, genuine fitted line, calendar ticks and marked unlogged intervals. */
function TrendChart({ points, windowDays, startDate, endDate, t }: {
  points: ProgressInsights['weight']['points']; windowDays: number;
  startDate: string; endDate: string; t: Translator;
}) {
  const palette = useTheme();
  if (points.length === 0) return null;
  const geometry = buildWeightChartGeometry(points, windowDays);
  const xAt = (fraction: number) => 54 + fraction * 278;
  const yAt = (fraction: number) => 16 + fraction * 116;
  const ticks = geometry.ticks.map(tick => {
    const y = r1(yAt(tick.y));
    return `<line x1="54" y1="${y}" x2="332" y2="${y}" stroke="${palette.line}" stroke-width="1"/>` +
      `<text x="0" y="${y + 5}" font-size="16" fill="${palette.muted}">${tick.value.toFixed(1)}</text>`;
  }).join('');
  const dots = geometry.points.map(point => `<circle cx="${r1(xAt(point.x))}" cy="${r1(yAt(point.y))}" r="3.5" fill="${palette.weight}" stroke="${palette.paper}" stroke-width="1.5"/>`).join('');
  const intervals = geometry.points.slice(1).map((point, index) => {
    const previous = geometry.points[index]!;
    const missing = point.x - previous.x > 1 / Math.max(1, windowDays - 1) + 0.0001;
    return `<line x1="${r1(xAt(previous.x))}" y1="${r1(yAt(previous.y))}" x2="${r1(xAt(point.x))}" y2="${r1(yAt(point.y))}" stroke="${missing ? palette.muted : palette.weight}" stroke-width="2" ${missing ? 'stroke-dasharray="2 5"' : ''}/>`;
  }).join('');
  const trend = fitChartTrend(geometry.points);
  const fitted = trend.length < 2 ? '' : `<polyline points="${trend.map(point => `${r1(xAt(point.x))},${r1(yAt(point.y))}`).join(' ')}" fill="none" stroke="${palette.weight}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  const midpoint = new Date(`${startDate}T00:00:00Z`);
  midpoint.setUTCDate(midpoint.getUTCDate() + Math.floor((windowDays - 1) / 2));
  const dates = [startDate, midpoint.toISOString().slice(0, 10), endDate];
  const dateLabels = dates.map((date, index) => {
    const parts = datePartsFor(date);
    const label = t('design.chartTick', { month: parts.month + 1, day: parts.day });
    return `<text x="${xAt(index / 2)}" y="157" text-anchor="${index === 0 ? 'start' : index === 2 ? 'end' : 'middle'}" font-size="16" fill="${palette.muted}">${label}</text>`;
  }).join('');
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 170">${ticks}${intervals}${fitted}${dots}${dateLabels}</svg>`;
  const hasGaps = geometry.points.slice(1).some((point, index) => point.x - geometry.points[index]!.x > 1 / Math.max(1, windowDays - 1) + 0.0001);
  return <view><view className="TrendChart" accessibility-hidden={true}><svg className="TrendChart-svg" content={content} /></view><view className="Chart-legend"><text className="Chart-legend-text">● {t('design.chartObserved')}</text>{trend.length > 0 && <text className="Chart-legend-text">– – {t('design.chartTrend')}</text>}{hasGaps && <text className="Chart-legend-text">··· {t('design.chartGap')}</text>}</view></view>;
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
              accessibility-element={true}
              accessibility-traits="button"
              accessibility-label={days === 7 ? t('insights.range7') : t('insights.range30')}
              accessibility-value={active ? '✓' : ''}
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

      <view className="Card Insights-card Insights-weight-card">
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
                : `${t('design.chartTrend')} · ${signed1(weight.slopeKgPerWeek)} ${t('insights.kgPerWeek')}`}
            </text>
            <text className="Section-note">{t('review.chartDates', { start: formatDate(t, datePartsFor(insights.startDate)), end: formatDate(t, datePartsFor(insights.endDate)), n: weight.loggedDays })}</text>
            <TrendChart
              points={weight.points}
              windowDays={windowDays}
              startDate={insights.startDate} endDate={insights.endDate} t={t}
            />
          </view>
        )}
      </view>

      <view className="Card Insights-card Insights-secondary">
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
                {formatQuantity(nutrition.averageKcal)} {t('insights.kcal')}
              </text>
            </view>
            <text className="Section-note">{t('design.foodCoverage', { n: nutrition.loggedDays, total: windowDays })}</text><text className="Section-note">{t('review.nutritionNote')}</text>
          </view>
        )}
      </view>

      <view className="Card Insights-card Insights-secondary">
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

      <view className="Card Insights-card Insights-secondary">
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
