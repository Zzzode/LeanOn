import { useEffect, useRef, useState } from '@lynx-js/react';
import type { Translator } from '@zzzode/i18n';

interface InputEvent {
  detail: { value: string };
}

interface WeightSheetProps {
  currentWeightKg?: number;
  t: Translator;
  canSave?: boolean;
  canPairScale?: boolean;
  onClose: () => void;
  onPairScale: () => void;
  onSave: (weightKg: number) => Promise<void>;
}

/**
 * Bottom sheet for logging today's weight. It is mounted only while open, so the
 * field is always initialised to the current weight. `default-value` needs
 * Android 4.0, so on 3.9 we prefill imperatively via the input's `setValue`
 * method (supported since 1.5). Save runs the typed bridge write; the parent
 * refreshes from the host-returned HostData (RFC 0010).
 */
export function WeightSheet({
  currentWeightKg,
  t,
  canSave = true,
  canPairScale = true,
  onClose,
  onPairScale,
  onSave,
}: WeightSheetProps) {
  const initial = currentWeightKg === undefined ? '' : String(currentWeightKg);
  const [value, setValue] = useState<string>(initial);
  const pending = useRef(false);
  const handleClose = () => { if (!pending.current) onClose(); };
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const numericValue = Number(value);
  const invalid = error !== null &&
    (!Number.isFinite(numericValue) || numericValue < 20 || numericValue > 300);

  useEffect(() => {
    lynx
      .createSelectorQuery()
      .select('#weight-input')
      .invoke({ method: 'setValue', params: { value: initial } })
      .exec();
    // Run once when the sheet mounts.
  }, []);

  const handleInput = (event: InputEvent) => {
    setValue(event.detail.value);
    if (error !== null) setError(null);
  };

  const handleSave = async () => {
    if (pending.current || !canSave) return;
    const kg = Number(value);
    if (!Number.isFinite(kg) || kg < 20 || kg > 300) {
      setError(t('weightSheet.invalid'));
      return;
    }
    pending.current = true;
    setError(null);
    setSaving(true);
    try {
      await onSave(Math.round(kg * 10) / 10);
    } catch {
      setError(t('weightSheet.error'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <view
      className="Sheet-overlay"
      hover-class="tap-feedback-hover"
      bindtap={saving ? undefined : handleClose}
    >
      <view className="Sheet Theme-weight" catchtap={() => {}}>
        <text className="Sheet-title">{t('weightSheet.title')}</text>
        <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
        <text className="Form-label">{t('review.weightLabel')}</text>
        <view className={`Sheet-field${focused ? ' focused' : ''}${invalid ? ' invalid' : ''}`}>
          <input
            accessibility-element={true}
            accessibility-label={t('review.weightLabel')}
            id="weight-input"
            className="Sheet-input"
            type="digit"
            disabled={saving}
            confirm-type="done"
            bindconfirm={() => lynx.createSelectorQuery().select('#weight-input').invoke({ method: 'blur' }).exec()}
            bindinput={handleInput}
            bindfocus={() => setFocused(true)}
            bindblur={() => setFocused(false)}
            placeholder={t('weightSheet.hint')}
          />
          <text className="Sheet-unit">kg</text>
        </view>
        {error !== null && <text className="Sheet-error" accessibility-element={true}>{error}</text>}
        {!canSave && <text className="Section-note">{t('review.unavailableBody')}</text>}
        </scroll-view>
        <view className="Sheet-actions">
          <view
            className="Sheet-btn"
            accessibility-element={true}
            accessibility-traits={saving ? 'disabled' : 'button'}
            accessibility-label={t('weightSheet.cancel')}
            hover-class="tap-feedback-hover"
            bindtap={saving ? undefined : handleClose}
          >
            <text className="Sheet-btn-label">{t('weightSheet.cancel')}</text>
          </view>
          <view
            className={`Sheet-btn primary${saving || !canSave ? ' disabled' : ''}`}
            accessibility-element={true}
            accessibility-traits={saving || !canSave ? 'disabled' : 'button'}
            accessibility-label={saving ? t('review.saving') : t('weightSheet.save')}
            hover-class="tap-feedback-hover"
            bindtap={saving || !canSave ? undefined : handleSave}
          >
            <text className="Sheet-btn-label primary">
              {saving ? t('review.saving') : t('weightSheet.save')}
            </text>
          </view>
        </view>
        {canPairScale && <view
          className="Sheet-link"
          accessibility-element={true}
          accessibility-traits={saving ? 'disabled' : 'button'}
          accessibility-label={t('weightSheet.pairScale')}
          hover-class="tap-feedback-hover"
          bindtap={saving ? undefined : () => { if (!pending.current) onPairScale(); }}
        >
          <text className="Sheet-link-label">
            {t('weightSheet.pairScale')}
          </text>
        </view>}
      </view>
    </view>
  );
}
