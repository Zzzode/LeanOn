import {
  createLeanOnBridgeClient,
  createLynxTransport,
  createMemoryBridge,
  hasLynxHost,
  type LeanOnBridgeClient,
} from '@zzzode/bridge';
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from '@zzzode/core';
import { createCustomFood, updateCustomFood } from '@zzzode/food-data';
import { sampleHostData } from './sample.js';
import type { HostData } from './types.js';

/** Deep clone via JSON; HostData is fully JSON-friendly. */
function clone(data: HostData): HostData {
  return JSON.parse(JSON.stringify(data)) as HostData;
}

/** Insert or replace the weight for [date], returning the next HostData. */
function upsertWeight(
  data: HostData,
  date: string,
  weightKg: number,
): HostData {
  const weights = data.weights.filter((w) => w.date !== date);
  weights.push({ date, weightKg });
  weights.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { ...data, weights };
}

/**
 * Off-device bridge for the web preview and tests. It keeps a mutable copy of
 * the sample and simulates the native contract: `health.writeWeight` and the
 * `scale.*` methods with their `scale.discovered`/`scale.reading` and
 * `records.changed` events (RFC 0010, RFC 0011).
 */
function createPreviewBridge(): LeanOnBridgeClient {
  const memory = createMemoryBridge();
  let hostData: HostData = clone(sampleHostData);
  let scaleState: 'idle' | 'scanning' | 'connected' = 'idle';
  let customFoodSeq = 0;

  memory.handle<
    { date: string; weightKg: number },
    { success: true; hostData: HostData }
  >('health.writeWeight', (request) => {
    hostData = upsertWeight(hostData, request.date, request.weightKg);
    return { success: true, hostData: clone(hostData) };
  });

  memory.handle<
    {
      date: string;
      kcal: number;
      macros: HostData['intake'][number]['macros'];
      foodId?: string;
    },
    { success: true; hostData: HostData }
  >('health.writeIntake', (request) => {
    // Accumulate the meal into the day's intake (multiple meals add together).
    const hasToday = hostData.intake.some((s) => s.date === request.date);
    const intake = hasToday
      ? hostData.intake.map((s) =>
          s.date === request.date
            ? {
                date: s.date,
                kcal: s.kcal + request.kcal,
                macros: {
                  proteinG: s.macros.proteinG + request.macros.proteinG,
                  carbsG: s.macros.carbsG + request.macros.carbsG,
                  fatG: s.macros.fatG + request.macros.fatG,
                },
              }
            : s,
        )
      : [
          ...hostData.intake,
          {
            date: request.date,
            kcal: request.kcal,
            macros: request.macros,
          },
        ];
    let next: HostData = { ...hostData, intake };
    if (request.foodId !== undefined) {
      const without = next.recentFoodIds.filter(
        (id) => id !== request.foodId,
      );
      next = {
        ...next,
        recentFoodIds: [request.foodId, ...without].slice(0, 12),
      };
    }
    hostData = next;
    return { success: true, hostData: clone(hostData) };
  });

  memory.handle<
    {
      name: string;
      kcal: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      defaultGrams?: number;
    },
    { success: true; hostData: HostData }
  >('health.writeCustomFood', (request) => {
    customFoodSeq += 1;
    const item = createCustomFood({
      id: `custom-preview-${customFoodSeq}`,
      name: request.name,
      kcal: request.kcal,
      proteinG: request.proteinG,
      carbsG: request.carbsG, fatG: request.fatG,
      ...(request.defaultGrams === undefined
        ? {}
        : { defaultGrams: request.defaultGrams }),
    });
    hostData = {
      ...hostData,
      customFoods: [...hostData.customFoods, item],
    };
    return { success: true, hostData: clone(hostData) };
  });

  memory.handle<
    {
      id: string;
      name: string;
      kcal: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      defaultGrams?: number | null;
    },
    { success: true; hostData: HostData }
  >('health.updateCustomFood', (request) => {
    const target = hostData.customFoods.find((f) => f.id === request.id);
    if (target === undefined) throw new Error('not-found');
    const updated = updateCustomFood(target, {
      name: request.name,
      kcal: request.kcal,
      proteinG: request.proteinG,
      carbsG: request.carbsG,
      fatG: request.fatG,
      defaultGrams: request.defaultGrams,
    });
    hostData = {
      ...hostData,
      customFoods: hostData.customFoods.map((f) =>
        f.id === request.id ? updated : f,
      ),
    };
    return { success: true, hostData: clone(hostData) };
  });

  memory.handle<
    { id: string },
    { success: true; hostData: HostData }
  >('health.deleteCustomFood', (request) => {
    if (!hostData.customFoods.some((f) => f.id === request.id)) {
      throw new Error('not-found');
    }
    hostData = {
      ...hostData,
      customFoods: hostData.customFoods.filter(
        (f) => f.id !== request.id,
      ),
      favoriteFoodIds: hostData.favoriteFoodIds.filter(
        (id) => id !== request.id,
      ),
      recentFoodIds: hostData.recentFoodIds.filter(
        (id) => id !== request.id,
      ),
    };
    return { success: true, hostData: clone(hostData) };
  });

  memory.handle<
    { id: string; favorite: boolean },
    { success: true; hostData: HostData }
  >('health.setFoodFavorite', (request) => {
    const favoriteFoodIds = request.favorite
      ? [...new Set([...hostData.favoriteFoodIds, request.id])]
      : hostData.favoriteFoodIds.filter((id) => id !== request.id);
    hostData = { ...hostData, favoriteFoodIds };
    return { success: true, hostData: clone(hostData) };
  });

  // --- Barcode scan + Open Food Facts simulation (RFC 0016) ---
  const scanBarcode = '0012345678905';
  const scannedProduct = {
    product_name: 'Granola Test Bar',
    nutriments: {
      'energy-kcal_100g': 420,
      'proteins_100g': 12,
      'carbohydrates_100g': 55,
      'fat_100g': 16,
    },
    serving_quantity: 35,
  };
  memory.handle('scanner.scanBarcode', () => ({ barcode: scanBarcode }));
  memory.handle<
    { barcode: string },
    { found: true; product: typeof scannedProduct } | { found: false }
  >('food.lookupProduct', (request) =>
    request.barcode === scanBarcode
      ? { found: true, product: scannedProduct }
      : { found: false },
  );
  memory.handle<
    {
      barcode: string;
      name: string;
      kcal: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      defaultGrams?: number;
    },
    { success: true; hostData: HostData }
  >('health.writeScannedFood', (request) => {
    const item = {
      id: `off-${request.barcode}`,
      name: { en: request.name, 'zh-CN': request.name },
      kcal: request.kcal,
      macros: {
        proteinG: request.proteinG ?? 0,
        carbsG: request.carbsG ?? 0,
        fatG: request.fatG ?? 0,
      },
      source: 'open-food-facts' as const,
      barcode: request.barcode,
      ...(request.defaultGrams !== undefined
        ? { defaultGrams: request.defaultGrams }
        : {}),
    };
    const customFoods = hostData.customFoods.filter(
      (food) => food.id !== item.id,
    );
    customFoods.push(item);
    hostData = { ...hostData, customFoods };
    return { success: true, hostData: clone(hostData) };
  });
  memory.handle<
    { date: string; typeId: string; durationMin: number; kcal: number },
    { success: true; hostData: HostData }
  >('health.writeExercise', (request) => {
    const exercises = [
      ...hostData.exercises,
      {
        id: `ex-preview-${Date.now().toString(36)}`,
        date: request.date,
        typeId: request.typeId,
        durationMin: request.durationMin,
        kcal: request.kcal,
      },
    ];
    hostData = { ...hostData, exercises };
    return { success: true, hostData: clone(hostData) };
  });
  memory.handle<
    {
      id: string;
      date: string;
      typeId: string;
      durationMin: number;
      kcal: number;
    },
    { success: true; hostData: HostData }
  >('health.updateExercise', (request) => {
    const exercises = hostData.exercises.map((session) =>
      session.id === request.id
        ? {
            id: session.id,
            date: request.date,
            typeId: request.typeId,
            durationMin: request.durationMin,
            kcal: request.kcal,
          }
        : session,
    );
    hostData = { ...hostData, exercises };
    return { success: true, hostData: clone(hostData) };
  });
  memory.handle<
    { id: string },
    { success: true; hostData: HostData }
  >('health.deleteExercise', (request) => {
    const exercises = hostData.exercises.filter(
      (session) => session.id !== request.id,
    );
    hostData = { ...hostData, exercises };
    return { success: true, hostData: clone(hostData) };
  });

  // --- Reminder preferences simulation (RFC 0020) ---
  let reminderSettings: ReminderSettings = {
    weight: { ...DEFAULT_REMINDER_SETTINGS.weight },
    meals: { ...DEFAULT_REMINDER_SETTINGS.meals },
  };
  memory.handle('notification.getSettings', () => ({
    settings: reminderSettings,
  }));
  memory.handle<
    { settings: ReminderSettings },
    { success: true; settings: ReminderSettings }
  >('notification.updateSettings', (request) => {
    reminderSettings = request.settings;
    return { success: true, settings: request.settings };
  });
  memory.handle('notification.requestPermission', () => ({ granted: true }));

  // --- Health Connect export simulation (RFC 0021) ---
  let hcEnabled = false;
  let hcGranted = false;
  memory.handle('healthConnect.getStatus', () => ({
    supported: true,
    enabled: hcEnabled,
    permissionsGranted: hcGranted,
  }));
  memory.handle('healthConnect.requestPermission', () => {
    hcGranted = true;
    return { granted: true };
  });
  memory.handle<{ enabled: boolean }, { success: true }>(
    'healthConnect.setEnabled',
    (request) => {
      hcEnabled = request.enabled;
      return { success: true };
    },
  );

  memory.handle('scale.getStatus', () => ({
    state: scaleState,
    pairedDeviceId: null,
  }));

  memory.handle('scale.scan', () => {
    scaleState = 'scanning';
    setTimeout(() => {
      memory.emit('scale.discovered', {
        deviceId: 'mock-mac',
        name: 'LeanOn Scale',
        rssi: -54,
      });
    }, 600);
    return { scanning: true };
  });

  memory.handle('scale.connect', () => {
    scaleState = 'connected';
    // Simulate a stable weighing after connection.
    setTimeout(() => {
      const date = hostData.today;
      const weightKg = 79.8;
      hostData = upsertWeight(hostData, date, weightKg);
      memory.emit('scale.reading', {
        deviceId: 'mock-mac',
        date,
        weightKg,
      });
      memory.emit('records.changed', { hostData: clone(hostData) });
    }, 1200);
    return { connected: true };
  });

  memory.handle('scale.disconnect', () => {
    scaleState = 'idle';
    return { connected: false };
  });

  return createLeanOnBridgeClient(memory.transport);
}

/** Select the real host bridge when running on device; otherwise the preview. */
export function createAppBridge(): LeanOnBridgeClient {
  return hasLynxHost()
    ? createLeanOnBridgeClient(createLynxTransport())
    : createPreviewBridge();
}
