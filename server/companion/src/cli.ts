import { resolve } from 'node:path';
import { createCompanionServer } from './index.js';
const relay = await createCompanionServer({ file: resolve(process.env.LEANON_RELAY_FILE ?? '.local/companion/state.json'), port: Number(process.env.LEANON_RELAY_PORT ?? 8787) });
console.log(`LeanOn local ciphertext relay listening at ${relay.url}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => { void relay.close().then(() => process.exit(0)); });
