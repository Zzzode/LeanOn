import { randomUUID } from 'node:crypto';
import { authorized, type Session } from './auth.js';
import { commit, sql } from './database.js';
import { binary, CATEGORIES, cipher, fail, hash, id, integer, keys, same, type Group } from './protocol.js';

export interface GroupRow { id: string; kind: 'vault' | 'family'; epoch: number; sequence: number; grants: string; status: string }
interface InviteRow {
  id: string; kind: 'device' | 'family'; creator_id: string; creator_device_id: string;
  recipient_id: string | null; recipient_device_id: string | null; recipient_proof_hash: string | null;
  status: string; expires_at: number; proof_hash: string; wrapped_key: string; group_id: string;
}
export async function group(db: D1Database, session: Session, groupId: string): Promise<{ row: GroupRow; dto: Group }> {
  authorized(session);
  const row = await sql(db, "SELECT g.* FROM groups g JOIN memberships m ON m.group_id = g.id WHERE g.id = ? AND m.account_id = ? AND g.status = 'active'", groupId, session.account_id).first<GroupRow>();
  if (!row) fail(410, 'group_revoked_or_unavailable');
  const members = await sql(db, 'SELECT account_id FROM memberships WHERE group_id = ? ORDER BY account_id', groupId).all<{ account_id: string }>();
  return { row, dto: { id: row.id, kind: row.kind, epoch: row.epoch, members: members.results.map(m => m.account_id), grants: JSON.parse(row.grants) as Group['grants'] } };
}
export function checkEpoch(row: GroupRow, value: unknown): void { if (integer(value, 1) !== row.epoch) fail(409, 'epoch_mismatch'); }
export async function family(db: D1Database, accountId: string): Promise<string | null> {
  return sql(db, "SELECT group_id FROM memberships WHERE account_id = ? AND kind = 'family'", accountId).first<string>('group_id');
}
function inviteDto(i: InviteRow): unknown {
  return { id: i.id, kind: i.kind, creatorId: i.creator_id, creatorDeviceId: i.creator_device_id,
    recipientId: i.recipient_id, recipientDeviceId: i.recipient_device_id, status: i.status, expiresAt: i.expires_at,
    wrappedKey: JSON.parse(i.wrapped_key) as unknown, groupId: i.group_id };
}
export async function me(db: D1Database, session: Session): Promise<unknown> {
  const familyId = session.authorized ? await family(db, session.account_id) : null;
  const invites = await sql(db, 'SELECT * FROM invites WHERE creator_id = ? OR recipient_id = ? ORDER BY expires_at DESC LIMIT 32', session.account_id, session.account_id).all<InviteRow>();
  return { protocol: 2, accountId: session.account_id, deviceId: session.device_id, deviceAuthorized: !!session.authorized,
    vaultId: session.vault_id, vault: session.authorized ? (await group(db, session, session.vault_id)).dto : null, migration: await sql(db, 'SELECT operation_id AS id, status FROM migration_jobs WHERE account_id = ?', session.account_id).first(), family: familyId ? (await group(db, session, familyId)).dto : null, invites: invites.results.map(inviteDto) };
}
export async function inviteRoute(db: D1Database, before: number, s: Session, method: string, inviteId: string | null, action: string | null, b: Record<string, unknown>, now: number): Promise<unknown> {
  if (!inviteId) {
    authorized(s); keys(b, ['id', 'kind', 'proofHash', 'wrappedKey', 'expiresInSeconds']);
    const iid = id(b.id); if (b.kind !== 'family' && b.kind !== 'device') fail(400, 'invalid_kind');
    const proofHash = typeof b.proofHash === 'string' && /^[a-f0-9]{64}$/.test(b.proofHash) ? b.proofHash : fail(400, 'invalid_proof_hash');
    const wrapped = cipher(b.wrappedKey); const seconds = b.expiresInSeconds === undefined ? 600 : integer(b.expiresInSeconds, 1, 600);
    if (b.kind === 'family' && await family(db, s.account_id)) fail(409, 'already_paired');
    const pending = await sql(db, "SELECT id FROM invites WHERE creator_id = ? AND kind = ? AND status IN ('open','pending') AND expires_at > ?", s.account_id, b.kind, now).first();
    if (pending) fail(409, 'invite_pending');
    const count = await db.prepare('SELECT count(*) AS n FROM invites').first<number>('n'); if ((count ?? 0) >= 64) fail(409, 'invite_capacity');
    const i: InviteRow = { id: iid, kind: b.kind, creator_id: s.account_id, creator_device_id: s.device_id, recipient_id: null, recipient_device_id: null, recipient_proof_hash: null, status: 'open', expires_at: now + seconds * 1000, proof_hash: proofHash, wrapped_key: JSON.stringify(wrapped), group_id: b.kind === 'device' ? s.vault_id : randomUUID() };
    await commit(db, before, [sql(db, 'INSERT INTO invites VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)', i.id, i.kind, i.creator_id, i.creator_device_id, i.status, i.expires_at, i.proof_hash, i.wrapped_key, i.group_id)]);
    return inviteDto(i);
  }
  const i = await sql(db, 'SELECT * FROM invites WHERE id = ?', inviteId).first<InviteRow>();
  if (!i) fail(404, 'invite_not_found');
  if (method === 'GET' && !action) {
    if (i.creator_id !== s.account_id && i.recipient_id !== s.account_id) fail(404, 'invite_not_found'); return inviteDto(i);
  }
  if (method === 'DELETE' && !action) {
    if (i.creator_id !== s.account_id && i.recipient_id !== s.account_id) fail(404, 'invite_not_found');
    if (i.status === 'accepted') fail(409, 'invite_used');
    await commit(db, before, [sql(db, "UPDATE invites SET status = 'cancelled' WHERE id = ?", i.id)]); return { ok: true };
  }
  if (method === 'POST' && action === 'accept') {
    keys(b, ['proof']); const proof = binary(b.proof, 32);
    if (i.expires_at <= now) fail(410, 'invite_expired'); if (i.status !== 'open') fail(409, 'invite_not_open');
    if (!same(hash(Buffer.from(proof, 'base64')), i.proof_hash)) fail(403, 'invite_proof_invalid');
    if (i.kind === 'family') {
      authorized(s); if (s.account_id === i.creator_id) fail(409, 'same_account');
      if (await family(db, s.account_id) || await family(db, i.creator_id)) fail(409, 'already_paired');
    } else {
      if (i.creator_id !== s.account_id || i.creator_device_id === s.device_id || s.authorized) fail(403, 'invalid_device_pairing');
    }
    await commit(db, before, [sql(db, "UPDATE invites SET status = 'pending', recipient_id = ?, recipient_device_id = ?, recipient_proof_hash = ? WHERE id = ?", s.account_id, s.device_id, s.proof_hash, i.id)]);
    i.status = 'pending'; i.recipient_id = s.account_id; i.recipient_device_id = s.device_id; return inviteDto(i);
  }
  if (method === 'POST' && action === 'confirm') {
    authorized(s); keys(b, []);
    if (i.creator_id !== s.account_id || i.creator_device_id !== s.device_id) fail(403, 'invite_access_denied');
    if (i.expires_at <= now) fail(410, 'invite_expired');
    if (i.status !== 'pending' || !i.recipient_id || !i.recipient_device_id || !i.recipient_proof_hash) fail(409, 'invite_not_pending');
    const active = await sql(db, "SELECT id FROM accounts WHERE id = ? AND status = 'active'", i.recipient_id).first(); if (!active) fail(410, 'recipient_unavailable');
    const statements: D1PreparedStatement[] = [];
    if (i.kind === 'device') {
      const devices = await sql(db, 'SELECT id FROM devices WHERE account_id = ?', s.account_id).all<{ id: string }>();
      if (devices.results.length >= 32 || devices.results.some(d => d.id === i.recipient_device_id)) fail(409, 'device_limit_or_collision');
      statements.push(sql(db, 'INSERT INTO devices VALUES (?, ?, ?)', s.account_id, i.recipient_device_id, i.recipient_proof_hash));
    } else {
      if (await family(db, s.account_id) || await family(db, i.recipient_id)) fail(409, 'already_paired');
      statements.push(sql(db, "INSERT INTO groups (id,kind,epoch,status) VALUES (?, 'family', 1, 'active')", i.group_id),
        sql(db, "INSERT INTO memberships VALUES (?, ?, 'family'), (?, ?, 'family')", i.group_id, s.account_id, i.group_id, i.recipient_id));
    }
    statements.push(sql(db, "UPDATE invites SET status = 'accepted' WHERE id = ?", i.id));
    await commit(db, before, statements); i.status = 'accepted';
    return { invite: inviteDto(i), group: (await group(db, s, i.group_id)).dto };
  }
  return fail(404, 'not_found');
}
export function revokeGroupStatements(db: D1Database, groupId: string, now: number, before: number): D1PreparedStatement[] {
  return [
    sql(db, "UPDATE groups SET status = 'revoked', epoch = epoch + 1, grants = '{}' WHERE id = ?", groupId),
    sql(db, 'INSERT INTO revocation_history SELECT id, epoch, ?, ? FROM groups WHERE id = ? ON CONFLICT(group_id) DO UPDATE SET epoch = excluded.epoch, revoked_at = excluded.revoked_at, revision = excluded.revision', now, before + 1, groupId),
    sql(db, 'DELETE FROM memberships WHERE group_id = ?', groupId),
    ...['records', 'seen', 'nonces', 'delivered', 'receipts', 'object_refs'].map(table => sql(db, `DELETE FROM ${table} WHERE group_id = ?`, groupId)),
    sql(db, "UPDATE photo_objects SET status = 'fence-pending' WHERE group_id = ? AND status != 'fenced'", groupId),
  ];
}
export async function grants(db: D1Database, before: number, s: Session, groupId: string, b: Record<string, unknown>): Promise<Group> {
  keys(b, ['epoch', 'recipientId', 'categories']); const { row, dto } = await group(db, s, groupId); checkEpoch(row, b.epoch);
  const recipient = id(b.recipientId);
  if (row.kind !== 'family' || recipient === s.account_id || !dto.members.includes(recipient)) fail(403, 'invalid_recipient');
  if (!Array.isArray(b.categories) || b.categories.length > CATEGORIES.length) fail(400, 'invalid_categories');
  const categories = [...new Set(b.categories.map(id))]; if (categories.some(c => !CATEGORIES.includes(c))) fail(400, 'invalid_category');
  const previous = dto.grants[s.account_id]?.[recipient] ?? []; const removed = previous.filter(c => !categories.includes(c));
  dto.grants[s.account_id] ??= {}; dto.grants[s.account_id]![recipient] = categories;
  const statements = [sql(db, 'UPDATE groups SET grants = ? WHERE id = ?', JSON.stringify(dto.grants), groupId)];
  if (removed.length) {
    const placeholders = removed.map(() => '?').join(',');
    const predicate = `group_id = ? AND ((owner_id = ? AND category IN (${placeholders})) OR (? = 1 AND kind = 'encouragement'))`;
    const parameters = [groupId, s.account_id, ...removed, removed.includes('encouragement') ? 1 : 0];
    statements.push(sql(db, `DELETE FROM object_refs WHERE group_id = ? AND (owner_id,record_id) IN (SELECT owner_id,record_id FROM records WHERE ${predicate})`, groupId, ...parameters),
      sql(db, `DELETE FROM records WHERE ${predicate}`, ...parameters),
      sql(db, 'DELETE FROM receipts WHERE group_id = ? AND change_id NOT IN (SELECT change_id FROM records WHERE group_id = ?)', groupId, groupId),
      sql(db, "UPDATE photo_objects SET status = 'fence-pending' WHERE group_id = ? AND owner_id = ? AND status IN ('reserved','ready') AND id NOT IN (SELECT object_id FROM object_refs WHERE group_id = ?)", groupId, s.account_id, groupId));
  }
  await commit(db, before, statements); return dto;
}
