# Full-product implementation and acceptance

English · [简体中文](report.zh-CN.md)

## Latest bounded completion — 7 October 2026

This section supersedes the earlier remaining Progress contrast, Partner density, gallery repetition/page-offset, and Android live receipt-protocol gates below.
The final shared bundle is `7711c4ba96b81f8d0917c77b8b93618462f234a6782046db3a571af37d095f10`, embedded identically in both isolated native hosts.
The root agent wrote this follow-up; the independent audit and older immutable checkpoints below retain their original authorship and scope.

| Previously observed issue | Applied correction and user effect | Evidence boundary |
|---|---|---|
| Progress weight heading and empty-state contrast; root content extending beneath floating native tabs | Use strong ink for the weight heading/empty text; size root Lynx content to the native safe area. The approved tab-bar source is unchanged. | Unfiltered official contrast audits cover the complete chart, then Nutrition/Exercise/Active days/0 at stable fully visible reading positions. Earlier partially clipped bar-edge failures are retained; this is not certification of every scroll offset or full accessibility. |
| Partner local-use paragraph contrast and management-heavy main view | Shorten the localized offline explanation and use strong ink. Move UUID/device/account operations into an explicit Connection details disclosure scoped to the current account. | Actual synthetic-account UI verifies collapsed/expanded identity and device tools, preserved invitation entry, and final account deletion. No fake encouragement delivery or placeholder login is counted. |
| Gallery repeated privacy paragraphs and full-width paired actions | One localized privacy summary; paired Edit/Delete and paging actions wrap while keeping minimum target widths. The picker/edit form retains full privacy context. | Actual generated gray-image screenshots; original photo height and confirmation/revision guards remain. |
| Previous/Next retained the old scroll position | Changed pages use the supported nested native `scrollIntoViewOptions` API to reveal the first item; stale timers are cancelled. | iOS asserts the returning first image is visible before helper scrolling. Android native Next/Back captures show generated item 5 then item 1 at the page start. This does not cover every Partner/shared-gallery page. |
| Gallery note overlapped the chooser at 320dp/double text scale | Give the heading a column flow and prevent its note from shrinking. | Actual Chinese/English final native captures show complete privacy text and chooser label. No blanket large-text certification is implied. |

The Partner page also exposed a pre-existing native registry omission: `companion.confirmAccountDeletionLocalData` was implemented but not advertised, causing the entire page to report Unsupported.
The one-line capability addition and a meaningful module/registry parity test correct this integration defect without changing the protocol.

Android's new deletion contract now has actual loopback TCP, AndroidKeyStore, encrypted multi-store journal, and three distinct OS-process acceptance on the final QA artifact.
Both first processes are verified alive before exact `.uiqa` force-stop and absent afterward.
The flow tests committed DELETE with lost response, receipt recovery/local wipe, committed ACK with lost response, and third-process completion preserving newly recreated encrypted record/photo bytes without a second DELETE or wipe.
The exact disposable aliases and fixture are removed; original QA records/personal/companion hashes are unchanged.
This is distinct from the older C-account protocol and memory-transport cases; it does not prove hardware Health Connect cancellation, power loss inside a write, or production filesystem durability.

Final case counts, artifact hashes, screenshots, cleanup receipts and deployment decisions are recorded separately in `bounded-final-acceptance.json` and the indexed evidence ZIP.
Build/test evidence is never added across overlapping checkpoints.
No commit, push, paid resource, production endpoint, physical-device operation, or real health-data access occurred.

Final: workspace build/typecheck, Pages142, i18n18; one iOS native85/UI6 invocation and separate darkUI2 pass. Android real receipt PIDs26419→26499→26576. Exact synthetic fixtures/keys/owned simulator/owned relay cleaned. See [final acceptance](bounded-final-acceptance.json); screenshots are original native pixels in the indexed ZIP.


## Earlier checkpoint — preserved history

Status: local implementation is integrated; the latest recovery, gallery and accessibility evidence below supersedes the earlier 07:45 checkpoint.
Baseline: `main`, HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`, origin `https://github.com/Zzzode/LeanOn.git`.
The existing dirty workspace and approved bottom navigation are preserved.
There has been no commit, push or production deployment.

## Final authorized P1 closure

