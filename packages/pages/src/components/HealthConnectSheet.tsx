import { useEffect, useRef, useState } from '@lynx-js/react';
import type { Translator } from '@zzzode/i18n';
import { canEnableHealth, canSyncHealth, type HealthConnection, type HealthProvider } from '../state/health-connection.js';

interface HealthConnectSheetProps {
  t: Translator;
  provider: HealthProvider;
  connection: HealthConnection | null;
  loading: boolean;
  loadError: boolean;
  capabilities: { request: boolean; toggle: boolean; sync: boolean };
  onClose: () => void;
  onRetry: () => Promise<void>;
  onRequestPermission: () => Promise<void>;
  onSetEnabled: (enabled: boolean) => Promise<void>;
  onSync: () => Promise<boolean>;
}

function formatSync(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => value < 10 ? `0${value}` : String(value);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Each platform exposes its own authorization facts through the same connection UI. */
export function HealthConnectSheet({ t, provider, connection, loading, loadError,
  capabilities, onClose, onRetry, onRequestPermission, onSetEnabled, onSync }: HealthConnectSheetProps) {
  const pending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState<'request' | 'toggle' | 'sync' | 'retry' | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const perform = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(kind);
    setError(false);
    try { await action(); }
    catch { if (mounted.current) setError(true); }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  };
  const healthKit = provider === 'health-kit';
  const status = connection?.status;
  const ready = connection !== null && !loading && !loadError;
  const granted = connection?.provider === 'health-connect' && connection.status.permissionsGranted;
  const canRequest = ready && status?.supported === true && capabilities.request && (healthKit || !granted);
  const canEnable = connection !== null && canEnableHealth(connection);
  const canSync = connection !== null && canSyncHealth(connection) && capabilities.sync;
  const blocked = busy !== null || loading;
  const permissionLabel = healthKit ? t('healthKit.manageAccess') : t(granted ? 'healthConnect.permissionGranted' : 'healthConnect.grantPermission');

  return <view className="Sheet-overlay" bindtap={onClose}>
    <view className="Sheet Reminder-sheet Theme-brand" catchtap={() => {}}>
      <text className="Sheet-title">{t(healthKit ? 'healthKit.title' : 'healthConnect.title')}</text>
      <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
        <text className="HealthConnect-desc">{t(healthKit ? 'healthKit.description' : 'healthConnect.description')}</text>
        {healthKit && <text className="Section-note">{t('healthKit.readPrivate')}</text>}
        {loading && <text className="Settings-status" accessibility-element={true}>{t('health.loading')}</text>}
        {loadError && <view>
          <text className="Sheet-error" accessibility-element={true}>{t('review.retryError')}</text>
          <view className="Sheet-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('health.retry')}
            bindtap={blocked ? undefined : () => void perform('retry', onRetry)}>
            <text className="Sheet-btn-label">{t('health.retry')}</text>
          </view>
        </view>}
        {ready && status !== undefined && (!status.supported
          ? <text className="HealthConnect-unsupported">{t(healthKit ? 'healthKit.unsupported' : 'healthConnect.unsupported')}</text>
          : <view className="Reminder-kind">
            <view className="Reminder-row">
              <text className="Reminder-label">{t('healthConnect.permission')}</text>
              <view className={`Sheet-btn primary HealthConnect-grant${blocked || !canRequest ? ' disabled' : ''}`}
                accessibility-element={true} accessibility-traits="button" accessibility-label={permissionLabel}
                hover-class={blocked || !canRequest ? undefined : 'tap-feedback-hover'}
                bindtap={blocked || !canRequest ? undefined : () => void perform('request', onRequestPermission)}>
                <text className="Sheet-btn-label primary">{permissionLabel}</text>
              </view>
            </view>
            {connection?.provider === 'health-kit' && <view>
              <text className="Section-note" accessibility-element={true}>
                {t(connection.status.writeAuthorized ? 'healthKit.writeAllowed' : 'healthKit.writeNotEnabled')}
              </text>
              <text className="Section-note" accessibility-element={true}>
                {t(connection.status.nutritionWriteAuthorized === undefined ? 'healthKit.nutritionWriteUnknown'
                  : connection.status.nutritionWriteAuthorized ? 'healthKit.nutritionWriteAllowed' : 'healthKit.nutritionWriteNotEnabled')}
              </text>
            </view>}
            <view className="Reminder-row">
              <text className="Reminder-label">{t(healthKit ? 'healthKit.syncPreference' : 'healthConnect.export')}</text>
              <view className="Reminder-toggle">
                {[true, false].map(enabled => {
                  const selected = status.enabled === enabled;
                  const disabled = blocked || !capabilities.toggle || selected || (enabled && !canEnable);
                  return <view key={String(enabled)} className={selected ? 'Reminder-seg active' : 'Reminder-seg'}
                    accessibility-element={true} accessibility-traits="button" accessibility-value={selected ? '✓' : ''}
                    accessibility-label={t(enabled ? 'reminder.on' : 'reminder.off')}
                    hover-class={disabled ? undefined : 'tap-feedback-hover'}
                    bindtap={disabled ? undefined : () => void perform('toggle', () => onSetEnabled(enabled))}>
                    <text className={selected ? 'Reminder-seg-label active' : 'Reminder-seg-label'}>{t(enabled ? 'reminder.on' : 'reminder.off')}</text>
                  </view>;
                })}
              </view>
            </view>
            <view className="HealthConnect-syncrow">
              <view className={`Sheet-btn HealthConnect-sync${blocked || !canSync ? ' disabled' : ''}`}
                accessibility-element={true} accessibility-traits="button" accessibility-label={t('healthConnect.syncNow')}
                hover-class={blocked || !canSync ? undefined : 'tap-feedback-hover'}
                bindtap={blocked || !canSync ? undefined : () => void perform('sync', async () => { if (!await onSync()) throw new Error('Sync failed'); })}>
                <text className="Sheet-btn-label">{t(busy === 'sync' ? 'healthConnect.syncing' : 'healthConnect.syncNow')}</text>
              </view>
              <text className="HealthConnect-lastsync">{status.lastSyncEpochMs
                ? `${t('healthConnect.lastSync')} ${formatSync(status.lastSyncEpochMs)}` : t('healthConnect.neverSynced')}</text>
            </view>
          </view>)}
        {busy !== null && busy !== 'sync' && <text className="Settings-status" accessibility-element={true}>{t('review.saving')}</text>}
        {error && <text className="Sheet-error" accessibility-element={true}>{t('review.retryError')}</text>}
      </scroll-view>
      <view className="Sheet-actions"><view className="Sheet-btn primary" accessibility-element={true}
        accessibility-traits="button" accessibility-label={t('healthConnect.done')} hover-class="tap-feedback-hover" bindtap={onClose}>
        <text className="Sheet-btn-label primary">{t('healthConnect.done')}</text>
      </view></view>
    </view>
  </view>;
}
