import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AccountDeletionReceipt, Change, Ciphertext, Group, Invite, Receipt, SessionDto, StoredChange } from './types.js';
export type { AccountDeletionReceipt, AccountDeletionAcknowledgement, Change, Ciphertext, Group, Invite, Receipt, SessionDto, StoredChange, SyncResponse } from './types.js';
interface Account {
    id: string;
    login: string;
    salt: string;
    passwordHash: string;
    devices: string[];
    deviceProofHashes: Record<string, string>;
    vaultId: string;
}
interface GroupState extends Group {
    sequence: number;
    records: Record<string, StoredChange>;
    seen: Record<string, {
        ownerId: string;
        digest: string;
    }>;
    receipts: Receipt[];
    delivered: Record<string, string[]>;
}
interface InviteState extends Invite {
    proofHash: string;
    recipientDeviceProofHash: string | null;
}
interface State {
    version: 1;
    accounts: Record<string, Account>;
    groups: Record<string, GroupState>;
    invites: Record<string, InviteState>;
    revoked: Record<string, number>;
    accountDeletions: Record<string, AccountDeletionReceipt & { proofHash: string }>;
}
interface Session {
    accountId: string;
    deviceId: string;
    deviceProofHash: string;
    expiresAt: number;
}
export interface CompanionOptions {
    file: string;
    host?: string;
    port?: number;
    now?: () => number;
    sessionTtlMs?: number;
    syncDirectory?: (directory: string) => Promise<void>;
}
export class ProtocolError extends Error {
    constructor(public readonly status: number, public readonly code: string) { super(code); }
}
const fail = (status: number, code: string): never => { throw new ProtocolError(status, code); };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(400, 'invalid_object');
function keys(value: Record<string, unknown>, allowed: string[]): void { if (Object.keys(value).some(k => !allowed.includes(k)))
    fail(400, 'unknown_field'); }
function str(value: unknown, min = 1, max = 128): string { return typeof value === 'string' && value.length >= min && value.length <= max ? value : fail(400, 'invalid_string'); }
function id(value: unknown): string { const s = str(value); return /^[A-Za-z0-9_-]+$/.test(s) && !['__proto__', 'constructor', 'prototype'].includes(s) ? s : fail(400, 'invalid_id'); }
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : fail(400, 'invalid_number'); }
function binary(value: unknown, length?: number): string { const s = str(value, 0, 96 * 1024 * 1024); if (s.length > Math.ceil((length ?? 64 * 1024 * 1024) / 3) * 4)
    fail(413, 'encoded_capacity'); const bytes = Buffer.from(s, 'base64'); if (bytes.length > 64 * 1024 * 1024)
    fail(413, 'ciphertext_too_large'); if (bytes.toString('base64') !== s || (length !== undefined && bytes.length !== length))
    fail(400, 'invalid_base64'); return s; }
function cipher(value: unknown): Ciphertext { const o = object(value); keys(o, ['algorithm', 'nonce', 'ciphertext', 'tag']); if (o.algorithm !== 'AES-256-GCM')
    fail(400, 'invalid_algorithm'); return { algorithm: 'AES-256-GCM', nonce: binary(o.nonce, 12), ciphertext: binary(o.ciphertext), tag: binary(o.tag, 16) }; }
function change(value: unknown): Change { const o = object(value); keys(o, ['id', 'recordId', 'category', 'kind', 'updatedAt', 'deleted', 'payload']); if (o.kind !== 'record' && o.kind !== 'encouragement')
    return fail(400, 'invalid_kind'); if (typeof o.deleted !== 'boolean')
    return fail(400, 'invalid_deleted'); return { id: id(o.id), recordId: id(o.recordId), category: id(o.category), kind: o.kind, updatedAt: number(o.updatedAt), deleted: o.deleted, payload: cipher(o.payload) }; }
