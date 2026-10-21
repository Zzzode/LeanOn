import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createHash } from 'node:crypto';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = Number(process.argv[2] ?? '64035');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
const state = resolve('../../.tmp-tool-results/cloudflare-fixture-' + port);
await mkdir(state, { recursive: true, mode: 0o700 });
const mf = new Miniflare({ ...convertV4MiniflareOptions({ host: '127.0.0.1', port, scriptPath: resolve('dist/worker.js'), modules: true, compatibilityDate: '2026-10-07', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['PHOTOS'], telemetry: { enabled: false } }), resourcePersistencePath: state });
const db = await mf.getD1Database('DB');
if (await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'meta'").first('n')) throw new Error('Fixture directory must be fresh');
await db.batch((await readFile('migrations/0001-private-relay.sql', 'utf8')).split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
for (const [slot, marker] of [['owner', 'o'], ['partner', 'p']]) {
  const digest = createHash('sha256').update(marker.repeat(43)).digest('hex');
  await db.prepare("INSERT INTO admission_slots VALUES (?, ?, ?, ?, 'open', NULL)").bind(slot, digest, 'cloudflare-' + slot, Date.now() + 2 * 60 * 60 * 1000).run();
}
await mf.ready;
process.stdout.write('local_fixture_ready port=' + port + '\n');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await mf.dispose(); await rm(state, { recursive: true, force: true }); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
