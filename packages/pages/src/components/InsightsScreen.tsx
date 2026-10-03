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

const CHART_WIDTH = 350;
const CHART_HEIGHT = 200;
const PLOT_LEFT = 20;
const PLOT_RIGHT = 330;
const PLOT_TOP = 30;
const PLOT_BOTTOM = CHART_HEIGHT - 40;

const r1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Weight trend as an SVG line chart. Lynx renders SVG through the `svg`
 * element's `content` attribute (a markup string), which works on both the
 * web runtime and native; presentation attributes are inlined so the chart
 * renders even if page CSS does not reach SVG sub-elements. The optional
 * goal weight is folded into the y-domain so its dashed line stays visible.
 */
function TrendChart({
  points,
  goalWeightKg,
}: {
  points: ProgressInsights['weight']['points'];
  goalWeightKg?: number;
}) {
  if (points.length === 0) return null;
  const ys = points.map((point) => point.y);
  const dataMin = Math.min(...ys);
  const dataMax = Math.max(...ys);
  let min = dataMin;
  let max = dataMax;
  if (goalWeightKg !== undefined) {
    min = Math.min(min, goalWeightKg);
    max = Math.max(max, goalWeightKg);
  }
  const span = max - min;
  const count = points.length;
  const xAt = (index: number): number =>
    count === 1
      ? (PLOT_LEFT + PLOT_RIGHT) / 2
      : PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * index) / (count - 1);
  const yAt = (weight: number): number =>
    span === 0
      ? (PLOT_TOP + PLOT_BOTTOM) / 2
      : PLOT_BOTTOM - ((weight - min) / span) * (PLOT_BOTTOM - PLOT_TOP);

  const coords = points.map((point, index) => ({
    x: xAt(index),
    y: yAt(point.y),
  }));
  const first = coords[0]!;
  const last = coords[count - 1]!;
  const linePoints = coords
    .map((coord) => `${r1(coord.x)},${r1(coord.y)}`)
    .join(' ');
  const areaPoints = `${r1(first.x)},${PLOT_BOTTOM} ${linePoints} ${r1(last.x)},${PLOT_BOTTOM}`;
  const dots = coords
    .map(
      (coord) =>
        `<circle class="TrendChart-dot" cx="${r1(coord.x)}" cy="${r1(coord.y)}" r="3" fill="#218967"/>`,
    )
    .join('');
  const currentDot = `<circle class="TrendChart-dot-current" cx="${r1(last.x)}" cy="${r1(last.y)}" r="5" fill="#218967" stroke="#ffffff" stroke-width="3"/>`;
  const goalLine =
    goalWeightKg === undefined
      ? ''
      : `<line class="TrendChart-goal" x1="${PLOT_LEFT}" y1="${r1(yAt(goalWeightKg))}" x2="${PLOT_RIGHT}" y2="${r1(yAt(goalWeightKg))}" stroke="#b6c0ba" stroke-width="2" stroke-dasharray="8 6"/>`;
  const labels =
    `<text class="TrendChart-label" x="2" y="${PLOT_TOP + 2}" font-size="10" fill="#8a988f">${dataMax.toFixed(1)}</text>` +
    `<text class="TrendChart-label" x="2" y="${PLOT_BOTTOM + 12}" font-size="10" fill="#8a988f">${dataMin.toFixed(1)}</text>`;
  const content =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">` +
    `<polygon class="TrendChart-area" points="${areaPoints}" fill="#218967" opacity="0.08"/>` +
    goalLine +
    `<polyline class="TrendChart-line" points="${linePoints}" fill="none" stroke="#218967" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    dots +
    currentDot +
    labels +
    `</svg>`;

  return (
    <view className="TrendChart">
      <svg className="TrendChart-svg" content={content} />
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
            <TrendChart
              points={weight.points}
              goalWeightKg={hostData.goalWeightKg}
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
