import { authorized, type Account, type Session } from './auth.js';
import { commit, revision, sql } from './database.js';
import { revokeGroupStatements } from './groups.js';
import { cleanup } from './objects.js';
import { binary, fail, hash, id, keys, passwordKey, same, string, type Environment } from './protocol.js';

interface Job { operation_id: string; account_id: string; proof_hash: string; status: string; created_at: number; deleted_at: number | null }
export const deletionProofHash = (operation: string, account: string, proof: string): string => hash(JSON.stringify(['leanon-account-deletion-v1', operation, account, proof]));
function receipt(job: Job): unknown { return { version: 1, operationId: job.operation_id, accountId: job.account_id, status: 'deleted', deletedAt: job.deleted_at }; }
export async function deleteAccount(env: Environment, before: number, s: Session, b: Record<string, unknown>, now: number): Promise<unknown> {
  authorized(s); keys(b, ['password', 'operationId', 'proof']); const operation = id(b.operationId); const proof = binary(b.proof, 32);
  const account = await sql(env.DB, "SELECT * FROM accounts WHERE id = ? AND status = 'active'", s.account_id).first<Account>(); if (!account) fail(401, 'unauthorized');
  const actual = await passwordKey(string(b.password, 12, 256), account.salt, account.password_p); if (!same(actual, account.password_hash)) fail(401, 'invalid_credentials');
  const conflict = await sql(env.DB, 'SELECT operation_id FROM deletion_jobs WHERE operation_id = ?', operation).first(); if (conflict) fail(409, 'deletion_operation_conflict');
  const count = await env.DB.prepare('SELECT count(*) AS n FROM deletion_jobs').first<number>('n'); if ((count ?? 0) >= 10000) fail(429, 'deletion_receipt_capacity');
  const groups = await sql(env.DB, 'SELECT group_id FROM memberships WHERE account_id = ?', account.id).all<{ group_id: string }>();
  const statements = [
    sql(env.DB, "INSERT INTO deletion_jobs VALUES (?, ?, ?, 'deleting', ?, NULL)", operation, account.id, deletionProofHash(operation, account.id, proof), now),
    sql(env.DB, "UPDATE accounts SET status = 'deleting', salt = '', password_hash = '' WHERE id = ?", account.id),
    sql(env.DB, "UPDATE admission_slots SET status = 'retired' WHERE account_id = ?", account.id),
    sql(env.DB, 'DELETE FROM sessions WHERE account_id = ?', account.id),
    sql(env.DB, 'DELETE FROM devices WHERE account_id = ?', account.id),
    sql(env.DB, 'DELETE FROM invites WHERE creator_id = ? OR recipient_id = ?', account.id, account.id),
  ];
  for (const g of groups.results) {
    statements.push(sql(env.DB, 'INSERT INTO deletion_objects SELECT ?, id FROM photo_objects WHERE group_id = ?', operation, g.group_id), ...revokeGroupStatements(env.DB, g.group_id, now, before));
  }
  await commit(env.DB, before, statements);
  return recover(env, operation, 'receipt', { proof }, now);
}
export async function finalizeJobs(env: Environment, now: number): Promise<void> {
  const jobs = await env.DB.prepare("SELECT * FROM deletion_jobs WHERE status = 'deleting' LIMIT 4").all<Job>();
  for (const job of jobs.results) {
    const remaining = await sql(env.DB, "SELECT p.id FROM photo_objects p JOIN deletion_objects d ON d.object_id = p.id WHERE d.operation_id = ? AND p.status != 'fenced' LIMIT 1", job.operation_id).first();
    if (remaining) continue;
    const before = await revision(env.DB);
    await commit(env.DB, before, [
      sql(env.DB, "UPDATE deletion_jobs SET status = 'deleted', deleted_at = ? WHERE operation_id = ? AND status = 'deleting'", now, job.operation_id),
      sql(env.DB, 'INSERT OR IGNORE INTO deletion_history VALUES (?, ?, ?)', job.account_id, now, before + 1),
      sql(env.DB, 'DELETE FROM migration_jobs WHERE account_id = ?', job.account_id),
      sql(env.DB, "DELETE FROM accounts WHERE id = ? AND status = 'deleting'", job.account_id),
    ]);
  }
}
export async function recover(env: Environment, operation: string, action: string, b: Record<string, unknown>, now: number): Promise<unknown> {
  keys(b, ['proof']); const proof = binary(b.proof, 32);
  let job = await sql(env.DB, 'SELECT * FROM deletion_jobs WHERE operation_id = ?', operation).first<Job>();
  if (!job || !same(job.proof_hash, deletionProofHash(operation, job.account_id, proof))) fail(404, 'deletion_not_found');
  if (job.status !== 'deleted') {
    try { await cleanup(env, now); await finalizeJobs(env, now); }
    catch { return fail(503, 'deletion_pending_retry_receipt'); }
    job = await sql(env.DB, 'SELECT * FROM deletion_jobs WHERE operation_id = ?', operation).first<Job>();
  }
  if (!job || job.status !== 'deleted') fail(503, 'deletion_pending_retry_receipt');
  if (action === 'ack') {
    const before = await revision(env.DB);
    await commit(env.DB, before, [sql(env.DB, 'DELETE FROM deletion_objects WHERE operation_id = ?', operation), sql(env.DB, 'DELETE FROM deletion_jobs WHERE operation_id = ?', operation)]);
    return { version: 1, operationId: operation, status: 'acknowledged' };
  }
  return receipt(job);
}
