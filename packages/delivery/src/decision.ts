import { checkCompatibility, findArtifact } from './manifest';
import { isInRollout } from './rollout';
import type {
  BundleManifest,
  DeliveryContext,
  LocalBundleState,
  LocalState,
  UpdateAction,
} from './types';

/**
 * Decide what to do for a single bundle id given the manifest, persisted local
 * state and the device/user context. Pure: no network, filesystem or time.
 */
export function decideUpdate(
  id: string,
  manifest: BundleManifest,
  local: LocalBundleState | null,
  context: DeliveryContext,
): UpdateAction {
  const artifact = findArtifact(manifest, id);

  // Not listed in the manifest: leave any local copy untouched.
  if (artifact === null) {
    return { kind: 'skip', id, reason: 'not_listed' };
  }

  // A broken current version self-heals first.
  if (local !== null && local.broken) {
    const lastGood = local.lastGoodVersion;
    if (lastGood !== null && lastGood !== local.version) {
      return { kind: 'rollback', id, toVersion: lastGood };
    }
    // No usable last-good: re-fetch the current artifact to repair a corrupt
    // cache. The user is already on this version, so rollout is not re-gated.
    if (!artifact.yanked && artifact.version === local.version) {
      return { kind: 'download', id, artifact };
    }
  }

  // Compatibility gating by host version and capabilities.
  const compat = checkCompatibility(artifact, context);
  if (!compat.ok) {
    return { kind: 'skip', id, reason: compat.reason };
  }

  const localVersion = local?.version ?? null;

  // Yanked artifact: move off it if installed and a good version exists.
  if (artifact.yanked === true) {
    if (
      local !== null &&
      localVersion === artifact.version &&
      local.lastGoodVersion !== null &&
      local.lastGoodVersion !== artifact.version
    ) {
      return { kind: 'rollback', id, toVersion: local.lastGoodVersion };
    }
    return { kind: 'skip', id, reason: 'yanked_no_alternative' };
  }

  // Already on the listed version: keep it; rollout never pulls users back.
  if (localVersion === artifact.version) {
    return { kind: 'skip', id, reason: 'up_to_date' };
  }

  // Manifest is behind a healthy local version: never downgrade.
  if (localVersion !== null && artifact.version < localVersion) {
    return { kind: 'skip', id, reason: 'up_to_date' };
  }

  // New install or upgrade: gate by staged rollout.
  if (!isInRollout(context.userId, id, artifact.rolloutPercentage)) {
    return { kind: 'skip', id, reason: 'not_in_rollout' };
  }

  return { kind: 'download', id, artifact };
}

/** Decide updates for every bundle id appearing in the manifest or local state. */
export function decideAll(
  manifest: BundleManifest,
  local: LocalState,
  context: DeliveryContext,
): UpdateAction[] {
  const ids = new Set<string>([
    ...Object.keys(manifest.bundles),
    ...Object.keys(local),
  ]);
  return [...ids]
    .sort()
    .map((id) => decideUpdate(id, manifest, local[id] ?? null, context));
}
