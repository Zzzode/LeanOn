import type { MessageKey, Translator } from '@zzzode/i18n';
import {
  recommendWaterGoalMl,
  waterForDate,
  type WaterSample,
} from '@zzzode/core';
import { Card } from './Card.js';
import { ProgressBar } from './ProgressBar.js';

/** Standard cup size used by the quick +/− controls (RFC 0023). */
export const CUP_ML = 250;

interface WaterCardProps {
  today: string;
  water: WaterSample[];
  currentWeightKg: number;
  t: Translator;
  /** Persist the new absolute day total after a +/− cup tap. */
  onSetTotal: (amountMl: number) => void;
}

export function WaterCard({
  today,
  water,
  currentWeightKg,
  t,
  onSetTotal,
}: WaterCardProps) {
  const currentMl = waterForDate(water, today);
  const goalMl = recommendWaterGoalMl(currentWeightKg);
  const reached = currentMl >= goalMl;
  const fraction = goalMl > 0 ? currentMl / goalMl : 0;
  const leftMl = Math.max(0, goalMl - currentMl);
  const canRemove = currentMl > 0;

  const add = () => onSetTotal(currentMl + CUP_ML);
  const remove = () => onSetTotal(Math.max(0, currentMl - CUP_ML));

  return (
    <Card>
      <view className="Water-head">
        <text className="Card-title">{t('water.title')}</text>
        <view className="Water-amountWrap">
          <text className="Water-amount">{currentMl}</text>
          <text className="Water-unit">{t('water.ml')}</text>
        </view>
      </view>
      <ProgressBar fraction={fraction} color="#218967" />
      <view className="Water-meta">
        <text className="Water-status">
          {reached
            ? t('water.reached')
            : t('water.left', { amount: leftMl })}
        </text>
        <text className="Water-goal">
          {t('water.goal')} {goalMl}
        </text>
      </view>
      <view className="Water-controls">
        <view
          className={canRemove ? 'Water-btn' : 'Water-btn disabled'}
          bindtap={canRemove ? remove : undefined}
        >
          <text className="Water-btn-label">{t('water.remove')}</text>
        </view>
        <view className="Water-btn primary" bindtap={add}>
          <text className="Water-btn-label primary">{t('water.add')}</text>
        </view>
      </view>
    </Card>
  );
}

// Re-exported for type-checking of the label key union (kept in sync with i18n).
export type WaterLabelKey = Extract<MessageKey, `water.${string}`>;
