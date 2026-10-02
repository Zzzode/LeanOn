import './App.css';
import { useEffect, useInitData, useMemo, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { EnergyCard } from './components/EnergyCard.js';
import { FoodSheet } from './components/FoodSheet.js';
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

type ActiveSheet = 'none' | 'weight' | 'scale' | 'food';

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

  const handleSaveIntake = async (meal: {
    kcal: number;
    macros: HostData['intake'][number]['macros'];
  }) => {
    const response = await bridge.invoke('health.writeIntake', {
      date: hostData.today,
      kcal: meal.kcal,
      macros: meal.macros,
    });
    setHostData(response.hostData);
    setActiveSheet('none');
  };

  const handleCreateCustomFood = async (request: {
    name: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    defaultGrams?: number;
  }) => {
    const response = await bridge.invoke(
      'health.writeCustomFood',
      request,
    );
    setHostData(response.hostData);
    return response.hostData.customFoods[
      response.hostData.customFoods.length - 1
    ]!;
  };

  const handleUpdateCustomFood = async (request: {
    id: string;
    name: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    defaultGrams: number | null;
  }) => {
    const response = await bridge.invoke(
      'health.updateCustomFood',
      request,
    );
    setHostData(response.hostData);
    return response.hostData.customFoods.find(
      (food) => food.id === request.id,
    )!;
  };

  const handleDeleteCustomFood = async (id: string) => {
    const response = await bridge.invoke('health.deleteCustomFood', { id });
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
          <QuickActions
            t={t}
            onLogFood={() => setActiveSheet('food')}
            onLogWeight={() => setActiveSheet('weight')}
          />
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
      {activeSheet === 'food' && (
        <FoodSheet
          t={t}
          locale={locale}
          customFoods={hostData.customFoods}
          onClose={() => setActiveSheet('none')}
          onSave={handleSaveIntake}
          onCreateCustomFood={handleCreateCustomFood}
          onUpdateCustomFood={handleUpdateCustomFood}
          onDeleteCustomFood={handleDeleteCustomFood}
        />
      )}
    </page>
  );
}
