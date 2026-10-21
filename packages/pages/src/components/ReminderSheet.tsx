import { useEffect, useRef, useState } from '@lynx-js/react';
import {
  type ReminderKind,
  type ReminderSettings,
} from '@zzzode/core';
import type { Translator } from '@zzzode/i18n';
import { permissionDenied } from '../state/reminders.js';

interface TimeOption {
  hour: number;
  minute: number;
}

const WEIGHT_TIMES: ReadonlyArray<TimeOption> = [
  { hour: 6, minute: 30 },
  { hour: 7, minute: 0 },
  { hour: 7, minute: 30 },
  { hour: 8, minute: 0 },
];

const MEALS_TIMES: ReadonlyArray<TimeOption> = [
  { hour: 20, minute: 0 },
  { hour: 21, minute: 0 },
  { hour: 22, minute: 0 },
];

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

interface ReminderSheetProps {
  t: Translator;
  settings: ReminderSettings | null;
  onClose: () => void;
  onSave: (settings: ReminderSettings) => void | Promise<void>;
  platform?: 'ios' | 'android' | null;
  loading?: boolean;
  loadError?: boolean;
  onRetry?: () => Promise<void>;
}

/**
 * Bottom sheet for daily reminder preferences (RFC 0020). Each kind has an
 * On/Off segmented control and a row of preset times; picking a time enables
 * the kind. Save persists and reschedules on the host.
 */
export function ReminderSheet({
  t,
  settings,
  onClose,
  onSave,
  platform,
  loading = false,
  loadError = false,
  onRetry,
}: ReminderSheetProps) {
  const pending = useRef(false);
  const handleClose = () => { if (!pending.current) onClose(); };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReminderSettings | null>(settings);
  const blocked = loading || loadError || settings === null || draft === null;
  useEffect(() => {
    if (!loading && !loadError && settings !== null) setDraft(settings);
  }, [settings, loading, loadError]);

  const handleSave = async () => {
    if (pending.current || blocked || draft === null) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (failure) {
      setError(t(permissionDenied(failure) ? 'reminder.permissionDenied' : 'review.retryError'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const toggle = (kind: ReminderKind) => {
    if (pending.current || blocked) return;
    setDraft((previous) => previous === null ? null : ({
      ...previous,
      [kind]: { ...previous[kind], enabled: !previous[kind].enabled },
    }));
  };

  const pickTime = (kind: ReminderKind, hour: number, minute: number) => {
    if (pending.current || blocked) return;
    setDraft((previous) => previous === null ? null : ({
      ...previous,
      [kind]: { ...previous[kind], hour, minute, enabled: true },
    }));
  };

  const renderKind = (
    kind: ReminderKind,
    label: string,
    times: ReadonlyArray<TimeOption>,
  ) => {
    if (draft === null) return null;
    const slot = draft[kind];
    return (
      <view className="Reminder-kind">
        <view className="Reminder-row">
          <text className="Reminder-label">{label}</text>
          <view className="Reminder-toggle">
            <view
              accessibility-element={true}
              accessibility-traits={saving ? 'disabled' : slot.enabled ? 'selected' : 'button'}
              accessibility-label={t('reminder.on')}
              className={
                slot.enabled ? 'Reminder-seg active' : 'Reminder-seg'
              }
              hover-class="tap-feedback-hover"
              bindtap={saving || slot.enabled ? undefined : () => toggle(kind)}
            >
              <text
                className={
                  slot.enabled
                    ? 'Reminder-seg-label active'
                    : 'Reminder-seg-label'
                }
              >
                {t('reminder.on')}
              </text>
            </view>
            <view
              accessibility-element={true}
              accessibility-traits={saving ? 'disabled' : slot.enabled ? 'button' : 'selected'}
              accessibility-label={t('reminder.off')}
              className={
                slot.enabled ? 'Reminder-seg' : 'Reminder-seg active'
              }
              hover-class="tap-feedback-hover"
              bindtap={!saving && slot.enabled ? () => toggle(kind) : undefined}
            >
              <text
                className={
                  slot.enabled
                    ? 'Reminder-seg-label'
                    : 'Reminder-seg-label active'
                }
              >
                {t('reminder.off')}
              </text>
            </view>
          </view>
        </view>
        <view className="Reminder-times">
          {times.map((time) => {
            const active =
              slot.hour === time.hour && slot.minute === time.minute;
            return (
              <view
                key={formatTime(time.hour, time.minute)}
                className={active ? 'Reminder-time active' : 'Reminder-time'}
                accessibility-element={true}
                accessibility-traits={saving ? 'disabled' : active ? 'selected' : 'button'}
                accessibility-label={formatTime(time.hour, time.minute)}
                hover-class="tap-feedback-hover"
                bindtap={saving ? undefined : () => pickTime(kind, time.hour, time.minute)}
              >
                <text
                  className={
                    active
                      ? 'Reminder-time-label active'
                      : 'Reminder-time-label'
                  }
                >
                  {formatTime(time.hour, time.minute)}
                </text>
              </view>
            );
          })}
        </view>
      </view>
    );
  };

  return (
    <view
      className="Sheet-overlay"
      hover-class="tap-feedback-hover"
      bindtap={saving ? undefined : handleClose}
    >
      <view className="Sheet Reminder-sheet Theme-brand" catchtap={() => {}}>
        <text className="Sheet-title">{t('reminder.title')}</text>
        {platform === 'ios' && <text className="Section-note">{t('reminder.iosWindow')}</text>}
        <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
        {loading && <text className="Settings-status" accessibility-element={true}>{t('reminder.loading')}</text>}
        {!loading && (loadError || settings === null) && <view>
          <text className="Sheet-error" accessibility-element={true}>{t('reminder.loadError')}</text>
          {onRetry !== undefined && <view className="Sheet-btn" accessibility-element={true} accessibility-traits="button"
            accessibility-label={t('reminder.retry')} bindtap={() => void onRetry()}>
            <text className="Sheet-btn-label">{t('reminder.retry')}</text>
          </view>}
        </view>}
        {!blocked && renderKind('weight', t('reminder.weight'), WEIGHT_TIMES)}
        {!blocked && renderKind('meals', t('reminder.meals'), MEALS_TIMES)}
        {error !== null && <text className="Sheet-error" accessibility-element={true}>{error}</text>}
        </scroll-view>
        <view className="Sheet-actions">
          <view
            className="Sheet-btn"
            accessibility-element={true}
            accessibility-traits={saving ? 'disabled' : 'button'}
            accessibility-label={t('reminder.cancel')}
            hover-class="tap-feedback-hover"
            bindtap={saving ? undefined : handleClose}
          >
            <text className="Sheet-btn-label">{t('reminder.cancel')}</text>
          </view>
          <view
            className={`Sheet-btn primary${saving || blocked ? ' disabled' : ''}`}
            accessibility-element={true}
            accessibility-traits={saving || blocked ? 'disabled' : 'button'}
            accessibility-label={saving ? t('review.saving') : t('reminder.save')}
            hover-class="tap-feedback-hover"
            bindtap={saving || blocked ? undefined : handleSave}
          >
            <text className="Sheet-btn-label primary">{saving ? t('review.saving') : t('reminder.save')}</text>
          </view>
        </view>
      </view>
    </view>
  );
}
