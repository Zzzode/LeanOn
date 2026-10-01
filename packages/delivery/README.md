# @zzzode/delivery

English · [简体中文](README.zh-CN.md)

Pure, deterministic decision engine for delivering and updating Lynx bundles without an app
release. It contains no network, filesystem, time or crypto code; the host performs those through
ports and asks this package what to do.

## What it decides

Given a signed manifest, persisted local state and a device/user context, `decideUpdate` returns
one action per bundle id:

- `download` — absent/older, compatible and in rollout
- `rollback` — current version is broken or yanked and a last-known-good exists
- `skip` — with a stable reason (`up_to_date`, `incompatible_host`, `missing_capability`,
  `not_in_rollout`, `yanked_no_alternative`, `not_listed`)

## Usage

```ts
import { decideAll, type BundleManifest, type DeliveryContext, type LocalState } from '@zzzode/delivery';

const manifest: BundleManifest = await fetchManifest();          // host port (resource.fetch)
const local: LocalState = await readLocalState();                // host port (storage.*)
const context: DeliveryContext = {
  hostVersion: '0.1.0',
  userId: 'stable-user-id',
  hostCapabilities: ['app.getCapabilities', 'health.readSamples'],
  platform: 'ios',
};

for (const action of decideAll(manifest, local, context)) {
  if (action.kind === 'download') {
    // download to temp, verify checksum + signature, atomically move into cache
  } else if (action.kind === 'rollback') {
    // restore action.toVersion from cache
  }
}
```

## Building blocks

- `version` — semver comparison for `minHostVersion`
- `rollout` — deterministic FNV-1a per-user buckets and percentage gating
- `manifest` — artifact lookup and host compatibility checks
- `integrity` — checksum comparison and combined integrity results
- `decision` — `decideUpdate` / `decideAll`

## Related

- RFC 0007 dynamic bundle delivery; RFC 0005 bridge (`resource.fetch`, `storage.*`); RFC 0006
  native host and container.
