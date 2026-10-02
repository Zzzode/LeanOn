import {
  createLeanOnBridgeClient,
  createLynxTransport,
  createMemoryBridge,
  hasLynxHost,
  type LeanOnBridgeClient,
} from '@zzzode/bridge';
import { createCustomFood } from '@zzzode/food-data';
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
    hostData = { ...hostData, intake };
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