The shared modal return path now reveals a remembered invoker using the supported native scroll callback, then requests focus with generation guards.
Runtime closure covers the measured Dietary entry; every possible modal entry is not certified.
Actual bound TalkBack Cancel and Save both returned to the Dietary Button with the label and green focus outline fully visible, bounds1248–1395 above the native bar2210; root independently viewed both PNGs.
The final086 runtime has two bounded cases/11 official AX actions, exact settings restoration09:55:52 and unchanged original QA files; it does not establish speech or physical reader gestures.
Actual iOS affected UI3/3 passed09:55:22, including visible return, selected labels and actual grey-photo paging/foreground pixels; full VoiceOver remains unverified.

Stable native role keys now authenticate and preserve legacy DEKs across container relocation, without overwriting or discarding undecryptable data.
All-role/current/history preflight and same-DEK checks precede promotion and recovery writes, including foreground retry.
Final native84/84 passed09:53:44: provider15, consumer11, existing49 and Backup9; this is one actual batch, not an accumulation of prior runs.
The old local-complete/orphan check preserves proof and suppresses ACK; recreated weight/photo bytes and new keys remain unchanged.
An orphan alias with no authenticating ciphertext cannot be safely identified and stays recovery-required; this is deliberately fail closed, not automatic cleanup success.
See [final84 cases](key-migration-final-84-cases.json) and the audit for full evidence and line anchors.

The final catalog-only package12c19b25 is built/typechecked with Pages142/142 and catalog18/18 passing.
Native visual acceptance stays qualified to086; final12c packaging changes one recovery-status sentence in each locale, with unchanged focus/gallery behavior sources.
Production deployment and real camera/health/BLE/notification permissions remain outside this acceptance.

## Implemented result

Personal workflows now have native modules for dietary preferences, measurement CRUD, encrypted photo metadata/bytes and portable password-encrypted backups.
Partner now uses a real local ciphertext relay, explicit account/device invitations and creator confirmation, opt-in sharing, account-scoped vault replication, durable receipt-based encouragement and unlink/account deletion choices.
Signing in does not import or transmit pre-existing local health data; a named-account import requires explicit consent and both storage revisions.
A restored backup replaces the supported local collections only after authentication, preview, confirmation and a multi-store transaction.
The implementation includes failure paths; a lost callback never establishes that a write did not occur.

## Scope and evidence boundary

All acceptance accounts and records are synthetic; photo fixtures are generated.
Android uses the isolated `.uiqa` host on an Android 15/API35 arm64 emulator, 1080×2400.
iOS uses isolated `.uiqa` hosts on iPhone 17 Pro and disposable iPhone SE3 / iOS 26.5 simulators; SE3 is 375×667 pt.
No formal-app records or profiles, real account credentials, operating-system clock settings or permission dialogs are changed.
Screenshots must be actual native captures, with platform, language, appearance and visible-state boundaries recorded in the evidence index.
A unit-test fixture port is not an actual Keychain/Keystore, health provider, camera, Bluetooth scale or notification delivery result.

## Implemented contracts

- Personal state is revisioned and mutation receipts support replay before stale-revision checks.
- Photo originals selected explicitly are normalized into metadata-free JPEG derivatives; imported canonical JPEGs keep exact bytes.
- Backup format 1 uses AES-256-GCM and exact UTF-8 PBKDF2-HMAC-SHA256, 600,000 iterations; authentication precedes JSON decode and any store write.
- Records, personal data and photos use encrypted native storage and a prepared/committed recovery journal, with fail-closed handling of uncertain durability.
- Invitation proof and key wrapping use distinct HKDF contexts; accepting an invitation does not authorize a device before creator confirmation.
- Ciphertext AAD authenticates change metadata; the relay stores no plaintext health records or group keys.
- Per-device consent is intersected with relay grants; relay data cannot enlarge the device's chosen sharing scope.
- Vault keys and attachment ownership are namespaced by endpoint realm and account; account switches never auto-attach the prior local dataset.
- Entity clocks merge independent offline edits; a restore receipt cancels only its matching deletion, and same-clock/different-content conflicts fail validation.
- Receiving stores, grants and cursors commit before ACK; only a genuine recipient receipt changes encouragement from pending to delivered.

See [RFC 0034](../../rfcs/0034-private-personal-data-and-companion-sync.md), [relay protocol](../../server/companion/protocol.md) and [current audit](audit.md) for the design and source evidence.
The RFC remains a proposed local implementation decision; production service selection has not been made.

## Latest recovery and native UI checkpoint

