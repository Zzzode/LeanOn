import './App.css';
import { useEffect, useInitData, useMemo, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { createFoodFromBarcode } from '@zzzode/food-data';
import { EnergyCard } from './components/EnergyCard.js';
import { ExerciseCard } from './components/ExerciseCard.js';
import { ExerciseSheet } from './components/ExerciseSheet.js';
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

type ActiveSheet = 'none' | 'weight' | 'scale' | 'food' | 'exercise';

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
  const [initialFoodId, setInitialFoodId] = useState<string | undefined>(
    undefined,
  );
  const [scanError, setScanError] = useState<string | null>(null);

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
    foodId: string;
    kcal: number;
    macros: HostData['intake'][number]['macros'];
  }) => {
    const response = await bridge.invoke('health.writeIntake', {
      date: hostData.today,
      kcal: meal.kcal,
      macros: meal.macros,
      foodId: meal.foodId,
    });
    setHostData(response.hostData);
    setActiveSheet('none');
  };

  const handleSaveExercise = async (session: {
    typeId: string;
    durationMin: number;
    kcal: number;
  }) => {
    const response = await bridge.invoke('health.writeExercise', {
      date: hostData.today,
      ...session,
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

  const handleSetFavorite = async (id: string, favorite: boolean) => {
    const response = await bridge.invoke('health.setFoodFavorite', {
      id,
      favorite,
    });
    setHostData(response.hostData);
  };

  /**
   * Scan a barcode, look it up in Open Food Facts, persist it as a user food and
   * open its detail (RFC 0016). Reuses an already-imported product, and reports
   * not-found / no-energy / offline states inline.
   */
  const handleScanBarcode = async () => {
    setScanError(null);
    try {
      const scan = await bridge.invoke('scanner.scanBarcode');
      if ('cancelled' in scan) return;
      const barcode = scan.barcode;
      const offId = `off-${barcode}`;

      if (hostData.customFoods.some((food) => food.id === offId)) {
        setInitialFoodId(offId);
        return;
      }
      const lookup = await bridge.invoke('food.lookupProduct', { barcode });
      if (!lookup.found) {
        setScanError(t('foodSheet.scanNotFound'));
        return;
      }
      let item;
      try {
        item = createFoodFromBarcode(barcode, lookup.product);
      } catch {
        setScanError(t('foodSheet.scanNoEnergy'));
        return;
      }
      const written = await bridge.invoke('health.writeScannedFood', {
        barcode,
        name: item.name.en,
        kcal: item.kcal,
        proteinG: item.macros.proteinG,
        carbsG: item.macros.carbsG,
        fatG: item.macros.fatG,
        ...(item.defaultGrams === undefined
          ? {}
          : { defaultGrams: item.defaultGrams }),
      });
      setHostData(written.hostData);
      setInitialFoodId(offId);
    } catch {
      setScanError(t('foodSheet.scanUnavailable'));
    }
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
          <ExerciseCard state={state} locale={locale} t={t} />
          <QuickActions
            t={t}
            onLogFood={() => {
              setInitialFoodId(undefined);
              setScanError(null);
              setActiveSheet('food');
            }}
            onLogWeight={() => setActiveSheet('weight')}
            onLogExercise={() => setActiveSheet('exercise')}
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
          favoriteFoodIds={hostData.favoriteFoodIds}
          recentFoodIds={hostData.recentFoodIds}
          onClose={() => {
            setInitialFoodId(undefined);
            setScanError(null);
            setActiveSheet('none');
          }}
          onSave={handleSaveIntake}
          onCreateCustomFood={handleCreateCustomFood}
          onUpdateCustomFood={handleUpdateCustomFood}
          onDeleteCustomFood={handleDeleteCustomFood}
          onSetFavorite={handleSetFavorite}
          initialSelectedId={initialFoodId}
          scanError={scanError ?? undefined}
          onScanBarcode={handleScanBarcode}
        />
      )}
      {activeSheet === 'exercise' && (
        <ExerciseSheet
          currentWeightKg={state.currentWeightKg}
          locale={locale}
          t={t}
          onClose={() => setActiveSheet('none')}
          onSave={handleSaveExercise}
        />
      )}
    </page>
  );
}
