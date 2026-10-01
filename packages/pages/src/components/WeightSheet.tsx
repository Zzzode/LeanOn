import { useEffect, useState } from '@lynx-js/react';
import type { Translator } from '@zzzode/i18n';

interface InputEvent {
  detail: { value: string };
}

interface WeightSheetProps {
  currentWeightKg: number;
  t: Translator;
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
  onClose,
  onPairScale,
  onSave,
}: WeightSheetProps) {
  const initial = String(currentWeightKg);
  const [value, setValue] = useState<string>(initial);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
    const kg = Number(value);
    if (!Number.isFinite(kg) || kg < 20 || kg > 300) {
      setError(t('weightSheet.invalid'));
      return;
    }
    setSaving(true);
    try {
      await onSave(Math.round(kg * 10) / 10);
    } catch {
      setError(t('weightSheet.error'));
      setSaving(false);
    }
  };

  return (
    <view className="Sheet-overlay" bindtap={onClose}>
      <view className="Sheet" catchtap={() => {}}>
        <text className="Sheet-title">{t('weightSheet.title')}</text>
        <view className="Sheet-field">
          <input
            id="weight-input"
            className="Sheet-input"
            type="digit"
            bindinput={handleInput}
            placeholder={t('weightSheet.hint')}
          />
          <text className="Sheet-unit">kg</text>
        </view>
        {error !== null && <text className="Sheet-error">{error}</text>}
        <view className="Sheet-actions">
          <view className="Sheet-btn" bindtap={onClose}>
            <text className="Sheet-btn-label">{t('weightSheet.cancel')}</text>
          </view>
          <view
            className={`Sheet-btn primary${saving ? ' disabled' : ''}`}
            bindtap={saving ? undefined : handleSave}
          >
            <text className="Sheet-btn-label primary">
              {t('weightSheet.save')}
            </text>
          </view>
        </view>
        <view className="Sheet-link" bindtap={onPairScale}>
          <text className="Sheet-link-label">
            {t('weightSheet.pairScale')}
          </text>
        </view>
      </view>
    </view>
  );
}
