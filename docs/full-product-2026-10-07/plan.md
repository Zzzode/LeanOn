# Full-product execution and acceptance

English · [简体中文](plan.zh-CN.md)

Baseline: `main`, HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`, origin `https://github.com/Zzzode/LeanOn.git`.
Preserve the existing dirty workspace and approved bottom tabs.
No commit, push, production deployment, real account creation or OS permission approval is authorized.
This checklist does not claim completion.

| Batch | Work | Required acceptance |
|---|---|---|
| 1 | Preferences, measurements, photos, encrypted records, backup | Persistent CRUD/restart; unknown values; cancel; auth/tamper rejection; revision conflict; atomic recovery; cross-native backup |
| 2 | Real local accounts, invites, pairing, grants, sync, encouragement, unlink/delete | Creator confirmation; device-ID spoof rejection; no health plaintext on relay; replay/tombstones; durable cursor then ACK; private default; purge; local deletion choices |
| 3 | Bilingual light/dark native flows | Actual Android/iOS pages/results; keyboard/modal continuity; unchanged bottom tabs; no placeholder success |
| 4 | Scanner, Health, scales, reminders, lifecycle | Permission-free checks; cleanup/background/clock/reschedule; hardware/real permissions explicitly unverified |
| 5 | Accessibility and final packages | Small screens/text scale; read-screen labels/hierarchy; midnight/timezone; release compile versus signed device; final source/bundle hashes; Library evidence |

Root owns Bridge, workspace/lock, RFC 0034 and integration/evidence.
Independent owners handle data, relay, Pages/i18n, Android, iOS and security/accessibility review.
Verify final code; relevant changes invalidate older runtime evidence.
Build shared bundles centrally before native staging.
Use `.uiqa`, fictional accounts, generated images, isolated stores and a loopback relay.
Never install, launch, inspect or mutate formal-app records during QA.
Never approve OS permissions during QA.
No production provider, endpoint or credentials are selected; hosting preference remains an optional pending decision.
Keep physical hardware, permission-dependent delivery, device signing and production hardening as explicit blockers if unverified.
Record commands, devices/OS/locale/appearance, source checkpoints and bundle/build hashes.
Use actual native captures, not web preview pixels.
Save new evidence to Library and return native IDs; preserve old evidence identities and results.
See [protocol](../../server/companion/protocol.md), [RFC](../../rfcs/0034-private-personal-data-and-companion-sync.md) and [ongoing audit](audit.md).
