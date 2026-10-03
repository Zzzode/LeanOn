import { useEffect, useState } from '@lynx-js/react';
import type { LeanOnBridgeClient, ScaleDeviceDto } from '@zzzode/bridge';
import type { Translator } from '@zzzode/i18n';

type Phase = 'idle' | 'scanning' | 'connecting' | 'connected';

interface ScaleSheetProps {
  bridge: LeanOnBridgeClient;
  t: Translator;
  onClose: () => void;
}

/**
 * Pair and use a BLE weight scale (RFC 0011). It scans for standard Weight
 * Scale devices, connects to the chosen one, and shows the live reading. The
 * reading is persisted by the host, which broadcasts `records.changed`; App
 * subscribes to that event to refresh Home.
 */
export function ScaleSheet({ bridge, t, onClose }: ScaleSheetProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [devices, setDevices] = useState<ScaleDeviceDto[]>([]);
  const [reading, setReading] = useState<number | null>(null);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);

  useEffect(() => {
    const offDiscovered = bridge.subscribe(
      'scale.discovered',
      (payload) => {
        setDevices((current) =>
          current.some((d) => d.deviceId === payload.deviceId)
            ? current
            : [...current, payload],
        );
      },
    );
    const offReading = bridge.subscribe('scale.reading', (payload) => {
      setReading(payload.weightKg);
    });

    bridge.invoke('scale.getStatus').then((status) => {
      setActiveDevice(status.pairedDeviceId);
      if (status.state === 'connected') setPhase('connected');
    });

    return () => {
      offDiscovered();
      offReading();
    };
    // Subscribe once when the sheet mounts.
  }, []);

  const handleScan = async () => {
    setDevices([]);
    setReading(null);
    setPhase('scanning');
    await bridge.invoke('scale.scan');
  };

  const handleConnect = async (device: ScaleDeviceDto) => {
    setActiveDevice(device.deviceId);
    setPhase('connecting');
    await bridge.invoke('scale.connect', { deviceId: device.deviceId });
    setPhase('connected');
  };

  const deviceStatus = (device: ScaleDeviceDto): string => {
    if (activeDevice !== device.deviceId) return `${device.rssi} dBm`;
    if (phase === 'connecting') return t('scaleSheet.connecting');
    if (phase === 'connected') return t('scaleSheet.paired');
    return `${device.rssi} dBm`;
  };

  return (
    <view
      className="Sheet-overlay"
      hover-class="tap-feedback-hover"
      bindtap={onClose}
    >
      <view className="ScaleSheet" catchtap={() => {}}>
        <text className="Sheet-title">{t('scaleSheet.title')}</text>

        {reading != null ? (
          <view className="Scale-reading">
            <text className="Scale-reading-value">{reading}</text>
            <text className="Scale-reading-unit">kg</text>
          </view>
        ) : (
          <text className="Scale-hint">
            {phase === 'scanning'
              ? t('scaleSheet.scanning')
              : phase === 'connected'
                ? t('scaleSheet.waiting')
                : t('scaleSheet.noDevices')}
          </text>
        )}

        <view className="Scale-devices">
          {devices.map((device) => (
            <view
              key={device.deviceId}
              className={`Scale-device${
                activeDevice === device.deviceId ? ' active' : ''
              }`}
              hover-class="tap-feedback-hover"
              bindtap={() => handleConnect(device)}
            >
              <text className="Scale-device-name">{device.name}</text>
              <text className="Scale-device-meta">
                {deviceStatus(device)}
              </text>
            </view>
          ))}
        </view>

        <view className="Sheet-actions">
          <view
            className="Sheet-btn"
            hover-class="tap-feedback-hover"
            bindtap={onClose}
          >
            <text className="Sheet-btn-label">{t('scaleSheet.close')}</text>
          </view>
          <view
            className="Sheet-btn primary"
            hover-class="tap-feedback-hover"
            bindtap={handleScan}
          >
            <text className="Sheet-btn-label primary">
              {t('scaleSheet.scan')}
            </text>
          </view>
        </view>
      </view>
    </view>
  );
}
