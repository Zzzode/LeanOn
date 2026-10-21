import { fail } from './protocol.js';

export function sql(db: D1Database, query: string, ...values: (string | number | null)[]): D1PreparedStatement { return db.prepare(query).bind(...values); }
export async function revision(db: D1Database): Promise<number> {
  const value = await db.prepare('SELECT revision FROM meta WHERE id = 1').first<number>('revision');
  if (value === null) throw new Error('Missing schema'); return value;
}
/** Every authorization read follows this revision read, never precedes it. */
export async function commit(db: D1Database, before: number, statements: D1PreparedStatement[]): Promise<void> {
  try {
    await db.batch([
      sql(db, 'UPDATE meta SET revision = revision + 1 WHERE id = 1 AND revision = ?', before),
      db.prepare('INSERT INTO mutation_guard VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value'),
      ...statements,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/CHECK constraint failed: value = 1/.test(message)) fail(409, 'concurrent_write_retry_same_ids');
    if (/UNIQUE constraint failed/.test(message)) fail(409, 'identity_or_nonce_conflict');
    throw error;
  }
}
export function assertSql(db: D1Database, predicate: string, ...values: (string | number | null)[]): D1PreparedStatement {
  return sql(db, `UPDATE mutation_guard SET value = CASE WHEN (${predicate}) THEN 1 ELSE 0 END WHERE id = 1`, ...values);
}
