- Start Date: 2026-10-01
- RFC Type: process
- Status: Accepted
- Supersedes: 0001 (the TypeScript/build-tool baseline portions)
- Related: 0002

# Documentation Standards, TypeScript 7 and Rspack-Based Builds

English · [简体中文](0003-docs-typescript7-build-system.zh-CN.md)

## Summary

Establish three engineering standards:

1. **English is the default documentation language**; Chinese translations use the `.zh-CN`
   suffix before the file extension, across READMEs, RFCs and all other docs.
2. The codebase is a **strict TypeScript 7** project.
3. The **Rspack ecosystem** is the build standard: **Rslib** for TypeScript libraries,
   **Rspeedy** for Lynx pages/cards, and Rsbuild for any web-style app.

A root **`AGENTS.md`** becomes the canonical guide for both developers and coding agents.

## Motivation

- The repository is open source and aims for an international audience; an explicit language
  policy prevents a mix of Chinese-only and English-only documents and makes translations
  discoverable through a consistent suffix.
- TypeScript 7 is the current major version and ships the fast `tsgo` declaration pipeline used
  by Rslib; standardizing early avoids mixed compiler versions.
- The team already committed to Lynx. Lynx's own toolchain (Rspeedy) and the library tool
  (Rslib) are both built on Rspack, so standardizing on that ecosystem gives one fast,
  compatible bundling model rather than ad-hoc `tsc`/`tsup` choices per package.

## Guide-level explanation

- Write every new document in English and name it normally. Add a Chinese version as
  `<name>.zh-CN.md`; link the two near the top.
- Code, identifiers and comments are written in English.
- A library is built with `rslib build`, producing `dist/index.js` plus `dist/index.d.ts`.
- A Lynx screen is built with Rspeedy once real Lynx pages exist.
- `AGENTS.md` is the first file a contributor or agent reads; it summarizes these rules.

## Reference-level explanation

### Documentation language policy

- Default (English) file keeps the conventional name: `README.md`,
  `0004-domain-engine.md`, `CONTRIBUTING.md`.
- Chinese translation inserts `.zh-CN` before the extension: `README.zh-CN.md`,
  `0004-domain-engine.zh-CN.md`, `CONTRIBUTING.zh-CN.md`.
- The rule applies in every directory, including `rfcs/`.
- Language variants are linked near the top and updated together in the same PR.
- The Chinese contributing guide lives at `.github/CONTRIBUTING.zh-CN.md` next to the English
  `.github/CONTRIBUTING.md`.

### TypeScript 7 baseline

- `typescript` is pinned to the 7.x major line; all packages `extend` `tsconfig.base.json`.
- Shared flags: `strict`, `noUncheckedIndexedAccess`, `isolatedModules`,
  `verbatimModuleSyntax`, `module: ESNext`, `moduleResolution: Bundler`.
- Named exports; avoid `any`; `packages/core` stays free of UI and native dependencies.

### Build system

Rspack is the underlying bundler; scenario tools sit on top:

| Target | Tool | Command | Output |
|---|---|---|---|
| Libraries (`core`, `bridge`, `ui`) | Rslib (`@rslib/core`) | `rslib build` | ESM + `.d.ts` (via `tsgo`) |
| Lynx pages & cards (`pages`, `cards`) | Rspeedy (`@lynx-js/rspeedy`) | `rspeedy build` | Lynx bundles |
| Web-style app (if needed) | Rsbuild (`@rsbuild/core`) | `rsbuild build` | web assets |

- Each library has an `rslib.config.ts` with a single ESM `lib` entry and `dts: true`.
- `pages` and `cards` currently use `tsc` as placeholders and switch to Rspeedy when the first
  real Lynx screen is added.
- Type-checking is a separate `tsc --noEmit` step; bundlers are not relied upon for types.

### AGENTS.md

The root `AGENTS.md` consolidates project overview, layout, documentation, TypeScript, build,
monorepo, RFC, commit and health-guardrail conventions and is kept in sync with these RFCs.

## Drawbacks

- Maintaining English and Chinese variants adds documentation upkeep and can drift if
  translators are unavailable.
- TypeScript 7 / `tsgo` is newer; some third-party type ecosystems may lag a major version.
- Rslib 1.0 is recent (September 2026), so long-term stability is less proven than raw `tsc`.

## Rationale and alternatives

- **Chinese-default or mixed-language docs**: lower barrier for the two authors but hurts the
  open-source audience; rejected in favor of English-default with explicit Chinese variants.
- **Stay on TypeScript 5**: stable, but misses `tsgo` performance and the current major line;
  rejected.
- **Build libraries with `tsc` only**: simplest, but no bundling/format control and diverges
  from the Rspack-based Lynx toolchain; Rslib is the Rspack-team's dedicated solution and is
  preferred.
- **Use Rsbuild library mode directly**: superseded by Rslib, which is purpose-built for
  libraries and bundles the dts plugin.

## Unresolved questions

- Whether to enable Rslib's faster `dts.isolated` mode once source conforms to isolated
  declarations.
- Exact Rspeedy plugins and version pinning when Lynx screens land.
- Lint/format toolchain (Biome vs ESLint + Prettier) and the Rstest rollout.

## Implementation plan

- [x] Add root `AGENTS.md`
- [x] Upgrade `typescript` to 7.x and verify all packages
- [x] Install Rslib and add `rslib.config.ts` to `core`, `bridge`, `ui`; switch their scripts
- [x] Convert all docs to English default with `.zh-CN.md` variants
- [x] Move the Chinese contributing guide under `.github/`
- [ ] Adopt Rspeedy for `pages`/`cards` with the first real Lynx screen
- [ ] Introduce Rstest and a lint/format toolchain
