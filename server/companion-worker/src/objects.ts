import { type Session } from './auth.js';
import { commit, revision, sql } from './database.js';
import { checkEpoch, group } from './groups.js';
import { fail, hash, id, integer, keys, LIMITS, references, type Environment } from './protocol.js';

export interface PhotoRow { id: string; group_id: string; epoch: number; owner_id: string; device_id: string; digest: string; size: number; status: string; expires_at: number }
export const objectKey = (objectId: string): string => `v2/${objectId}`;
export async function reserve(env: Environment, before: number, s: Session, groupId: string, b: Record<string, unknown>, now: number): Promise<unknown> {
  keys(b, ['epoch', 'objects']); const { row, dto } = await group(env.DB, s, groupId); checkEpoch(row, b.epoch);
  const refs = references(b.objects); if (refs.length > LIMITS.changes) fail(400, 'reservation_batch_capacity');
  if (row.kind === 'family' && !dto.members.filter(m => m !== s.account_id).every(m => (dto.grants[s.account_id]?.[m] ?? []).includes('photos'))) fail(403, 'sharing_not_authorized');
  const statements: D1PreparedStatement[] = [];
  for (const ref of refs) {
    const existing = await sql(env.DB, 'SELECT * FROM photo_objects WHERE id = ?', ref.id).first<PhotoRow>();
    if (existing) {
      if (existing.group_id !== groupId || existing.epoch !== row.epoch || existing.owner_id !== s.account_id || existing.device_id !== s.device_id || existing.digest !== ref.digest || existing.size !== ref.size || !['reserved','ready'].includes(existing.status)) fail(409, 'object_id_conflict');
    } else statements.push(sql(env.DB, "INSERT INTO photo_objects VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?)", ref.id, groupId, row.epoch, s.account_id, s.device_id, ref.digest, ref.size, now + 60 * 60 * 1000));
  }
  if (statements.length) await commit(env.DB, before, statements);
  return { ok: true, objects: refs };
}
export async function photo(env: Environment, before: number, s: Session, method: string, groupId: string, objectId: string, request: Request, now: number): Promise<Response | unknown> {
  id(objectId); const { row, dto } = await group(env.DB, s, groupId);
  const stored = await sql(env.DB, 'SELECT * FROM photo_objects WHERE id = ? AND group_id = ?', objectId, groupId).first<PhotoRow>();
  if (!stored || stored.epoch !== row.epoch || !['reserved','ready'].includes(stored.status)) fail(404, 'object_unavailable');
  if (method === 'GET') {
    if (stored.status !== 'ready') fail(404, 'object_unavailable');
    if (stored.owner_id !== s.account_id && !(dto.grants[stored.owner_id]?.[s.account_id] ?? []).includes('photos')) fail(403, 'sharing_not_authorized');
    const referenced = await sql(env.DB, 'SELECT object_id FROM object_refs WHERE object_id = ? LIMIT 1', objectId).first(); if (!referenced) fail(404, 'object_unreferenced');
    const result = await env.PHOTOS.get(objectKey(objectId));
    if (!result || result.size !== stored.size || result.customMetadata?.digest !== stored.digest) fail(503, 'object_storage_incomplete');
    return new Response(result.body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(stored.size), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }
  if (method !== 'PUT') fail(404, 'not_found');
  if (stored.owner_id !== s.account_id || stored.device_id !== s.device_id) fail(403, 'object_owner_required');
  if (row.kind === 'family' && !dto.members.filter(m => m !== s.account_id).every(m => (dto.grants[s.account_id]?.[m] ?? []).includes('photos'))) fail(403, 'sharing_not_authorized');
  if (request.headers.get('content-type') !== 'application/octet-stream' || Number(request.headers.get('content-length')) !== stored.size) fail(400, 'object_length_required');
  // Binary transport keeps base64 copies out of the 128 MiB Worker heap.
  if (!request.body) fail(400, 'object_body_required');
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > stored.size) fail(413, 'object_capacity'); parts.push(part.value); }
  } finally { await reader.cancel(); }
  const packet = Buffer.concat(parts); if (size !== stored.size || hash(packet) !== stored.digest) fail(400, 'object_digest_mismatch');
  const result = await env.PHOTOS.put(objectKey(objectId), packet, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { digest: stored.digest } });
  if (!result) {
    const present = await env.PHOTOS.head(objectKey(objectId));
    if (!present || present.size !== stored.size || present.customMetadata?.digest !== stored.digest) fail(410, 'object_fenced');
  }
  // A revocation racing the upload invalidates this CAS. The reservation remains
  // durable and the cleanup fence removes any uploaded bytes before deletion ACK.
  await commit(env.DB, before, [sql(env.DB, "UPDATE photo_objects SET status = 'ready', expires_at = ? WHERE id = ? AND status IN ('reserved','ready')", now + 60 * 60 * 1000, objectId)]);
  return { ok: true, id: objectId };
}
/** Retain zero-byte fences: a late conditional upload can never recreate bytes. */
export async function cleanup(env: Environment, now: number, maximum: number = LIMITS.cleanup): Promise<number> {
  const before = await revision(env.DB);
  const expired = await sql(env.DB, "SELECT id FROM photo_objects WHERE status IN ('reserved','ready') AND expires_at <= ? AND id NOT IN (SELECT object_id FROM object_refs) LIMIT ?", integer(now), maximum).all<{ id: string }>();
  if (expired.results.length) await commit(env.DB, before, expired.results.map(o => sql(env.DB, "UPDATE photo_objects SET status = 'fence-pending' WHERE id = ?", o.id)));
  const pending = await sql(env.DB, "SELECT id FROM photo_objects WHERE status = 'fence-pending' ORDER BY id LIMIT ?", maximum).all<{ id: string }>();
  let completed = 0;
  for (const item of pending.results) {
    const fence = await env.PHOTOS.put(objectKey(item.id), new Uint8Array(0), { customMetadata: { state: 'revoked' } });
    if (!fence || fence.size !== 0) throw new Error('Fence failed');
    const check = await env.PHOTOS.head(objectKey(item.id)); if (!check || check.size !== 0 || check.customMetadata?.state !== 'revoked') throw new Error('Fence verification failed');
    const current = await revision(env.DB);
    await commit(env.DB, current, [sql(env.DB, "UPDATE photo_objects SET status = 'fenced', digest = printf('%064d', 0), size = 0 WHERE id = ? AND status = 'fence-pending'", item.id)]);
    completed++;
  }
  return completed;
}
