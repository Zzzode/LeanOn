import './App.css';
import './theme.generated.css';
import { useEffect, useInitData, useMemo, useRef, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { isAppearanceState, type AppearancePreference, type AppearanceState } from '@zzzode/bridge';
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
import { QuickActions } from './components/QuickActions.js';
import { ThemeContext } from './components/ThemeContext.js';
import { palettes } from './state/theme.js';
import { createAppBridge } from './state/app-bridge.js';
import { bootstrapHostData, readHostDataEnvelope } from './state/host-data.js';
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
  hostData?: unknown;
  locale?: string;
  supportedMethods?: string[];
  /** Route requested by the native shell (RFC 0028). Absent => dev shell. */
  route?: string;
  appearancePreference?: AppearancePreference;
  appearance?: 'light' | 'dark';
}

export function App() {
  const initData = useInitData() as BootstrapData | undefined;
  const [hostData, setHostData] = useState<HostData | null>(
    bootstrapHostData(initData?.hostData, initData?.route === undefined),
  );
  const [locale, setLocale] = useState<Locale>(resolveLocale(initData?.locale));
  const bootstrapAppearance = { preference: initData?.appearancePreference, resolved: initData?.appearance };
  const [appearance, setAppearance] = useState<AppearanceState>(isAppearanceState(bootstrapAppearance)
    ? bootstrapAppearance : { preference: 'system', resolved: 'light' });
  const appearanceRevision = useRef(0);
  const palette = palettes[appearance.resolved];
  const [info, setInfo] = useState<'about' | 'unavailable' | 'weightNeeded' | null>(null);
  const supports = (method: string) => initData?.route === undefined || initData.supportedMethods?.includes(method) === true;
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

  const bridge = useMemo(() => createAppBridge(isNativeShell), [isNativeShell]);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const state = useMemo(() => hostData === null ? null : selectToday(hostData), [hostData]);
  const modalActive = activeSheet !== 'none' || reminderOpen || hcOpen || info !== null;

  useEffect(() => {
    if (!isNativeShell) return;
    void bridge.invoke('app.setModalActive', { active: modalActive }).catch(() => {});
    return () => {
      void bridge.invoke('app.setModalActive', { active: false }).catch(() => {});
    };
  }, [bridge, isNativeShell, modalActive]);

  useEffect(() => bridge.subscribe('app.dismissModal', () => {
    setActiveSheet('none');
    setEditingExercise(null);
    setReminderOpen(false);
    setHcOpen(false);
    setInfo(null);
    setInitialFoodId(undefined);
    setScanError(null);
  }), [bridge]);

  useEffect(() => bridge.subscribe('app.localeChanged', ({ locale: nextLocale }) => setLocale(nextLocale)), [bridge]);
  useEffect(() => bridge.subscribe('app.appearanceChanged', payload => {
    if (isAppearanceState(payload)) { appearanceRevision.current += 1; setAppearance(payload); }
  }), [bridge]);

  useEffect(() => {
    let active = true;
    const revision = appearanceRevision.current;
    void bridge.invoke('app.getAppearance').then(response => {
      if (active && revision === appearanceRevision.current && isAppearanceState(response)) setAppearance(response);
    }).catch(() => {});
    return () => { active = false; };
  }, [bridge]);

  const handleLocaleChange = async (nextLocale: Locale): Promise<void> => {
    if (!isNativeShell) { setLocale(nextLocale); return; }
    const response = await bridge.invoke('app.setLocale', { locale: nextLocale });
    setLocale(response.locale);
  };

  const handleAppearanceChange = async (preference: AppearancePreference): Promise<void> => {
    const revision = ++appearanceRevision.current;
    const response = await bridge.invoke('app.setAppearance', { preference });
    if (response.success !== true || !isAppearanceState(response)) throw new Error('Invalid appearance response');
    if (revision === appearanceRevision.current) setAppearance(response);
  };

  // External writes (BLE scale, later sync) push a fresh snapshot through
  // records.changed; Home refreshes without knowing the source (RFC 0011).
  useEffect(() => {
    const unsubscribe = bridge.subscribe('records.changed', (payload) => {
      setHostData(readHostDataEnvelope(payload));
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

  const requireHostData = (): HostData => {
    if (hostData === null) throw new Error('Host records unavailable');
    return hostData;
  };
  const acceptHostData = (value: unknown): HostData => {
    const next = readHostDataEnvelope(value);
    setHostData(next);
    if (next === null) throw new Error('Invalid host records');
    return next;
  };

  const handleSaveWeight = async (weightKg: number) => {
    const response = await bridge.invoke('health.writeWeight', {
      date: requireHostData().today,
      weightKg,
    });
    acceptHostData(response);
    setActiveSheet('none');
  };

  const handleSaveIntake = async (meal: {
    foodId: string;
    kcal: number;
    macros: HostData['intake'][number]['macros'];
    micros: HostData['intake'][number]['micros'];
  }) => {
    const response = await bridge.invoke('health.writeIntake', {
      date: requireHostData().today,
      kcal: meal.kcal,
      macros: meal.macros,
      micros: meal.micros,
      foodId: meal.foodId,
    });
    acceptHostData(response);
    setActiveSheet('none');
  };

  /** Persist the day's absolute water total (RFC 0023). */
  const handleSetWaterTotal = async (amountMl: number) => {
    if (!supports('health.writeWater')) { setInfo('unavailable'); return; }
    const response = await bridge.invoke('health.writeWater', {
      date: requireHostData().today,
      amountMl,
    });
    acceptHostData(response);
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
        date: requireHostData().today,
        ...session,
      });
      acceptHostData(response);
    } else {
      const response = await bridge.invoke('health.writeExercise', {
        date: requireHostData().today,
        ...session,
      });
      acceptHostData(response);
    }
    setEditingExercise(null);
    setActiveSheet('none');
  };

  const handleDeleteExercise = async (id: string) => {
    const response = await bridge.invoke('health.deleteExercise', { id });
    acceptHostData(response);
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
    const next = acceptHostData(response);
    return next.customFoods[next.customFoods.length - 1]!;
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
    const next = acceptHostData(response);
    return next.customFoods.find(
      (food) => food.id === request.id,
    )!;
  };

  const handleDeleteCustomFood = async (id: string) => {
    const response = await bridge.invoke('health.deleteCustomFood', { id });
    acceptHostData(response);
    setActiveSheet('none');
  };

  const handleSetFavorite = async (id: string, favorite: boolean) => {
    const response = await bridge.invoke('health.setFoodFavorite', {
      id,
      favorite,
    });
    acceptHostData(response);
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

      if (requireHostData().customFoods.some((food) => food.id === offId)) {
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
      acceptHostData(written);
      setInitialFoodId(offId);
    } catch {
      setScanError(t('foodSheet.scanUnavailable'));
    }
  };

  const handleOpenReminders = async () => {
    if (!supports('notification.getSettings')) { setInfo('unavailable'); return; }
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
    if (!supports('healthConnect.getStatus')) { setInfo('unavailable'); return; }
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
      acceptHostData(response);
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
      void bridge.invoke('app.openRoute', { route }).then(({ success }) => { if (!success) setInfo('unavailable'); }).catch(() => setInfo('unavailable'));
      return;
    }
    setDevStack((stack) => [...stack, route]);
  };

  const handleDevBack = () => {
    setDevStack((stack) => stack.slice(0, -1));
  };

  const screenActions: ScreenActions = {
    logFood: (foodId?: string) => {
      setInitialFoodId(foodId);
      setScanError(null);
      setActiveSheet('food');
    },
    logWeight: () => setActiveSheet('weight'),
    logExercise: () => {
      if (state === null) { setInfo('weightNeeded'); return; }
      setEditingExercise(null);
      setActiveSheet('exercise');
    },
    openReminders: handleOpenReminders,
    openScale: () => supports('scale.scan') ? setActiveSheet('scale') : setInfo('unavailable'),
    openAbout: () => setInfo('about'),
    openHealthConnections: handleOpenHealthConnect,
    openRoute: handleOpenRoute,
    openSettings: () => handleOpenRoute('settings'),
    setWaterTotal: handleSetWaterTotal,
    editExercise: handleEditExercise,
    deleteExercise: handleDeleteExercise,
  };

  const currentRoute: AppRoute = isNativeShell
    ? (nativeRoute as AppRoute)
    : (devStack[devStack.length - 1] ?? devTab);

  const renderRoute = (route: AppRoute) => {
    if (hostData === null && route !== 'settings' && route !== 'partner') return (
      <view className="Card Load-error">
        <text className="Empty-title">{t('design.loadError')}</text>
        <text className="Empty-body">{t('design.loadErrorBody')}</text>
      </view>
    );
    if (route === 'partner') return <PartnerScreen t={t} actions={screenActions} />;
    if (route === 'settings') return (
      <SettingsScreen t={t} locale={locale} appearance={appearance} onAppearanceChange={handleAppearanceChange} onLocaleChange={handleLocaleChange} onOpenReminders={handleOpenReminders} onOpenHealthConnect={handleOpenHealthConnect} remindersAvailable={supports('notification.getSettings')} healthAvailable={supports('healthConnect.getStatus')} />
    );
    if (hostData === null) return null;
    if (route === 'me') return <MeScreen state={state} hostData={hostData} locale={locale} t={t} actions={screenActions} supports={supports} />;
    if (route === 'diary') return <DiaryScreen state={state} hostData={hostData} locale={locale} t={t} actions={screenActions} />;
    if (state === null) return (
      <view className="Tab-pane">
        <view className="ScreenTitle"><text className="ScreenTitle-text">{t(route === 'progress' ? 'progress.title' : 'design.todayTitle')}</text></view>
        {route === 'today' && <QuickActions t={t} onLogFood={() => screenActions.logFood()} onLogWeight={screenActions.logWeight} onLogExercise={screenActions.logExercise} />}
        <view className="Card">
        <text className="Empty-title">{t('review.weightFirst')}</text>
        <text className="Empty-body">{t(route === 'progress' ? 'design.progressEmpty' : 'review.weightFirstBody')}</text>
        <view className="Action-btn primary" bindtap={screenActions.logWeight}><text className="Action-label primary">{t('action.logWeight')}</text></view>
        </view>
      </view>
    );
  const screenProps: ScreenProps | null = state === null ? null : {
    hostData,
    state,
    locale,
    t,
    actions: screenActions,
    supports,
  };

    if (screenProps === null) return null;
    switch (route) {
      case 'today':
        return <TodayScreen {...screenProps} />;
      case 'progress':
        return <ProgressScreen {...screenProps} />;
      default:
        return null;
    }
  };

  return (
    <ThemeContext.Provider value={palette}>
    <page className={`Page Theme-${appearance.resolved}`} style={{ backgroundColor: palette.canvas }}>
      <view className={`PageRoot Theme-${appearance.resolved}`} style={{ backgroundColor: palette.canvas }}>
      <scroll-view scroll-orientation="vertical" className="Scroll" accessibility-elements-hidden={modalActive}>
        <view className="Content">
          {!isNativeShell && devStack.length > 0 && (
            <view
              className="DevBack"
              hover-class="tap-feedback-hover"
              bindtap={handleDevBack}
            >
              <text className="DevBack-text">‹ {t('settings.done')}</text>
            </view>
          )}
          {renderRoute(currentRoute)}
        </view>
      </scroll-view>
      {!isNativeShell && devStack.length === 0 && (
        <BottomTabBar current={devTab} t={t} onSelect={setDevTab} />
      )}
      {info !== null && (
        <view className="Sheet-overlay" bindtap={() => setInfo(null)}>
          <view className="Sheet" catchtap={() => {}}>
            <text className="Sheet-title">{t(info === 'about' ? 'me.about' : info === 'weightNeeded' ? 'review.weightFirst' : 'review.notAvailable')}</text>
            <text className="Empty-body">{t(info === 'about' ? 'review.aboutBody' : info === 'weightNeeded' ? 'review.weightFirstBody' : 'review.unavailableBody')}</text>
            <view className="Sheet-btn primary" bindtap={() => setInfo(null)}><text className="Sheet-btn-label primary">{t('settings.done')}</text></view>
          </view>
        </view>
      )}
      {activeSheet === 'weight' && (
        <WeightSheet
          currentWeightKg={state?.currentWeightKg}
          t={t}
          onClose={() => setActiveSheet('none')}
          onPairScale={screenActions.openScale}
          canSave={supports('health.writeWeight')}
          canPairScale={supports('scale.scan') && supports('scale.connect')}
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
      {activeSheet === 'food' && hostData !== null && (
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
          canSave={supports('health.writeIntake')}
          supportedMethods={initData?.supportedMethods}
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
      {activeSheet === 'exercise' && state !== null && (
        <ExerciseSheet
          currentWeightKg={state.currentWeightKg}
          locale={locale}
          t={t}
          initialSession={editingExercise ?? undefined}
          onClose={() => {
            setEditingExercise(null);
            setActiveSheet('none');
          }}
          canSave={supports('health.writeExercise') && (!editingExercise || supports('health.updateExercise'))}
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
    </ThemeContext.Provider>
  );
}
