import './App.css';
import { useEffect, useInitData, useMemo, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { createFoodFromBarcode } from '@zzzode/food-data';
import type { ReminderSettings } from '@zzzode/core';
import { BottomTabBar } from './components/BottomTabBar.js';
import { ExerciseSheet } from './components/ExerciseSheet.js';
import { FoodSheet } from './components/FoodSheet.js';
import {
  HealthConnectSheet,
  type HealthConnectStatus,
} from './components/HealthConnectSheet.js';
import { ReminderSheet } from './components/ReminderSheet.js';
import { ScaleSheet } from './components/ScaleSheet.js';
import { SettingsScreen } from './components/SettingsScreen.js';
import { WeightSheet } from './components/WeightSheet.js';
import { createAppBridge } from './state/app-bridge.js';
import { sampleHostData } from './state/sample.js';
import { selectToday } from './state/select.js';
import type { HostData } from './state/types.js';
import {
  isAppRoute,
  type AppRoute,
  type PrimaryRoute,
  type PushedRoute,
} from './state/routes.js';
import { DiaryScreen } from './screens/DiaryScreen.js';
import { MeScreen } from './screens/MeScreen.js';
import { PartnerScreen } from './screens/PartnerScreen.js';
import { ProgressScreen } from './screens/ProgressScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import type { ScreenActions, ScreenProps } from './screens/types.js';

type ActiveSheet = 'none' | 'weight' | 'scale' | 'food' | 'exercise';

interface BootstrapData {
  hostData?: HostData;
  locale?: string;
  /** Route requested by the native shell (RFC 0028). Absent => dev shell. */
  route?: string;
}

export function App() {
  const initData = useInitData() as BootstrapData | undefined;
  const [hostData, setHostData] = useState<HostData>(
    initData?.hostData ?? sampleHostData,
  );
  const [locale, setLocale] = useState<Locale>(resolveLocale(initData?.locale));
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  // A native shell passes a route and renders its own tab bar. Without one the
  // bundle runs the in-Lynx developer shell (tab bar + pushed-page stack).
  const nativeRoute: AppRoute | undefined = isAppRoute(initData?.route ?? '')
    ? (initData?.route as AppRoute)
    : undefined;
  const isNativeShell = nativeRoute !== undefined;
  const [devTab, setDevTab] = useState<PrimaryRoute>('today');
  const [devStack, setDevStack] = useState<PushedRoute[]>([]);
  const [initialFoodId, setInitialFoodId] = useState<string | undefined>(
    undefined,
  );
  const [scanError, setScanError] = useState<string | null>(null);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings | null>(null);
  const [reminderOpen, setReminderOpen] = useState<boolean>(false);
  const [hcStatus, setHcStatus] = useState<HealthConnectStatus>({
    supported: false,
    enabled: false,
    permissionsGranted: false,
    lastSyncEpochMs: 0,
  });
  const [hcOpen, setHcOpen] = useState<boolean>(false);

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

  // Load persisted reminder preferences once (RFC 0020).
  useEffect(() => {
    let active = true;
    bridge
      .invoke('notification.getSettings')
      .then((response) => {
        if (active) setReminderSettings(response.settings);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bridge]);

  // Load Health Connect availability/export status once (RFC 0021).
  useEffect(() => {
    let active = true;
    bridge
      .invoke('healthConnect.getStatus')
      .then((response) => {
        if (active) {
          setHcStatus({
            supported: response.supported,
            enabled: response.enabled,
            permissionsGranted: response.permissionsGranted,
            lastSyncEpochMs: response.lastSyncEpochMs,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
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
    micros: HostData['intake'][number]['micros'];
  }) => {
    const response = await bridge.invoke('health.writeIntake', {
      date: hostData.today,
      kcal: meal.kcal,
      macros: meal.macros,
      micros: meal.micros,
      foodId: meal.foodId,
    });
    setHostData(response.hostData);
    setActiveSheet('none');
  };

  /** Persist the day's absolute water total (RFC 0023). */
  const handleSetWaterTotal = async (amountMl: number) => {
    const response = await bridge.invoke('health.writeWater', {
      date: hostData.today,
      amountMl,
    });
    setHostData(response.hostData);
  };

  const [editingExercise, setEditingExercise] = useState<{
    id: string;
    typeId: string;
    durationMin: number;
  } | null>(null);

  const handleEditExercise = (session: {
    id: string;
    typeId: string;
    durationMin: number;
  }) => {
    setEditingExercise(session);
    setActiveSheet('exercise');
  };

  const handleSaveExercise = async (session: {
    typeId: string;
    durationMin: number;
    kcal: number;
  }) => {
    if (editingExercise !== null) {
      const response = await bridge.invoke('health.updateExercise', {
        id: editingExercise.id,
        date: hostData.today,
        ...session,
      });
      setHostData(response.hostData);
    } else {
      const response = await bridge.invoke('health.writeExercise', {
        date: hostData.today,
        ...session,
      });
      setHostData(response.hostData);
    }
    setEditingExercise(null);
    setActiveSheet('none');
  };

  const handleDeleteExercise = async (id: string) => {
    const response = await bridge.invoke('health.deleteExercise', { id });
    setHostData(response.hostData);
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
        fiberG: item.micros.fiberG,
        sugarG: item.micros.sugarG,
        saturatedFatG: item.micros.saturatedFatG,
        sodiumMg: item.micros.sodiumMg,
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

  const handleOpenReminders = async () => {
    if (reminderSettings === null) {
      try {
        const response = await bridge.invoke('notification.getSettings');
        setReminderSettings(response.settings);
      } catch {
        // The sheet falls back to defaults; Save still works.
      }
    }
    setReminderOpen(true);
  };

  const handleSaveReminders = async (settings: ReminderSettings) => {
    // Request the runtime permission when any reminder is enabled (RFC 0020).
    if (settings.weight.enabled || settings.meals.enabled) {
      try {
        await bridge.invoke('notification.requestPermission');
      } catch {
        // Preferences are still persisted; the user can grant permission later.
      }
    }
    const response = await bridge.invoke('notification.updateSettings', {
      settings,
    });
    setReminderSettings(response.settings);
    setReminderOpen(false);
  };

  const handleOpenHealthConnect = () => {
    // Open immediately; refresh availability in the background so the tap is
    // never blocked by an asynchronous status check (RFC 0021).
    setHcOpen(true);
    bridge
      .invoke('healthConnect.getStatus')
      .then((response) => {
        setHcStatus({
          supported: response.supported,
          enabled: response.enabled,
          permissionsGranted: response.permissionsGranted,
          lastSyncEpochMs: response.lastSyncEpochMs,
        });
      })
      .catch(() => {});
  };

  const handleSyncHealthConnect = async (): Promise<boolean> => {
    try {
      const response = await bridge.invoke('healthConnect.sync');
      setHostData(response.hostData as Parameters<typeof setHostData>[0]);
      setHcStatus((previous) => ({
        ...previous,
        lastSyncEpochMs: Date.now(),
      }));
      return true;
    } catch {
      return false;
    }
  };

  const handleRequestHealthConnectPermission = async () => {
    try {
      const response = await bridge.invoke('healthConnect.requestPermission');
      setHcStatus((previous) => ({
        ...previous,
        permissionsGranted: response.granted,
      }));
    } catch {
      // The user can retry from the sheet.
    }
  };

  const handleSetHealthConnectEnabled = async (enabled: boolean) => {
    try {
      await bridge.invoke('healthConnect.setEnabled', { enabled });
      setHcStatus((previous) => ({ ...previous, enabled }));
    } catch {
      // Keep the switch unchanged on failure.
    }
  };

  const handleOpenRoute = (route: PushedRoute) => {
    if (isNativeShell) {
      void bridge.invoke('app.openRoute', { route });
      return;
    }
    setDevStack((stack) => [...stack, route]);
  };

  const handleDevBack = () => {
    setDevStack((stack) => stack.slice(0, -1));
  };

  const screenActions: ScreenActions = {
    logFood: () => {
      setInitialFoodId(undefined);
      setScanError(null);
      setActiveSheet('food');
    },
    logWeight: () => setActiveSheet('weight'),
    logExercise: () => {
      setEditingExercise(null);
      setActiveSheet('exercise');
    },
    openReminders: handleOpenReminders,
    openHealthConnections: handleOpenHealthConnect,
    openRoute: handleOpenRoute,
    setWaterTotal: handleSetWaterTotal,
    editExercise: handleEditExercise,
    deleteExercise: handleDeleteExercise,
  };

  const currentRoute: AppRoute = isNativeShell
    ? (nativeRoute as AppRoute)
    : (devStack[devStack.length - 1] ?? devTab);

  const screenProps: ScreenProps = {
    hostData,
    state,
    locale,
    t,
    actions: screenActions,
  };

  const renderRoute = (route: AppRoute) => {
    switch (route) {
      case 'today':
        return <TodayScreen {...screenProps} />;
      case 'diary':
        return <DiaryScreen {...screenProps} />;
      case 'progress':
        return <ProgressScreen {...screenProps} />;
      case 'partner':
        return <PartnerScreen {...screenProps} />;
      case 'me':
        return <MeScreen {...screenProps} />;
      case 'settings':
        return (
          <SettingsScreen
            t={t}
            locale={locale}
            onLocaleChange={setLocale}
            onOpenReminders={handleOpenReminders}
            onOpenHealthConnect={handleOpenHealthConnect}
          />
        );
      default:
        return null;
    }
  };

  return (
    <page>
      <view className="PageRoot">
      <scroll-view scroll-y className="Scroll">
        <view className="Content">
          {!isNativeShell && devStack.length > 0 && (
            <view className="DevBack" bindtap={handleDevBack}>
              <text className="DevBack-text">‹ {t('settings.done')}</text>
            </view>
          )}
          {renderRoute(currentRoute)}
        </view>
      </scroll-view>
      {!isNativeShell && devStack.length === 0 && (
        <BottomTabBar current={devTab} t={t} onSelect={setDevTab} />
      )}
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
          initialSession={editingExercise ?? undefined}
          onClose={() => {
            setEditingExercise(null);
            setActiveSheet('none');
          }}
          onSave={handleSaveExercise}
        />
      )}
      {reminderOpen && (
        <ReminderSheet
          t={t}
          settings={reminderSettings}
          onClose={() => setReminderOpen(false)}
          onSave={handleSaveReminders}
        />
      )}
      {hcOpen && (
        <HealthConnectSheet
          t={t}
          status={hcStatus}
          onClose={() => setHcOpen(false)}
          onRequestPermission={handleRequestHealthConnectPermission}
          onSetEnabled={handleSetHealthConnectEnabled}
          onSync={handleSyncHealthConnect}
        />
      )}
      </view>
    </page>
  );
}
