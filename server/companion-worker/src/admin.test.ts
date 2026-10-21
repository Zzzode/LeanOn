import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCipheriv, randomBytes } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { exportBackup, exportDeletionFloor, migrateLegacy, planLegacyMigration, restoreBackup } from './admin.js';
import { hash, type Change, type Environment } from './protocol.js';
import { sql } from './database.js';
import { createCompanionServer } from '@zzzode/companion-server';

const key = Buffer.alloc(32, 23), password = 'PUBLIC synthetic backup password', proof = Buffer.alloc(32, 24).toString('base64');
interface Session { accountId: string; vaultId: string; token: string }
describe('offline authenticated backup, deletion floor and legacy migration', () => {
  let source: Miniflare, target: Miniflare, directory: string, env: Environment, restored: Environment;
  async function create(name: string): Promise<{ mf: Miniflare; env: Environment }> {
    const mf = new Miniflare({ ...convertV4MiniflareOptions({ scriptPath: join(process.cwd(), 'dist/worker.js'), modules: true, compatibilityDate: '2026-10-07', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['PHOTOS'], telemetry: { enabled: false } }), resourcePersistencePath: join(directory, name) });
    const db = await mf.getD1Database('DB') as unknown as D1Database; const photos = await mf.getR2Bucket('PHOTOS') as unknown as R2Bucket;
    const schema = await readFile('migrations/0001-private-relay.sql', 'utf8'); await db.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
    return { mf, env: { DB: db, PHOTOS: photos } };
  }
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'leanon-backup-synthetic-')); const a = await create('source'), b = await create('target'); source = a.mf; env = a.env; target = b.mf; restored = b.env; });
  afterEach(async () => { await source?.dispose(); await target?.dispose(); await rm(directory, { recursive: true, force: true }); });
  async function account(slot: 'owner' | 'partner'): Promise<Session> {
    const admission = slot.repeat(9).slice(0,43).padEnd(43,'x');
    await sql(env.DB, "INSERT INTO admission_slots VALUES (?, ?, ?, ?, 'open', NULL)", slot, hash(admission), slot, Date.now() + 600000).run();
    const r = await source.dispatchFetch('http://localhost/v1/accounts', { method: 'POST', body: JSON.stringify({ login: slot, password, deviceId: slot + '-device', deviceProof: proof, admissionToken: admission }) }); expect(r.status).toBe(200); return await r.json() as Session;
  }
  async function photo(a: Session, objectId: string, epoch = 1): Promise<void> {
    const nonce = Buffer.from(randomBytes(12)), cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 31), nonce); const encrypted = Buffer.concat([cipher.update('PUBLIC independent image bytes'), cipher.final()]);
    const packet = Buffer.concat([nonce, Buffer.from(cipher.getAuthTag()), encrypted]); const ref = { id: objectId, digest: hash(packet), size: packet.length };
    const headers = { authorization: 'Bearer ' + a.token };
    expect((await source.dispatchFetch(`http://localhost/v2/groups/${a.vaultId}/objects/reserve`, { method: 'POST', headers, body: JSON.stringify({ epoch, objects: [ref] }) })).status).toBe(200);
    expect((await source.dispatchFetch(`http://localhost/v2/groups/${a.vaultId}/objects/${objectId}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/octet-stream', 'content-length': String(packet.length) }, body: packet })).status).toBe(200);
    const manifestNonce = Buffer.from(randomBytes(12)); const c: Change = { id: 'manifest-' + objectId, recordId: 'manifest-' + objectId, category: 'vault', kind: 'record', updatedAt: 1, deleted: false, payload: { algorithm: 'AES-256-GCM', nonce: manifestNonce.toString('base64'), ciphertext: Buffer.from('PUBLIC small ciphertext fixture').toString('base64'), tag: Buffer.alloc(16, 1).toString('base64') }, objects: [ref] };
    expect((await source.dispatchFetch(`http://localhost/v1/groups/${a.vaultId}/sync`, { method: 'POST', headers, body: JSON.stringify({ epoch, cursor: 0, changes: [c], acks: [] }) })).status).toBe(200);
  }
  it('restores both accounts, encrypted objects, indexes and paired device proofs, without restoring live sessions', async () => {
    const a = await account('owner'), b = await account('partner'); await photo(a, 'owner-object'); await photo(b, 'partner-object');
    const backup = await exportBackup(env, key), floor = await exportDeletionFloor(env, key);
    expect(JSON.stringify(backup.manifest)).not.toContain(password); expect(JSON.stringify(backup.manifest)).not.toContain(a.token);
    expect(await restoreBackup(restored, backup, floor, key)).toEqual({ restoredAccounts: 2, fencedObjects: 0 });
    expect(await restored.DB.prepare('SELECT count(*) AS n FROM devices').first<number>('n')).toBe(2);
    expect(await restored.DB.prepare('SELECT count(*) AS n FROM sessions').first<number>('n')).toBe(0);
    expect(await restored.DB.prepare('SELECT count(*) AS n FROM object_refs').first<number>('n')).toBe(2);
    for (const object of backup.objects) expect(new Uint8Array(await (await restored.PHOTOS.get(object.key))!.arrayBuffer())).toEqual(object.bytes);
    const login = await target.dispatchFetch('http://localhost/v1/sessions', { method: 'POST', body: JSON.stringify({ login: 'owner', password, deviceId: 'owner-device', deviceProof: proof }) }); expect(login.status).toBe(200);
  });
  it('restoring an older snapshot cannot revive deleted account ciphertext after receipt ACK', async () => {
    const a = await account('owner'), b = await account('partner'); await photo(a, 'deleted-object'); await photo(b, 'retained-object');
    const old = await exportBackup(env, key);
    const receiptProof = Buffer.alloc(32, 32).toString('base64');
    const deletion = await source.dispatchFetch('http://localhost/v1/accounts/current', { method: 'DELETE', headers: { authorization: 'Bearer ' + a.token }, body: JSON.stringify({ password, operationId: 'backed-up-deletion', proof: receiptProof }) }); expect(deletion.status).toBe(200);
    const ack = await source.dispatchFetch('http://localhost/v1/account-deletions/backed-up-deletion/ack', { method: 'POST', body: JSON.stringify({ proof: receiptProof }) }); expect(ack.status).toBe(200);
    const latest = await exportDeletionFloor(env, key);
    expect(await restoreBackup(restored, old, latest, key)).toEqual({ restoredAccounts: 1, fencedObjects: 1 });
    expect(await sql(restored.DB, 'SELECT id FROM accounts WHERE id = ?', a.accountId).first()).toBeNull();
    expect((await restored.PHOTOS.head('v2/deleted-object'))?.size).toBe(0);
    expect((await restored.PHOTOS.head('v2/retained-object'))?.size).toBeGreaterThan(0);
    expect(await restored.DB.prepare('SELECT count(*) AS n FROM deletion_jobs').first<number>('n')).toBe(0);
    expect(await restored.PHOTOS.put('v2/deleted-object', Buffer.alloc(100), { onlyIf: { etagDoesNotMatch: '*' } })).toBeNull();
  });
  it('rejects modified ciphertext, omitted object bytes and wrong independent backup keys before any target writes', async () => {
    const a = await account('owner'); await photo(a, 'object'); const backup = await exportBackup(env, key), floor = await exportDeletionFloor(env, key);
    const changed = { ...backup, objects: backup.objects.map(o => ({ key: o.key, bytes: new Uint8Array(o.bytes).fill(0) })) };
    await expect(restoreBackup(restored, changed, floor, key)).rejects.toThrow('Backup object authentication failed');
    await expect(restoreBackup(restored, { ...backup, objects: [] }, floor, key)).rejects.toThrow('Duplicate/missing backup object');
    await expect(restoreBackup(restored, backup, floor, Buffer.alloc(32, 1))).rejects.toThrow();
    expect(await restored.DB.prepare('SELECT count(*) AS n FROM accounts').first<number>('n')).toBe(0); expect((await restored.PHOTOS.list()).objects).toHaveLength(0);
  });
  it('rejects an older deletion floor and refuses an already populated restore target', async () => {
    await account('owner'); const stale = await exportDeletionFloor(env, key); await account('partner'); const backup = await exportBackup(env, key);
    await expect(restoreBackup(restored, backup, stale, key)).rejects.toThrow('A current deletion floor is required');
    const current = await exportDeletionFloor(env, key); await restoreBackup(restored, backup, current, key);
    await expect(restoreBackup(restored, backup, current, key)).rejects.toThrow('Restore requires an empty target');
  });
  it('validates and migrates a real synthetic legacy file relay, retains IDs and upgrades its verifier after login', async () => {
    const file = join(directory, 'legacy.json'); const relay = await createCompanionServer({ file, port: 0 });
    let legacyAccount: Session;
    try {
      const response = await fetch(relay.url + '/v1/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'legacy-owner', password, deviceId: 'legacy-phone', deviceProof: proof }) }); legacyAccount = await response.json() as Session; expect(response.status).toBe(200);
    } finally { await relay.close(); }
    const state: unknown = JSON.parse(await readFile(file, 'utf8')); expect(await migrateLegacy(env.DB, state)).toEqual({ accounts: 1, republishGroups: [] });
    expect(await sql(env.DB, 'SELECT id FROM accounts WHERE id = ?', legacyAccount.accountId).first<string>('id')).toBe(legacyAccount.accountId);
    expect(await sql(env.DB, 'SELECT password_p FROM accounts WHERE id = ?', legacyAccount.accountId).first<number>('password_p')).toBe(1);
    const r = await source.dispatchFetch('http://localhost/v1/sessions', { method: 'POST', body: JSON.stringify({ login: 'legacy-owner', password, deviceId: 'legacy-phone', deviceProof: proof }) }); expect(r.status).toBe(200);
    expect(await sql(env.DB, 'SELECT password_p FROM accounts WHERE id = ?', legacyAccount.accountId).first<number>('password_p')).toBe(5);
  });
  it('checkpoints bounded offline import batches and keeps HTTP unavailable until the same authenticated restore completes', async () => {
    const a = await account('owner');
    for (let n = 0; n < 100; n++) await sql(env.DB, 'INSERT INTO devices VALUES (?, ?, ?)', a.accountId, 'public-device-' + n, hash(proof)).run();
    const backup = await exportBackup(env, key), floor = await exportDeletionFloor(env, key);
    let calls = 0, maximum = 0;
    const fault = new Proxy(restored.DB, { get(db, name) {
      if (name === 'batch') return async (statements: D1PreparedStatement[]) => { maximum = Math.max(maximum, statements.length); if (++calls === 3) throw new Error('PUBLIC interrupted import'); return db.batch(statements); };
      const member: unknown = Reflect.get(db, name); return typeof member === 'function' ? member.bind(db) : member;
    }});
    await expect(restoreBackup({ ...restored, DB: fault }, backup, floor, key)).rejects.toThrow('PUBLIC interrupted import');
    expect(maximum).toBeLessThanOrEqual(35);
    expect((await target.dispatchFetch('http://localhost/health')).status).toBe(503);
    await restoreBackup(restored, backup, floor, key);
    expect(await restored.DB.prepare('SELECT count(*) AS n FROM devices').first<number>('n')).toBe(101);
    expect((await target.dispatchFetch('http://localhost/health')).status).toBe(200);
    expect(await restored.DB.prepare('SELECT id FROM maintenance').first()).toBeNull();
  });

  it('stages opaque legacy aggregates without copying ciphertext and completes only after independent native republication', async () => {
    const file = join(directory,'legacy-aggregate.json'), relay = await createCompanionServer({file,port:0});
    let a:Session;
    try {
      const registered = await fetch(relay.url+'/v1/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'legacy-owner',password,deviceId:'legacy-device',deviceProof:proof})});a=await registered.json() as Session;
      const nonce=Buffer.from(randomBytes(12)),cipher=createCipheriv('aes-256-gcm',Buffer.alloc(32,42),nonce);const payload={algorithm:'AES-256-GCM',nonce:nonce.toString('base64'),ciphertext:Buffer.concat([cipher.update('PUBLIC legacy aggregate'),cipher.final()]).toString('base64'),tag:Buffer.from(cipher.getAuthTag()).toString('base64')};
      const synced=await fetch(relay.url+`/v1/groups/${a.vaultId}/sync`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+a.token},body:JSON.stringify({epoch:1,cursor:0,changes:[{id:'legacy-vault',recordId:'legacy-vault',category:'vault',kind:'record',updatedAt:1,deleted:false,payload}],acks:[]})});expect(synced.status).toBe(200);
    }finally{await relay.close();}
    const state:unknown=JSON.parse(await readFile(file,'utf8'));
    const plan = planLegacyMigration(state, 'http://127.0.0.1:64043', 'a'.repeat(64), 'PUBLIC-cutover');
    expect(plan).toMatchObject({ mode: 'dry-run', accounts: 1, approvedDevices: 1, oldRecordsCopied: 0, requiresNativeRepublication: true });
    expect(JSON.stringify(plan)).not.toContain('passwordHash');
    expect(JSON.stringify(plan)).not.toContain('deviceProof');
    expect(() => planLegacyMigration(state, 'http://remote.invalid', 'a'.repeat(64), 'PUBLIC-cutover')).toThrow();
    expect(() => planLegacyMigration(state, 'https://target.invalid', 'wrong-service', 'PUBLIC-cutover')).toThrow();
    await expect(migrateLegacy(env.DB,state)).rejects.toThrow('republication required');
    expect(await env.DB.prepare('SELECT count(*) AS n FROM accounts').first<number>('n')).toBe(0);
    await migrateLegacy(env.DB,state,{operationId:'PUBLIC-cutover'});
    expect(await env.DB.prepare('SELECT count(*) AS n FROM records').first<number>('n')).toBe(0);
    expect(await sql(env.DB,'SELECT epoch FROM groups WHERE id = ?',a!.vaultId).first<number>('epoch')).toBe(2);
    const login=await source.dispatchFetch('http://localhost/v1/sessions',{method:'POST',body:JSON.stringify({login:'legacy-owner',password,deviceId:'legacy-device',deviceProof:proof})});const session=await login.json() as Session;expect(login.status).toBe(200);
    const complete=()=>source.dispatchFetch('http://localhost/v2/migrations/complete',{method:'POST',headers:{authorization:'Bearer '+session.token},body:JSON.stringify({id:'PUBLIC-cutover',photoCount:1})});
    expect((await complete()).status).toBe(409);
    await photo(session,'republished-private-photo',2);expect((await complete()).status).toBe(200);expect((await complete()).status).toBe(200);
    expect(await env.DB.prepare('SELECT status FROM migration_jobs').first<string>('status')).toBe('complete');
    expect(await restoreBackup(restored,await exportBackup(env,key),await exportDeletionFloor(env,key),key)).toEqual({restoredAccounts:1,fencedObjects:0});
    expect(await restored.DB.prepare('SELECT status FROM migration_jobs').first<string>('status')).toBe('complete');
  });

});