The gallery/contrast checkpoint below uses `c66cfe4361d2f714834a687e1c5ae0398550ecc4eb973c87f61b1d62d33317fb`.
The later focus-return bundle is `efc9600b05dab37d71839f82b9a7e46d0c814b9d252691a1a4bd16eb49e823a6`, with141/141 final Pages tests; native runtime regression is recorded separately.
Build and typecheck pass.
An earlier full workspace run passed437 tests on bundle f69d8026; later final Pages138 and real TCP relay32 passes are separate targeted runs, not a fabricated combined442-test run.
Current Android JVM XML records243 executed:242 passed, one explicit opt-in skip, zero failures/errors.
Twelve focused Android deletion cases exercise the actual repository through injected transport/storage ports; they do not establish actual HTTP, Keystore or production-journal acceptance.
Current iOS targeted tests passed49/49, including actual Darwin TCP307/308 and declared/chunked size guards, actual encrypted journal faults, QA Keychain cleanup and cancellation checks.
Exact test cases, run boundaries and hashes are in [current summary](recovery-final-summary.json), [Android cases](recovery-android-jvm-cases.json) and [iOS cases](recovery-ios-targeted-cases.json).

Deletion now writes an encrypted prepared intent before DELETE, with a random private recovery proof and operation identity.
The relay atomically persists a hashed receipt with account removal; exact receipt verification precedes local cleanup, durable local completion precedes ACK, and lost response/ACK retries cannot wipe newly created data.
Dual revision checks and an explicit keep-local decision protect recreated records and the independently recreated health ledger.
No password or proof appears in public state, backup or event payloads.
This closes the earlier remote-success/before-intent-persistence window; it does not make server and local stores one distributed transaction.
Both client and relay must support the new contract: the older8787 development relay lacks receipt/ACK routes and is deliberately retained only for earlier fixture cleanup.
Deployment requires server-first readiness checks; rolling compatibility with that older relay is not claimed.

After explicit user approval at08:57:19UTC, the exact originally refused fresh relay command succeeded once at127.0.0.1:61059.
Two actual URLSession/QA Keychain live deletion cases passed09:01:40UTC: committed DELETE response loss, exact receipt recovery, ACK response loss, retained new data, and wrong-password/no-receipt explicit retry.
Those two cases reopen service objects within one OS process.
Separate staged process recovery passed09:20:47UTC: preparePID23784 had already exited, recoveryPID58867 verified receipt, local wipe and ACK without another DELETE.
Fixture, pointer and four original QA Keychain aliases were verified absent, all fresh relay counts were zero, its owned session exited0, and its scoped directory was removed.
A sandbox-denied TCP probe is not represented as a listener verification.
The QA reinstall moved its container; a test-only exact fixture remap retained the original key namespace, so this run is not production upgrade acceptance.

Own and Partner photo views now request at most four previews per page, with localized pagination and stale-generation rejection.
Actual Android1000-photo acceptance used generated grey JPEGs and an encrypted collection of20,451,894bytes, below the32MiB JPEG boundary rather than at the maximum compressed-byte limit.
First/next/previous pages and actual foreground grey pixels were observed; four visible issued previews became zero in background and four fresh generation paths in foreground on the final bafb1bad APK.
Final sampled PSS was217,821KiB and process HWM453,312KiB; these samples are not continuous peak instrumentation or a general maximum-memory guarantee.
Actual iOS five-photo first4/second1/foreground1/previous4 pixel-aware UI acceptance passed1/1.
Returning to the first page preserves the old scroll position and may require scrolling back to its first image; this is a P2 interaction-continuity finding.

Android ordinary and320dp/font-scale2.0 forms retain the same draft through focus and expose Cancel/Save targets of48dp and72dp respectively.
Localized choice labels contain the selected/unselected state because the pinned Lynx accessibility-value setter does not expose it reliably.
Temporarily enabled TalkBack was actually bound with touch exploration, and the service-preserving QA runner exposed Button/click semantics, modal isolation and choice activation.
Injected swipe/double-tap traversal and spoken announcements have not passed; absence of an audio capture capability is not evidence of correct speech.
The original settings were restored exactly at09:15:01UTC. Controlled AX Cancel returned focus to the Me heading rather than the invoker, a confirmed P1.
A subsequent explicit instruction authorizes its narrow fix and regression.
The first efc native repeat returned AX focus to the correct Button, but its actual pixels remained hidden under the native bar; this interim result does not close the P1.
The follow-up uses the supported native scrollIntoView success callback before guarded focus return; final visible-pixel acceptance is recorded separately.

