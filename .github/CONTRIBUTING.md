# Contributing to LeanOn

English · [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for your interest in LeanOn! There are many ways to help: filing bugs, suggesting
features, improving documentation, writing RFCs, or contributing code.

## Ground rules

- Be kind and respectful. By participating, you agree to the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep discussions constructive and focused.

## Development setup

**Prerequisites:** Node.js >= 22.13, pnpm >= 11 (enable with `corepack enable`).

```bash
git clone https://github.com/Zzzode/LeanOn.git
cd LeanOn
pnpm install
pnpm typecheck
pnpm build
```

Useful scripts:

| Command | Description |
|---|---|
| `pnpm typecheck` | Type-check every workspace package |
| `pnpm build` | Build every package |
| `pnpm test` | Run package tests |
| `pnpm --filter <pkg> <script>` | Run a script in one package |

## Repository layout

This is a pnpm workspace monorepo. TypeScript packages live under `packages/*`, native hosts
under `apps/*`, cross-cutting native capabilities under `native/*`, and backend code under
`server/`. See the [README](../README.md) for the full map.

## Coding conventions

- TypeScript **strict mode** is required, including `noUncheckedIndexedAccess`.
- Prefer pure, well-typed functions; the domain core (`packages/core`) must stay free of UI
  and native dependencies.
- Route all native access through `packages/bridge`; do not call native modules directly
  from pages or cards.
- Formatting follows [EditorConfig](../.editorconfig); keep line endings at LF.
- Add tests for behavior changes where practical.

## Making a change

1. Fork the repository and create a branch: `feat/<short-desc>`, `fix/<short-desc>`,
   `docs/<short-desc>`.
2. Make your change with clear commits
   ([Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(core): ...`).
3. Ensure `pnpm typecheck` and `pnpm build` pass.
4. Open a pull request and fill in the template. Link related issues.

## RFC process

Significant changes to architecture, public APIs, or new core capabilities are designed via
**RFCs** before implementation. Please read the [RFC guide](../rfcs/README.md) and use the
[template](../rfcs/0000-template.md).

## Reporting issues

- Bugs and feature requests: use the issue templates.
- Security vulnerabilities: follow the [security policy](SECURITY.md) and report privately.

## Licensing

By contributing, you agree that your contributions are licensed under the project's
[Apache License, Version 2.0](../LICENSE). New dependencies must have an Apache-2.0-compatible
license (see `docs/licenses.md`).
