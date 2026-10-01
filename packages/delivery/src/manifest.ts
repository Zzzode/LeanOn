import type { BundleArtifact, BundleManifest, DeliveryContext } from './types';
import { meetsMinVersion } from './version';

/** Look up an artifact by bundle id, or null when the manifest does not list it. */
export function findArtifact(manifest: BundleManifest, id: string): BundleArtifact | null {
  return manifest.bundles[id] ?? null;
}

/** Result of checking an artifact against the host context. */
export type CompatibilityResult =
  | { ok: true }
  | { ok: false; reason: 'incompatible_host' | 'missing_capability' };

/**
 * Verify the host version satisfies `minHostVersion` and that every required
 * capability method is implemented by the host.
 */
export function checkCompatibility(
  artifact: BundleArtifact,
  context: DeliveryContext,
): CompatibilityResult {
  if (!meetsMinVersion(context.hostVersion, artifact.minHostVersion)) {
    return { ok: false, reason: 'incompatible_host' };
  }
  const available = new Set(context.hostCapabilities);
  const missing = artifact.requiredCapabilities.find((method) => !available.has(method));
  if (missing !== undefined) {
    return { ok: false, reason: 'missing_capability' };
  }
  return { ok: true };
}
