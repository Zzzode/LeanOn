import { authenticate, authorized, createSession } from './auth.js';
import { body, fail, id, json, LIMITS, ProtocolError, type Environment } from './protocol.js';
import { commit, revision, sql } from './database.js';
import { deleteAccount, finalizeJobs, recover } from './deletion.js';
import { checkEpoch, grants, group, inviteRoute, me, revokeGroupStatements } from './groups.js';
import { cleanup, photo, reserve } from './objects.js';
import { sync } from './sync.js';

async function route(request: Request, env: Environment): Promise<Response | unknown> {
  if (await env.DB.prepare('SELECT id FROM maintenance WHERE id = 1').first()) fail(503, 'offline_maintenance');
  const path = new URL(request.url).pathname; const method = request.method; const now = Date.now();
  if (method === 'GET' && path === '/v2/service') return { protocol: 2, serviceId: await env.DB.prepare('SELECT identifier FROM service_identity WHERE id = 1').first('identifier') };
  if (method === 'GET' && path === '/health') return { ok: true, protocol: 2 };
  if (method === 'GET' && path === '/v1/capabilities') return { protocol: 2, photos: 'independent-aes-gcm-v2', admission: 'private-two-person', limits: LIMITS };
  const recovery = /^\/v1\/account-deletions\/([A-Za-z0-9_-]{1,128})\/(receipt|ack)$/.exec(path);
  if (method === 'POST' && recovery) return recover(env, id(recovery[1]), recovery[2]!, await body(request), now);
  // This revision precedes EVERY permission read used for a mutation.
  const before = await revision(env.DB);
  if (method === 'POST' && ['/v1/accounts', '/v1/sessions'].includes(path)) return createSession(env.DB, before, await body(request), path === '/v1/accounts', now);
  const session = await authenticate(env.DB, request, now);
  if (method === 'DELETE' && path === '/v1/sessions/current') {
    await commit(env.DB, before, [sql(env.DB, 'DELETE FROM sessions WHERE token_hash = ?', session.token_hash)]); return { ok: true };
  }
  if (method === 'GET' && path === '/v1/me') return me(env.DB, session);
  if (method === 'POST' && path === '/v2/migrations/complete') {
    authorized(session); const b = await body(request);
    if (Object.keys(b).sort().join('|') !== 'id|photoCount') fail(400, 'migration_fields');
    const photoCount = b.photoCount;
    if (typeof photoCount !== 'number' || !Number.isSafeInteger(photoCount) || photoCount < 0 || photoCount > 64) fail(400, 'migration_photo_count');
    const job = await sql(env.DB, 'SELECT operation_id, status FROM migration_jobs WHERE account_id = ?', session.account_id).first<{operation_id: string; status: string}>();
    if (!job || job.operation_id !== id(b.id)) fail(409, 'migration_identity_mismatch');
    const records = await sql(env.DB, "SELECT objects FROM records WHERE group_id = ? AND owner_id = ? AND category = 'vault' AND deleted = 0 LIMIT 1", session.vault_id, session.account_id).first<{objects:string}>();
    if (!records || (JSON.parse(records.objects) as unknown[]).length !== photoCount) fail(409, 'migration_republication_incomplete');
    const ready = await sql(env.DB, "SELECT count(*) AS n FROM object_refs r JOIN photo_objects p ON p.id = r.object_id WHERE r.group_id = ? AND r.owner_id = ? AND p.status = 'ready'", session.vault_id, session.account_id).first<number>('n');
    if ((ready ?? 0) < photoCount) fail(409, 'migration_objects_incomplete');
    if (job.status !== 'complete') await commit(env.DB, before, [sql(env.DB, "UPDATE migration_jobs SET status = 'complete' WHERE account_id = ? AND operation_id = ?", session.account_id, job.operation_id)]);
    return { id: job.operation_id, status: 'complete' };
  }
  if (method === 'DELETE' && path === '/v1/accounts/current') return deleteAccount(env, before, session, await body(request), now);
  if (method === 'POST' && path === '/v1/invites') return inviteRoute(env.DB, before, session, method, null, null, await body(request), now);
  const invite = /^\/v1\/invites\/([A-Za-z0-9_-]{1,128})(?:\/(accept|confirm))?$/.exec(path);
  if (invite) return inviteRoute(env.DB, before, session, method, id(invite[1]), invite[2] ?? null, await body(request), now);
  const object = /^\/v2\/groups\/([A-Za-z0-9_-]{1,128})\/objects\/(reserve|[A-Za-z0-9_-]{1,128})$/.exec(path);
  if (object) {
    if (method === 'POST' && object[2] === 'reserve') return reserve(env, before, session, id(object[1]), await body(request), now);
    return photo(env, before, session, method, id(object[1]), id(object[2]), request, now);
  }
  const match = /^\/v1\/groups\/([A-Za-z0-9_-]{1,128})(?:\/(grants|sync))?$/.exec(path);
  if (match) {
    const groupId = id(match[1]); const b = await body(request);
    if (method === 'PUT' && match[2] === 'grants') return grants(env.DB, before, session, groupId, b);
    if (method === 'POST' && match[2] === 'sync') return sync(env.DB, before, session, groupId, b, now);
    if (method === 'DELETE' && !match[2]) {
      const { row } = await group(env.DB, session, groupId); checkEpoch(row, b.epoch);
      if (row.kind !== 'family') fail(403, 'cannot_unlink_vault');
      if (Object.keys(b).some(key => key !== 'epoch')) fail(400, 'unknown_field');
      await commit(env.DB, before, revokeGroupStatements(env.DB, groupId, now, before)); return { ok: true, epoch: row.epoch + 1 };
    }
  }
  return fail(404, 'not_found');
}
export const worker = {
  async fetch(request: Request, env: Environment): Promise<Response> {
    try { const result = await route(request, env); return result instanceof Response ? result : json(result); }
    catch (error: unknown) { const status = error instanceof ProtocolError ? error.status : 503; const code = error instanceof ProtocolError ? error.code : 'persistence_or_internal_failure'; return json({ error: { code, message: code } }, status); }
  },
  async scheduled(_controller: ScheduledController, env: Environment): Promise<void> {
    if (await env.DB.prepare('SELECT id FROM maintenance WHERE id = 1').first()) return;
    await cleanup(env, Date.now()); await finalizeJobs(env, Date.now());
    // Expired bearer hashes and abandoned invites do not grow forever.
    const before = await revision(env.DB);
    await commit(env.DB, before, [sql(env.DB, 'DELETE FROM sessions WHERE expires_at <= ?', Date.now()), sql(env.DB, 'DELETE FROM auth_budgets WHERE window_start <= ?', Date.now() - 900000), sql(env.DB, 'DELETE FROM hash_lease WHERE expires_at <= ?', Date.now()), sql(env.DB, "DELETE FROM invites WHERE expires_at <= ? AND status != 'accepted'", Date.now())]);
  },
};
