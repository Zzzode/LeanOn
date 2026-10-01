import {
  createLeanOnBridgeClient,
  createLynxTransport,
  createMemoryBridge,
  hasLynxHost,
  type LeanOnBridgeClient,
} from '@zzzode/bridge';
import { sampleHostData } from './sample.js';
import type { HostData } from './types.js';

/** Deep clone via JSON; HostData is fully JSON-friendly. */
function clone(data: HostData): HostData {
  return JSON.parse(JSON.stringify(data)) as HostData;
}

/**
 * Off-device bridge for the web preview and tests: it keeps a mutable copy of
 * the sample and simulates `health.writeWeight`, returning the updated HostData
 * exactly as the native host contract requires (RFC 0010).
 */
function createPreviewBridge(): LeanOnBridgeClient {
  const memory = createMemoryBridge();
  let hostData: HostData = clone(sampleHostData);

  memory.handle<
    { date: string; weightKg: number },
    { success: true; hostData: HostData }
  >('health.writeWeight', (request) => {
    const weights = hostData.weights.filter((w) => w.date !== request.date);
    weights.push({ date: request.date, weightKg: request.weightKg });
    weights.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    hostData = { ...hostData, weights };
    return { success: true, hostData: clone(hostData) };
  });

  return createLeanOnBridgeClient(memory.transport);
}

/** Select the real host bridge when running on device; otherwise the preview. */
export function createAppBridge(): LeanOnBridgeClient {
  return hasLynxHost()
    ? createLeanOnBridgeClient(createLynxTransport())
    : createPreviewBridge();
}
