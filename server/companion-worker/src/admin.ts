import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { validateState } from '@zzzode/companion-server';
import { commit, revision, sql } from './database.js';
import { hash, object, LIMITS, type Ciphertext, type Environment } from './protocol.js';

type Value = string | number | null;
type Row = Record<string, Value>;
export interface BackupObject { key: string; bytes: Uint8Array }
export interface Backup { manifest: Ciphertext; objects: BackupObject[] }
interface ObjectIndex { key: string; size: number; digest: string; metadata: Record<string, string> }
interface Manifest { version: 1; revision: number; tables: Record<string, Row[]>; objects: ObjectIndex[] }
interface Floor {
  version: 1; revision: number; accounts: Row[]; groups: Row[]; photos: Row[]; jobs: Row[]; history: Row[]; revocations: Row[];
}
export const BACKUP_TABLES: readonly string[] = ['admission_slots', 'accounts', 'devices', 'groups', 'memberships', 'invites', 'records', 'seen', 'nonces', 'delivered', 'receipts', 'photo_objects', 'object_refs', 'deletion_jobs', 'deletion_objects', 'deletion_history', 'revocation_history', 'migration_jobs'];
function sealManifest(value: unknown, key: Uint8Array, purpose: string): Ciphertext {
  if (key.byteLength !== 32) throw new Error('Independent 32-byte backup key required');
  const nonce = Buffer.from(randomBytes(12)), cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(purpose));
  return { algorithm: 'AES-256-GCM', nonce: nonce.toString('base64'), ciphertext: Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]).toString('base64'), tag: Buffer.from(cipher.getAuthTag()).toString('base64') };
}
function openManifest(value: Ciphertext, key: Uint8Array, purpose: string): unknown {
  if (key.byteLength !== 32 || value.algorithm !== 'AES-256-GCM' || Object.keys(value).length !== 4) throw new Error('Invalid backup key/envelope');
  const nonce = Buffer.from(value.nonce, 'base64'), tag = Buffer.from(value.tag, 'base64');
  if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid backup envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce); decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as unknown;
}
async function rows(db: D1Database, table: string): Promise<Row[]> {
  const result = await db.prepare(`SELECT * FROM ${table} LIMIT 10001`).all<Row>();
  if (result.results.length > 10000) throw new Error('Offline backup table capacity'); return result.results;
}
/** Each checkpoint and its <=32 data statements commit together. A failed import
 * remains unavailable to HTTP/cron and resumes only with the same authenticated input. */