Actual iOS contrast audits retain five unresolved Progress findings and one Partner finding.
The visible "Not enough data yet" result must not be dismissed as offscreen; some other frames intersect the native bottom fade.
Source token ratios and ordinary AX checks do not override these rendered findings.
Dietary/measurement stable contrast audits report zero findings; full VoiceOver is unverified.
A paired physical iPhone16Pro is available by readonly discovery, but no installation, access, OS permissions or VoiceOver session was authorized on it.

Retain the approved bottom navigation, readable numeric emphasis and explicit named import consent.
The gallery still spends too much vertical space on repeated privacy copy and full-width edit/delete controls; four-per-page bounds resources but does not resolve its visual density.
Prioritize visible contrast and scroll/focus continuity, then compact the explanatory copy and group photo actions; avoid a complete redesign during reliability acceptance.

Production remains a reviewable proposal in [deployment decision](deployment-decision.md), with no provider resources created.
Current registration is open to any reachable caller; device invitations are not a registration gate.
An admission policy, persistent single-writer deployment, independent backup/deletion restoration policy, region, budget and deployment approval are prerequisites.
External deletion/revocation while a prepared intent exists can conservatively block recovery without a matching receipt; no unsafe401/404 success or automatic intent discard is implemented.
Health-ledger clearing precedes the three-store CAS and is not a fourth journal participant; a later CAS failure does not roll that ledger back.
Cancellation drains the actor before returning, which can exceed30seconds; a hard30-second deadline is not promised.

## Earlier 07:45 verification checkpoint

Root workspace build and typecheck passed.
One final workspace Rstest run passed **420 tests**, zero failures: Core83, exercise7, i18n18, delivery23, food42, relay23, Data47, Bridge49 and Pages128.
The actual TCP relay23 suite is included in 420, not added to it; targeted/intermediate batches are not accumulated.
See [workspace summary](workspace-test-summary.json) for the exact log hash.
The shared native UI bundle is frozen at SHA-256 `3bbe6225013ec611f0cde9c69a614d5ab15250234448f1d8ecf99d190606387d`.
The bounded-decoder/modal-cleanup Android build executed **224 JVM cases: 223 passed, one opt-in HTTP skip**, zero failures (47 classes).
Final device regression is separately identified below.
The final actual Android photo/modal/lifecycle group passed **2 cases**, with8 official UI actions: two generated JPEGs visibly rendered, modal closed, background cache emptied, and a new foreground generation visibly reloaded.
A separate **11/11** actual HTTP/crypto/merge/preview-purge-fault suite passed; it uses fixture storage ports, not actual Keystore.
The new QA APK embeds the exact shared bundle, APK SHA-256 `30e04a2acea9807d1f6f039dd44db5fcc8a606fb5b0706787b1e46648e19eff8`.
The earlier pixel/UI checkpoint is APK `01b0b3e6…`; public backup and A/B/C interop used the separately identified `e03913eb…` artifact.
**Fourteen** actual Android device checks passed using Keystore, JPEG pixels and JCA, including exact public Unicode backup restoration, legacy-ledger migration/cleanup and original-store hash preservation.
They do not establish document-picker or camera/permission interaction, or UI Save behavior.
iOS final native tests executed **190: 189 passed, one opt-in staged interoperability skip**, zero failures.
Seven actual-source logical-purge fault tests verified encrypted state inside the failing preview-cleanup callback and fresh-service retry.
The real URLSession relay test passed with actual native stores and an ephemeral memory key provider; actual QA Keychain lifecycle is separately covered by native crypto tests.
Swift CREATE → Kotlin ACCEPT → Swift CONFIRM → Kotlin SYNC → Swift RECEIVE passed against the real local relay.
Independent weight edits merged; both canonical JPEGs matched exact bytes; the recipient durably committed and sent real ACK.
After the specific A/B/C approval at 07:18:37 UTC, the original VERIFY, new-process deletion recovery, Swift REVOKE, Android REVOKED and both CLEANUP stages actually passed.
Recipient durable ACK produced native delivered state; revocation purged peer messages and refused sending; private handoffs and dedicated A/B/C fixtures were removed.
This is repository/native state evidence, not a screenshot of the sending UI.
CREATE/ACCEPT/CONFIRM/SYNC/RECEIVE used the earlier native-069-v2 checkpoint; VERIFY/REVOKED/CLEANUP used e03913eb/76cb0aa9.
Direct public native backup exchange also passed both directions: Swift CommonCrypto/CryptoKit export → Kotlin JCA inspect/atomic restore, and Kotlin export → Swift inspect/atomic restore.
Exact JPEG SHA-256 matched `902b88fb192ea99ddf99e5f2bd279afc0203dbbbb8ac79b5ee6356677d3d53c1`; no application credentials are in these public fixtures.
The corrected iOS photo workflow passed an actual grey-pixel check before and after foreground return, together with metadata edit and deletion.
The iOS build21 pixel-aware UI group passed **7/7**, zero failures, on its recorded native/UI-plugin/bundle identity, before the final logical-purge/lifecycle retry changes.
The final affected Partner/photo group passed **2/2**, zero failures, on build26 at07:43:01 UTC: real register/explicit-attach/logout/relogin/delete, and actual photo pixels/edit/foreground/delete.
These batches are not accumulated into one suite.
The preceding AX-only seven-case pass missed a blank image and is historical evidence only.
Android unsigned Release and iOS unsigned iphoneos Release compile passed; this does not prove device signing or distribution.
Final iOS native SHA-256 is `d51fd5b95b400a241141d7a34249f90d64d4c1d07362cc71ae37dcafc2fa9225`; UI plugin `8f57afc596cd9339ada24df1ff445fa40acc7c6812826dfc3930bdd71f5ee7d7`.
Final SE3 device `CE6916DA-858B-4BFB-91E4-7935612F49CB` was removed after acceptance; the earlier SE3 is a different device identity.
Root independently matched95 iOS source hashes,180 Android source hashes, all10 final iOS and8 final Android capture hashes; the archive retains the per-capture manifests.
The formal iOS binary and original QA records retained their baseline hashes.


