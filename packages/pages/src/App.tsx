import './App.css';
import { useInitData, useMemo, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { EnergyCard } from './components/EnergyCard.js';
import { Header } from './components/Header.js';
import { MacroCard } from './components/MacroCard.js';
import { QuickActions } from './components/QuickActions.js';
import { WeightCard } from './components/WeightCard.js';
import { WeightSheet } from './components/WeightSheet.js';
import { createAppBridge } from './state/app-bridge.js';
import { sampleHostData } from './state/sample.js';
import { selectToday } from './state/select.js';
import type { HostData } from './state/types.js';

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
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);

  const bridge = useMemo(() => createAppBridge(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const state = useMemo(() => selectToday(hostData), [hostData]);

  const handleSaveWeight = async (weightKg: number) => {
    const response = await bridge.invoke('health.writeWeight', {
      date: hostData.today,
      weightKg,
    });
    setHostData(response.hostData);
    setSheetOpen(false);
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
          <QuickActions t={t} onLogWeight={() => setSheetOpen(true)} />
          <text className="Footer">{t('footer.disclaimer')}</text>
        </view>
      </scroll-view>
      {sheetOpen && (
        <WeightSheet
          currentWeightKg={state.currentWeightKg}
          t={t}
          onClose={() => setSheetOpen(false)}
          onSave={handleSaveWeight}
        />
      )}
    </page>
  );
}
