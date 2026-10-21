import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import { mkdtemp, readFile, rm, rename, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createCompanionServer } from './index.js';
import type { AccountDeletionReceipt, Change, Ciphertext, Group, Invite, SessionDto, StoredChange, Receipt } from './types.js';
type Sync = {
    epoch: number;
    cursor: number;
    changes: StoredChange[];
    receipts: Receipt[];
};
const password = 'fictional-password-2026';
const proofs = new Map<string, string>();
function deviceProof(id: string): string { let proof = proofs.get(id); if (!proof) {
    proof = randomBytes(32).toString('base64');
    proofs.set(id, proof);
} return proof; }
function seal(text: string | Buffer, key: Buffer, aad?: string): Ciphertext { const nonce = randomBytes(12), c = createCipheriv('aes-256-gcm', key, nonce); if (aad)
    c.setAAD(Buffer.from(aad)); return { algorithm: 'AES-256-GCM', nonce: nonce.toString('base64'), ciphertext: Buffer.concat([c.update(text), c.final()]).toString('base64'), tag: c.getAuthTag().toString('base64') }; }
function openCipher(v: Ciphertext, key: Buffer, aad?: string): Buffer { const c = createDecipheriv('aes-256-gcm', key, Buffer.from(v.nonce, 'base64')); if (aad)
    c.setAAD(Buffer.from(aad)); c.setAuthTag(Buffer.from(v.tag, 'base64')); return Buffer.concat([c.update(Buffer.from(v.ciphertext, 'base64')), c.final()]); }
