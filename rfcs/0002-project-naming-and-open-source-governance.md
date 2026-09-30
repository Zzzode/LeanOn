- Start Date: 2026-10-01
- RFC Type: process
- Status: Accepted
- Supersedes: 0001 (only the `@health/*` package naming convention)

# Project Naming and Open-Source Governance

English · [简体中文](0002-project-naming-and-open-source-governance.zh-CN.md)

## Summary

Set the project brand name to **LeanOn**, host the repository under the personal GitHub account
`Zzzode/LeanOn`, use the `@zzzode/*` npm scope for packages, license the project under the
**Apache License 2.0**, and establish the full set of community-health files and a CI baseline.

## Motivation

The project is going open source. Its long-term assets start with the **name and governance
structure**: the name drives recognition and spread, while governance files determine how
smoothly external contributors can participate and how vulnerabilities are handled responsibly.
Both should be settled early to avoid the cost of renaming links, docs and packages after launch.

## Guide-level explanation

- The project is publicly called **LeanOn**: two people getting **lean** while being able to
  **lean on** each other, echoing the "Lean on me" sentiment.
- Repository: `https://github.com/Zzzode/LeanOn`.
- Install a TS package: `pnpm add @zzzode/core` (effective once the npm user `zzzode` is
  registered).
- Contributor entry points: README → CONTRIBUTING; significant changes start with an RFC;
  vulnerabilities are reported privately.

## Reference-level explanation

### Naming availability checks

- `leanon`: on GitHub it is a personal organization dormant since 2017; on npm it is an
  abandoned package from 2017 whose name npm officially keeps ("hanging on to the package
  name"), so it cannot be re-registered.
- Therefore the brand is LeanOn but the **technical handles do not occupy `leanon`**:
  - The GitHub repository lives under the author's personal account: `Zzzode/LeanOn`.
  - The npm scope uses the author handle: `@zzzode/*` (the `zzzode` package name was free when
    checked).
- Alternative organization names if an independent org is needed later: `leanonhq` /
  `leanon-app` (both free on npm when checked).

### Package naming map

| Old name (RFC 0001) | New name |
|---|---|
| `@health/core` | `@zzzode/core` |
| `@health/bridge` | `@zzzode/bridge` |
| `@health/ui` | `@zzzode/ui` |
| `@health/pages` | `@zzzode/pages` |
| `@health/cards` | `@zzzode/cards` |

Package manifests consistently include `license`, `author`, `repository`, `homepage`, `bugs`,
`keywords`, `files` and `publishConfig`.

### Open-source license

Use the **Apache License 2.0**:

- Consistent with the upstream [Lynx](https://lynxjs.org) ecosystem (Apache-2.0).
- Compared to MIT, it includes explicit **patent grant and termination clauses**, which are
  safer for a project with native clients that may be used commercially.
- The root provides the full `LICENSE` and a `NOTICE`; third-party licenses are documented in
  `docs/licenses.md`.

### Community and engineering files

- Docs: `README.md` (English, default) and `README.zh-CN.md` (Chinese), linked at the top.
- Contributing: `.github/CONTRIBUTING.md` (English) and `.github/CONTRIBUTING.zh-CN.md`
  (Chinese).
- Code of conduct: `.github/CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- Security: `.github/SECURITY.md`, using GitHub private vulnerability reporting.
- Issue templates: bug report / feature request / config (blank issues disabled).
- PR template, `CODEOWNERS`, `FUNDING.yml` (placeholder), `dependabot.yml`.
- CI: `.github/workflows/ci.yml`, running install, typecheck and build on Node 22 / 24.
- Others: `CHANGELOG.md` (Keep a Changelog), `.gitattributes`, `assets/logo.svg`.

## Drawbacks

- The brand (LeanOn) and npm names (`@zzzode/*`) differ, which must be explained in the README
  or first-time install carries a small cognitive cost.
- Apache-2.0 adds NOTICE and file-header conventions over MIT, slightly more upkeep.
- Bilingual README / CONTRIBUTING means long-term dual maintenance.

## Rationale and alternatives

- **MIT**: simpler and more permissive, but lacks a patent grant; given integration with the
  Apache-2.0 Lynx and native client distribution, Apache-2.0 is preferred.
- **AGPL**: would force network services to open source but raises the barrier for companies
  and community use; not aligned with this project.
- **Flat npm name `lean-on`**: free when checked, but five packages would need multiple flat
  names with no scope to group them; the author scope `@zzzode/*` is clearer, with flat names
  as a fallback if ever needed.
- **Independent GitHub organization**: `leanon` / `lean-on` / `leanon-dev` are all occupied by
  empty accounts; personal-account hosting is simplest at this stage, with organization
  deferred until the project matures.

## Unresolved questions

- Actual registration of the npm user `zzzode` and the package release flow (requires the
  author).
- Whether to enable GitHub Sponsors / FUNDING.
- Whether to introduce a DCO (Developer Certificate of Origin) check.
- Migration and redirect plan if an independent organization is created later.

## Implementation plan

- [x] Place the Apache-2.0 `LICENSE` and `NOTICE`
- [x] Community-health files (CoC, bilingual CONTRIBUTING, SECURITY, Issue/PR templates,
  CODEOWNERS, FUNDING, dependabot)
- [x] CI workflow
- [x] Bilingual README, logo, CHANGELOG, `.gitattributes`, `docs/licenses.md`
- [x] Rename the five packages to `@zzzode/*` and complete their metadata
- [ ] Author registers the npm user and publishes the first release
- [ ] Push the repository and enable Discussions / private vulnerability reporting in GitHub
  settings
