- Start Date: 2026-09-30
- RFC Type: architecture
- Status: Accepted

> Note: the package naming convention in this RFC (`@health/*`) was later changed to
> `@zzzode/*` by [RFC 0002](0002-project-naming-and-open-source-governance.md). The TypeScript
> version and build-tool decisions were later refined by RFC 0003.

# Monorepo Structure and Engineering Baseline

## Summary

Adopt a **pnpm workspace monorepo** as the single repository for the couples' health app,
hosting Lynx business packages, the cross-platform domain core, native hosts and backend code;
establish the TypeScript baseline, package naming and the RFC design process.

## Motivation

- The product uses a **Lynx × Native hybrid architecture**: Lynx owns dynamically delivered
  pages and cards; Native owns health-data collection (HealthKit / Health Connect), Bluetooth
  smart scales, background tasks, notifications and widgets/watch apps. The two kinds of code
  need clear physical boundaries while staying interface-synchronized within one repository.
- With only two users/developers, a monorepo lets cross-platform interface changes land in a
  single commit, avoiding multi-repository version mismatch.
- Design decisions need a written record to avoid re-litigating "why did we do it this way",
  hence the RFC process (see `rfcs/README.md`).

## Guide-level explanation

Daily development entry points:

```bash
pnpm install        # install all workspace dependencies
pnpm typecheck      # type-check all packages
pnpm build          # build all packages
pnpm test           # run all package tests
```

Adding a TS package: create `package.json`, `tsconfig.json` and `src/` under
`packages/<name>/` following an existing package; pnpm picks it up automatically.

Adding a design decision: copy `rfcs/0000-template.md` and follow the process in
`rfcs/README.md`.

## Reference-level explanation

### Directory structure

```
.
├── apps/
│   ├── ios/                 # iOS native host (Swift): shell, Lynx container, bridge impl
│   └── android/             # Android native host (Kotlin)
├── packages/                # pnpm workspace members (TS)
│   ├── core/                # domain engine (TDEE / trends / nutrition score)
│   ├── bridge/              # NativeModules wrappers and TS types
│   ├── ui/                  # design system & business components (on lynx-ui)
│   ├── pages/               # Lynx page bundle collection
│   └── cards/               # dynamically delivered card bundles
├── native/                  # grouped cross-platform native capabilities (not workspace members)
│   ├── health-adapter/      # unified HealthKit / Health Connect adapter
│   ├── ble-scale/           # smart-scale BLE protocol
│   └── offline-kit/         # LynxResourceProvider: download/verify/cache/fallback
├── server/                  # manifest/offline-package service and sync backend
├── rfcs/                    # design documents (see rfcs/README.md)
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .npmrc
├── .editorconfig
└── .gitignore
```

### Workspace conventions

- `pnpm-workspace.yaml` currently includes only `packages/*`; `server/` joins after the
  backend RFC is finalized.
- Packages use a single scope and stay at version `0.0.0` with `private: true` until published
  independently.
- Inter-package references use the `workspace:*` protocol.

### TypeScript baseline

- Every package `extends` the root `tsconfig.base.json`, sharing `strict`,
  `noUncheckedIndexedAccess`, `isolatedModules` and `verbatimModuleSyntax`.
- Targeted at Lynx/Rspeedy bundling: `module` is `ESNext`, `moduleResolution` is `Bundler`.
- Each package provides a `typecheck` (`tsc --noEmit`) and a `build` script.

### Architecture boundaries (refined by later RFCs)

- Native capabilities (health data, BLE, background, notifications, widgets, watch) do not go
  into `packages/`; they live in `apps/*` and `native/*`.
- The domain engine stays a pure-TS package with zero UI and zero native dependencies, so it
  can run on a Lynx background thread, be reused on the server and be rolled out with bundles.
- All Lynx ↔ Native interaction is funneled through the bridge package; pages must not scatter
  direct calls.

## Drawbacks

- Native iOS/Android projects coexist with the pnpm project in one repository, requiring clear
  ignore rules and CI orchestration; early directory semantics rely on READMEs.
- Monorepo tooling (Rspeedy, CI, cache) is centralized, so a configuration mistake affects all
  packages.
- A pure-TS domain engine cannot handle "compute in the background after the app is killed";
  such tasks still fall to native.

## Rationale and alternatives

- **Polyrepo**: splitting native and JS causes bridge interfaces and data models to mismatch
  across repositories when changed; too costly for a two-person team. Rejected.
- **Single repository without workspace**: lacks dependency linkage and unified scripts,
  reducing package management to manual upkeep. Rejected.
- **KMP for the domain engine**: Kotlin Multiplatform is stronger for offline background
  computation but introduces the Kotlin/Native toolchain and cannot hot-update via Lynx
  bundles; at the current scale a pure-TS core yields more iteration value. KMP remains a
  fallback if performance becomes a bottleneck.

## Unresolved questions

- Package build and publish shape: direct `tsc` output vs a bundler (decide when Lynx
  dual-thread output is needed).
- Lynx / Rspeedy version and integration, and the concrete LynxView container wrapping.
- Bridge interface description and code generation, and the capability-version negotiation
  format.
- Offline-package signing-key management, the manifest service and CDN shape.
- CI platform, test framework (Node test runner selection) and lint toolchain.
- Cloud-sync backend and data-encryption approach.

## Implementation plan

- [x] Root config: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`,
  `.editorconfig`, `.gitignore`
- [x] Five installable, type-checkable TS package skeletons under `packages/`
- [x] Placeholder docs for `apps/*`, `native/*`, `server/`
- [x] RFC process, template and this baseline RFC
- [ ] Follow-up RFCs (numbers are a suggested order only):
  - domain engine: adaptive TDEE, trend smoothing, plateau detection
  - bridge protocol and NativeModules list
  - native host and Lynx container integration
  - dynamic-delivery channel (offline-kit / manifest / signing)
  - data model, encrypted local storage and cloud sync
