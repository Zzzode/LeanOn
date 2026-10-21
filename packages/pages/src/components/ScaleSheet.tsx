import { useEffect, useRef, useState } from '@lynx-js/react';
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
  const pending = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [devices, setDevices] = useState<ScaleDeviceDto[]>([]);
  const [reading, setReading] = useState<number | null>(null);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
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
      if (!mounted.current) return;
      setActiveDevice(status.pairedDeviceId);
      if (status.state === 'connected') setPhase('connected');
    }).catch(() => {
      if (mounted.current) setError(t('review.retryError'));
    });

    return () => {
      mounted.current = false;
      offDiscovered();
      offReading();
    };
    // Subscribe once when the sheet mounts.
  }, []);

  // The native scan stops after 15 seconds. Poll its actual status, rather
  // than leaving a permanent spinner after the host has stopped scanning.
  useEffect(() => {
    if (phase !== 'scanning' && phase !== 'connecting' && phase !== 'connected') return;
    let active = true;
    let checking = false;
    const deadline = Date.now() + 30_000;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const status = await bridge.invoke('scale.getStatus');
        if (!active) return;
        if (status.state === 'connected') {
          setActiveDevice(status.pairedDeviceId);
          setPhase('connected');
        } else if (status.state !== 'scanning' && status.state !== 'connecting') {
          setPhase('idle');
          setActiveDevice(null);
          setReading(null);
          if (phase === 'connecting' || phase === 'connected') setError(t('review.retryError'));
        } else if (phase !== 'connected' && Date.now() >= deadline) {
          setPhase('idle');
          setError(t('review.retryError'));
        }
      } catch {
        if (active) {
          setPhase('idle');
          setActiveDevice(null);
          setReading(null);
          setError(t('review.retryError'));
        }
      } finally {
        checking = false;
      }
    }, 1_000);
    return () => { active = false; clearInterval(timer); };
  }, [phase, bridge, t]);

  const handleScan = async () => {
    if (pending.current || phase === 'scanning' || phase === 'connecting') return;
    pending.current = true;
    setDevices([]);
    setReading(null);
    setError(null);
    setPhase('scanning');
    try {
      const result = await bridge.invoke('scale.scan');
      if (mounted.current && !result.scanning) {
        setPhase('idle');
        setError(t('review.retryError'));
      }
    } catch {
      if (mounted.current) {
        setPhase('idle');
        setError(t('review.retryError'));
      }
    } finally {
      pending.current = false;
    }
  };

  const handleConnect = async (device: ScaleDeviceDto) => {
    if (pending.current || phase === 'connecting') return;
    pending.current = true;
    setActiveDevice(device.deviceId);
    setError(null);
    setPhase('connecting');
    try {
      const result = await bridge.invoke('scale.connect', { deviceId: device.deviceId });
      if (!mounted.current) return;
      if (result.connected) setPhase('connected');
      else {
        setPhase('idle');
        setError(t('review.retryError'));
      }
    } catch {
      if (mounted.current) {
        setPhase('idle');
        setError(t('review.retryError'));
      }
    } finally {
      pending.current = false;
    }
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
      <view className="ScaleSheet Theme-weight" catchtap={() => {}}>
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

        {error !== null && <text className="Sheet-error" accessibility-element={true}>{error}</text>}
        <scroll-view scroll-orientation="vertical" className="Scale-devices">
          {devices.map((device) => (
            <view
              key={device.deviceId}
              className={`Scale-device${
                activeDevice === device.deviceId ? ' active' : ''
              }`}
              accessibility-element={true}
              accessibility-traits={phase === 'connecting' ? 'disabled' : activeDevice === device.deviceId ? 'selected' : 'button'}
              accessibility-label={`${device.name}, ${deviceStatus(device)}`}
              hover-class="tap-feedback-hover"
              bindtap={phase === 'connecting' ? undefined : () => handleConnect(device)}
            >
              <text className="Scale-device-name">{device.name}</text>
              <text className="Scale-device-meta">
                {deviceStatus(device)}
              </text>
            </view>
          ))}
        </scroll-view>

        <view className="Sheet-actions">
          <view
            className="Sheet-btn"
            accessibility-element={true}
            accessibility-traits="button"
            accessibility-label={t('scaleSheet.close')}
            hover-class="tap-feedback-hover"
            bindtap={onClose}
          >
            <text className="Sheet-btn-label">{t('scaleSheet.close')}</text>
          </view>
          <view
            className={`Sheet-btn primary${phase === 'scanning' || phase === 'connecting' ? ' disabled' : ''}`}
            accessibility-element={true}
            accessibility-traits={phase === 'scanning' || phase === 'connecting' ? 'disabled' : 'button'}
            accessibility-label={phase === 'scanning' ? t('scaleSheet.scanning') : t('scaleSheet.scan')}
            hover-class="tap-feedback-hover"
            bindtap={phase === 'scanning' || phase === 'connecting' ? undefined : handleScan}
          >
            <text className="Sheet-btn-label primary">
              {phase === 'scanning' ? t('scaleSheet.scanning') : t('scaleSheet.scan')}
            </text>
          </view>
        </view>
      </view>
    </view>
  );
}
