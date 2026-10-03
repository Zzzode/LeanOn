import { useState } from '@lynx-js/react';
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderKind,
  type ReminderSettings,
} from '@zzzode/core';
import type { Translator } from '@zzzode/i18n';

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
  onSave: (settings: ReminderSettings) => void;
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
}: ReminderSheetProps) {
  const [draft, setDraft] = useState<ReminderSettings>(
    settings ?? DEFAULT_REMINDER_SETTINGS,
  );

  const toggle = (kind: ReminderKind) => {
    setDraft((previous) => ({
      ...previous,
      [kind]: { ...previous[kind], enabled: !previous[kind].enabled },
    }));
  };

  const pickTime = (kind: ReminderKind, hour: number, minute: number) => {
    setDraft((previous) => ({
      ...previous,
      [kind]: { ...previous[kind], hour, minute, enabled: true },
    }));
  };

  const renderKind = (
    kind: ReminderKind,
    label: string,
    times: ReadonlyArray<TimeOption>,
  ) => {
    const slot = draft[kind];
    return (
      <view className="Reminder-kind">
        <view className="Reminder-row">
          <text className="Reminder-label">{label}</text>
          <view className="Reminder-toggle">
            <view
              className={
                slot.enabled ? 'Reminder-seg active' : 'Reminder-seg'
              }
              hover-class="tap-feedback-hover"
              bindtap={slot.enabled ? undefined : () => toggle(kind)}
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
              className={
                slot.enabled ? 'Reminder-seg' : 'Reminder-seg active'
              }
              hover-class="tap-feedback-hover"
              bindtap={slot.enabled ? () => toggle(kind) : undefined}
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
                hover-class="tap-feedback-hover"
                bindtap={() => pickTime(kind, time.hour, time.minute)}
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
      bindtap={onClose}
    >
      <view className="Sheet Reminder-sheet" catchtap={() => {}}>
        <text className="Sheet-title">{t('reminder.title')}</text>
        {renderKind('weight', t('reminder.weight'), WEIGHT_TIMES)}
        {renderKind('meals', t('reminder.meals'), MEALS_TIMES)}
        <view className="Sheet-actions">
          <view
            className="Sheet-btn"
            hover-class="tap-feedback-hover"
            bindtap={onClose}
          >
            <text className="Sheet-btn-label">{t('reminder.cancel')}</text>
          </view>
          <view
            className="Sheet-btn primary"
            hover-class="tap-feedback-hover"
            bindtap={() => onSave(draft)}
          >
            <text className="Sheet-btn-label primary">{t('reminder.save')}</text>
          </view>
        </view>
      </view>
    </view>
  );
}