## Earlier data-path findings and closure

| Finding | Correction and verified scope |
|---|---|
| Old health-export ledger | Bounded readonly legacy compatibility; next explicit changing write encrypts. Android real Keystore reserve/reopen and iOS legacy/encryption tests passed; real health-provider data was not read or migrated |
| Local-delete residue | Cancel in-flight generation, remove app records/personal/photos/ledger/keys/cache, and disable automatic import before clearing. Android final native cleanup/reopen and durable disabled-sync checks passed; iOS journal/cleanup/generation tests passed; OS health records remain untouched |
| Remote delete succeeds, local cleanup fails | Persist pending cleanup and retry through a freshly opened service without authenticating to a deleted account. iOS actual QA Keychain/store-object reopen passed. Android actual remote deletion, injected failure and encrypted pending marker passed; fresh process PID8590 recovered the prior failure intent and removed fixture data/Keystore aliases. The QA process was already absent before force-stop; no live-process kill is claimed |
| Photos return from background | Scoped invalidation, generation URI, stale-reply rejection and explicit retry. Native cache checks, iOS build21 seven UI cases including actual grey pixels/edit/foreground/delete, and Android actual generated-grey foreground images passed. Final changed-source regressions are separately identified |
| Preview file cleanup fails during revocation | Persist logical auth/grants/peer-health/key removal before fallible preview I/O, retain a retry marker, publish purged credential-free state and block new access until successful cleanup. Android fault suite11/11 and iOS fault suite7/7 passed; successful retry respects the requested foreground/background lifecycle |

These are isolated-fixture/code findings, not evidence of exposure, loss or modification of real user health data.
Repository/service-object reopening is distinguished from an actual process restart.

## Earlier actual UI findings

The prior fixed header/footer hid the draft on iPhone SE3 at the largest accessibility font size.
The shared sheet now keeps the uncontrolled input subtree, uses whole-sheet scrolling when body space is insufficient and reveals the focused field, while retaining font scaling.
Six full-width measurement filters pushed the first stored value below the fold; the final UI uses a two-column grid with wrapping labels and minimum touch height.
Android native captures show labeled dietary choices, Cancel and Save with 48 dp bounds; official FINGER interaction is separate evidence.
Without an enabled reader service, `ViewGroup clickable=false` does not establish full TalkBack behavior; Lynx3.9 initializes its accessibility delegate conditionally.
Both native photo galleries had image nodes/URIs but blank actual pixels because their Lynx hosts lacked registered image loaders.
The narrow correction only loads approved own/partner preview-cache capabilities, with no network/content-provider/arbitrary-file access; actual post-fix pixels were verified on both platforms.
Android uses a bounded JPEG decoder because the pinned SDK delegates an unbounded resize request; worked-case tests cap a 20,000×20,000 image to at most 4,194,304 decoded pixels.
iOS bounds target dimensions and permits only one decoded request to wait for main-thread delivery.
Both loaders recheck authorization at delivery and invalidate in-memory capabilities before fallible file cleanup; secondary disk/memory caching is disabled on Android.
AX existence, metadata CRUD and exact JPEG transport cannot substitute for image display.

