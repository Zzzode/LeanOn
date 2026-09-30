# AGENTS.md

Guidance for humans and AI coding agents working in this repository. Follow these conventions
when writing code, documentation, commits or RFCs.

## Project overview

**LeanOn** is an open-source health companion for **two people** (you and your partner) to log
meals, exercise, weight and body measurements, with a focus on sustainable weight loss and
long-term health. The name combines getting **lean** with being able to **lean on** each other.

- Platforms: Android and iOS.
- Architecture: **Lynx × Native hybrid**. Lynx renders pages/cards that can be delivered
  dynamically; native (Swift/Kotlin) owns HealthKit / Health Connect, Bluetooth scales,
  background tasks, notifications, widgets and watch apps.
- A pure-TypeScript domain core holds the metabolism and nutrition logic.

## Repository layout

| Path | Description |
|---|---|
| `apps/ios` | iOS native host (Swift): shell, Lynx container, bridge implementations |
| `apps/android` | Android native host (Kotlin) |
| `packages/core` | Pure-TS domain engine (TDEE, trends, nutrition) |
| `packages/bridge` | Typed Lynx ↔ Native bridge |
| `packages/ui` | Design system and components (built on lynx-ui) |
| `packages/pages` | Lynx page bundles |
| `packages/cards` | Dynamically delivered card bundles |
| `native/` | Cross-cutting native capabilities (health adapter, BLE scale, offline kit) |
| `server/` | Manifest, sync and intelligence backends |
| `rfcs/` | Design documents |
| `docs/` | Additional documentation |

## Documentation standards

1. **English is the default language** for every document: READMEs, RFCs, guides, ADRs and
   in-repository docs.
2. **Chinese translations use the `.zh-CN` suffix inserted immediately before the file
   extension:**
   - `README.md` → `README.zh-CN.md`
   - `0003-domain-engine.md` → `0003-domain-engine.zh-CN.md`
   - `CONTRIBUTING.md` → `CONTRIBUTING.zh-CN.md`
3. This rule applies everywhere, including the `rfcs/` directory. An RFC is authored in English
   by default; its Chinese counterpart, if provided, uses the same number and name with the
   `.zh-CN` suffix.
4. Each document links its language variants near the top (English lists the Chinese link and
   vice versa). When a document is changed, update all of its language variants in the same
   pull request or explicitly note the translation follow-up.
5. File and directory names are lowercase and use `kebab-case`. RFC files are numbered
   `NNNN-kebab-name.md` with a monotonic, never-reused four-digit number.
6. Use GitHub-flavored Markdown, one sentence per line where practical, and keep documents
   short and decision-oriented.
7. **Code identifiers and code comments are written in English.**

## TypeScript standards

- This is a **strict TypeScript 7** project. All packages `extend` the root
  `tsconfig.base.json`.
- Required compiler options include `strict`, `noUncheckedIndexedAccess`, `isolatedModules`,
  `verbatimModuleSyntax`, `module: ESNext` and `moduleResolution: Bundler`.
- Prefer pure functions and explicit types; avoid `any` (use `unknown` and narrow it).
- Use named exports.
- Keep `packages/core` free of UI and native dependencies so it runs on a Lynx background
  thread and on the server.
- Route all native access through `packages/bridge`; pages and cards never call native modules
  directly.

## Build system

The **Rspack** ecosystem is the standard; pick the tool that matches the target:

| Target | Tool | Build command |
|---|---|---|
| TS libraries (`core`, `bridge`, `ui`) | [Rslib](https://rslib.rs) | `rslib build` (ESM + `.d.ts`) |
| Lynx pages & cards (`pages`, `cards`) | [Rspeedy](https://lynxjs.org/rspeedy) | `rspeedy build` |
| Web-style app (if ever needed) | [Rsbuild](https://rsbuild.rs) | `rsbuild build` |

- `pages` and `cards` currently build with `tsc` as placeholders; switch to Rspeedy when the
  first real Lynx screen is added.
- Rslib generates declaration files with `tsgo`; type-checking itself is a separate step.

## Monorepo conventions

- Package manager: **pnpm** (see `packageManager` in the root `package.json`); Node >= 22.13.
- Published packages use the `@zzzode/*` scope. Internal package references use
  `workspace:*`.
- Add a package by creating `packages/<name>/` with `package.json`, `tsconfig.json`, `src/`
  and, for libraries, `rslib.config.ts`.

Common commands:

```bash
pnpm install      # install all workspace dependencies
pnpm typecheck    # type-check all packages
pnpm build        # build all packages
pnpm test         # run package tests
```

## RFC process

Significant architectural decisions, new technology/dependencies and new core capabilities go
through an RFC before implementation. See [`rfcs/README.md`](rfcs/README.md) and copy
[`rfcs/0000-template.md`](rfcs/0000-template.md). RFCs are historical documents: do not rewrite
their conclusions after merge; use a new RFC to supersede them.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(core): ...`, `fix(bridge): ...`, `docs: ...`, `chore: ...`, `ci: ...`.
- Branch names: `feat/<short-desc>`, `fix/<short-desc>`, `docs/<short-desc>`,
  `rfc/<nnnn-short-name>`.
- Ensure `pnpm typecheck` and `pnpm build` pass; fill in the pull-request template.
- Testing uses **Rstest** for TypeScript packages; add tests for behavior changes.

## Health and safety guardrails

- LeanOn is not a medical device and does not diagnose or treat disease.
- Default weight-loss guidance stays within evidence-based ranges (roughly 0.5–1 kg per week)
  and never sets calories below basal metabolic rate.
- Include eating-disorder screening and a prompt to seek professional care when appropriate.
