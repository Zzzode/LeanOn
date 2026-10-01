- Start Date: 2026-10-01
- RFC Type: architecture
- Status: Accepted
- Related: 0005, 0006, 0008

# Dynamic Bundle Delivery

English · [简体中文](0007-dynamic-delivery.zh-CN.md)

## Summary

Design how Lynx bundles (pages and cards) are delivered and updated without an app release:

- A signed **manifest** listing versioned bundle artifacts
- Download with SHA-256 and signature verification, atomic local caching
- Offline-first loading (render the cached bundle immediately)
- Staged rollout via deterministic per-user buckets
- Compatibility gating by host version and capabilities
- Automatic rollback to the last-known-good bundle

The update **decisions** are pure TypeScript in a new `@zzzode/delivery` package; the hosts
perform network, file and cryptographic operations through injected ports.

## Motivation

- Lynx's value is dynamic UI, but Lynx does not fetch resources. A safe delivery channel is what
  actually enables shipping fixes and features without app-store review.
- The app must work offline and must never install a corrupt or tampered bundle.
- A bad release must self-heal: a bundle that fails to load should roll back without user action.
- For a two-person app the backend should be trivial: static hosting of a manifest plus bundles.

## Guide-level explanation

- On launch the host renders the cached bundle for a route right away.
- In the background it fetches the manifest, compares it with persisted local state, and asks the
  delivery engine what to do per bundle: download, roll back, or skip.
- Eligible bundles download to a temp file, are verified (checksum + signature), then atomically
  replace the current artifact.
- New versions roll out gradually by a stable hash of (user, bundle); users who already have a
  version keep it even if the percentage is later lowered.
- If a bundle is marked yanked or repeatedly fails to load, the host restores the last-known-good
  version from cache.

## Reference-level explanation

### Manifest and artifact model

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-01T00:00:00Z",
  "bundles": {
    "home": {
      "version": 7,                 // monotonic integer per bundle id
      "url": "https://cdn/bundles/home@7.lynx",
      "sha256": "<hex>",
      "signature": "<detached signature>",
      "minHostVersion": "0.1.0",
      "requiredCapabilities": ["health.readSamples", "app.getCapabilities"],
      "size": 184320,
      "rolloutPercentage": 25,      // absent = 100
      "yanked": false
    }
  }
}
```

### Update decision (pure)

`decideUpdate(id, manifest, localState, context)` returns one of:

- `download` — local is absent/older, and compatibility and rollout pass
- `rollback` — current version is broken or yanked and a last-good version is cached
- `skip` with a reason: `up_to_date`, `incompatible_host`, `missing_capability`,
  `not_in_rollout`, `yanked_no_alternative`, or `not_listed`

Rules:

- Compatibility: host semver must satisfy `minHostVersion`, and every required capability method
  must be present in `app.getCapabilities`.
- Rollout only gates **new downloads/upgrades**; users already on a version are not pulled back by
  a lowered percentage.
- A bundle missing from the manifest is left untouched locally (no remote deletion).
- The manifest never downgrades a healthy user.

### Staged rollout

`rolloutBucket(userId, bundleId)` is a deterministic 0–99 bucket from a stable string hash
(FNV-1a). A version with `rolloutPercentage: p` is offered when `bucket < p`. The same user maps
to the same bucket across launches; different users spread across buckets.

### Integrity and security

- Verify SHA-256 before use and verify a detached signature with a public key embedded in the app.
- Write to a temp file and atomically move into place only after both checks pass.
- Delivery is over HTTPS; the module-auth validator (RFC 0006) is an independent boundary.
- The engine exposes checksum comparison and result types; hashing and signature verification use
  platform crypto via ports.

### Caching and rollback

- Keep the current and last-known-good artifacts plus persisted per-id state
  (`version`, `lastGoodVersion`, `broken`).
- A load failure (or a crash signal) marks the version broken; the next decision rolls back to
  `lastGoodVersion`. Enforce a cache size budget and evict older artifacts.

### Ports and hosting

The engine is given ports backed by the host: fetch manifest/bundle (`resource.fetch`) and
read/write local state (`storage.*`). No network or filesystem code lives in the package. The
backend is static: a CDN or GitHub Pages serving the manifest and signed bundles; a manifest
example and signing notes live under `server/`.

## Drawbacks

- Signing adds a key-management step and per-release signing.
- Keeping two artifacts per bundle uses extra disk; rollback cannot help if the very first install
  is bad (no last-good exists).
- Percentage rollout is probabilistic across users; deterministic per-user, not per-device.

## Rationale and alternatives

- **Immediate full release to all users**: simpler but a bad bundle reaches everyone; rejected.
- **Put decisions in native code**: would be untestable and duplicated; pure TS with injected IO
  ports is deterministic and unit-tested.
- **A stateful backend computing per-user updates**: unnecessary for this scale; static hosting
  plus client-side bucketing is enough.
- **Trust-on-first-use without signatures**: reduces operations but allows tampering; rejected.

## Unresolved questions

- Signature scheme and key storage/rotation per platform (embedded public key format).
- Exact crash/failure signal that marks a bundle broken, and the failure threshold.
- Cache budget and eviction policy defaults.
- Whether cards and pages share one manifest or use separate channels.

## Implementation plan

- [x] Delivery design (this RFC)
- [x] `@zzzode/delivery` package: types, semver, rollout, compatibility, decisions, integrity
      helpers, Rstest suite
- [ ] Example manifest and static-hosting/signing notes under `server/`
- [ ] Host ports: real resource provider and persisted state (with RFC 0006/0008)
- [ ] Native checksum/signature verification and atomic cache

## References

- Lynx resource provider and bundle loader (RFC 0006); `resource.fetch` and `storage.*` (RFC 0005).
- Deterministic hashing (FNV-1a); semantic versioning for host compatibility.
