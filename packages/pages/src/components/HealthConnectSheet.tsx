import { useState } from '@lynx-js/react';
import type { Translator } from '@zzzode/i18n';

export interface HealthConnectStatus {
  supported: boolean;
  enabled: boolean;
  permissionsGranted: boolean;
  /** Epoch ms of the last successful sync; 0 means never (RFC 0025). */
  lastSyncEpochMs: number;
}

interface HealthConnectSheetProps {
  t: Translator;
  status: HealthConnectStatus;
  onClose: () => void;
  onRequestPermission: () => void;
  onSetEnabled: (enabled: boolean) => void;
  /** Run a two-way sync now; resolves true on success. */
  onSync: () => Promise<boolean>;
}

function pad2(value: number): string {
  return (value < 10 ? '0' : '') + value;
}

function formatSync(epochMs: number): string {
  if (!epochMs) return '';
  const date = new Date(epochMs);
  return (
    `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

/**
 * Bottom sheet for Health Connect (RFC 0021 export; RFC 0025 two-way sync). On
 * supported devices it exposes the permission grant, an On/Off switch, a manual
 * "Sync now" and the last-sync time. When Health Connect is unavailable it
 * shows an explanatory message.
 */
export function HealthConnectSheet({
  t,
  status,
  onClose,
  onRequestPermission,
  onSetEnabled,
  onSync,
}: HealthConnectSheetProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    onSync()
      .then(() => setSyncing(false))
      .catch(() => setSyncing(false));
  };

  const canSync = status.permissionsGranted;

  return (
    <view
      className="Sheet-overlay"
      hover-class="tap-feedback-hover"
      bindtap={onClose}
    >
      <view className="Sheet Reminder-sheet" catchtap={() => {}}>
        <text className="Sheet-title">{t('healthConnect.title')}</text>
        <text className="HealthConnect-desc">
          {t('healthConnect.description')}
        </text>
        {!status.supported ? (
          <text className="HealthConnect-unsupported">
            {t('healthConnect.unsupported')}
          </text>
        ) : (
          <view className="Reminder-kind">
            <view className="Reminder-row">
              <text className="Reminder-label">
                {t('healthConnect.permission')}
              </text>
              <view
                className="Sheet-btn primary HealthConnect-grant"
                hover-class="tap-feedback-hover"
                bindtap={
                  status.permissionsGranted ? undefined : onRequestPermission
                }
              >
                <text className="Sheet-btn-label primary">
                  {status.permissionsGranted
                    ? t('healthConnect.permissionGranted')
                    : t('healthConnect.grantPermission')}
                </text>
              </view>
            </view>
            <view className="Reminder-row">
              <text className="Reminder-label">
                {t('healthConnect.export')}
              </text>
              <view className="Reminder-toggle">
                <view
                  className={
                    status.enabled ? 'Reminder-seg active' : 'Reminder-seg'
                  }
                  hover-class="tap-feedback-hover"
                  bindtap={
                    status.enabled ? undefined : () => onSetEnabled(true)
                  }
                >
                  <text
                    className={
                      status.enabled
                        ? 'Reminder-seg-label active'
                        : 'Reminder-seg-label'
                    }
                  >
                    {t('reminder.on')}
                  </text>
                </view>
                <view
                  className={
                    status.enabled ? 'Reminder-seg' : 'Reminder-seg active'
                  }
                  hover-class="tap-feedback-hover"
                  bindtap={
                    status.enabled ? () => onSetEnabled(false) : undefined
                  }
                >
                  <text
                    className={
                      status.enabled
                        ? 'Reminder-seg-label'
                        : 'Reminder-seg-label active'
                    }
                  >
                    {t('reminder.off')}
                  </text>
                </view>
              </view>
            </view>
            <view className="HealthConnect-syncrow">
              <view
                className={
                  syncing || !canSync
                    ? 'Sheet-btn HealthConnect-sync disabled'
                    : 'Sheet-btn HealthConnect-sync'
                }
                hover-class="tap-feedback-hover"
                bindtap={!syncing && canSync ? handleSync : undefined}
              >
                <text className="Sheet-btn-label">
                  {syncing
                    ? t('healthConnect.syncing')
                    : t('healthConnect.syncNow')}
                </text>
              </view>
              <text className="HealthConnect-lastsync">
                {canSync
                  ? status.lastSyncEpochMs
                    ? `${t('healthConnect.lastSync')} ${formatSync(status.lastSyncEpochMs)}`
                    : t('healthConnect.neverSynced')
                  : ''}
              </text>
            </view>
          </view>
        )}
        <view className="Sheet-actions">
          <view
            className="Sheet-btn primary"
            hover-class="tap-feedback-hover"
            bindtap={onClose}
          >
            <text className="Sheet-btn-label primary">
              {t('healthConnect.done')}
            </text>
          </view>
        </view>
      </view>
    </view>
  );
}
