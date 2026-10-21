# Production deployment decision draft

English · [简体中文](deployment-decision.zh-CN.md)

Status: reviewable proposal only; no provider account, paid resource, production endpoint, deployment, commit or push has been created.
The current relay remains a loopback development service.

## Recommended first scope

Use an invite-only private beta on one Fly.io Machine, one persistent volume and a TLS reverse proxy in the same Machine.
The proxy listens on port8080 and forwards to the existing Node relay on127.0.0.1:8787.
Keep the relay's default loopback restriction; do not expose the development listener directly.
Run one writer process, with automatic restart, readiness checks and no scale-out or multiple mounts of the state file.
Disable automatic stop while testing receipt recovery and monitor disk, memory, receipt capacity and failed durability barriers.
Start with shared-cpu-1x/1GB and a1GB volume; increase memory only after measured payload/load acceptance.
The four-photo page limit controls client mounting, not the relay's request-buffering peak.

This is a private-beta recommendation, not a high-availability or public-registration approval.
Fly volumes are local to one physical server and are not automatically replicated; a single instance can have downtime or data loss on disk/host failure.
Daily snapshots are not a substitute for independent backups.
Sources: [volume limitations](https://docs.fly.io/volumes/overview), [service and TLS configuration](https://docs.fly.io/reference/configuration).

## Minimum decisions from the owner

1. Approve provider and billing organization: recommend Fly.io with an estimated $15/month budget; this is not a hard platform spending cap and excludes variable traffic/backup/region costs.
2. Name the initial population and required data-residency region; default to a private invitation beta and provider hostname, after a separately verified registration admission gate.
3. Specify independent encrypted backup destination/retention/deletion-restoration policy, plus explicit resource-provisioning and deployment scope; commit/push require separate authorization.

Pricing depends on region and usage.
As one current example, shared-cpu-1x/1GB is US$6.70/month in Ashburn and US$8.50/month in Singapore; a1GB volume adds US$0.15/month before transfer and backup charges.
The ceiling above is an estimate, not a quote or subscription commitment.
Source: [official pricing](https://docs.fly.io/about/pricing).

## Concrete deployment prerequisites

Build the standalone relay artifact with the repository's pnpm/Node22 toolchain.
Package the relay and a supervised reverse proxy, using a persistent mount for LEANON_RELAY_FILE.
Configure force_https, the region, minimum one running Machine and no concurrent file-backed writers.
Provider release commands do not mount the app volume; state migrations and restore rehearsals must run against the actual attached volume under the single-writer lease.
Do not restore a live state file while the writer is running.

The current POST /v1/accounts route permits registration by any caller that can reach the relay.
Family/device invitations are not a registration admission gate.
The recommended invite-only beta requires separately implemented and tested network admission or a server registration gate; TLS/loopback forwarding alone does not provide it.
Do not expose public registration while describing this proposal as invite-only.

Before production approval: exercise process restart and uncertain fsync/rename on the deployed volume, TLS/redirect/body limits at the proxy boundary, maximum payload memory, disk-full behavior, backup/restore with deletion tombstones, secret injection/rotation, log redaction, abuse throttling and operational alerts.
Define account recovery separately: passwords do not recover client-only vault keys; existing-device approval remains the current implemented trust model.
A multi-host deployment requires a transactional shared store and a new storage/deployment decision; the current PID lease is not a distributed lock.

## Actual local tooling boundary

The Docker CLI is installed, but the sandbox cannot access the user's Colima daemon socket through a normal read-only call.
The Fly CLI is not installed in this workspace.
Neither fact authorizes starting/changing a global daemon, installing a provider tool, signing into an account or allocating paid resources.
Deployment artifacts and provider validation will be prepared against the chosen destination after the decisions above; deployment remains pending.

Official pricing, volume and configuration pages rechecked 2026-10-07; local acceptance does not provision this proposal.
