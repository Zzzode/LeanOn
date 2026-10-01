import type { RecordEnvelope } from './types';

/** A pure, total function from one schema version to the next. */
export type MigrateFn = (data: unknown) => unknown;

/** One schema migration step. */
export interface Migration {
  from: number;
  to: number;
  migrate: MigrateFn;
}

/** Raised when a migration path is missing or invalid. */
export class MigrationError extends Error {}

/** Applies an ordered chain of schema migrations. */
export class Migrator {
  private readonly steps = new Map<number, Migration>();

  add(migration: Migration): this {
    if (migration.to <= migration.from) {
      throw new MigrationError('a migration must move to a higher version');
    }
    this.steps.set(migration.from, migration);
    return this;
  }

  /** Highest version reachable through registered migrations. */
  get latestVersion(): number {
    const versions: number[] = [
      ...this.steps.keys(),
      ...[...this.steps.values()].map((m) => m.to),
    ];
    return versions.length === 0 ? 0 : Math.max(...versions);
  }

  /** Migrate data from one version to another, applying the chain. */
  migrate(data: unknown, from: number, to: number): unknown {
    if (to < from) {
      throw new MigrationError('cannot migrate to a lower version');
    }
    let current = data;
    let version = from;
    while (version < to) {
      const step = this.steps.get(version);
      if (step === undefined) {
        throw new MigrationError(`no migration registered from version ${version}`);
      }
      current = step.migrate(current);
      version = step.to;
    }
    return current;
  }
}

/** Migrate an envelope's payload and update its schema version. */
export function migrateEnvelope<TOut>(
  envelope: RecordEnvelope<unknown>,
  migrator: Migrator,
  toVersion: number,
): RecordEnvelope<TOut> {
  const data = migrator.migrate(envelope.data, envelope.schemaVersion, toVersion);
  return { ...envelope, schemaVersion: toVersion, data: data as TOut };
}
