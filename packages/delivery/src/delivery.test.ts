import { describe, expect, it } from '@rstest/core';
import {
  checkCompatibility,
  decideAll,
  decideUpdate,
  evaluateIntegrity,
  fnv1aHash,
  isHexSha256,
  isInRollout,
  meetsMinVersion,
  rolloutBucket,
  verifyChecksum,
} from './index';
import type {
  BundleArtifact,
  BundleManifest,
  DeliveryContext,
  LocalBundleState,
  LocalState,
} from './index';

const VALID_SHA = 'a'.repeat(64);

function artifact(overrides: Partial<BundleArtifact> = {}): BundleArtifact {
  return {
    version: 1,
    url: 'https://cdn.example.com/a@1.lynx',
    sha256: VALID_SHA,
    signature: 'signature',
    minHostVersion: '0.1.0',
    requiredCapabilities: [],
    size: 100,
    ...overrides,
  };
}

function manifest(bundles: Record<string, BundleArtifact>): BundleManifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-01T00:00:00Z',
    bundles,
  };
}

const context: DeliveryContext = {
  hostVersion: '1.0.0',
  userId: 'user-1',
  hostCapabilities: ['app.getCapabilities', 'health.readSamples'],
  platform: 'ios',
};

function localState(overrides: Partial<LocalBundleState> = {}): LocalBundleState {
  return { version: 1, lastGoodVersion: null, broken: false, ...overrides };
}

describe('semver', () => {
  it('orders versions', () => {
    expect(meetsMinVersion('0.1.0', '0.1.0')).toBe(true);
    expect(meetsMinVersion('1.0.0', '0.9.9')).toBe(true);
    expect(meetsMinVersion('0.0.9', '0.1.0')).toBe(false);
    expect(meetsMinVersion('1.2.0', '1.10.0')).toBe(false);
  });

  it('ignores pre-release and build suffixes for the minimum check', () => {
    expect(meetsMinVersion('0.1.0-rc.1', '0.1.0')).toBe(true);
    expect(meetsMinVersion('0.1.0+build.5', '0.1.0')).toBe(true);
  });
});

describe('rollout bucketing', () => {
  it('is deterministic and within range', () => {
    const first = rolloutBucket('user-1', 'home');
    const second = rolloutBucket('user-1', 'home');
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
    expect(fnv1aHash('x')).toBe(fnv1aHash('x'));
  });

  it('treats 100% as all users and 0% as none', () => {
    expect(isInRollout('user-1', 'home', 100)).toBe(true);
    expect(isInRollout('user-1', 'home', undefined)).toBe(true);
    expect(isInRollout('user-1', 'home', 0)).toBe(false);
  });

  it('spreads different users across buckets', () => {
    const buckets = new Set(
      Array.from({ length: 20 }, (_, i) => rolloutBucket(`user-${i}`, 'home')),
    );
    expect(buckets.size).toBeGreaterThan(1);
  });
});