function decrypt(v:Ciphertext,key:Buffer,aad?:string):string { return openCipher(v,key,aad).toString(); }
function invitation(id: string) { const secret = randomBytes(32), key = randomBytes(32), proof = Buffer.from(hkdfSync('sha256', secret, Buffer.from(id), Buffer.from('leanon-invite-proof-v1'), 32)), wrap = Buffer.from(hkdfSync('sha256', secret, Buffer.from(id), Buffer.from('leanon-invite-wrap-v1'), 32)); return { proof: proof.toString('base64'), proofHash: createHash('sha256').update(proof).digest('hex'), wrappedKey: seal(key, wrap, id), key, wrap, secret }; }
const record = (key: Buffer, id = 'change1', fields: Partial<Change> = {}): Change => ({ id, recordId: 'meal1', category: 'progress_band', kind: 'record', updatedAt: 100, deleted: false, payload: seal('fictional health payload', key), ...fields });
describe('real TCP ciphertext relay', () => {
    let directory: string, file: string, relay: Awaited<ReturnType<typeof createCompanionServer>>, time: number;
    beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'leanon-relay-test-')); file = join(directory, 'state.json'); time = 1000000; relay = await createCompanionServer({ file, port: 0, now: () => time }); });
    afterEach(async () => { await relay.close(); await rm(directory, { recursive: true, force: true }); });
    async function req<T>(path: string, method = 'GET', value?: unknown, token?: string, status = 200): Promise<T> { const r = await fetch(relay.url + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(value !== undefined ? { body: JSON.stringify(value) } : {}) }); const body: unknown = await r.json(); expect(r.status).toBe(status); return body as T; }
    const account = (login = 'alice', deviceId = 'alice-phone') => req<SessionDto>('/v1/accounts', 'POST', { login, password, deviceId, deviceProof: deviceProof(deviceId) });
    const login = (deviceId = 'alice-phone') => req<SessionDto>('/v1/sessions', 'POST', { login: 'alice', password, deviceId, deviceProof: deviceProof(deviceId) });
    const vault = (a: SessionDto): Group => ({ id: a.vaultId, kind: 'vault', epoch: 1, members: [a.accountId], grants: {} });
    const sync = (a: SessionDto, g: Group, changes: Change[] = [], cursor = 0, acks: string[] = []) => req<Sync>(`/v1/groups/${g.id}/sync`, 'POST', { epoch: g.epoch, cursor, changes, acks }, a.token);
    const grant = (a: SessionDto, b: SessionDto, g: Group, categories: string[]) => req<Group>(`/v1/groups/${g.id}/grants`, 'PUT', { epoch: 1, recipientId: b.accountId, categories }, a.token);
    async function pair(a: SessionDto, b: SessionDto, id = 'family-invite') { const crypto = invitation(id); const i = await req<Invite>('/v1/invites', 'POST', { id, kind: 'family', proofHash: crypto.proofHash, wrappedKey: crypto.wrappedKey }, a.token); expect(i.status).toBe('open'); expect((await req<Invite>(`/v1/invites/${id}/accept`, 'POST', { proof: crypto.proof }, b.token)).status).toBe('pending'); await req(`/v1/groups/${i.groupId}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [] }, b.token, 403); const result = await req<{
        group: Group;
    }>(`/v1/invites/${id}/confirm`, 'POST', {}, a.token); return { group: result.group, crypto }; }
    it('persists encrypted content and hashes; restart keeps records but revokes sessions', async () => { const a = await account(), key = randomBytes(32), g = vault(a); await sync(a, g, [record(key)]); const disk = await readFile(file, 'utf8'); expect(disk).not.toContain(password); expect(disk).not.toContain('fictional health payload'); expect(disk).not.toContain(a.token); await relay.close(); relay = await createCompanionServer({ file, port: 0, now: () => time }); await req('/v1/me', 'GET', undefined, a.token, 401); const received = await sync(await login(), g); expect(received.changes).toHaveLength(1); expect(decrypt(received.changes[0]!.payload, key)).toBe('fictional health payload'); });
    it('requires mutual consent, defaults private, prevents repeated confirmations and caps family at two', async () => { const a = await account(), b = await account('bob', 'bob-phone'), c = await account('carol', 'carol-phone'); const { group, crypto } = await pair(a, b); expect(group.members).toEqual([a.accountId, b.accountId]); expect(group.grants).toEqual({}); await req('/v1/invites/family-invite/accept', 'POST', { proof: crypto.proof }, c.token, 409); await req('/v1/invites/family-invite/confirm', 'POST', {}, a.token, 409); await req('/v1/invites', 'POST', { id: 'new', kind: 'family', proofHash: crypto.proofHash, wrappedKey: crypto.wrappedKey }, a.token, 409); });
    it('wraps group keys client-side and disclosed proof cannot decrypt them', async () => { const a = await account(), b = await account('bob', 'bob-phone'); const { crypto } = await pair(a, b); const i = await req<Invite>('/v1/invites/family-invite', 'GET', undefined, b.token); expect(openCipher(i.wrappedKey, crypto.wrap, i.id).equals(crypto.key)).toBe(true); expect(() => decrypt(i.wrappedKey, Buffer.from(crypto.proof, 'base64'), i.id)).toThrow(); const disk = await readFile(file, 'utf8'); expect(disk).not.toContain(crypto.secret.toString('base64')); expect(disk).not.toContain(crypto.key.toString('base64')); });
    it('pairs a second own device and denies its data access before confirmation', async () => { const a = await account(), b = await login('alice-tablet'), g = vault(a), key = randomBytes(32); expect(b.deviceAuthorized).toBe(false); await sync(a, g, [record(key)]); await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [] }, b.token, 403); const i = invitation('device1'); await req('/v1/invites', 'POST', { id: 'device1', kind: 'device', proofHash: i.proofHash, wrappedKey: i.wrappedKey }, a.token); await req('/v1/invites/device1/accept', 'POST', { proof: i.proof }, b.token); await req('/v1/invites/device1/confirm', 'POST', {}, b.token, 403); await req('/v1/invites/device1/confirm', 'POST', {}, a.token); expect((await sync(b, g)).changes).toHaveLength(1); await sync(b, g, [record(key, 'change2', { recordId: 'weight1' })]); expect((await sync(a, g)).changes).toHaveLength(2); });
    it('blocks cross-vault, unknown tokens and unpaired devices from family access', async () => { const a = await account(), b = await account('bob', 'bob-phone'), unknown = await login('new-device'); const { group } = await pair(a, b); for (const [g, t] of [[vault(a), b.token], [group, unknown.token]] as const)
        await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [] }, t, 403); await req('/v1/me', 'GET', undefined, 'invalid', 401); });
    it('requires directional opt-in, explicit recipient ACK and exact idempotency replay', async () => { const a = await account(), b = await account('bob', 'bob-phone'); const { group: g, crypto } = await pair(a, b); const c = record(crypto.key, 'message1', { recordId: 'message1', kind: 'encouragement', category: 'encouragement', payload: seal('You have my support', crypto.key) }); const path = `/v1/groups/${g.id}/sync`; await req(path, 'POST', { epoch: 1, cursor: 0, changes: [c], acks: [] }, a.token, 403); await grant(a, b, g, ['encouragement']); await grant(b, a, g, ['encouragement']); expect((await sync(a, g, [c])).receipts).toEqual([]); const received = await sync(b, g); expect(decrypt(received.changes[0]!.payload, crypto.key)).toBe('You have my support'); for (const [sender, ack] of [[a, 'message1'], [b, 'missing']] as const)
        await req(path, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [ack] }, sender.token, 403); expect((await sync(b, g, [], received.cursor, ['message1'])).receipts).toEqual([{ id: 'message1', recipientId: b.accountId, acknowledgedAt: time }]); expect((await sync(a, g, [c])).cursor).toBe(1); await req(path, 'POST', { epoch: 1, cursor: 0, changes: [{ ...c, updatedAt: 101 }], acks: [] }, a.token, 409); await req(path, 'POST', { epoch: 1, cursor: 0, changes: [record(crypto.key, 'reverse', { category: 'exact_weight' })], acks: [] }, b.token, 403); });
    it('purges revoked category ciphertext and cannot recover it via old cursor', async () => { const a = await account(), b = await account('bob', 'bob-phone'); const { group: g, crypto } = await pair(a, b); await grant(a, b, g, ['progress_band']); await sync(a, g, [record(crypto.key)]); expect((await sync(b, g)).changes).toHaveLength(1); await grant(a, b, g, []); expect((await sync(b, g, [], 0)).changes).toEqual([]); expect(await readFile(file, 'utf8')).not.toContain('"recordId":"meal1"'); });
    it('rejects wrong proof, expiration, cancellation and invitation replay', async () => { const a = await account(), b = await account('bob', 'bob-phone'), i = invitation('short'); await req('/v1/invites', 'POST', { id: 'short', kind: 'family', proofHash: i.proofHash, wrappedKey: i.wrappedKey, expiresInSeconds: 1 }, a.token); await req('/v1/invites/short/accept', 'POST', { proof: randomBytes(32).toString('base64') }, b.token, 403); time += 1001; await req('/v1/invites/short/accept', 'POST', { proof: i.proof }, b.token, 410); const c = invitation('cancel'); await req('/v1/invites', 'POST', { id: 'cancel', kind: 'family', proofHash: c.proofHash, wrappedKey: c.wrappedKey }, a.token); await req('/v1/invites/cancel', 'DELETE', undefined, a.token); await req('/v1/invites/cancel/accept', 'POST', { proof: c.proof }, b.token, 409); });
    it('serializes concurrent writers and tombstones dominate newer live writes', async () => { const a = await account(), g = vault(a), key = randomBytes(32); await Promise.all([sync(a, g, [record(key, 'a', { updatedAt: 100 })]), sync(a, g, [record(key, 'b', { updatedAt: 200 })])]); expect((await sync(a, g)).changes[0]!.id).toBe('b'); await sync(a, g, [record(key, 'delete', { deleted: true, updatedAt: 1 })]); await sync(a, g, [record(key, 'newer', { updatedAt: 9999 })]); const received = await sync(a, g); expect(received.changes).toHaveLength(1); expect(received.changes[0]!.id).toBe('delete'); });
    it('rejects stale epochs, future/overflow cursors, plaintext and unknown fields', async () => { const a = await account(), path = `/v1/groups/${a.vaultId}/sync`; await req(path, 'POST', { epoch: 0, cursor: 0, changes: [], acks: [] }, a.token, 409); await req(path, 'POST', { epoch: 1, cursor: 1, changes: [], acks: [] }, a.token, 409); await req(path, 'POST', { epoch: 1, cursor: Number.MAX_SAFE_INTEGER + 1, changes: [], acks: [] }, a.token, 400); await req(path, 'POST', { epoch: 1, cursor: 0, changes: [{ ...record(randomBytes(32)), payload: { text: 'health plaintext' } }], acks: [] }, a.token, 400); await req(path, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [], health: 'raw' }, a.token, 400); });
    it('unlink purges family and rejects former members and stale invitations', async () => { const a = await account(), b = await account('bob', 'bob-phone'); const { group: g, crypto } = await pair(a, b); await grant(a, b, g, ['progress_band']); await sync(a, g, [record(crypto.key)]); expect((await req<{
        epoch: number;
    }>(`/v1/groups/${g.id}`, 'DELETE', { epoch: 1 }, a.token)).epoch).toBe(2); for (const member of [a, b])
        await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [] }, member.token, 403); await req('/v1/invites/family-invite', 'GET', undefined, a.token, 404); expect(await readFile(file, 'utf8')).not.toContain('"recordId":"meal1"'); });
    it('delete account purges all data and invitations and revokes every session', async () => { const a = await account(), second = await login(), b = await account('bob', 'bob-phone'); const { group: g } = await pair(a, b); const proof = randomBytes(32).toString('base64'); await req('/v1/accounts/current', 'DELETE', { password: 'wrong-password-long', operationId: 'delete-alice', proof }, a.token, 401); await req('/v1/accounts/current', 'DELETE', { password, operationId: 'delete-alice', proof }, a.token); for (const t of [a.token, second.token])
        await req('/v1/me', 'GET', undefined, t, 401); await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [] }, b.token, 403); const disk = await readFile(file, 'utf8'); expect(disk).not.toContain('"login":"alice"'); expect(disk).not.toContain('"creatorId"'); });
    it('expires short-lived sessions and logout revokes immediately', async () => { const a = await account(); time += 1800001; await req('/v1/me', 'GET', undefined, a.token, 401); const b = await login(); await req('/v1/sessions/current', 'DELETE', undefined, b.token); await req('/v1/me', 'GET', undefined, b.token, 401); });
    it('real rename failure returns failure and leaves memory and durable state unchanged', async () => { const a = await account(), g = vault(a), original = await readFile(file, 'utf8'); await rename(file, file + '.backup'); await mkdir(file); await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [record(randomBytes(32))], acks: [] }, a.token, 500); await rm(file, { recursive: true }); await rename(file + '.backup', file); expect(await readFile(file, 'utf8')).toBe(original); expect((await sync(a, g)).changes).toEqual([]); });
    it('rejects malformed durable schemas and does not bind an HTTP listener', async () => { await relay.close(); await writeFile(file, JSON.stringify({ version: 1, accounts: { bad: { id: 'bad' } }, groups: {}, invites: {}, revoked: {} })); await expect(createCompanionServer({ file, port: 0 })).rejects.toThrow(); await rm(file); relay = await createCompanionServer({ file, port: 0 }); });
    it('rejects empty normalized login and prevents two live processes sharing a state file', async () => { await req('/v1/accounts', 'POST', { login: '   ', password, deviceId: 'phone', deviceProof: deviceProof('phone') }, undefined, 400); await expect(createCompanionServer({ file, port: 0 })).rejects.toThrow('already owned'); });
    it('rejects ACK before the receiving device has fetched the ciphertext', async () => { const a = await account(), b = await account('bob', 'bob-phone'); const { group: g, crypto } = await pair(a, b); await grant(a, b, g, ['encouragement']); await grant(b, a, g, ['encouragement']); await sync(a, g, [record(crypto.key, 'm1', { recordId: 'm1', kind: 'encouragement', category: 'encouragement' })]); await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: ['m1'] }, b.token, 403); await sync(b, g); expect((await sync(b, g, [], 0, ['m1'])).receipts).toHaveLength(1); });
    it('rejects spoofed known device IDs and does not authorize another pending proof with the same device ID', async () => { const a = await account(); await req('/v1/sessions', 'POST', { login: 'alice', password, deviceId: 'alice-phone', deviceProof: randomBytes(32).toString('base64') }, undefined, 401); const b = await login('tablet'); const impostor = await req<SessionDto>('/v1/sessions', 'POST', { login: 'alice', password, deviceId: 'tablet', deviceProof: randomBytes(32).toString('base64') }); const i = invitation('proof-device'); await req('/v1/invites', 'POST', { id: 'proof-device', kind: 'device', proofHash: i.proofHash, wrappedKey: i.wrappedKey }, a.token); await req('/v1/invites/proof-device/accept', 'POST', { proof: i.proof }, b.token); await req('/v1/invites/proof-device/confirm', 'POST', {}, a.token); expect((await sync(b, vault(a))).changes).toEqual([]); await req(`/v1/groups/${a.vaultId}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [], acks: [] }, impostor.token, 403); });
    it('post-rename directory fsync failure keeps memory aligned with committed disk and safely retries IDs', async () => { await relay.close(); let failBarrier = false; relay = await createCompanionServer({ file, port: 0, syncDirectory: async () => { if (failBarrier) {
            failBarrier = false;
            throw new Error('injected directory fsync fault');
        } } }); const a = await account(), g = vault(a), c = record(randomBytes(32)); failBarrier = true; await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [c], acks: [] }, a.token, 503); expect(await readFile(file, 'utf8')).toContain('"id":"change1"'); expect((await sync(a, g, [c])).changes).toHaveLength(1); expect((await sync(a, g, [c])).cursor).toBe(1); });
    it('binds authenticated routing metadata with the frozen payload AAD', async () => { const a = await account(), g = vault(a), key = randomBytes(32), c = record(key); const aad = JSON.stringify(['leanon-change-v1', g.id, g.epoch, a.accountId, a.deviceId, c.id, c.recordId, c.category, c.kind, c.updatedAt, c.deleted]); c.payload = seal('encrypted content', key, aad); const stored = (await sync(a, g, [c])).changes[0]!; expect(decrypt(stored.payload, key, aad)).toBe('encrypted content'); const tampered = JSON.stringify(['leanon-change-v1', g.id, g.epoch, a.accountId, a.deviceId, c.id, c.recordId, 'exact_weight', c.kind, c.updatedAt, true]); expect(() => decrypt(stored.payload, key, tampered)).toThrow(); });
    it('rejects encouragement until the recipient also opts in and purges it when that consent is revoked', async () => { const a = await account(), b = await account('bob', 'bob-phone'); const { group: g, crypto } = await pair(a, b); const c = record(crypto.key, 'cheer', { recordId: 'cheer', category: 'encouragement', kind: 'encouragement' }); await grant(a, b, g, ['encouragement']); await req(`/v1/groups/${g.id}/sync`, 'POST', { epoch: 1, cursor: 0, changes: [c], acks: [] }, a.token, 403); await grant(b, a, g, ['encouragement']); await sync(a, g, [c]); await grant(b, a, g, []); expect((await sync(b, g)).changes).toEqual([]); });
    it('paginates winning records without skipping a visible cursor and includes current grants', async () => { const a = await account(), g = vault(a), key = randomBytes(32); const entries = Array.from({ length: 130 }, (_, i) => record(key, `change-${i}`, { recordId: `meal-${i}` })); await sync(a, g, entries.slice(0, 70)); await sync(a, g, entries.slice(70)); const first = await sync(a, g); expect(first.changes).toHaveLength(100); expect(first.cursor).toBe(100); const next = await sync(a, g, [], first.cursor); expect(next.changes).toHaveLength(30); expect(next.cursor).toBe(130); });
    it('bounds live sessions per account and prunes expiration before issuing another token', async () => {
      const a=await account(); for(let i=1;i<32;i++) await login();
      await req('/v1/sessions','POST',{login:'alice',password,deviceId:'alice-phone',deviceProof:deviceProof('alice-phone')},undefined,429);
      time+=1_800_001; const fresh=await login(); expect(fresh.expiresAt).toBe(time+1_800_000);
      await req('/v1/me','GET',undefined,a.token,401);
    });
    it('recovers proof-bound deletion without a session after response loss and restart, and ACK is durable', async () => {
        const a = await account(), proof = randomBytes(32).toString('base64');
        const receipt = await req<AccountDeletionReceipt>('/v1/accounts/current', 'DELETE', { password, operationId: 'lost-delete-response', proof }, a.token);
        expect(receipt).toEqual({ version: 1, operationId: 'lost-delete-response', accountId: a.accountId, status: 'deleted', deletedAt: time });
        const disk = await readFile(file, 'utf8'); expect(disk).not.toContain(proof); expect(disk).not.toContain(password);
        await relay.close(); relay = await createCompanionServer({ file, port: 0, now: () => time });
        await req('/v1/me', 'GET', undefined, a.token, 401);
        expect(await req('/v1/account-deletions/lost-delete-response/receipt', 'POST', { proof })).toEqual(receipt);
        await req('/v1/account-deletions/lost-delete-response/receipt', 'POST', { proof: randomBytes(32).toString('base64') }, undefined, 404);
        await req('/v1/account-deletions/lost-delete-response/ack', 'POST', { proof: randomBytes(32).toString('base64') }, undefined, 404);
        expect(await req('/v1/account-deletions/lost-delete-response/ack', 'POST', { proof })).toEqual({ version: 1, operationId: 'lost-delete-response', status: 'acknowledged' });
        await relay.close(); relay = await createCompanionServer({ file, port: 0, now: () => time });
        await req('/v1/account-deletions/lost-delete-response/receipt', 'POST', { proof }, undefined, 404);
        await req('/v1/account-deletions/lost-delete-response/ack', 'POST', { proof }, undefined, 404);
    });
    it('wrong password and unauthorized device never create deletion proof or purge data', async () => {
        const a = await account(), proof = randomBytes(32).toString('base64'), op = 'wrong-password';
        await req('/v1/accounts/current', 'DELETE', { password: 'PUBLIC wrong password', operationId: op, proof }, a.token, 401);
        await req(`/v1/account-deletions/${op}/receipt`, 'POST', { proof }, undefined, 404);
        await req('/v1/me', 'GET', undefined, a.token);
        const pending = await login('unapproved-device');
        await req('/v1/accounts/current', 'DELETE', { password, operationId: op, proof }, pending.token, 403);
        await req('/v1/me', 'GET', undefined, a.token);
        expect(JSON.parse(await readFile(file, 'utf8')).accountDeletions).toEqual({});
    });
    it('receipt durability probe repairs uncertain delete commit and cannot report success through a failed barrier', async () => {
        await relay.close(); let failBarrier = false;
        relay = await createCompanionServer({ file, port: 0, now: () => time, syncDirectory: async () => { if (failBarrier) { failBarrier = false; throw new Error('PUBLIC directory fsync failure'); } } });
        const a = await account(), proof = randomBytes(32).toString('base64'), operationId = 'uncertain-deletion';
        failBarrier = true; await req('/v1/accounts/current', 'DELETE', { password, operationId, proof }, a.token, 503);
        await req('/v1/me', 'GET', undefined, a.token, 401);
        failBarrier = true; await req(`/v1/account-deletions/${operationId}/receipt`, 'POST', { proof }, undefined, 503);
        expect((await req<AccountDeletionReceipt>(`/v1/account-deletions/${operationId}/receipt`, 'POST', { proof })).accountId).toBe(a.accountId);
    });
    it('deletion rename failure leaves account live and cannot manufacture a receipt', async () => {
        const a = await account(), proof = randomBytes(32).toString('base64');
        await rename(file, file + '.backup'); await mkdir(file);
        await req('/v1/accounts/current', 'DELETE', { password, operationId: 'rename-failed', proof }, a.token, 500);
        await rm(file, { recursive: true }); await rename(file + '.backup', file);
        await req('/v1/me', 'GET', undefined, a.token);
        await req('/v1/account-deletions/rename-failed/receipt', 'POST', { proof }, undefined, 404);
    });
    it('prevents operation reuse across accounts and bounds receipts before account removal', async () => {
        const a = await account(), proof = randomBytes(32).toString('base64');
        await req('/v1/accounts/current', 'DELETE', { password, operationId: 'existing-op', proof }, a.token);
        const b = await account('bob', 'bob-phone');
        await req('/v1/accounts/current', 'DELETE', { password, operationId: 'existing-op', proof }, b.token, 409);
        await req('/v1/me', 'GET', undefined, b.token);
        await relay.close(); const persisted = JSON.parse(await readFile(file, 'utf8'));
        for (let n = 1; n < 10000; n++) persisted.accountDeletions[`PUBLIC-op-${n}`] = { version: 1, operationId: `PUBLIC-op-${n}`, accountId: `PUBLIC-deleted-${n}`, status: 'deleted', deletedAt: time, proofHash: '0'.repeat(64) };
        await writeFile(file, JSON.stringify(persisted)); relay = await createCompanionServer({ file, port: 0, now: () => time });
        const session = await req<SessionDto>('/v1/sessions', 'POST', { login: 'bob', password, deviceId: 'bob-phone', deviceProof: deviceProof('bob-phone') });
        await req('/v1/accounts/current', 'DELETE', { password, operationId: 'over-capacity', proof }, session.token, 429);
        await req('/v1/me', 'GET', undefined, session.token);
    });
    it('adds the empty receipt collection when loading a prior version-one state', async () => {
        const a = await account(); await relay.close(); const old = JSON.parse(await readFile(file, 'utf8')); delete old.accountDeletions;
        await writeFile(file, JSON.stringify(old)); relay = await createCompanionServer({ file, port: 0, now: () => time });
        const session = await login(); const proof = randomBytes(32).toString('base64');
        expect((await req<AccountDeletionReceipt>('/v1/accounts/current', 'DELETE', { password, operationId: 'legacy-delete', proof }, session.token)).accountId).toBe(a.accountId);
    });
    it('binds receipt identity to the deleted account even when the same login is re-registered', async () => {
        const old = await account(), proof = randomBytes(32).toString('base64');
        await req('/v1/accounts/current', 'DELETE', { password, operationId: 'old-account', proof }, old.token);
        const replacement = await account(); expect(replacement.accountId).not.toBe(old.accountId);
        const receipt = await req<AccountDeletionReceipt>('/v1/account-deletions/old-account/receipt', 'POST', { proof });
        expect(receipt.accountId).toBe(old.accountId); expect(receipt.accountId).not.toBe(replacement.accountId);
        await req('/v1/account-deletions/old-account/receipt', 'POST', { proof, accountId: replacement.accountId }, undefined, 400);
        await req('/v1/account-deletions/old-account/ack', 'POST', { proof, password }, undefined, 400);
        await req('/v1/me', 'GET', undefined, replacement.token);
    });
    it('rejects an oversized declared body before receiving content', async () => {
        const status = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(relay.url + '/v1/accounts', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': 96 * 1024 * 1024 + 1 } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode ?? 0)); });
            request.once('error', reject); request.end();
        });
        expect(status).toBe(413); expect(await req('/health')).toEqual({ ok: true, protocol: 1 });
    });
    it('accepts actual chunked JSON and rejects a streamed oversized body without creating an account', async () => {
        const accepted = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(relay.url + '/v1/accounts', { method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode ?? 0)); });
            request.once('error', reject);
            const json = JSON.stringify({ login: 'chunked-public', password, deviceId: 'chunked-phone', deviceProof: deviceProof('chunked-phone') });
            request.write(json.slice(0, 17)); request.end(json.slice(17));
        });
        expect(accepted).toBe(200);
        const before = await readFile(file, 'utf8');
        const rejected = await new Promise<number | string>(resolve => {
            const request = httpRequest(relay.url + '/v1/accounts', { method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode ?? 0)); });
            request.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? 'unknown'));
            void (async () => { const bytes = Buffer.alloc(16 * 1024, 32); for (let n = 0; n < 6144; n++) if (!request.write(bytes)) await once(request, 'drain'); request.end(Buffer.from(' ')); })().catch((error: NodeJS.ErrnoException) => resolve(error.code ?? 'unknown'));
        });
        // Node may close the overflowing incoming stream before a structured 413 reaches the peer.
        expect([413, 'ECONNRESET', 'EPIPE']).toContain(rejected);
        expect(await readFile(file, 'utf8')).toBe(before); expect(await req('/health')).toEqual({ ok: true, protocol: 1 });
    });

});