Opaque semantic source token calculations cover 22 light/dark text pairs, with a minimum ratio of 5.013:1.
See [computed token evidence](source-token-contrast.json).
These calculations do not measure rendered pixels, translucent surfaces, nontext controls, focus navigation or reader usability.

## Remaining visual priorities

| Priority | Verified finding | User impact | Concrete next design change |
|---|---|---|---|
| P1 | Progress five/Partner one official contrast findings, including visible empty-state copy | Secondary guidance becomes harder to read near the native fade | Correct the rendered text/surface pairs and test visible positions in light/dark; retain the approved bar |
| P2 | Repeated privacy paragraphs, large single photos and full-width edit/delete dominate both actual galleries | A simple photo check requires too much scrolling | Keep one short privacy line, group secondary actions and make the four-photo page easier to scan |
| P2 | Actual D Partner UI prominently exposes account UUID and repeats family/device invitation labels; source PartnerScreen42/CompanionSheet63 | Setup reads like an administration console and obscures the support task | Keep display name as identity; move diagnostic ID to expandable detail and separate partner connection from own-device tools |
| P2 | iOS gallery Previous preserves the second-page scroll offset | The first image can return above the viewport | Explicitly restore a meaningful page position while preserving intentional within-page reading |

Keep the approved bottom navigation, restrained surfaces, readable numbers, minimum targets, preserved drafts and explicit named import consent.
Use the existing semantic palette and spacing system; avoid adding glass effects or a full redesign to solve these concrete problems.

## Remaining acceptance boundaries

Camera scanning, actual HealthKit/Health Connect authorization and data, real Bluetooth scales, notification delivery and locked background behavior require device/permission acceptance not authorized in this session.
iOS physical-device distribution signing requires a configured development team and credentials; simulator ad-hoc signing does not establish that result.
The local relay is a bounded development service, not a selected or deployed production provider.
Menstrual sharing is represented in the protocol but there is no menstrual-recording collection; this report does not claim period tracking is implemented.
Swift rejects canonical-equivalent distinct foreign entity IDs rather than silently collapsing them; generated native IDs are ASCII, and full arbitrary-Unicode identity interoperability is not claimed.
Deleting a relay account and deleting local stores are not one distributed atomic transaction.
The earlier remote-success/before-intent-persistence gap is superseded by the prepared receipt protocol and separately scoped tests above.
Production operating terms, account recovery and service hardening need a deployment decision and separate acceptance.
Actual current iOS TCP size/redirect tests pass; they are not an exhaustive network-security certification.
The1000-photo Android check and four-preview window establish the tested fixture behavior, not every maximum-byte gallery or device memory budget.

## Approval history and current scope

Earlier VERIFY/deletion-recover refusals are retained as history, with exact commands/reasons and a bounded UTC interval.
Specific A/B/C approval resolved those checks; all dependent revocation/cleanup stages passed without changing or bypassing the rejected actions.
The separate D-account consent tap and fresh relay command were originally rejected before execution.
The checkbox only changes local consent state; subsequent explicit submission would attach the fictional measurement/two generated photos to D and permit vault sync to the loopback relay.
The user explicitly approved D import/cleanup, fresh deletion tests and temporary TalkBack enable/restore at08:57:19UTC; these approvals do not extend to production or physical-device permissions.
Final outcomes and historical exact reasons remain in [precise approval record](approval-blocker.md).

## Approved D acceptance and cleanup

Original D consent, explicit named import, vault sync and account/local cleanup actually passed on original01b0/3bbe and older8787.
One fictional measurement and two generated grey photos were attached; all other record counts were zero.
Stable UI showed attached ownership and no pending sync, while readonly relay inspection confirmed ciphertext vault/keyring sequence2.
D account lookup after deletion returned zero; all local record/photo counts and previews were zero.
At09:37:18 the exact four scoped Keystore aliases and D cache were verified absent, with originalbf2e records preserved; private handoff/typed captures were removed.
Unrelated old-relay accounts and state were retained.
This does not substitute for the new prepared-receipt protocol tests above.

## Deliverables

The final evidence index identifies source/package hashes, scope-specific sanitized results and original native screenshots.
Library delivery includes this paired report, the independent audit and a readable overview made from real native captures.
Private relay state, credentials, invitation secrets, tokens, keys, native stores and raw test-result bundles are excluded.