describe('compatibility', () => {
  it('rejects an older host', () => {
    const result = checkCompatibility(artifact({ minHostVersion: '2.0.0' }), context);
    expect(result).toEqual({ ok: false, reason: 'incompatible_host' });
  });

  it('rejects when a required capability is missing', () => {
    const result = checkCompatibility(
      artifact({ requiredCapabilities: ['scale.connect'] }),
      context,
    );
    expect(result).toEqual({ ok: false, reason: 'missing_capability' });
  });

  it('accepts a compatible artifact', () => {
    const result = checkCompatibility(
      artifact({ requiredCapabilities: ['health.readSamples'] }),
      context,
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('update decisions', () => {
  it('downloads a first install at full rollout', () => {
    const decision = decideUpdate('home', manifest({ home: artifact() }), null, context);
    expect(decision.kind).toBe('download');
  });

  it('holds a first install at zero rollout', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ rolloutPercentage: 0 }) }),
      null,
      context,
    );
    expect(decision).toEqual({ kind: 'skip', id: 'home', reason: 'not_in_rollout' });
  });

  it('reports up to date on the same version', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ version: 5 }) }),
      localState({ version: 5 }),
      context,
    );
    expect(decision).toEqual({ kind: 'skip', id: 'home', reason: 'up_to_date' });
  });

  it('upgrades at full rollout and holds at zero rollout', () => {
    const next = artifact({ version: 6 });
    expect(
      decideUpdate('home', manifest({ home: next }), localState({ version: 5 }), context).kind,
    ).toBe('download');
    expect(
      decideUpdate(
        'home',
        manifest({ home: artifact({ version: 6, rolloutPercentage: 0 }) }),
        localState({ version: 5 }),
        context,
      ),
    ).toEqual({ kind: 'skip', id: 'home', reason: 'not_in_rollout' });
  });

  it('does not pull back a user when rollout is later lowered', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ version: 6, rolloutPercentage: 0 }) }),
      localState({ version: 6 }),
      context,
    );
    expect(decision).toEqual({ kind: 'skip', id: 'home', reason: 'up_to_date' });
  });

  it('never downgrades a healthy user when the manifest is behind', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ version: 4 }) }),
      localState({ version: 5 }),
      context,
    );
    expect(decision).toEqual({ kind: 'skip', id: 'home', reason: 'up_to_date' });
  });

  it('rolls back a broken version to the last-known-good', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ version: 6 }) }),
      localState({ version: 6, lastGoodVersion: 5, broken: true }),
      context,
    );
    expect(decision).toEqual({ kind: 'rollback', id: 'home', toVersion: 5 });
  });

  it('re-fetches a broken current version when there is no last-good', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ version: 6 }) }),
      localState({ version: 6, lastGoodVersion: null, broken: true }),
      context,
    );
    expect(decision.kind).toBe('download');
  });

  it('rolls back a yanked version with a good alternative', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ version: 6, yanked: true }) }),
      localState({ version: 6, lastGoodVersion: 5 }),
      context,
    );
    expect(decision).toEqual({ kind: 'rollback', id: 'home', toVersion: 5 });
  });

  it('skips a yanked version without an alternative', () => {
    const decision = decideUpdate(
      'home',
      manifest({ home: artifact({ version: 6, yanked: true }) }),
      localState({ version: 6 }),
      context,
    );
    expect(decision).toEqual({
      kind: 'skip',
      id: 'home',
      reason: 'yanked_no_alternative',
    });
  });

  it('leaves a local bundle untouched when it is not listed', () => {
    const decision = decideUpdate(
      'legacy',
      manifest({ home: artifact() }),
      localState({ version: 1 }),
      context,
    );
    expect(decision).toEqual({ kind: 'skip', id: 'legacy', reason: 'not_listed' });
  });
});

describe('integrity', () => {
  it('recognizes hex SHA-256 digests', () => {
    expect(isHexSha256(VALID_SHA)).toBe(true);
    expect(isHexSha256('nope')).toBe(false);
    expect(isHexSha256('A'.repeat(64))).toBe(false);
  });

  it('compares checksums ignoring case and surrounding space', () => {
    expect(verifyChecksum(VALID_SHA, `  ${VALID_SHA.toUpperCase()}  `)).toBe(true);
    expect(verifyChecksum(VALID_SHA, 'b'.repeat(64))).toBe(false);
  });

  it('combines checksum and signature outcomes', () => {
    expect(evaluateIntegrity(true, true)).toEqual({ ok: true });
    expect(evaluateIntegrity(false, true)).toEqual({
      ok: false,
      reason: 'checksum_mismatch',
    });
    expect(evaluateIntegrity(true, false)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
});

describe('decideAll', () => {
  it('covers ids from both the manifest and local state', () => {
    const local: LocalState = {
      legacy: localState({ version: 1 }),
    };
    const decisions = decideAll(manifest({ home: artifact() }), local, context);
    const ids = decisions.map((d) => d.id);
    expect(ids).toContain('home');
    expect(ids).toContain('legacy');
    expect(decisions).toHaveLength(2);
  });
});
