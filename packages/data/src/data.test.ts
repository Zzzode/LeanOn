import { describe, expect, it } from '@rstest/core';
import {
  applyBatch,
  defaultShareSettings,
  isShared,
  mergeCollection,
  mergeEnvelope,
  Migrator,
  migrateEnvelope,
  selectOutgoing,
} from './index';
import type { ChangeBatch, PeerVector, RecordEnvelope, ShareSettings } from './index';

function envelope(
  id: string,
  overrides: Partial<RecordEnvelope<unknown>> = {},
): RecordEnvelope<unknown> {
  return {
    id,
    ownerId: 'owner-1',
    kind: 'weight_log',
    schemaVersion: 1,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    deviceId: 'device-a',
    deleted: false,
    data: { value: 1 },
    ...overrides,
  };
}

describe('schema migrations', () => {
  const migrator = new Migrator()
    .add({
      from: 1,
      to: 2,
      migrate: (d) => ({ ...(d as Record<string, unknown>), two: true }),
    })
    .add({
      from: 2,
      to: 3,
      migrate: (d) => ({ ...(d as Record<string, unknown>), three: true }),
    });

  it('applies a migration chain', () => {
    const result = migrator.migrate({ one: 1 }, 1, 3) as Record<string, unknown>;
    expect(result.two).toBe(true);
    expect(result.three).toBe(true);
    expect(migrator.latestVersion).toBe(3);
  });

  it('migrates an envelope and updates its version', () => {
    const result = migrateEnvelope<Record<string, unknown>>(
      envelope('e1', { data: { one: 1 } }),
      migrator,
      3,
    );
    expect(result.schemaVersion).toBe(3);
    expect(result.data.three).toBe(true);
  });

  it('rejects invalid or missing paths', () => {
    expect(() =>
      new Migrator().add({ from: 2, to: 1, migrate: (d) => d }),
    ).toThrow();
    expect(() => migrator.migrate({}, 1, 5)).toThrow();
  });
});

describe('record merge', () => {
  it('takes the later write', () => {
    const a = envelope('e1', { updatedAt: '2026-09-01T00:00:00Z' });
    const b = envelope('e1', {
      updatedAt: '2026-09-02T00:00:00Z',
      data: { value: 2 },
    });
    expect(mergeEnvelope(a, b)).toBe(b);
  });

  it('tie-breaks identical timestamps by device id', () => {
    const a = envelope('e1', { deviceId: 'device-a' });
    const b = envelope('e1', { deviceId: 'device-b' });
    expect(mergeEnvelope(a, b)).toBe(b);
  });

  it('lets a tombstone win even when older', () => {
    const live = envelope('e1', { updatedAt: '2026-09-05T00:00:00Z' });
    const tombstone = envelope('e1', {
      updatedAt: '2026-09-01T00:00:00Z',
      deleted: true,
    });
    expect(mergeEnvelope(live, tombstone)).toBe(tombstone);
  });

  it('refuses to merge different ids', () => {
    expect(() => mergeEnvelope(envelope('e1'), envelope('e2'))).toThrow();
  });
});

describe('collection merge', () => {
  it('unions by id and resolves duplicates', () => {
    const local = [
      envelope('e1'),
      envelope('e2', { data: { value: 1 } }),
    ];
    const remote = [
      envelope('e2', { updatedAt: '2026-09-03T00:00:00Z', data: { value: 2 } }),
      envelope('e3'),
    ];
    const merged = mergeCollection(local, remote);
    expect(merged).toHaveLength(3);
    const e2 = merged.find((r) => r.id === 'e2');
    expect(e2?.data).toEqual({ value: 2 });
  });
});

describe('sync planning', () => {
  const local = [envelope('e1'), envelope('e2')];

  it('sends everything to a peer with no state', () => {
    expect(selectOutgoing(local, {})).toHaveLength(2);
  });

  it('skips records the peer already has', () => {
    const peer: PeerVector = {
      e1: { updatedAt: '2026-09-01T00:00:00Z', deleted: false },
    };
    const outgoing = selectOutgoing(local, peer);
    expect(outgoing.map((r) => r.id)).toEqual(['e2']);
  });

  it('sends newer writes and tombstones', () => {
    const updated = envelope('e1', { updatedAt: '2026-09-09T00:00:00Z' });
    const deleted = envelope('e2', { deleted: true });
    const peer: PeerVector = {
      e1: { updatedAt: '2026-09-01T00:00:00Z', deleted: false },
      e2: { updatedAt: '2026-09-01T00:00:00Z', deleted: false },
    };
    const outgoing = selectOutgoing([updated, deleted], peer);
    expect(outgoing).toHaveLength(2);
  });

  it('applies an incoming batch', () => {
    const batch: ChangeBatch = {
      cursor: 'cursor-2',
      records: [envelope('e3'), envelope('e1', { deleted: true })],
    };
    const merged = applyBatch([envelope('e1'), envelope('e2')], batch);
    expect(merged).toHaveLength(3);
    const e1 = merged.find((r) => r.id === 'e1');
    expect(e1?.deleted).toBe(true);
  });
});

describe('privacy boundaries', () => {
  it('is private by default', () => {
    const settings = defaultShareSettings();
    expect(isShared(settings, 'goal')).toBe(false);
    expect(isShared(settings, 'meals')).toBe(false);
  });

  it('shares only enabled categories', () => {
    const settings: ShareSettings = { ...defaultShareSettings(), categories: ['goal'] };
    expect(isShared(settings, 'goal')).toBe(true);
    expect(isShared(settings, 'photos')).toBe(false);
  });
});
