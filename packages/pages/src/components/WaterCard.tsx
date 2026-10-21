import type { MessageKey, Translator } from '@zzzode/i18n';
import { useRef, useState } from '@lynx-js/react';
import type { WaterSample } from '@zzzode/core';
import { Card } from './Card.js';
import { ProgressBar } from './ProgressBar.js';
import { useTheme } from './ThemeContext.js';
import { commitWaterChange, CUP_ML, waterSummary } from '../state/water.js';
import { formatQuantity } from '../state/theme.js';

/** Standard cup size used by the quick +/− controls (RFC 0023). */
export { CUP_ML } from '../state/water.js';

interface WaterCardProps {
  today: string;
  water: WaterSample[];
  currentWeightKg?: number;
  t: Translator;
  available?: boolean;
  /** Persist the new absolute day total after a +/− cup tap. */
  onSetTotal: (amountMl: number) => Promise<void>;
}

export function WaterCard({
  today,
  water,
  currentWeightKg,
  t,
  available = false,
  onSetTotal,
}: WaterCardProps) {
  const palette = useTheme();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const { currentMl, goalMl } = waterSummary(water, today, currentWeightKg);
  const canRemove = currentMl > 0 && !saving;
  const update = async (delta: number) => {
    if (pending.current || !available) return;
    setSaving(true);
    setError(false);
    try { await commitWaterChange(pending, currentMl, delta, onSetTotal); }
    catch { setError(true); }
    finally { setSaving(false); }
  };

  return (
    <Card className="Open-section Theme-water Water-summary">
      <view className="Water-row">
        <view className="Water-heading">
          <text className="Category-label water">{t('water.title')}</text>
          <view className="Water-amountWrap">
            <text className="Water-amount">{formatQuantity(currentMl)}</text>
            <text className="Water-unit">{t('water.ml')}</text>
          </view>
        </view>
        {available ? <view className="Water-controls">
          <view className={canRemove ? 'Water-btn tap-feedback' : 'Water-btn disabled'}
            accessibility-element={true} accessibility-traits="button" accessibility-label={t('water.remove')}
            hover-class={canRemove ? 'tap-feedback-hover' : undefined}
            bindtap={canRemove ? () => void update(-CUP_ML) : undefined}>
            <text className="Water-btn-label">−250</text>
          </view>
          <view className={saving ? 'Water-btn disabled' : 'Water-btn primary tap-feedback'}
            accessibility-element={true} accessibility-traits="button" accessibility-label={t('water.add')}
            hover-class={saving ? undefined : 'tap-feedback-hover'}
            bindtap={saving ? undefined : () => void update(CUP_ML)}>
            <text className="Water-btn-label primary">+250</text>
          </view>
        </view> : <text className="Section-note">{t('review.notAvailable')}</text>}
      </view>
      {goalMl !== null && <view className="Water-meta">
        <text className="Water-status">{currentMl >= goalMl ? t('water.reached')
          : t('water.left', { amount: formatQuantity(Math.max(0, goalMl - currentMl)) })}</text>
        <text className="Water-goal">{t('water.goal')} {formatQuantity(goalMl)} {t('water.ml')}</text>
      </view>}
      {goalMl !== null && <view className="Water-progress"><ProgressBar fraction={currentMl / goalMl} color={palette.waterText} /></view>}
      {saving && <text className="Settings-status" accessibility-element={true}>{t('review.saving')}</text>}
      {error && <text className="Sheet-error" accessibility-element={true}>{t('water.error')}</text>}
    </Card>
  );
}

// Re-exported for type-checking of the label key union (kept in sync with i18n).
export type WaterLabelKey = Extract<MessageKey, `water.${string}`>;
