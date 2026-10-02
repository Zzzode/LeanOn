# RFC Process

English · [简体中文](README.zh-CN.md)

All significant design decisions in this repository are captured as **RFCs (Request for
Comments)**. An RFC is a short design document describing a change, its motivation, the
proposed approach, alternatives and open questions.

## When an RFC is needed

Needed for:

- Decisions that affect overall architecture or cross-module collaboration (the Lynx container
  approach, the bridge protocol, the data-sync strategy)
- Introducing a new technology stack, dependency or engineering convention
- New core business capabilities (the adaptive TDEE engine, the dynamic-delivery channel)
- Any decision you later realize "would have saved us pain if we had written it down"

Not needed for:

- Implementation details, renames or formatting within a single module
- Bug fixes and dependency upgrades
- Small changes that the code already expresses clearly (when in doubt, write one — it is cheap)

## Process

1. **Copy the template**: copy `0000-template.md`, take the next four-digit number, and name
   the file like `0003-adaptive-tdee.md`.
2. **Fill it in and open a PR**: create a branch `rfc/<number>-<short-name>`, commit and open a
   pull request. With only two people, discussion can happen directly in the PR comments.
3. **Discuss and revise**: iterate on the document based on feedback.
4. **Merge means Accepted**: once discussion converges with no blocking objection, merge and
   set the status to `Accepted`.
5. **Implement**: after the code lands, set the status to `Implemented` and note the actual
   implementation and any deviations at the end of the RFC.

## Status

| Status | Meaning |
|---|---|
| `Proposed` | Raised, under discussion |
| `Accepted` | Agreed, pending or in implementation |
| `Implemented` | Landed in code |
| `Rejected` | Not adopted after discussion (kept to record why) |
| `Withdrawn` | Withdrawn by the author |
| `Superseded` | Replaced by a newer RFC; the header notes the relationship |

## Conventions

- Numbers are never reused or reordered once assigned.
- RFCs are **historical documents**: do not rewrite their conclusions after merge; use a new
  RFC to supersede an old one.
- Keep them short: enough to explain the decision, nothing more.
- Documentation is English by default; a Chinese translation, if provided, uses the same name
  with the `.zh-CN` suffix (see `AGENTS.md`).

## RFC index

| # | Title | Status |
|---|---|---|
| [0001](0001-monorepo-and-tooling.md) | Monorepo baseline and tooling | Accepted |
| [0002](0002-project-naming-and-open-source-governance.md) | Project naming and open-source governance | Accepted |
| [0003](0003-docs-typescript7-build-system.md) | Docs, TypeScript 7 and the build system | Accepted |
| [0004](0004-core-domain-engine.md) | Core domain engine | Accepted |
| [0005](0005-typed-bridge.md) | Typed Lynx ↔ Native bridge | Accepted |
| [0006](0006-native-host-and-container.md) | Native host and Lynx container | Accepted |
| [0007](0007-dynamic-delivery.md) | Dynamic bundle delivery | Accepted |
| [0008](0008-data-model-encrypted-storage-sync.md) | Data model, encrypted storage and sync | Accepted |
| [0009](0009-internationalization.md) | Internationalization (English + 简体中文) | Accepted |
| [0010](0010-interactive-logging-write-path.md) | Interactive logging write path | Accepted |
| [0011](0011-ble-scale-and-records-changed.md) | BLE weight scale and `records.changed` | Accepted |
| [0012](0012-offline-food-logging.md) | Offline food logging | Accepted |
| [0013](0013-custom-foods.md) | Custom foods | Accepted |
| [0014](0014-manage-custom-foods.md) | Manage custom foods (edit/delete) | Accepted |
| [0015](0015-favorites-and-recent-foods.md) | Favorites and recently eaten foods | Accepted |
| [0016](0016-barcode-scan-and-open-food-facts.md) | Barcode scanning and Open Food Facts lookup | Accepted |
| [0017](0017-exercise-logging.md) | Exercise logging | Accepted |
| [0018](0018-manage-exercise.md) | Edit and delete exercise sessions | Accepted |
| [0019](0019-progress-insights.md) | Progress insights and weekly review | Accepted |
| [0020](0020-smart-reminders.md) | Smart reminders | Accepted |
| [0021](0021-health-connect-export.md) | Health Connect export | Accepted |
| [0022](0022-adaptive-launcher-icon.md) | Adaptive launcher icon | Accepted |
