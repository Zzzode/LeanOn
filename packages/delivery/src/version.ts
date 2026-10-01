/**
 * Minimal semantic-version comparison for host compatibility gating. Only the
 * numeric major.minor.patch core is compared; pre-release/build suffixes are
 * ignored for the minimum-version check.
 */
export type SemverTuple = readonly [number, number, number];

export function parseSemver(version: string): SemverTuple {
  const core = version.trim().split(/[-+]/)[0] ?? '';
  const parts = core.split('.');
  const part = (index: number): number => {
    const raw = parts[index];
    if (raw === undefined) {
      return 0;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : 0;
  };
  return [part(0), part(1), part(2)];
}

/** Returns -1, 0 or 1 as `a` is less than, equal to or greater than `b`. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa[0] !== pb[0]) {
    return pa[0] < pb[0] ? -1 : 1;
  }
  if (pa[1] !== pb[1]) {
    return pa[1] < pb[1] ? -1 : 1;
  }
  if (pa[2] !== pb[2]) {
    return pa[2] < pb[2] ? -1 : 1;
  }
  return 0;
}

/** True when `version` satisfies a minimum version of `min`. */
export function meetsMinVersion(version: string, min: string): boolean {
  return compareSemver(version, min) >= 0;
}
