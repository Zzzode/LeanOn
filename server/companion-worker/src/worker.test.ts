import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import { randomBytes, createCipheriv } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { hash, passwordKey, type Change, type Ciphertext, type Group } from './protocol.js';
import { commit, revision, sql } from './database.js';
import { cleanup } from './objects.js';
import { finalizeJobs } from './deletion.js';

interface Session { accountId: string; deviceId: string; token: string; expiresAt: number; vaultId: string; deviceAuthorized: boolean }
interface Sync { cursor: number; changes: Change[]; receipts: unknown[] }
const password = 'synthetic-password-2026';
const deviceProof = Buffer.alloc(32, 7).toString('base64');
const admission = { owner: 'o'.repeat(43), partner: 'p'.repeat(43) };
function sealed(text = 'synthetic payload'): Ciphertext {
  const nonce = Buffer.from(randomBytes(12)), c = createCipheriv('aes-256-gcm', Buffer.alloc(32, 3), nonce);
  return { algorithm: 'AES-256-GCM', nonce: nonce.toString('base64'), ciphertext: Buffer.concat([c.update(text), c.final()]).toString('base64'), tag: Buffer.from(c.getAuthTag()).toString('base64') };
}
const record = (iid: string, fields: Partial<Change> = {}): Change => ({ id: iid, recordId: iid, category: 'vault', kind: 'record', updatedAt: 100, deleted: false, payload: sealed(), ...fields });
describe('official local workerd / D1 / private R2', () => {
  let mf: Miniflare, directory: string, db: D1Database, photos: R2Bucket;
  const options = () => ({ ...convertV4MiniflareOptions({ scriptPath: join(process.cwd(), 'dist/worker.js'), modules: true, compatibilityDate: '2026-10-07', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['PHOTOS'], telemetry: { enabled: false } }), resourcePersistencePath: join(directory, 'resources') });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'leanon-worker-synthetic-'));
    mf = new Miniflare(options()); db = await mf.getD1Database('DB') as unknown as D1Database; photos = await mf.getR2Bucket('PHOTOS') as unknown as R2Bucket;
    const schema = await readFile(join(process.cwd(), 'migrations/0001-private-relay.sql'), 'utf8');
    await db.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  });
  afterEach(async () => { await mf?.dispose(); await rm(directory, { recursive: true, force: true }); });
  async function req<T>(path: string, method = 'GET', value?: unknown, bearer?: string, status = 200): Promise<T> {
    const response = await mf.dispatchFetch('http://localhost' + path, { method, headers: { 'content-type': 'application/json', ...(bearer ? { authorization: 'Bearer ' + bearer } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    const result = await response.json(); expect(response.status, JSON.stringify(result)).toBe(status); return result as T;
  }
  async function seed(slot: 'owner' | 'partner', expires = Date.now() + 600000): Promise<void> {
    await sql(db, "INSERT INTO admission_slots VALUES (?, ?, ?, ?, 'open', NULL)", slot, hash(admission[slot]), slot, expires).run();
  }
  async function register(slot: 'owner' | 'partner' = 'owner'): Promise<Session> {
    await seed(slot); return req('/v1/accounts', 'POST', { login: slot, password, deviceId: slot + '-phone', deviceProof, admissionToken: admission[slot] });
  }
  const signIn = (device = 'owner-phone', proof = deviceProof) => req<Session>('/v1/sessions', 'POST', { login: 'owner', password, deviceId: device, deviceProof: proof });
  const sync = (a: Session, changes: Change[] = [], cursor = 0, acks: string[] = [], gid = a.vaultId) => req<Sync>(`/v1/groups/${gid}/sync`, 'POST', { epoch: 1, cursor, changes, acks }, a.token);
  async function pair(a: Session, b: Session, iid = 'family'): Promise<Group> {
    const proof = Buffer.alloc(32, 9).toString('base64');
    await req('/v1/invites', 'POST', { id: iid, kind: 'family', proofHash: hash(Buffer.from(proof, 'base64')), wrappedKey: sealed() }, a.token);
    await req(`/v1/invites/${iid}/accept`, 'POST', { proof }, b.token);
    return (await req<{ group: Group }>(`/v1/invites/${iid}/confirm`, 'POST', {}, a.token)).group;
  }
  const grant = (a: Session, b: Session, gid: string, categories: string[]) => req(`/v1/groups/${gid}/grants`, 'PUT', { epoch: 1, recipientId: b.accountId, categories }, a.token);
  it('has no public registration and rejects wrong, expired and replayed admission tickets', async () => {
    const body = { login: 'owner', password, deviceId: 'owner-phone', deviceProof };
    await req('/v1/accounts', 'POST', body, undefined, 403);
    await seed('owner', Date.now() - 1); await req('/v1/accounts', 'POST', { ...body, admissionToken: admission.owner }, undefined, 410);
    await sql(db, 'UPDATE admission_slots SET expires_at = ?', Date.now() + 600000).run();
    await req('/v1/accounts', 'POST', { ...body, login: 'third-person', admissionToken: admission.owner }, undefined, 403);
    await req('/v1/accounts', 'POST', { ...body, admissionToken: admission.owner });
    await req('/v1/accounts', 'POST', { ...body, admissionToken: admission.owner }, undefined, 409);
    expect(await db.prepare('SELECT count(*) AS n FROM accounts').first<number>('n')).toBe(1);
  });
  it('atomically consumes one admission under concurrent registration, never a third account', async () => {
    await seed('owner'); const b = { login: 'owner', password, deviceId: 'owner-phone', deviceProof, admissionToken: admission.owner };
    const results = await Promise.all([1, 2, 3].map(() => mf.dispatchFetch('http://localhost/v1/accounts', { method: 'POST', body: JSON.stringify(b) })));
    expect(results.filter(r => r.status === 200)).toHaveLength(1); expect(results.filter(r => [409, 429].includes(r.status))).toHaveLength(2);
    await register('partner'); expect(await db.prepare('SELECT count(*) AS n FROM accounts').first<number>('n')).toBe(2);
    await req('/v1/accounts', 'POST', { ...b, login: 'third' }, undefined, 403);
  });
  it('persists hashed device-bound sessions across workerd restart, then revokes logout and expiration', async () => {
    const a = await register(); expect(await sql(db, 'SELECT token_hash FROM sessions WHERE token_hash = ?', hash(a.token)).first()).not.toBeNull();
    expect(JSON.stringify((await db.prepare('SELECT * FROM sessions').all()).results)).not.toContain(a.token);
    await mf.dispose(); mf = new Miniflare(options()); db = await mf.getD1Database('DB') as unknown as D1Database;
    await req('/v1/me', 'GET', undefined, a.token);
    await req('/v1/sessions', 'POST', { login: 'owner', password, deviceId: 'owner-phone', deviceProof: Buffer.alloc(32, 8).toString('base64') }, undefined, 401);
    const next = await signIn('unconfirmed'); expect(next.deviceAuthorized).toBe(false);
    await req(`/v1/groups/${a.vaultId}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [] }, next.token, 403);
    await req('/v1/sessions/current', 'DELETE', undefined, a.token); await req('/v1/me', 'GET', undefined, a.token, 401);
    await sql(db, 'UPDATE sessions SET expires_at = 0').run(); await req('/v1/me', 'GET', undefined, next.token, 401);
  });
  it('upgrades an imported legacy scrypt verifier only after valid authentication', async () => {
    const a = await register(); const salt = await sql(db, 'SELECT salt FROM accounts WHERE id = ?', a.accountId).first<string>('salt');
    await sql(db, 'UPDATE accounts SET password_p = 1, password_hash = ? WHERE id = ?', await passwordKey(password, salt!, 1), a.accountId).run();
    await req('/v1/sessions', 'POST', { login: 'owner', password: 'incorrect-password', deviceId: 'owner-phone', deviceProof }, undefined, 401);
    expect(await sql(db, 'SELECT password_p FROM accounts WHERE id = ?', a.accountId).first<number>('password_p')).toBe(1);
    await signIn(); expect(await sql(db, 'SELECT password_p FROM accounts WHERE id = ?', a.accountId).first<number>('password_p')).toBe(5);
  });
  it('rolls back the entire guarded batch when a stale revision races another writer', async () => {
    const before = await revision(db); await commit(db, before, []);
    await expect(commit(db, before, [db.prepare("INSERT INTO admission_slots VALUES ('owner','hash','synthetic',9999999999999,'open',NULL)")])).rejects.toThrow('concurrent_write_retry_same_ids');
    expect(await db.prepare('SELECT count(*) AS n FROM admission_slots').first<number>('n')).toBe(0);
  });
  it('requires creator confirmation of device proof before the new device obtains a vault', async () => {
    const a = await register(), next = await signIn('new-device'); const proof = Buffer.alloc(32, 11).toString('base64');
    await req('/v1/invites', 'POST', { id: 'device', kind: 'device', proofHash: hash(Buffer.from(proof, 'base64')), wrappedKey: sealed() }, a.token);
    await req('/v1/invites/device/accept', 'POST', { proof }, next.token);
    await req('/v1/invites/device/confirm', 'POST', {}, next.token, 403);
    await req('/v1/invites/device/confirm', 'POST', {}, a.token);
    expect((await req<{ deviceAuthorized: boolean }>('/v1/me', 'GET', undefined, next.token)).deviceAuthorized).toBe(true);
    await sync(next);
  });
  it('enforces replay, nonce, tombstone and bounded pagination without skipping newly inserted rows', async () => {
    const a = await register(); const c = record('one'); await sync(a, [c]); await sync(a, [c]);
    await req(`/v1/groups/${a.vaultId}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [{ ...c, updatedAt: 999 }], acks: [] }, a.token, 409);
    await req(`/v1/groups/${a.vaultId}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [{ ...c, id: 'reused-nonce' }], acks: [] }, a.token, 409);
    for (let n = 0; n < 16; n += 4) await sync(a, Array.from({ length: 4 }, (_, i) => record('row-' + (n + i))));
    const first = await sync(a, [record('new')]); expect(first.changes).toHaveLength(10); expect(first.cursor).toBe(10);
    const second = await sync(a, [], first.cursor); expect(second.changes).toHaveLength(8); expect(second.cursor).toBe(18);
    await sync(a, [record('delete-one', { recordId: 'one', deleted: true, updatedAt: 0 })]);
    await sync(a, [record('old-one', { recordId: 'one', updatedAt: 9999 })]);
    expect(await sql(db, "SELECT deleted FROM records WHERE record_id = 'one'").first<number>('deleted')).toBe(1);
  });
  it('requires mutual encouragement consent and a prior delivery to the same receiving device for ACK', async () => {
    const a = await register(), b = await register('partner'), g = await pair(a, b); const cheer = record('cheer', { category: 'encouragement', kind: 'encouragement' });
    await grant(a, b, g.id, ['encouragement']);
    await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [cheer], acks: [] }, a.token, 403);
    await grant(b, a, g.id, ['encouragement']); await sync(a, [cheer], 0, [], g.id);
    await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: ['cheer'] }, b.token, 403);
    expect((await sync(b, [], 0, [], g.id)).changes).toHaveLength(1); await sync(b, [], 1, ['cheer'], g.id);
    expect((await sync(a, [], 1, [], g.id)).receipts).toHaveLength(1);
    await grant(b, a, g.id, []); expect((await sync(a, [], 0, [], g.id)).changes).toHaveLength(0);
  });
  async function upload(a: Session, iid: string, packet = Buffer.alloc(64, 1)): Promise<{ id: string; digest: string; size: number }> {
    const ref = { id: iid, digest: hash(packet), size: packet.length };
    await req(`/v2/groups/${a.vaultId}/objects/reserve`, 'POST', { epoch: 1, objects: [ref] }, a.token);
    const response = await mf.dispatchFetch(`http://localhost/v2/groups/${a.vaultId}/objects/${iid}`, { method: 'PUT', body: packet, headers: { authorization: 'Bearer ' + a.token, 'content-type': 'application/octet-stream', 'content-length': String(packet.length) } });
    expect(response.status, await response.text()).toBe(200); return ref;
  }
  it('stores independent ciphertext objects privately, binds references and fences bytes before deletion receipt', async () => {
    const a = await register(); const ref = await upload(a, 'opaque-photo');
    await sync(a, [record('photo-manifest', { objects: [ref] })]);
    const path = `http://localhost/v2/groups/${a.vaultId}/objects/${ref.id}`;
    expect((await mf.dispatchFetch(path)).status).toBe(401);
    const r = await mf.dispatchFetch(path, { headers: { authorization: 'Bearer ' + a.token } }); expect(r.status).toBe(200); expect(Buffer.from(await r.arrayBuffer())).toEqual(Buffer.alloc(64, 1));
    const proof = Buffer.alloc(32, 17).toString('base64');
    const receipt = await req<{ status: string }>('/v1/accounts/current', 'DELETE', { password, operationId: 'delete', proof }, a.token); expect(receipt.status).toBe('deleted');
    await req('/v1/me', 'GET', undefined, a.token, 401);
    const head = await photos.head('v2/' + ref.id); expect(head?.size).toBe(0); expect(head?.customMetadata?.state).toBe('revoked');
    expect(await photos.put('v2/' + ref.id, Buffer.alloc(64, 2), { onlyIf: { etagDoesNotMatch: '*' } })).toBeNull();
    await req('/v1/account-deletions/delete/ack', 'POST', { proof }); expect(await db.prepare('SELECT count(*) AS n FROM deletion_history').first<number>('n')).toBe(1);
    await req('/v1/account-deletions/delete/receipt', 'POST', { proof }, undefined, 404);
  });
  it('recovers durable cleanup after an actual R2 failure and rejects receipt/ACK until every object is fenced', async () => {
    const a = await register(); const refs = [];
    for (let i = 0; i < 6; i++) refs.push(await upload(a, 'photo-' + i));
    await sync(a, [record('photos', { objects: refs })]);
    const proof = Buffer.alloc(32, 19).toString('base64');
    await req('/v1/accounts/current', 'DELETE', { password, operationId: 'recover', proof }, a.token, 503);
    expect(await db.prepare("SELECT status FROM deletion_jobs WHERE operation_id = 'recover'").first<string>('status')).toBe('deleting');
    const failing = new Proxy(photos, { get(target, name) { if (name === 'put') return async () => { throw new Error('synthetic R2 outage'); }; const value: unknown = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) as unknown : value; } });
    await expect(cleanup({ DB: db, PHOTOS: failing }, Date.now())).rejects.toThrow('synthetic R2 outage');
    await finalizeJobs({ DB: db, PHOTOS: photos }, Date.now());
    expect(await db.prepare("SELECT status FROM deletion_jobs WHERE operation_id = 'recover'").first<string>('status')).toBe('deleting');
    await mf.dispose(); mf = new Miniflare(options()); db = await mf.getD1Database('DB') as unknown as D1Database; photos = await mf.getR2Bucket('PHOTOS') as unknown as R2Bucket;
    const cron = await (await mf.getWorker()).scheduled({ cron: '*/15 * * * *' });
    expect(cron.outcome).toBe('ok');
    expect(await db.prepare("SELECT status FROM deletion_jobs WHERE operation_id = 'recover'").first<string>('status')).toBe('deleted');
    const receipt = await req<{ status: string }>('/v1/account-deletions/recover/receipt', 'POST', { proof }); expect(receipt.status).toBe('deleted');
    for (const ref of refs) expect((await photos.head('v2/' + ref.id))?.size).toBe(0);
  });
  it('bounds concurrent memory-hard authentication with a persistent expiring lease', async () => {
    await db.prepare("INSERT INTO hash_lease VALUES (1, 'PUBLIC-held-lease', ?)").bind(Date.now() + 60000).run();
    const blocked = await mf.dispatchFetch('http://localhost/v1/sessions', { method: 'POST', body: JSON.stringify({login:'owner', password:'PUBLIC synthetic password 2026', deviceId:'owner-device', deviceProof}) });
    expect(blocked.status).toBe(429);
    await db.prepare('UPDATE hash_lease SET expires_at = 0').run();
    const expired = await mf.dispatchFetch('http://localhost/v1/accounts', { method:'POST', body:JSON.stringify({login:'owner',password:'PUBLIC synthetic password 2026',deviceId:'owner-device',deviceProof}) });
    expect(expired.status).toBe(403);
    expect(await db.prepare('SELECT id FROM hash_lease').first()).toBeNull();
  });

});
