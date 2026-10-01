import './App.css';
import { useEffect, useInitData, useMemo, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { EnergyCard } from './components/EnergyCard.js';
import { Header } from './components/Header.js';
import { MacroCard } from './components/MacroCard.js';
import { QuickActions } from './components/QuickActions.js';
import { ScaleSheet } from './components/ScaleSheet.js';
import { WeightCard } from './components/WeightCard.js';
import { WeightSheet } from './components/WeightSheet.js';
import { createAppBridge } from './state/app-bridge.js';
import { sampleHostData } from './state/sample.js';
import { selectToday } from './state/select.js';
import type { HostData } from './state/types.js';

type ActiveSheet = 'none' | 'weight' | 'scale';

interface BootstrapData {
  hostData?: HostData;
  locale?: string;
}

export function App() {
  const initData = useInitData() as BootstrapData | undefined;
  const [hostData, setHostData] = useState<HostData>(
    initData?.hostData ?? sampleHostData,
  );
  const [locale, setLocale] = useState<Locale>(resolveLocale(initData?.locale));
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');

  const bridge = useMemo(() => createAppBridge(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const state = useMemo(() => selectToday(hostData), [hostData]);

  // External writes (BLE scale, later sync) push a fresh snapshot through
  // records.changed; Home refreshes without knowing the source (RFC 0011).
  useEffect(() => {
    const unsubscribe = bridge.subscribe('records.changed', (payload) => {
      setHostData(payload.hostData);
    });
    return unsubscribe;
  }, [bridge]);

  const handleSaveWeight = async (weightKg: number) => {
    const response = await bridge.invoke('health.writeWeight', {
      date: hostData.today,
      weightKg,
    });
    setHostData(response.hostData);
    setActiveSheet('none');
  };

  return (
    <page className="Page">
      <scroll-view scroll-y className="Scroll">
        <view className="Content">
          <Header
            state={state}
            locale={locale}
            t={t}
            onLocaleChange={setLocale}
          />
          <EnergyCard state={state} t={t} />
          {!state.safe && (
            <view className="Notice">
              <text className="Notice-text">{t('notice.safeFloor')}</text>
            </view>
          )}
          <WeightCard state={state} t={t} />
          <MacroCard state={state} t={t} />
          <QuickActions t={t} onLogWeight={() => setActiveSheet('weight')} />
          <text className="Footer">{t('footer.disclaimer')}</text>
        </view>
      </scroll-view>
      {activeSheet === 'weight' && (
        <WeightSheet
          currentWeightKg={state.currentWeightKg}
          t={t}
          onClose={() => setActiveSheet('none')}
          onPairScale={() => setActiveSheet('scale')}
          onSave={handleSaveWeight}
        />
      )}
      {activeSheet === 'scale' && (
        <ScaleSheet
          bridge={bridge}
          t={t}
          onClose={() => setActiveSheet('none')}
        />
      )}
    </page>
  );
}
