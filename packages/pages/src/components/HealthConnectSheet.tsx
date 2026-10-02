import type { Translator } from '@zzzode/i18n';

export interface HealthConnectStatus {
  supported: boolean;
  enabled: boolean;
  permissionsGranted: boolean;
}

interface HealthConnectSheetProps {
  t: Translator;
  status: HealthConnectStatus;
  onClose: () => void;
  onRequestPermission: () => void;
  onSetEnabled: (enabled: boolean) => void;
}

/**
 * Bottom sheet for the Health Connect export (RFC 0021). On supported devices it
 * exposes the write-permission grant and an export On/Off switch. Enabling the
 * export triggers a history backfill on the host. When Health Connect is
 * unavailable it shows an explanatory message instead.
 */
export function HealthConnectSheet({
  t,
  status,
  onClose,
  onRequestPermission,
  onSetEnabled,
}: HealthConnectSheetProps) {
  return (
    <view className="Sheet-overlay" bindtap={onClose}>
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
          </view>
        )}
        <view className="Sheet-actions">
          <view className="Sheet-btn primary" bindtap={onClose}>
            <text className="Sheet-btn-label primary">
              {t('healthConnect.done')}
            </text>
          </view>
        </view>
      </view>
    </view>
  );
}