async function offlineImport(db: D1Database, importToken: string, statements: D1PreparedStatement[], minimumRevision: number): Promise<void> {
  let state = await db.prepare('SELECT token, next_batch FROM maintenance WHERE id = 1').first<{ token: string; next_batch: number }>();
  if (state && state.token !== importToken) throw new Error('Different offline import already in progress');
  if (!state) {
    await commit(db, await revision(db), [sql(db, 'INSERT INTO maintenance VALUES (1, ?, 0)', importToken)]);
    state = { token: importToken, next_batch: 0 };
  }
  const count = Math.ceil(statements.length / 32);
  for (let batch = state.next_batch; batch < count; batch++) {
    await commit(db, await revision(db), [...statements.slice(batch * 32, (batch + 1) * 32), sql(db, 'UPDATE maintenance SET next_batch = ? WHERE id = 1 AND token = ?', batch + 1, importToken)]);
  }
  await commit(db, await revision(db), [db.prepare('DELETE FROM sessions'), db.prepare('DELETE FROM auth_budgets'), db.prepare('DELETE FROM hash_lease'), sql(db, 'UPDATE meta SET revision = max(revision, ?) WHERE id = 1', minimumRevision), sql(db, 'DELETE FROM maintenance WHERE id = 1 AND token = ?', importToken)]);
}
async function requireEmptyOrSameImport(db: D1Database, importToken: string): Promise<void> {
  const pending = await db.prepare('SELECT token FROM maintenance WHERE id = 1').first<{ token: string }>();
  if (pending) { if (pending.token !== importToken) throw new Error('Different offline import already in progress'); return; }
  for (const table of BACKUP_TABLES) if ((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first<number>('n')) !== 0) throw new Error('Restore requires an empty target');
}
/** Requires the operator to quiesce clients/cron; a changed revision rejects export. */
export async function exportBackup(env: Environment, key: Uint8Array): Promise<Backup> {
  if (await env.DB.prepare('SELECT id FROM maintenance').first()) throw new Error('Offline import in progress');
  const before = await revision(env.DB); const tables: Record<string, Row[]> = {};
  for (const table of BACKUP_TABLES) tables[table] = await rows(env.DB, table);
  const objects: BackupObject[] = [], inventory: ObjectIndex[] = []; let cursor: string | undefined;
  do {
    const page = await env.PHOTOS.list({ prefix: 'v2/', limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const listed of page.objects) {
      const result = await env.PHOTOS.get(listed.key); if (!result || result.size > LIMITS.photo) throw new Error('Backup object missing or oversized');
      const bytes = new Uint8Array(await result.arrayBuffer());
      objects.push({ key: result.key, bytes }); inventory.push({ key: result.key, size: bytes.byteLength, digest: hash(bytes), metadata: result.customMetadata ?? {} });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (const photo of tables.photo_objects ?? []) {
    const actual = inventory.find(o => o.key === `v2/${photo.id}`);
    if (photo.status === 'ready' && (!actual || actual.digest !== photo.digest || actual.size !== photo.size)) throw new Error('Backup ready index/object mismatch');
    if (photo.status === 'fenced' && (!actual || actual.size !== 0 || actual.metadata.state !== 'revoked')) throw new Error('Backup fence missing');
  }
  if (await revision(env.DB) !== before) throw new Error('Quiesce the relay before backup');
  const manifest: Manifest = { version: 1, revision: before, tables, objects: inventory };
  return { manifest: sealManifest(manifest, key, 'leanon-server-backup-v1'), objects };
}
/** Retain the LATEST authenticated floor independently from old backup snapshots. */
export async function exportDeletionFloor(env: Environment, key: Uint8Array): Promise<Ciphertext> {
  const before = await revision(env.DB);
  const floor: Floor = { version: 1, revision: before, accounts: await rows(env.DB, 'accounts'), groups: await rows(env.DB, 'groups'), photos: await rows(env.DB, 'photo_objects'), jobs: await rows(env.DB, 'deletion_jobs'), history: await rows(env.DB, 'deletion_history'), revocations: await rows(env.DB, 'revocation_history') };
  if (await revision(env.DB) !== before) throw new Error('Quiesce before capturing deletion floor');
  return sealManifest(floor, key, 'leanon-deletion-floor-v1');
}
function validatedRows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid backup rows');
  return value.map(v => { const row = object(v); if (Object.values(row).some(cell => cell !== null && typeof cell !== 'string' && (typeof cell !== 'number' || !Number.isSafeInteger(cell)))) throw new Error('Invalid backup cell'); return row as Row; });
}
/** Offline-only. Authenticate ALL bytes before writing a previously empty D1 target. */
export async function restoreBackup(env: Environment, backup: Backup, encryptedFloor: Ciphertext, key: Uint8Array): Promise<{ restoredAccounts: number; fencedObjects: number }> {
  const raw = object(openManifest(backup.manifest, key, 'leanon-server-backup-v1')); const f = object(openManifest(encryptedFloor, key, 'leanon-deletion-floor-v1'));
  if (raw.version !== 1 || f.version !== 1 || !Number.isSafeInteger(raw.revision) || !Number.isSafeInteger(f.revision) || Number(f.revision) < Number(raw.revision)) throw new Error('A current deletion floor is required');
  const importToken = hash(JSON.stringify([backup.manifest, encryptedFloor]));
  await requireEmptyOrSameImport(env.DB, importToken);
  const tablesRaw = object(raw.tables); if (Object.keys(tablesRaw).sort().join('|') !== [...BACKUP_TABLES].sort().join('|')) throw new Error('Unexpected backup topology');
  const tables: Record<string, Row[]> = {}; const columns: Record<string, string[]> = {};
  for (const table of BACKUP_TABLES) {
    const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>(); columns[table] = info.results.map(c => c.name);
    tables[table] = validatedRows(tablesRaw[table]);
    if (tables[table]!.some(row => Object.keys(row).sort().join('|') !== [...columns[table]!].sort().join('|'))) throw new Error('Invalid backup columns');
  }
  if (!Array.isArray(raw.objects)) throw new Error('Invalid object inventory');
  const inventory = raw.objects.map(item => {
    const o = object(item); if (typeof o.key !== 'string' || !/^v2\/[A-Za-z0-9_-]{1,128}$/.test(o.key) || typeof o.digest !== 'string' || !/^[a-f0-9]{64}$/.test(o.digest) || !Number.isSafeInteger(o.size)) throw new Error('Invalid object index');
    const metadata = object(o.metadata); if (Object.values(metadata).some(v => typeof v !== 'string')) throw new Error('Invalid object metadata');
    return { key: o.key, digest: o.digest, size: Number(o.size), metadata: metadata as Record<string, string> };
  });
  if (new Set(inventory.map(o => o.key)).size !== inventory.length || backup.objects.length !== inventory.length || new Set(backup.objects.map(o => o.key)).size !== inventory.length) throw new Error('Duplicate/missing backup object');
  for (const entry of inventory) { const value = backup.objects.find(o => o.key === entry.key); if (!value || value.bytes.byteLength !== entry.size || hash(value.bytes) !== entry.digest) throw new Error('Backup object authentication failed'); }
  const floorAccounts = validatedRows(f.accounts), floorGroups = validatedRows(f.groups), floorPhotos = validatedRows(f.photos), history = validatedRows(f.history), revocations = validatedRows(f.revocations), jobs = validatedRows(f.jobs);
  const deleted = new Set([...history.map(r => String(r.account_id)), ...floorAccounts.filter(r => r.status === 'deleting').map(r => String(r.id)), ...jobs.map(r => String(r.account_id))]);
  const revoked = new Set([...revocations.map(r => String(r.group_id)), ...floorGroups.filter(g => g.status === 'revoked').map(g => String(g.id))]);
  const fences = new Set(floorPhotos.filter(p => ['fenced', 'fence-pending'].includes(String(p.status))).map(p => `v2/${p.id}`));
  for (const p of tables.photo_objects ?? []) if (deleted.has(String(p.owner_id)) || revoked.has(String(p.group_id))) fences.add(`v2/${p.id}`);
  tables.accounts = tables.accounts!.filter(a => !deleted.has(String(a.id)));
  tables.migration_jobs = tables.migration_jobs!.filter(j => !deleted.has(String(j.account_id)));
  tables.devices = tables.devices!.filter(a => !deleted.has(String(a.account_id)));
  tables.admission_slots = tables.admission_slots!.map(s => deleted.has(String(s.account_id)) ? { ...s, status: 'retired' } : s);
  tables.groups = tables.groups!.map(g => {
    const current = floorGroups.find(fg => fg.id === g.id); if (!current || revoked.has(String(g.id))) return { ...g, status: 'revoked', grants: '{}', epoch: current?.epoch ?? Number(g.epoch) + 1 };
    return { ...g, grants: current.grants!, epoch: current.epoch! };
  });
  for (const g of tables.groups) if (g.status === 'revoked') revoked.add(String(g.id));
  for (const p of tables.photo_objects ?? []) if (deleted.has(String(p.owner_id)) || revoked.has(String(p.group_id))) fences.add(`v2/${p.id}`);
  tables.memberships = tables.memberships!.filter(m => !deleted.has(String(m.account_id)) && !revoked.has(String(m.group_id)));
  for (const table of ['records', 'seen', 'nonces', 'delivered', 'receipts', 'object_refs']) tables[table] = tables[table]!.filter(row => !revoked.has(String(row.group_id)) && !deleted.has(String(row.owner_id ?? row.account_id ?? row.recipient_id)));
  tables.records = tables.records!.filter(r => {
    const g = tables.groups!.find(g => g.id === r.group_id); if (!g || g.kind !== 'family') return true;
    const members = tables.memberships!.filter(m => m.group_id === g.id && m.account_id !== r.owner_id);
    const grants = JSON.parse(String(g.grants)) as Record<string, Record<string, string[]>>;
    return members.every(m => (grants[String(r.owner_id)]?.[String(m.account_id)] ?? []).includes(String(r.category))) && (r.kind !== 'encouragement' || members.every(m => (grants[String(m.account_id)]?.[String(r.owner_id)] ?? []).includes('encouragement')));
  });
  tables.receipts = tables.receipts!.filter(receipt => tables.records!.some(r => r.group_id === receipt.group_id && r.change_id === receipt.change_id));
  tables.object_refs = tables.object_refs!.filter(ref => tables.records!.some(r => r.group_id === ref.group_id && r.owner_id === ref.owner_id && r.record_id === ref.record_id));
  tables.invites = []; tables.delivered = []; tables.deletion_objects = [];
  tables.deletion_jobs = jobs.map(j => ({ ...j, status: 'deleted', deleted_at: j.deleted_at ?? Date.now() }));
  tables.deletion_history = [...history];
  for (const j of jobs) if (!tables.deletion_history.some(h => h.account_id === j.account_id)) tables.deletion_history.push({ account_id: j.account_id!, deleted_at: j.deleted_at ?? Date.now(), revision: Number(f.revision) + 1 });
  tables.revocation_history = revocations;
  tables.photo_objects = tables.photo_objects!.map(p => fences.has(`v2/${p.id}`) ? { ...p, status: 'fenced', digest: '0'.repeat(64), size: 0 } : p);
  // Conditional creates make interrupted offline restore retryable. Permission
  // rows are still absent until the final D1 transaction succeeds.
  for (const entry of inventory) {
    if (fences.has(entry.key)) continue;
    const value = backup.objects.find(o => o.key === entry.key)!;
    const put = await env.PHOTOS.put(entry.key, value.bytes, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: entry.metadata });
    if (!put) { const present = await env.PHOTOS.get(entry.key); if (!present || hash(new Uint8Array(await present.arrayBuffer())) !== entry.digest) throw new Error('Restore object conflict'); }
  }
  for (const fence of fences) { const result = await env.PHOTOS.put(fence, new Uint8Array(0), { customMetadata: { state: 'revoked' } }); if (!result || result.size !== 0) throw new Error('Restore fence failed'); }
  const statements: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM sessions')];
  for (const table of BACKUP_TABLES) for (const row of tables[table]!) {
    const names = columns[table]!; statements.push(sql(env.DB, `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`, ...names.map(n => row[n] ?? null)));
  }
  await offlineImport(env.DB, importToken, statements, Number(f.revision) + 1);
  return { restoredAccounts: tables.accounts.length, fencedObjects: fences.size };
}
/** Pure offline operator preview: no D1/R2 binding, HTTP request or credentials in its output. */
export interface LegacyMigrationPlan {
  mode: 'dry-run'; protocol: number; targetEndpoint: string; targetServiceId: string; operationId: string;
  sourceDigest: string; accounts: number; approvedDevices: number; groups: number;
  oldRecordsCopied: number; requiresNativeRepublication: boolean; steps: string[];
}
export function planLegacyMigration(value: unknown, targetEndpoint: string, targetServiceId: string, operationId: string): LegacyMigrationPlan {
  const state = validateState(value), accounts = Object.values(state.accounts);
  const url = new URL(targetEndpoint);
  if (accounts.length < 1 || accounts.length > 2) throw new Error('Migration requires one or two eligible accounts');
  if (!/^[a-f0-9]{64}$/.test(targetServiceId) || !/^[A-Za-z0-9_-]{1,128}$/.test(operationId)) throw new Error('Invalid verified target identity or operation');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname)))) throw new Error('Target must be an HTTPS origin or an explicit loopback fixture');
  return {
    mode: 'dry-run' as const, protocol: 2, targetEndpoint: url.origin, targetServiceId, operationId,
    sourceDigest: hash(JSON.stringify(state)), accounts: accounts.length,
    approvedDevices: accounts.reduce((count, account) => count + account.devices.length, 0),
    groups: Object.keys(state.groups).length,
    oldRecordsCopied: 0, requiresNativeRepublication: true,
    steps: ['Quiesce source and retain its authenticated backup', 'Stage identities and grants into a verified empty target',
      'Review each account on its approved device in Settings', 'Republish through a separate encrypted native collection',
      'Verify both accounts before retaining or retiring the source'],
  };
}
/** Legacy aggregate photo ciphertext cannot be split without native health keys. */
export async function migrateLegacy(db: D1Database, value: unknown, nativeRepublish?: { operationId: string }): Promise<{ accounts: number; republishGroups: string[] }> {
  const state = validateState(value); const accounts = Object.values(state.accounts);
  if (accounts.length > 2) throw new Error('Private deployment admits at most two legacy accounts');
  if (nativeRepublish && !/^[A-Za-z0-9_-]{1,128}$/.test(nativeRepublish.operationId)) throw new Error('Invalid native cutover operation');
  const importToken = hash(JSON.stringify([state, nativeRepublish ?? null]));
  await requireEmptyOrSameImport(db, importToken);
  const republishGroups = Object.values(state.groups).filter(g => Object.values(g.records).some(r => ['vault', 'photos'].includes(r.category) || Buffer.from(r.payload.ciphertext, 'base64').length > LIMITS.smallCipher) || Object.keys(g.seen).some(change => !Object.values(g.records).some(r => r.id === change))).map(g => g.id);
  if (republishGroups.length && !nativeRepublish) throw new Error('Native authenticated photo/large-record republication required before migration: ' + republishGroups.join(','));
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < accounts.length; index++) {
    const a = accounts[index]!; const slot = index === 0 ? 'owner' : 'partner';
    statements.push(sql(db, "INSERT INTO admission_slots VALUES (?, ?, ?, 0, 'claimed', ?)", slot, hash(Buffer.from(randomBytes(32))), a.login, a.id),
      sql(db, "INSERT INTO accounts VALUES (?, ?, ?, ?, ?, 1, ?, 'active')", a.id, a.login, slot, a.salt, a.passwordHash, a.vaultId));
    if (nativeRepublish) statements.push(sql(db, "INSERT INTO migration_jobs VALUES (?, ?, ?, 'pending')", a.id, nativeRepublish.operationId, hash(JSON.stringify(state))));
    for (const device of a.devices) statements.push(sql(db, 'INSERT INTO devices VALUES (?, ?, ?)', a.id, device, a.deviceProofHashes[device]!));
  }
  for (const g of Object.values(state.groups)) {
    statements.push(sql(db, "INSERT INTO groups VALUES (?, ?, ?, ?, ?, 'active')", g.id, g.kind, nativeRepublish ? g.epoch + 1 : g.epoch, nativeRepublish ? 0 : g.sequence, JSON.stringify(g.grants)));
    for (const member of g.members) statements.push(sql(db, 'INSERT INTO memberships VALUES (?, ?, ?)', g.id, member, g.kind));
    for (const r of nativeRepublish ? [] : Object.values(g.records)) statements.push(sql(db, "INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')", g.id, r.ownerId, r.recordId, r.id, r.deviceId, r.category, r.kind, r.updatedAt, r.deleted ? 1 : 0, r.sequence, JSON.stringify(r.payload)), sql(db, 'INSERT INTO nonces VALUES (?, ?, ?, ?)', g.id, g.epoch, r.payload.nonce, r.id));
    for (const [change, seen] of nativeRepublish ? [] : Object.entries(g.seen)) statements.push(sql(db, 'INSERT INTO seen VALUES (?, ?, ?, ?)', g.id, change, seen.ownerId, seen.digest));
    for (const receipt of nativeRepublish ? [] : g.receipts) statements.push(sql(db, 'INSERT INTO receipts VALUES (?, ?, ?, ?)', g.id, receipt.id, receipt.recipientId, receipt.acknowledgedAt));
    // Do not import device delivery/session authority: receivers must fetch again.
  }
  for (const invite of nativeRepublish ? [] : Object.values(state.invites)) statements.push(sql(db, 'INSERT INTO invites VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', invite.id, invite.kind, invite.creatorId, invite.creatorDeviceId, invite.recipientId, invite.recipientDeviceId, invite.recipientDeviceProofHash, invite.status, invite.expiresAt, invite.proofHash, JSON.stringify(invite.wrappedKey), invite.groupId));
  for (const [groupId, epoch] of Object.entries(state.revoked)) statements.push(sql(db, 'INSERT INTO revocation_history VALUES (?, ?, ?, 1)', groupId, epoch, Date.now()));
  for (const receipt of Object.values(state.accountDeletions)) statements.push(sql(db, "INSERT INTO deletion_jobs VALUES (?, ?, ?, 'deleted', ?, ?)", receipt.operationId, receipt.accountId, receipt.proofHash, receipt.deletedAt, receipt.deletedAt), sql(db, 'INSERT INTO deletion_history VALUES (?, ?, 1)', receipt.accountId, receipt.deletedAt));
  await offlineImport(db, importToken, statements, 1); return { accounts: accounts.length, republishGroups };
}