const SHARE_CATEGORIES = ['goal', 'progress_band', 'checkin_streak', 'meals', 'photos', 'menstrual', 'exact_weight', 'body_measurements', 'encouragement'];
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function groupDto(g: GroupState): Group { return { id: g.id, kind: g.kind, members: [...g.members], epoch: g.epoch, grants: structuredClone(g.grants) }; }
function inviteDto(i: InviteState): Invite { const { proofHash: _, recipientDeviceProofHash: __, ...dto } = i; return structuredClone(dto); }
function blank(): State { return { version: 1, accounts: {}, groups: {}, invites: {}, revoked: {}, accountDeletions: {} }; }
function deletionProofHash(operationId: string, accountId: string, proof: string): string { return hash(JSON.stringify(['leanon-account-deletion-v1', operationId, accountId, proof])); }
function deletionDto(value: AccountDeletionReceipt): AccountDeletionReceipt { return { version: 1, operationId: value.operationId, accountId: value.accountId, status: 'deleted', deletedAt: value.deletedAt }; }
function createGroup(groupId: string, kind: 'vault' | 'family', members: string[]): GroupState { return { id: groupId, kind, members, epoch: 1, grants: {}, sequence: 0, records: {}, seen: {}, receipts: [], delivered: {} }; }
/** Reject malformed persisted state before any listener exposes it. */
export function validateState(value: unknown): State {
    const state = object(value);
    keys(state, ['version', 'accounts', 'groups', 'invites', 'revoked', 'accountDeletions']);
    if (state.version !== 1)
        throw new Error('Unsupported relay state');
    const accounts = object(state.accounts);
    for (const [key, value] of Object.entries(accounts)) {
        const a = object(value);
        keys(a, ['id', 'login', 'salt', 'passwordHash', 'devices', 'deviceProofHashes', 'vaultId']);
        if (id(a.id) !== id(key))
            throw new Error('Account identity mismatch');
        loginName(a.login);
        id(a.vaultId);
        if (!/^[a-f0-9]{32}$/.test(str(a.salt, 32, 32)) || !/^[a-f0-9]{128}$/.test(str(a.passwordHash, 128, 128)))
            throw new Error('Invalid password hash');
        if (!Array.isArray(a.devices) || a.devices.length < 1 || a.devices.length > 32 || new Set(a.devices.map(id)).size !== a.devices.length)
            throw new Error('Invalid devices');
        const hashes = object(a.deviceProofHashes);
        if (Object.keys(hashes).length !== a.devices.length || a.devices.some(device => !/^[a-f0-9]{64}$/.test(str(hashes[id(device)], 64, 64))))
            throw new Error('Invalid device proof hashes');
    }
    const groups = object(state.groups);
    for (const [key, value] of Object.entries(groups)) {
        const g = object(value);
        keys(g, ['id', 'kind', 'members', 'epoch', 'grants', 'sequence', 'records', 'seen', 'receipts', 'delivered']);
        if (id(g.id) !== id(key) || (g.kind !== 'vault' && g.kind !== 'family'))
            throw new Error('Invalid group');
        number(g.epoch, 1, Number.MAX_SAFE_INTEGER - 1);
        number(g.sequence);
        if (!Array.isArray(g.members) || g.members.length !== (g.kind === 'vault' ? 1 : 2) || new Set(g.members.map(id)).size !== g.members.length || g.members.some(m => !Object.hasOwn(accounts, id(m))))
            throw new Error('Invalid members');
        for (const [sender, recipients] of Object.entries(object(g.grants))) {
            if (!g.members.includes(sender))
                throw new Error('Invalid sender');
            for (const [recipient, categories] of Object.entries(object(recipients)))
                if (recipient === sender || !g.members.includes(recipient) || !Array.isArray(categories) || categories.length > 32 || new Set(categories.map(id)).size !== categories.length)
                    throw new Error('Invalid grants');
        }
        for (const [recordKey, value] of Object.entries(object(g.records))) {
            const r = object(value);
            keys(r, ['id', 'recordId', 'category', 'kind', 'updatedAt', 'deleted', 'payload', 'ownerId', 'deviceId', 'sequence']);
            const { ownerId, deviceId, sequence, ...payload } = r;
            const c = change(payload);
            if (!g.members.includes(id(ownerId)) || recordKey !== `${id(ownerId)}:${c.recordId}`)
                throw new Error('Invalid record owner');
            id(deviceId);
            number(sequence, 1, number(g.sequence));
        }
        for (const [changeId, value] of Object.entries(object(g.seen))) {
            id(changeId);
            const seen = object(value);
            keys(seen, ['ownerId', 'digest']);
            if (!g.members.includes(id(seen.ownerId)) || !/^[a-f0-9]{64}$/.test(str(seen.digest, 64, 64)))
                throw new Error('Invalid replay digest');
        }
        for (const [device, delivered] of Object.entries(object(g.delivered))) {
            str(device, 1, 256);
            if (!Array.isArray(delivered) || delivered.some(v => typeof v !== 'string' || !Object.hasOwn(object(g.seen), id(v))))
                throw new Error('Invalid delivery ledger');
        }
        if (!Array.isArray(g.receipts))
            throw new Error('Invalid receipts');
        for (const value of g.receipts) {
            const r = object(value);
            keys(r, ['id', 'recipientId', 'acknowledgedAt']);
            id(r.id);
            if (!g.members.includes(id(r.recipientId)))
                throw new Error('Invalid receipt');
            number(r.acknowledgedAt);
        }
    }
    for (const [key, value] of Object.entries(object(state.invites))) {
        const i = object(value);
        keys(i, ['id', 'kind', 'creatorId', 'creatorDeviceId', 'recipientId', 'recipientDeviceId', 'status', 'expiresAt', 'wrappedKey', 'groupId', 'proofHash', 'recipientDeviceProofHash']);
        if (id(i.id) !== id(key) || !['family', 'device'].includes(str(i.kind)) || !['open', 'pending', 'accepted', 'cancelled'].includes(str(i.status)) || !Object.hasOwn(accounts, id(i.creatorId)))
            throw new Error('Invalid invite');
        id(i.creatorDeviceId);
        id(i.groupId);
        number(i.expiresAt);
        cipher(i.wrappedKey);
        if (i.recipientId !== null && !Object.hasOwn(accounts, id(i.recipientId)))
            throw new Error('Invalid invite recipient');
        if (i.recipientDeviceId !== null)
            id(i.recipientDeviceId);
        if (i.recipientDeviceProofHash !== null && !/^[a-f0-9]{64}$/.test(str(i.recipientDeviceProofHash, 64, 64)))
            throw new Error('Invalid recipient device proof');
        if (!/^[a-f0-9]{64}$/.test(str(i.proofHash, 64, 64)))
            throw new Error('Invalid invite proof');
    }
    for (const [groupId, epoch] of Object.entries(object(state.revoked))) {
        id(groupId);
        number(epoch, 2);
    }
    // Additive compatibility for the original version-one relay file.
    const deletions = state.accountDeletions === undefined ? {} : object(state.accountDeletions);
    if (Object.keys(deletions).length > 10000) throw new Error('Deletion receipt capacity exceeded');
    for (const [operationId, value] of Object.entries(deletions)) {
        const receipt = object(value);
        keys(receipt, ['version', 'operationId', 'accountId', 'status', 'deletedAt', 'proofHash']);
        if (receipt.version !== 1 || receipt.status !== 'deleted' || id(receipt.operationId) !== id(operationId)) throw new Error('Invalid deletion receipt');
        id(receipt.accountId); number(receipt.deletedAt);
        if (!/^[a-f0-9]{64}$/.test(str(receipt.proofHash, 64, 64))) throw new Error('Invalid deletion proof hash');
        if (Object.hasOwn(accounts, id(receipt.accountId))) throw new Error('Deletion receipt references a live account');
    }
    state.accountDeletions = deletions;
    return value as State;
}
function loginName(value: unknown): string {
    const login = str(value, 3, 128).trim().toLowerCase();
    if (login.length < 3 || /[\s\x00-\x1f\x7f]/.test(login))
        return fail(400, 'invalid_login');
    return login;
}
/** Single-process file transactions publish only after fsync and atomic rename. */
class FileStore {
    private queue: Promise<unknown> = Promise.resolve();
    constructor(readonly file: string, private state: State, private readonly syncDirectory: (directory: string) => Promise<void>) { }
    static async load(file: string, syncDirectory: (directory: string) => Promise<void>): Promise<FileStore> {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        let state: State;
        try {
            if ((await stat(file)).size > 128 * 1024 * 1024)
                throw new Error('Relay state exceeds capacity');
            state = validateState(JSON.parse(await readFile(file, 'utf8')) as unknown);
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
            state = blank();
        }
        return new FileStore(file, state, syncDirectory);
    }
    read(): State { return this.state; }
    transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
        const run = this.queue.then(async () => {
            const draft = structuredClone(this.state);
            const result = await fn(draft);
            const temporary = `${this.file}.${randomUUID()}.tmp`;
            try {
                const serialized = JSON.stringify(draft);
                if (Buffer.byteLength(serialized) > 128 * 1024 * 1024)
                    return fail(413, 'state_capacity');
                const handle = await open(temporary, 'wx', 0o600);
                try {
                    await handle.writeFile(serialized);
                    await handle.sync();
                }
                finally {
                    await handle.close();
                }
                await rename(temporary, this.file);
                // Rename is the commit point: disk and memory must agree even if the
                // subsequent durability barrier fails. Retrying the same IDs is safe.
                this.state = draft;
                // Directory fsync persists the rename before reporting success.
                try {
                    await this.syncDirectory(dirname(this.file));
                }
                catch {
                    throw new ProtocolError(503, 'durability_uncertain_retry_same_ids');
                }
                return result;
            }
            catch (error) {
                await unlink(temporary).catch(() => undefined);
                throw error;
            }
        });
        this.queue = run.catch(() => undefined);
        return run;
    }
}
/** One local process owns each durable state file; stale crash leases are reclaimed. */
async function acquireLease(file: string): Promise<() => Promise<void>> {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const lock = `${file}.lock`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const handle = await open(lock, 'wx', 0o600);
            await handle.writeFile(String(process.pid));
            await handle.sync();
            await handle.close();
            return async () => { await unlink(lock).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error; }); };
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error;
            const owner = Number(await readFile(lock, 'utf8'));
            if (!Number.isSafeInteger(owner) || owner <= 0)
                throw new Error('Invalid relay lease; inspect before removing');
            if (owner === process.pid)
                throw new Error('Relay state is already owned by a live process');
            try {
                process.kill(owner, 0);
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                    await unlink(lock);
                    continue;
                }
                throw error;
            }
            throw new Error('Relay state is already owned by a live process');
        }
    }
    throw new Error('Unable to acquire relay lease');
}
export interface CompanionServer {
    url: string;
    server: Server;
    close: () => Promise<void>;
}
export async function createCompanionServer(options: CompanionOptions): Promise<CompanionServer> {
    const releaseLease = await acquireLease(options.file);
    let store: FileStore;
    try {
        store = await FileStore.load(options.file, options.syncDirectory ?? (async (path) => { const directory = await open(path, 'r'); try {
            await directory.sync();
        }
        finally {
            await directory.close();
        } }));
    }
    catch (error) {
        await releaseLease();
        throw error;
    }
    const sessions = new Map<string, Session>();
    const now = options.now ?? Date.now;
    const ttl = Math.min(options.sessionTtlMs ?? 1800000, 1800000);
    if (!Number.isSafeInteger(ttl) || ttl <= 0) {
        await releaseLease();
        throw new Error('Session TTL must be positive');
    }
    const host = options.host ?? '127.0.0.1';
    if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
        await releaseLease();
        throw new Error('This QA relay binds only to loopback');
    }
    function issue(a: Account, deviceId: string, deviceProofHash: string): SessionDto {
        for (const [key, session] of sessions) if (session.expiresAt <= now()) sessions.delete(key);
        if (sessions.size >= 1000 || [...sessions.values()].filter(session => session.accountId === a.id).length >= 32) return fail(429, 'session_capacity');
        const token = randomBytes(32).toString('base64url'); const expiresAt = now() + ttl; sessions.set(hash(token), { accountId: a.id, deviceId, deviceProofHash, expiresAt }); return { accountId: a.id, deviceId, token, expiresAt, vaultId: a.vaultId, deviceAuthorized: a.devices.includes(deviceId) && a.deviceProofHashes[deviceId] === deviceProofHash }; }
    function auth(req: IncomingMessage): Session { const header = req.headers.authorization ?? ''; const token = header.startsWith('Bearer ') ? header.slice(7) : ''; const session = sessions.get(hash(token)); if (!session || session.expiresAt <= now() || !store.read().accounts[session.accountId]) {
        sessions.delete(hash(token));
        return fail(401, 'unauthorized');
    } return session; }
    function authorized(state: State, s: Session): Account { const a = state.accounts[s.accountId]; if (!a)
        return fail(401, 'unauthorized'); if (!a.devices.includes(s.deviceId) || a.deviceProofHashes[s.deviceId] !== s.deviceProofHash)
        return fail(403, 'device_pairing_required'); return a; }
    function member(state: State, s: Session, groupId: string): GroupState { authorized(state, s); const g = state.groups[groupId]; if (!g || !g.members.includes(s.accountId))
        return fail(403, 'group_access_denied'); return g; }
    function epoch(g: GroupState, value: unknown): void { if (number(value) !== g.epoch)
        fail(409, 'stale_epoch'); }
    function purge(state: State, g: GroupState): number { state.revoked[g.id] = g.epoch + 1; delete state.groups[g.id]; for (const i of Object.values(state.invites))
        if (i.groupId === g.id)
            delete state.invites[i.id]; return g.epoch + 1; }
    function family(state: State, accountId: string): GroupState | undefined { return Object.values(state.groups).find(g => g.kind === 'family' && g.members.includes(accountId)); }
    function assertOpen(i: InviteState | undefined): InviteState { if (!i)
        return fail(404, 'invite_not_found'); if (i.expiresAt <= now())
        return fail(410, 'invite_expired'); if (i.status !== 'open')
        return fail(409, 'invite_used'); return i; }
    async function body(req: IncomingMessage): Promise<Record<string, unknown>> { let size = 0; const chunks: Buffer[] = []; for await (const part of req) {
        const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part as string);
        size += chunk.length;
        if (size > 96 * 1024 * 1024)
            return fail(413, 'body_too_large');
        chunks.push(chunk);
    } if (size === 0)
        return {}; try {
        return object(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
    }
    catch (error) {
        if (error instanceof ProtocolError)
            throw error;
        return fail(400, 'invalid_json');
    } }
    async function route(req: IncomingMessage): Promise<unknown> {
        const url = new URL(req.url ?? '/', `http://${host}`);
        const path = url.pathname;
        const method = req.method;
        if (method === 'GET' && path === '/health')
            return { ok: true, protocol: 1 };
        const deletionRecovery = /^\/v1\/account-deletions\/([A-Za-z0-9_-]{1,128})\/(receipt|ack)$/.exec(path);
        if (method === 'POST' && deletionRecovery) {
            const operationId = id(deletionRecovery[1]); const b = await body(req); keys(b, ['proof']); const proof = binary(b.proof, 32);
            return store.transaction(state => {
                const receipt = state.accountDeletions[operationId];
                if (!receipt || !same(receipt.proofHash, deletionProofHash(operationId, receipt.accountId, proof))) return fail(404, 'deletion_not_found');
                if (deletionRecovery[2] === 'ack') { delete state.accountDeletions[operationId]; return { version: 1, operationId, status: 'acknowledged' }; }
                return deletionDto(receipt);
            });
        }
        if (method === 'POST' && (path === '/v1/accounts' || path === '/v1/sessions')) {
            const b = await body(req);
            keys(b, ['login', 'password', 'deviceId', 'deviceProof']);
            const login = loginName(b.login);
            const password = str(b.password, 12, 256);
            const deviceId = id(b.deviceId);
            const deviceProofHash = hash(Buffer.from(binary(b.deviceProof, 32), 'base64'));
            if (path === '/v1/accounts') {
                const salt = randomBytes(16).toString('hex');
                const passwordHash = (await derive(password, salt)).toString('hex');
                const account = await store.transaction(state => { if (Object.keys(state.accounts).length >= 100)
                    return fail(409, 'account_capacity'); if (Object.values(state.accounts).some(a => a.login === login))
                    return fail(409, 'login_unavailable'); const accountId = randomUUID(); const a: Account = { id: accountId, login, salt, passwordHash, devices: [deviceId], deviceProofHashes: { [deviceId]: deviceProofHash }, vaultId: randomUUID() }; state.accounts[a.id] = a; state.groups[a.vaultId] = createGroup(a.vaultId, 'vault', [a.id]); return a; });
                return issue(account, deviceId, deviceProofHash);
            }
            const a = Object.values(store.read().accounts).find(a => a.login === login);
            const salt = a?.salt ?? '00000000000000000000000000000000';
            const actual = (await derive(password, salt)).toString('hex');
            if (!a || !same(actual, a.passwordHash))
                return fail(401, 'invalid_credentials');
            if (a.devices.includes(deviceId) && !same(a.deviceProofHashes[deviceId] ?? '', deviceProofHash))
                return fail(401, 'invalid_device_proof');
            return issue(a, deviceId, deviceProofHash);
        }
        const s = auth(req);
        if (method === 'DELETE' && path === '/v1/sessions/current') {
            sessions.delete(hash((req.headers.authorization ?? '').slice(7)));
            return { ok: true };
        }
        if (method === 'GET' && path === '/v1/me') {
            const state = store.read();
            const a = state.accounts[s.accountId]!;
            const g = family(state, a.id);
            return { accountId: a.id, deviceId: s.deviceId, deviceAuthorized: a.devices.includes(s.deviceId) && a.deviceProofHashes[s.deviceId] === s.deviceProofHash, vaultId: a.vaultId, family: g ? groupDto(g) : null, invites: Object.values(state.invites).filter(i => i.creatorId === a.id || i.recipientId === a.id).map(inviteDto) };
        }
        if (method === 'DELETE' && path === '/v1/accounts/current') {
            const b = await body(req);
            keys(b, ['password', 'operationId', 'proof']);
            const operationId = id(b.operationId); const proof = binary(b.proof, 32);
            const a = authorized(store.read(), s);
            const actual = (await derive(str(b.password, 12, 256), a.salt)).toString('hex');
            if (!same(actual, a.passwordHash))
                return fail(401, 'invalid_credentials');
            const receipt = await store.transaction(state => {
                const token = (req.headers.authorization ?? '').slice(7);
                if (sessions.get(hash(token)) !== s || s.expiresAt <= now()) return fail(401, 'unauthorized');
                const current = authorized(state, s);
                if (current.passwordHash !== a.passwordHash || current.salt !== a.salt) return fail(401, 'invalid_credentials');
                if (Object.hasOwn(state.accountDeletions, operationId)) return fail(409, 'deletion_operation_conflict');
                if (Object.keys(state.accountDeletions).length >= 10000) return fail(429, 'deletion_receipt_capacity');
                const result: AccountDeletionReceipt & { proofHash: string } = { version: 1, operationId, accountId: a.id, status: 'deleted', deletedAt: number(now()), proofHash: deletionProofHash(operationId, a.id, proof) };
                for (const g of Object.values(state.groups))
                if (g.members.includes(a.id))
                    purge(state, g); for (const i of Object.values(state.invites))
                if (i.creatorId === a.id || i.recipientId === a.id)
                    delete state.invites[i.id]; delete state.accounts[a.id]; state.accountDeletions[operationId] = result;
                return deletionDto(result);
            }).finally(() => {
                // A committed rename can still report uncertain directory durability.
                // Deleted accounts must lose sessions even when the HTTP result is 503.
                if (!store.read().accounts[a.id]) for (const [token, value] of sessions) if (value.accountId === a.id) sessions.delete(token);
            });
            for (const [token, value] of sessions)
                if (value.accountId === a.id)
                    sessions.delete(token);
            return receipt;
        }
        if (method === 'POST' && path === '/v1/invites') {
            const b = await body(req);
            keys(b, ['id', 'kind', 'proofHash', 'wrappedKey', 'expiresInSeconds']);
            const inviteId = id(b.id);
            if (b.kind !== 'family' && b.kind !== 'device')
                return fail(400, 'invalid_kind');
            const kind = b.kind;
            const proofHash = str(b.proofHash, 64, 64);
            if (!/^[a-f0-9]{64}$/.test(proofHash))
                return fail(400, 'invalid_proof_hash');
            const wrappedKey = cipher(b.wrappedKey);
            const seconds = b.expiresInSeconds === undefined ? 600 : number(b.expiresInSeconds, 1, 600);
            return store.transaction(state => { const a = authorized(state, s); if (Object.keys(state.invites).length >= 500)
                return fail(409, 'invite_capacity'); if (state.invites[inviteId])
                return fail(409, 'invite_id_used'); if (kind === 'family' && family(state, a.id))
                return fail(409, 'already_paired'); if (Object.values(state.invites).some(i => i.creatorId === a.id && i.kind === kind && i.expiresAt > now() && (i.status === 'open' || i.status === 'pending')))
                return fail(409, 'invite_pending'); const i: InviteState = { id: inviteId, kind, creatorId: a.id, creatorDeviceId: s.deviceId, recipientId: null, recipientDeviceId: null, recipientDeviceProofHash: null, status: 'open', expiresAt: now() + seconds * 1000, wrappedKey, proofHash, groupId: kind === 'device' ? a.vaultId : randomUUID() }; state.invites[i.id] = i; return inviteDto(i); });
        }
        const inviteMatch = /^\/v1\/invites\/([A-Za-z0-9_-]+)(?:\/(accept|confirm))?$/.exec(path);
        if (inviteMatch) {
            const inviteId = id(inviteMatch[1]);
            const action = inviteMatch[2];
            if (method === 'GET' && !action) {
                const i = store.read().invites[inviteId];
                if (!i || !(i.creatorId === s.accountId || i.recipientId === s.accountId))
                    return fail(404, 'invite_not_found');
                return inviteDto(i);
            }
            if (method === 'DELETE' && !action)
                return store.transaction(state => { const i = state.invites[inviteId]; if (!i || !(i.creatorId === s.accountId || i.recipientId === s.accountId))
                    return fail(404, 'invite_not_found'); if (i.status === 'accepted')
                    return fail(409, 'invite_used'); i.status = 'cancelled'; return { ok: true }; });
            if (method === 'POST' && action === 'accept') {
                const b = await body(req);
                keys(b, ['proof']);
                const proof = binary(b.proof, 32);
                return store.transaction(state => { const i = assertOpen(state.invites[inviteId]); if (!same(hash(Buffer.from(proof, 'base64')), i.proofHash))
                    return fail(403, 'invite_proof_invalid'); const a = state.accounts[s.accountId]!; if (i.kind === 'family') {
                    authorized(state, s);
                    if (i.creatorId === s.accountId)
                        return fail(409, 'same_account');
                    if (family(state, s.accountId) || family(state, i.creatorId))
                        return fail(409, 'already_paired');
                }
                else if (i.creatorId !== s.accountId || i.creatorDeviceId === s.deviceId || a.devices.includes(s.deviceId))
                    return fail(403, 'invalid_device_pairing'); i.status = 'pending'; i.recipientId = s.accountId; i.recipientDeviceId = s.deviceId; i.recipientDeviceProofHash = s.deviceProofHash; return inviteDto(i); });
            }
            if (method === 'POST' && action === 'confirm') {
                return store.transaction(state => { authorized(state, s); const i = state.invites[inviteId]; if (!i || i.creatorId !== s.accountId || i.creatorDeviceId !== s.deviceId)
                    return fail(403, 'invite_access_denied'); if (i.expiresAt <= now())
                    return fail(410, 'invite_expired'); if (i.status !== 'pending' || !i.recipientId || !i.recipientDeviceId || !i.recipientDeviceProofHash)
                    return fail(409, 'invite_not_pending'); let g: GroupState; if (i.kind === 'device') {
                    const a = state.accounts[s.accountId]!;
                    if (!a.devices.includes(i.recipientDeviceId)) {
                        if (a.devices.length >= 32)
                            return fail(409, 'device_limit');
                        a.devices.push(i.recipientDeviceId);
                        a.deviceProofHashes[i.recipientDeviceId] = i.recipientDeviceProofHash;
                    }
                    else if (a.deviceProofHashes[i.recipientDeviceId] !== i.recipientDeviceProofHash)
                        return fail(409, 'device_proof_collision');
                    g = state.groups[a.vaultId]!;
                }
                else {
                    if (family(state, s.accountId) || family(state, i.recipientId))
                        return fail(409, 'already_paired');
                    g = createGroup(i.groupId, 'family', [s.accountId, i.recipientId]);
                    state.groups[g.id] = g;
                } i.status = 'accepted'; return { invite: inviteDto(i), group: groupDto(g) }; });
            }
        }
        const groupMatch = /^\/v1\/groups\/([A-Za-z0-9_-]+)(?:\/(grants|sync))?$/.exec(path);
        if (groupMatch) {
            const groupId = id(groupMatch[1]);
            const action = groupMatch[2];
            const b = await body(req);
            if (method === 'DELETE' && !action) {
                keys(b, ['epoch']);
                return store.transaction(state => { const g = member(state, s, groupId); epoch(g, b.epoch); if (g.kind !== 'family')
                    return fail(403, 'cannot_unlink_vault'); return { ok: true, epoch: purge(state, g) }; });
            }
            if (method === 'PUT' && action === 'grants') {
                keys(b, ['epoch', 'recipientId', 'categories']);
                const recipientId = id(b.recipientId);
                if (!Array.isArray(b.categories) || b.categories.length > 32)
                    return fail(400, 'invalid_categories');
                const categories = [...new Set(b.categories.map(id))];
                if (categories.some(c => !SHARE_CATEGORIES.includes(c)))
                    return fail(400, 'invalid_category');
                return store.transaction(state => { const g = member(state, s, groupId); epoch(g, b.epoch); if (g.kind !== 'family' || recipientId === s.accountId || !g.members.includes(recipientId))
                    return fail(403, 'invalid_recipient'); const previous = g.grants[s.accountId]?.[recipientId] ?? []; g.grants[s.accountId] ??= {}; g.grants[s.accountId]![recipientId] = categories; const removed = previous.filter(c => !categories.includes(c)); for (const [key, r] of Object.entries(g.records))
                    if ((r.ownerId === s.accountId && removed.includes(r.category)) || (removed.includes('encouragement') && r.kind === 'encouragement'))
                        delete g.records[key]; g.receipts = g.receipts.filter(r => { const existing = Object.values(g.records).find(c => c.id === r.id); return existing !== undefined; }); return groupDto(g); });
            }
            if (method === 'POST' && action === 'sync') {
                keys(b, ['epoch', 'cursor', 'changes', 'acks']);
                const cursor = number(b.cursor);
                if (!Array.isArray(b.changes) || b.changes.length > 100 || !Array.isArray(b.acks) || b.acks.length > 100)
                    return fail(400, 'invalid_batch');
                const changes = b.changes.map(change);
                const acks = b.acks.map(id);
                return store.transaction(state => {
                    const g = member(state, s, groupId);
                    epoch(g, b.epoch);
                    if (cursor > g.sequence)
                        return fail(409, 'invalid_cursor');
                    for (const c of changes) {
                        if (c.kind === 'encouragement' && c.category !== 'encouragement')
                            return fail(400, 'invalid_encouragement_category');
                        if (g.kind === 'family' && c.kind === 'encouragement' && !g.members.filter(a => a !== s.accountId).every(a => (g.grants[a]?.[s.accountId] ?? []).includes('encouragement')))
                            return fail(403, 'recipient_encouragement_disabled');
                        if (g.kind === 'family' && !g.members.filter(a => a !== s.accountId).every(a => (g.grants[s.accountId]?.[a] ?? []).includes(c.category)))
                            return fail(403, 'sharing_not_authorized');
                        const digest = hash(JSON.stringify(c));
                        const seen = g.seen[c.id];
                        if (seen) {
                            if (seen.ownerId !== s.accountId || seen.digest !== digest)
                                return fail(409, 'idempotency_conflict');
                            continue;
                        }
                        if (Object.keys(g.seen).length >= 10000)
                            return fail(409, 'idempotency_capacity');
                        const recordKey = `${s.accountId}:${c.recordId}`;
                        const old = g.records[recordKey];
                        const candidate: StoredChange = { ...c, ownerId: s.accountId, deviceId: s.deviceId, sequence: g.sequence + 1 };
                        const wins = !old || (!old.deleted && c.deleted) || (old.deleted === c.deleted && (c.updatedAt > old.updatedAt || (c.updatedAt === old.updatedAt && (s.deviceId > old.deviceId || (s.deviceId === old.deviceId && c.id > old.id)))));
                        g.seen[c.id] = { ownerId: s.accountId, digest };
                        if (wins) {
                            if (!old && Object.keys(g.records).length >= 1000)
                                return fail(409, 'record_capacity');
                            if (g.sequence >= Number.MAX_SAFE_INTEGER)
                                return fail(409, 'sequence_exhausted');
                            g.sequence++;
                            g.records[recordKey] = candidate;
                        }
                    }
                    for (const ack of acks) {
                        const c = Object.values(g.records).find(c => c.id === ack);
                        if (!g.delivered[`${s.accountId}_${s.deviceId}`]?.includes(ack) || !c || c.kind !== 'encouragement' || c.deleted || c.ownerId === s.accountId || g.kind !== 'family' || !(g.grants[c.ownerId]?.[s.accountId] ?? []).includes(c.category))
                            return fail(403, 'ack_not_authorized');
                        if (!g.receipts.some(r => r.id === ack && r.recipientId === s.accountId))
                            g.receipts.push({ id: ack, recipientId: s.accountId, acknowledgedAt: now() });
                    }
                    const ordered = Object.values(g.records).filter(c => c.sequence > cursor).sort((a, b) => a.sequence - b.sequence);
                    const visible: StoredChange[] = [];
                    let responseBytes = 4096;
                    let nextCursor = cursor;
                    let complete = true;
                    for (const c of ordered) {
                        if (c.ownerId === s.accountId || (g.grants[c.ownerId]?.[s.accountId] ?? []).includes(c.category)) {
                            const bytes = Buffer.byteLength(JSON.stringify(c));
                            if (visible.length >= 100 || responseBytes + bytes > 95 * 1024 * 1024) {
                                complete = false;
                                break;
                            }
                            visible.push(c);
                            responseBytes += bytes;
                        }
                        nextCursor = c.sequence;
                    }
                    if (complete)
                        nextCursor = g.sequence;
                    g.delivered[`${s.accountId}_${s.deviceId}`] = [...new Set([...(g.delivered[`${s.accountId}_${s.deviceId}`] ?? []), ...visible.filter(c => c.kind === 'encouragement' && c.ownerId !== s.accountId).map(c => c.id)])];
                    return { epoch: g.epoch, cursor: nextCursor, group: groupDto(g), changes: visible, receipts: g.receipts.filter(r => r.recipientId === s.accountId || Object.values(g.records).some(c => c.id === r.id && c.ownerId === s.accountId)) };
                });
            }
        }
        return fail(404, 'not_found');
    }
    const processing = new Set<Promise<void>>();
    let active = 0, large = 0;
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const declared = Number(req.headers['content-length'] ?? 0);
        const largeBody = declared > 1024 * 1024 || Boolean(req.headers['transfer-encoding']) || (!req.headers['content-length'] && (req.method === 'POST' || req.method === 'PUT'));
        if (declared > 96 * 1024 * 1024 || active >= 8 || (largeBody && large >= 1)) {
            res.writeHead(declared > 96 * 1024 * 1024 ? 413 : 429, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'request_capacity', message: 'request_capacity' } }));
            req.resume();
            return;
        }
        active++;
        if (largeBody)
            large++;
        let released = false, processingDone = false, responseDone = false;
        const release = () => { if (!released && processingDone && responseDone) {
            released = true;
            active--;
            if (largeBody)
                large--;
        } };
        const responseEnd = () => { responseDone = true; release(); };
        res.once('finish', responseEnd);
        res.once('close', responseEnd);
        const operation = route(req).then(result => { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(result)); }).catch((error: unknown) => { const status = error instanceof ProtocolError ? error.status : 500; const code = error instanceof ProtocolError ? error.code : 'persistence_or_internal_failure'; res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ error: { code, message: code } })); }).finally(() => { processingDone = true; release(); processing.delete(operation); });
        processing.add(operation);
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    try {
        await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 8787, host, () => { server.off('error', reject); resolve(); }); });
    }
    catch (error) {
        await releaseLease();
        throw error;
    }
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('No TCP address');
    return { url: `http://${host === '::1' ? '[::1]' : host}:${address.port}`, server, close: async () => { await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }); await Promise.allSettled([...processing]); sessions.clear(); await releaseLease(); } };
}
