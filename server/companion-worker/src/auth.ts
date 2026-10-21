import { randomBytes, randomUUID } from 'node:crypto';
import { assertSql, commit, revision, sql } from './database.js';
import { binary, fail, hash, id, keys, loginName, passwordKey, same, string, token } from './protocol.js';

export interface Account { id: string; login: string; slot: string; salt: string; password_hash: string; password_p: 1 | 5; vault_id: string; status: 'active' | 'deleting' }
export interface Session {
  token_hash: string; account_id: string; device_id: string; proof_hash: string; expires_at: number;
  vault_id: string; authorized: number;
}
export async function authenticate(db: D1Database, request: Request, now: number): Promise<Session> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) fail(401, 'unauthorized');
  const session = await sql(db, `SELECT s.*, a.vault_id, CASE WHEN d.proof_hash = s.proof_hash THEN 1 ELSE 0 END AS authorized
    FROM sessions s JOIN accounts a ON a.id = s.account_id AND a.status = 'active'
    LEFT JOIN devices d ON d.account_id = s.account_id AND d.id = s.device_id
    WHERE s.token_hash = ? AND s.expires_at > ?`, hash(authorization.slice(7)), now).first<Session>();
  if (!session) fail(401, 'unauthorized'); return session;
}
export function authorized(session: Session): void { if (!session.authorized) fail(403, 'device_not_authorized'); }
function sessionDto(account: Account, deviceId: string, rawToken: string, expiresAt: number, deviceAuthorized: boolean): unknown {
  return { accountId: account.id, deviceId, token: rawToken, expiresAt, vaultId: account.vault_id, deviceAuthorized };
}
async function reserveHashBudget(db: D1Database, before: number, login: string, now: number): Promise<number> {
  const scopes = [{ scope: 'global', duration: 60000, maximum: 64 }, { scope: 'login:' + hash(login), duration: 900000, maximum: 16 }];
  const statements: D1PreparedStatement[] = [sql(db, 'DELETE FROM auth_budgets WHERE window_start <= ?', now - 900000)];
  for (const rule of scopes) {
    const current = await sql(db, 'SELECT attempts, window_start FROM auth_budgets WHERE scope = ?', rule.scope).first<{ attempts: number; window_start: number }>();
    if (current && current.window_start + rule.duration > now && current.attempts >= rule.maximum) fail(429, 'authentication_rate_limited');
    statements.push(sql(db, `INSERT INTO auth_budgets VALUES (?, 1, ?) ON CONFLICT(scope) DO UPDATE SET attempts = CASE WHEN window_start + ? <= ? THEN 1 ELSE attempts + 1 END, window_start = CASE WHEN window_start + ? <= ? THEN excluded.window_start ELSE window_start END`, rule.scope, now, rule.duration, now, rule.duration, now));
  }
  await commit(db, before, statements);
  // Account/device/admission checks used below follow the new committed revision.
  return revision(db);
}
async function createSessionWithLease(db: D1Database, before: number, b: Record<string, unknown>, register: boolean, now: number): Promise<unknown> {
  keys(b, register ? ['login', 'password', 'deviceId', 'deviceProof', 'admissionToken'] : ['login', 'password', 'deviceId', 'deviceProof']);
  const login = loginName(b.login); const password = string(b.password, 12, 256); const deviceId = id(b.deviceId);
  const proofHash = hash(Buffer.from(binary(b.deviceProof, 32), 'base64')); const rawToken = token(); const expiresAt = now + 30 * 60 * 1000;
  if (register) {
    if (b.admissionToken === undefined) fail(403, 'private_admission_required');
    const admissionHash = hash(string(b.admissionToken, 43, 43));
    const slot = await sql(db, "SELECT slot, login, expires_at, status FROM admission_slots WHERE token_hash = ?", admissionHash).first<{ slot: string; login: string; expires_at: number; status: string }>();
    if (!slot || slot.login !== login) fail(403, 'admission_invalid');
    if (slot.status !== 'open') fail(409, 'admission_already_used');
    if (slot.expires_at <= now) fail(410, 'admission_expired');
    const existing = await sql(db, 'SELECT id FROM accounts WHERE login = ?', login).first(); if (existing) fail(409, 'login_unavailable');
    before = await reserveHashBudget(db, before, login, now);
    const salt = Buffer.from(randomBytes(16)).toString('hex'); const passwordHash = await passwordKey(password, salt);
    const account: Account = { id: randomUUID(), login, slot: slot.slot, salt, password_hash: passwordHash, password_p: 5, vault_id: randomUUID(), status: 'active' };
    await commit(db, before, [
      assertSql(db, "EXISTS(SELECT 1 FROM admission_slots WHERE slot = ? AND token_hash = ? AND login = ? AND status = 'open' AND expires_at > ?) AND (SELECT count(*) FROM accounts) < 2", slot.slot, admissionHash, login, now),
      sql(db, "UPDATE admission_slots SET status = 'claimed', account_id = ? WHERE slot = ?", account.id, slot.slot),
      sql(db, "INSERT INTO accounts VALUES (?, ?, ?, ?, ?, 5, ?, 'active')", account.id, login, slot.slot, salt, passwordHash, account.vault_id),
      sql(db, 'INSERT INTO devices VALUES (?, ?, ?)', account.id, deviceId, proofHash),
      sql(db, "INSERT INTO groups (id,kind,epoch,status) VALUES (?, 'vault', 1, 'active')", account.vault_id),
      sql(db, "INSERT INTO memberships VALUES (?, ?, 'vault')", account.vault_id, account.id),
      sql(db, 'INSERT INTO sessions VALUES (?, ?, ?, ?, ?)', hash(rawToken), account.id, deviceId, proofHash, expiresAt),
    ]);
    return sessionDto(account, deviceId, rawToken, expiresAt, true);
  }
  before = await reserveHashBudget(db, before, login, now);
  const account = await sql(db, "SELECT * FROM accounts WHERE login = ? AND status = 'active'", login).first<Account>();
  const actual = await passwordKey(password, account?.salt ?? '00000000000000000000000000000000', account?.password_p ?? 5);
  if (!account || !same(actual, account.password_hash)) fail(401, 'invalid_credentials');
  const device = await sql(db, 'SELECT proof_hash FROM devices WHERE account_id = ? AND id = ?', account.id, deviceId).first<{ proof_hash: string }>();
  if (device && !same(device.proof_hash, proofHash)) fail(401, 'invalid_device_proof');
  const upgraded = account.password_p === 1 ? await passwordKey(password, account.salt, 5) : account.password_hash;
  await commit(db, before, [
    assertSql(db, "EXISTS(SELECT 1 FROM accounts WHERE id = ? AND status = 'active' AND password_hash = ?)", account.id, account.password_hash),
    sql(db, 'UPDATE accounts SET password_hash = ?, password_p = 5 WHERE id = ?', upgraded, account.id),
    sql(db, 'DELETE FROM sessions WHERE expires_at <= ? OR (account_id = ? AND token_hash IN (SELECT token_hash FROM sessions WHERE account_id = ? ORDER BY expires_at DESC LIMIT -1 OFFSET 31))', now, account.id, account.id),
    sql(db, 'INSERT INTO sessions VALUES (?, ?, ?, ?, ?)', hash(rawToken), account.id, deviceId, proofHash, expiresAt),
  ]);
  return sessionDto(account, deviceId, rawToken, expiresAt, !!device);
}

/** Two users need no parallel memory-hard authentication. This persisted lease
 * bounds hashing across isolates; a crash recovers after one minute. */
export async function createSession(db: D1Database, before: number, b: Record<string, unknown>, register: boolean, now: number): Promise<unknown> {
  const lease = await db.prepare('SELECT expires_at FROM hash_lease WHERE id = 1').first<{ expires_at: number }>();
  if (lease && lease.expires_at > now) fail(429, 'authentication_busy_retry');
  const leaseToken = token();
  await commit(db, before, [assertSql(db, 'NOT EXISTS(SELECT 1 FROM hash_lease WHERE id = 1 AND expires_at > ?)', now), sql(db, 'INSERT INTO hash_lease VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at', leaseToken, now + 60000)]);
  try { return await createSessionWithLease(db, await revision(db), b, register, now); }
  finally {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await commit(db, await revision(db), [sql(db, 'DELETE FROM hash_lease WHERE id = 1 AND token = ?', leaseToken)]); break; }
      catch { /* Keep the lease until expiry if concurrent cleanup cannot commit. */ }
    }
  }
}
