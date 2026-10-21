import type { Session } from './auth.js';
import { commit, sql } from './database.js';
import { checkEpoch, group } from './groups.js';
import type { PhotoRow } from './objects.js';
import { change, fail, hash, id, integer, keys, LIMITS, type Change, type Group, type ObjectReference, type StoredChange } from './protocol.js';

interface RecordRow {
  group_id: string; owner_id: string; record_id: string; change_id: string; device_id: string; category: string;
  kind: 'record' | 'encouragement'; updated_at: number; deleted: number; sequence: number; payload: string; objects: string;
}
function stored(row: RecordRow): StoredChange {
  const result: StoredChange = { id: row.change_id, recordId: row.record_id, ownerId: row.owner_id, deviceId: row.device_id, category: row.category,
    kind: row.kind, updatedAt: row.updated_at, deleted: !!row.deleted, sequence: row.sequence, payload: JSON.parse(row.payload) as Change['payload'] };
  const objects = JSON.parse(row.objects) as ObjectReference[]; if (objects.length) result.objects = objects; return result;
}
function canReceive(g: Group, owner: string, recipient: string, category: string): boolean {
  return owner === recipient || (g.grants[owner]?.[recipient] ?? []).includes(category);
}
export async function sync(db: D1Database, before: number, s: Session, groupId: string, b: Record<string, unknown>, now: number): Promise<unknown> {
  keys(b, ['epoch', 'cursor', 'changes', 'acks']); const { row, dto } = await group(db, s, groupId); checkEpoch(row, b.epoch);
  const cursor = integer(b.cursor); if (cursor > row.sequence) fail(409, 'invalid_cursor');
  if (!Array.isArray(b.changes) || b.changes.length > LIMITS.changes || !Array.isArray(b.acks) || b.acks.length > LIMITS.acks) fail(400, 'invalid_batch');
  const incoming = b.changes.map(change); const acks = b.acks.map(id);
  if (new Set(incoming.map(c => c.id)).size !== incoming.length || new Set(acks).size !== acks.length) fail(400, 'duplicate_batch_id');
  const counts = await sql(db, 'SELECT (SELECT count(*) FROM seen WHERE group_id = ?) AS seen, (SELECT count(*) FROM records WHERE group_id = ?) AS records', groupId, groupId).first<{ seen: number; records: number }>();
  let seenCount = counts?.seen ?? 0, recordCount = counts?.records ?? 0, sequence = row.sequence;
  const statements: D1PreparedStatement[] = []; const candidates = new Map<string, RecordRow>();
  for (const c of incoming) {
    if (dto.kind === 'family') {
      const peers = dto.members.filter(m => m !== s.account_id);
      if (!peers.every(m => canReceive(dto, s.account_id, m, c.category))) fail(403, 'sharing_not_authorized');
      if (c.kind === 'encouragement' && !peers.every(m => canReceive(dto, m, s.account_id, 'encouragement'))) fail(403, 'recipient_encouragement_disabled');
      if (c.objects?.length && c.category !== 'photos') fail(400, 'invalid_object_category');
    }
    const digest = hash(JSON.stringify(c)); const seen = await sql(db, 'SELECT owner_id, digest FROM seen WHERE group_id = ? AND change_id = ?', groupId, c.id).first<{ owner_id: string; digest: string }>();
    if (seen) { if (seen.owner_id !== s.account_id || seen.digest !== digest) fail(409, 'idempotency_conflict'); continue; }
    if (++seenCount > 10000) fail(409, 'idempotency_capacity');
    const refs = c.objects ?? [];
    if (refs.length) {
      const photos = await sql(db, `SELECT * FROM photo_objects WHERE id IN (${refs.map(() => '?').join(',')})`, ...refs.map(o => o.id)).all<PhotoRow>();
      if (photos.results.length !== refs.length || refs.some(ref => !photos.results.some(p => p.id === ref.id && p.group_id === groupId && p.epoch === row.epoch && p.owner_id === s.account_id && p.device_id === s.device_id && p.digest === ref.digest && p.size === ref.size && p.status === 'ready'))) fail(409, 'object_reference_not_ready');
    }
    const recordKey = `${s.account_id}:${c.recordId}`;
    const old = candidates.get(recordKey) ?? await sql(db, 'SELECT * FROM records WHERE group_id = ? AND owner_id = ? AND record_id = ?', groupId, s.account_id, c.recordId).first<RecordRow>();
    const wins = !old || (!old.deleted && c.deleted) || (!!old.deleted === c.deleted && (c.updatedAt > old.updated_at || (c.updatedAt === old.updated_at && (s.device_id > old.device_id || (s.device_id === old.device_id && c.id > old.change_id)))));
    statements.push(sql(db, 'INSERT INTO seen VALUES (?, ?, ?, ?)', groupId, c.id, s.account_id, digest),
      sql(db, 'INSERT INTO nonces VALUES (?, ?, ?, ?)', groupId, row.epoch, c.payload.nonce, c.id));
    if (wins) {
      if (!old && ++recordCount > 1000) fail(409, 'record_capacity'); if (sequence >= Number.MAX_SAFE_INTEGER) fail(409, 'sequence_exhausted'); sequence++;
      const candidate: RecordRow = { group_id: groupId, owner_id: s.account_id, record_id: c.recordId, change_id: c.id, device_id: s.device_id, category: c.category, kind: c.kind, updated_at: c.updatedAt, deleted: c.deleted ? 1 : 0, sequence, payload: JSON.stringify(c.payload), objects: JSON.stringify(refs) };
      candidates.set(recordKey, candidate);
      statements.push(sql(db, `INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(group_id,owner_id,record_id) DO UPDATE SET change_id=excluded.change_id, device_id=excluded.device_id, category=excluded.category, kind=excluded.kind, updated_at=excluded.updated_at, deleted=excluded.deleted, sequence=excluded.sequence, payload=excluded.payload, objects=excluded.objects`, groupId, s.account_id, c.recordId, c.id, s.device_id, c.category, c.kind, c.updatedAt, c.deleted ? 1 : 0, sequence, candidate.payload, candidate.objects),
        sql(db, 'DELETE FROM object_refs WHERE group_id = ? AND owner_id = ? AND record_id = ?', groupId, s.account_id, c.recordId));
      if (refs.length) statements.push(sql(db, "INSERT INTO object_refs SELECT ?, ?, ?, json_extract(value, '$.id') FROM json_each(?)", groupId, s.account_id, c.recordId, JSON.stringify(refs)));
      // Superseded independently encrypted photos become durable cleanup work.
      if (old) {
        const removed = (JSON.parse(old.objects) as ObjectReference[]).filter(ref => !refs.some(r => r.id === ref.id));
        if (removed.length) statements.push(sql(db, `UPDATE photo_objects SET status = 'fence-pending' WHERE id IN (${removed.map(() => '?').join(',')}) AND id NOT IN (SELECT object_id FROM object_refs)`, ...removed.map(ref => ref.id)));
      }
    }
  }
  for (const ack of acks) {
    const existing = await sql(db, 'SELECT r.* FROM records r JOIN delivered d ON d.group_id = r.group_id AND d.change_id = r.change_id WHERE r.group_id = ? AND r.change_id = ? AND d.account_id = ? AND d.device_id = ?', groupId, ack, s.account_id, s.device_id).first<RecordRow>();
    if (!existing || dto.kind !== 'family' || existing.owner_id === s.account_id || existing.kind !== 'encouragement' || existing.deleted || !canReceive(dto, existing.owner_id, s.account_id, existing.category) || !canReceive(dto, s.account_id, existing.owner_id, 'encouragement')) fail(403, 'ack_not_authorized');
    statements.push(sql(db, 'INSERT OR IGNORE INTO receipts VALUES (?, ?, ?, ?)', groupId, ack, s.account_id, now));
  }
  if (incoming.length) statements.push(sql(db, 'UPDATE groups SET sequence = ? WHERE id = ?', sequence, groupId));
  // Combine only the bounded response slice with newly winning rows, rather than
  // loading or serializing the entire database as the filesystem relay did.
  const existing = await sql(db, 'SELECT * FROM records WHERE group_id = ? AND sequence > ? ORDER BY sequence LIMIT 11', groupId, cursor).all<RecordRow>();
  const boundary = existing.results.length >= 11 ? existing.results.at(-1)!.sequence : Number.MAX_SAFE_INTEGER;
  const ordered = [...existing.results.filter(r => !candidates.has(`${r.owner_id}:${r.record_id}`)), ...candidates.values()].filter(r => r.sequence > cursor && r.sequence <= boundary).sort((a, b2) => a.sequence - b2.sequence);
  const visible: StoredChange[] = []; let bytes = 4096, next = cursor; let complete = existing.results.length < 11;
  for (const r of ordered) {
    if (canReceive(dto, r.owner_id, s.account_id, r.category)) {
      const c = stored(r); const size = Buffer.byteLength(JSON.stringify(c));
      if (visible.length >= 10 || bytes + size > LIMITS.response) { complete = false; break; }
      visible.push(c); bytes += size;
      if (r.kind === 'encouragement' && r.owner_id !== s.account_id) statements.push(sql(db, 'INSERT OR IGNORE INTO delivered VALUES (?, ?, ?, ?)', groupId, r.change_id, s.account_id, s.device_id));
    }
    next = r.sequence;
  }
  if (complete) next = sequence;
  if (statements.length) await commit(db, before, statements);
  const receipts = await sql(db, 'SELECT change_id AS id, recipient_id AS recipientId, acknowledged_at AS acknowledgedAt FROM receipts WHERE group_id = ? AND (recipient_id = ? OR change_id IN (SELECT change_id FROM records WHERE group_id = ? AND owner_id = ?)) ORDER BY acknowledged_at LIMIT 100', groupId, s.account_id, groupId, s.account_id).all<{ id: string; recipientId: string; acknowledgedAt: number }>();
  return { epoch: row.epoch, cursor: next, group: dto, changes: visible, receipts: receipts.results };
}
