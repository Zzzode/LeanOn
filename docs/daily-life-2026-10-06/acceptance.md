# Personal daily-life acceptance

[简体中文](acceptance.zh-CN.md)

Checkpoint: 2026-10-06, `main`, HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`, with concurrent uncommitted implementation.
The tested local daily-life core passes at bundle `23593dc3…`: setup, historical records, deletion/restoration, and observable failure recovery.
The matrix distinguishes that closure from unverified six-screen states, accessibility, natural midnight and physical/provider integrations.
The later P1 feedback follow-up uses bundle `ae747dd3…`; its scoped evidence appears in the addendum and does not rerun the entire baseline automatically.
Only synthetic isolated stores may be used; do not inspect normal user stores or grant OS permissions.

## Evidence levels

`Source` means a reviewed code path, `Unit` means an executed named test, `Runtime` means an isolated native fixture, and `UI` means an actual button interaction on the identified native build.
Screenshots establish visible state only.
Previous theme/parity manifests do not establish new setup, history, mutation, or restore behavior.
Every final result must identify source/bundle checkpoint, device/platform, fixture path, test/log, and limitations.
The implementation review below distinguishes previously executed builds from the frozen final candidate.

## Migration decisions

Fresh personal stores are empty; demo data is explicitly isolated and existing records are never classified as demo by matching values.
Schema 2 supports nullable setup/goals, factual tracking before setup, identifiable legacy daily totals plus meal snapshots, stable movable record IDs, read-only imported mirrors, and one atomic revision/receipt/trash transaction.
Weight-loss guidance requires explicit eligibility and actual recorded weight; unknown risks remain unknown.
Read migration remains virtual until a validated write succeeds, and malformed established files fail closed.
Current source anchors and executed evidence appear below; remaining date/lifecycle and final-executable UI coverage remain explicit in the matrix.

## Acceptance matrix

This matrix records the bundle-235 baseline; the P1 addendum below qualifies the newer bundle separately.
New native runtime and UI rows are **pending** until independently executed evidence is attached.
Source work in progress and previously passing unrelated tests are not upgraded to a pass.
The initial eight Diary selector tests passed at 17:00:35 UTC; the expanded twelve-test file passed at 17:13:48 UTC in `/tmp/leanon-record-edit-tests.log` using Node 22.23.2 and Rstest 0.12.2.
They establish selected-date totals, calendar validation/navigation/history, saved-portion scaling and historical exercise correction, not native buttons or transactions.

| ID | Concrete acceptance | Unit / failure fixture | iOS UI | Android UI |
|---|---|---|---|---|
| INIT-01 | Missing personal file opens empty tracking/setup; relaunch remains personal, with no packaged demo. | Both native fresh-empty fixtures pass | Final 235 fresh setup/relaunch cases pass | Final 235 empty/cancel/setup and persisted restart pass |
| SETUP-01 | Skip setup and incomplete profile retain logging/history; valid completion and later edit persist atomically. | Both stores pass tracking/profile, null/missing and failed-commit cases | Final 235 all four English/Chinese light/dark setup/cancel/save/relaunch/edit cases pass | Final 235 setup/cancel/save/restart pass; later profile-edit button not separately exercised |
| SAFE-01 | Unknown risk, excluded risk, ineligible age or incomplete profile produce tracking-only guidance; ordinary eligible input respects policy floors and explicit opt-in. | Core/page/native safety fixtures pass | Final 235 unknown-risk tracking-only/no goal passes; exclusion variants are unit evidence | Final 235 unknown-risk tracking-only/no budget passes; exclusion variants are unit evidence |
| MIG-01 | Legacy aggregate history, micronutrients, imported provenance, foods and unknown fields survive migration; second load is stable. | Both stores pass legacy migration/metadata/read-no-write/corruption fixtures | Final 235 labeled legacy aggregate correction/cancel/recovery pass | Legacy UI not exercised; JVM/conformance evidence only |
| MIG-02 | Derived intake equals legacy total plus active entries exactly once; deleting/restoring entry adjusts only its snapshot. | Both stores and core pass projection/edit/delete/restore fixtures | Final 235 meal totals/delete/restore pass; combined legacy+meal case is unit evidence | Final 235 meal totals/delete/Undo pass; combined legacy+meal case is unit evidence |
| REC-01 | Add/edit dated meal with stable ID, portion, meal label and nutrient snapshot; catalog edits do not change past nutrition. | Snapshot scaling/identity/overflow and both native validation fixtures pass | Final 235 English/light and Chinese/dark historical meal create/edit pass | Final 235 Oct5 lunch 200 g→dinner 150 g and recovered 175 g draft pass |
| REC-02 | Edit/date-change weight, exercise and absolute water; duplicate date/identity and imported-source conflicts do not overwrite silently. | Both stores pass identity/source/collision fixtures; exercise MET-ratio selector tests pass | Final 235 Chinese/light and English/dark record create/edit/delete/restore and corrected weight date pass | Final 235 weight 72 kg, water 500 ml, walking 45 min / 133.5 kcal create/edit pass; date moves/type change not button-tested |
| REV-01 | Same operation retry is applied once even with stale expected revision; changed payload with same operation ID fails; stale new operation conflicts. | Both stores/core pass replay/reopen/stale/reuse fixtures; page lost-response retry passes | Error draft retention passes; deliberate lost-response replay not button-tested | Error draft retention passes; deliberate lost-response replay not button-tested |
| REV-02 | Out-of-order RPC/events never replace newer snapshots; caller sees conflict and explicitly refreshes/retries. | Pages 81 includes lower-revision and request-order forward/backward clock fixtures | Controlled clock/foreground pass; actual delayed RPC race not separately injected | Injected clock/draft pass; actual delayed RPC race not separately injected |
| DEL-01 | Confirmed deletion moves complete record to durable trash; Undo and Recently Deleted restore after restart; collision returns conflict. | Both stores pass durable deletion/reopen/restore collision fixtures | Final 235 meal and daily-record deletion/restoration cases pass | Final 235 meal cancel/confirm/Undo and exercise force-stop/restart/restore rev14 pass; weight/water deletion is unit-only |
| ERR-01 | Write/migration failure preserves last good file, revision, receipts and trash; UI keeps draft and allows safe retry. | Both native failure fixtures and two page recovery/conflict fixtures pass | Final 235 both legacy failed-write/same-modal recovery and corrupt-start read/retry pass; hidden internal polling flag inferred | Final 235 corrupted cache exposed 88.129 s, retained 175 g draft and same-modal recovery pass; error visible after scrolling |
| DATE-01 | Yesterday/history selection is explicit; opening before midnight and saving after refresh retains selected date; Today refreshes correctly. | Selected-day totals, leap/year/DST-date navigation, invalid/future dates, history and pinned-draft units pass | Final 235 controlled clock/foreground historical draft pass | Final 235 historical draft saved after app-internal next-day refresh pass |
| DATE-02 | Midnight while active, zone/time changes, foreground and relaunch refresh presentation without rewriting historical calendar dates. | Native clock/day and pure calendar fixtures pass | Final 235 controlled foreground day/time-zone switch passes; natural active midnight and real OS time-zone change unverified | Final 235 app-internal day switch and restart pass; natural active midnight and real OS time-zone change unverified |
| UI-01 | Today, Diary, Progress, Me, Settings and Partner truthfully cover incomplete, empty, populated, load error and unavailable states; bottom bar remains consistent. | Core/page empty, tracking, safety and invalid-snapshot fixtures pass | Final 235 selected daily screens covered; complete six-screen exceptional-state coverage unverified | Final 235 selected daily screens covered; complete six-screen exceptional-state coverage unverified |
| UI-02 | Forms use localized labels, visible errors, adequate touch targets and contrast; pending prevents duplicate save, Back/cancel preserves intended behavior. | Catalog parity and pure draft/error/retry fixtures pass | Final 235 selected native input/save/cancel pass; full Back/accessibility unverified | Final 235 selected native input/save/cancel pass; error visibility needs scroll; full Back/accessibility unverified |
| EXT-01 | Existing custom foods, favorite/recent, scan, reminders, appearance, health and BLE do not bypass revision/atomic rules or fabricate success. | Pending: native adapter regression tests | Pending: local UI; hardware/provider unverified | Pending: local UI; hardware/provider unverified |
| WIRE-01 | Explicit null, false and zero survive the real Lynx setup request/response/event path; missing required fields still reject without writes. | Shared simulated-null-drop and native decoder fixtures pass | Final 235 actual setup/null goals/risk answers pass; all false/zero/event variants are not separately button-tested | Final 235 actual setup/null state and receipts pass; all false/zero/event variants are not separately button-tested |

## Migration review checklist

1. Define schema version support explicitly; reject future versions and malformed established roots without writing.
2. Preserve valid legacy profiles but default safety/guidance to tracking-only until explicitly answered and enabled.
3. Preserve legacy intake as identifiable daily totals; the derived `intake` projection is never migration input once schema 2 exists.
4. Commit entry arrays, tombstones, operation receipt fingerprint and revision in one transaction; do not acknowledge before durable success.
5. Check replay before expected-revision rejection, but reject same operation ID with a different canonical payload.
6. Keep receipts long enough to uphold retry guarantees; if bounded, document the precise limit and behavior after eviction.
7. Restore checks current identity/date conflicts and provenance; failure leaves the tombstone intact.
8. All legacy native writers, health mirror replacements and BLE writes advance the same revision and preserve meal/trash state.
9. Do not mutate normal data during verification or infer a migrated demo from matching seed contents.
10. Separate local acceptance from physical BLE, camera, notification delivery and health-provider permission/device verification.

## Implementation review checkpoint

Diary now exposes explicit calendar-date entry, previous/next/Today, recorded-date shortcuts, editable meals and record rows, and a durable recently-deleted restore entry point.
`IntakeEditSheet` scales its original saved portion snapshot; `RecordEditSheet` retains IDs during explicit date moves and corrects legacy totals directly across kcal/macros/micros.
Legacy corrections operate on existing aggregate IDs and never fabricate meal metadata.
The root page owns confirmation, Undo, operation IDs, pinned draft revisions and final native callbacks.
Virtual migration and strict schema-2 recovery-array validation were subsequently source-reviewed and exercised by the native failure fixtures.

The later native fixture checkpoints below supersede the initial Android 17-case migration run; they remain synthetic store evidence, not provider/device/button evidence.
Both native hosts now reject save-exercise/intake IDs still in trash with conflict; their final guard is source-reviewed and included in the later native fixture checkpoint.

## JSON integration checkpoint

The prior actual setup flow failed on both native hosts because Lynx omitted null-valued request-map keys.
The repair uses a private JSON string envelope only for `records.mutate`; it does not substitute defaults for missing domain fields or change persisted records.
Earlier runtime checkpoint bundle SHA-256: `366dc77526603038448f2b0b5f1c0de50661e9898f9196f931b435e194601ea7`.
Shared workspace log `/tmp/leanon-daily-workspace-tests.log` records 300 passing tests at 17:33:57–58 UTC.
Android current XML records 151 JVM tests with zero failures/errors at 17:34:42–43 UTC; log `/tmp/leanon-android-daily-qa/final-native-source-build.log` also reports successful Debug unit and Release compilation.
iOS `/tmp/leanon-daily-ios-unit-wire-final.log` records 136 passing native unit tests at 17:38:38 UTC, including explicit-null preservation, missing-field rejection and malformed/mixed envelope rejection.
Actual bundle-366 setup evidence is now attached separately from those unit checks.
The iPhone 17 Pro / iOS 26.5 simulator passed `testEnglishLightSetupCancelSaveEditAndRelaunch` in 83.634 seconds; `/tmp/leanon-daily-setup-wire-final.log` and `/tmp/leanon-daily-setup-wire-final.xcresult` record one executed test with zero failures.
The immutable five-image manifest is `/tmp/leanon-daily-ios-evidence/setup-final-manifest.json`, with native binary SHA-256 `04c1129a8942f69eaaf2ed60ecacd9ad193a19376ef994a33fddcd147ecb6a2c` and the matching bundle hash above.
The reviewer personally inspected its `en-light-setup-setup-saved.png`: saved height 178 cm, no goal, and explicit tracking-only text are visible.
Android `/tmp/leanon-android-daily-qa/final-setup-saved.png` was also personally inspected: the saved 70.0 kg and tracking-only state are visible.
Its paired `final-setup-saved.json` records revision 1, height 170 cm, null goals and three null safety answers in both state and the durable operation receipt.
The root checkpoint identifies Android APK SHA-256 `d097d1196d9d551f51ed7a017bf4e28d490d0d946627ac79257f05fdc240414e`; Android emulator identity and complete interaction coverage must accompany the final platform manifest.
These establish the actual setup/null repair for this checkpoint, not every false/zero/event variant or the upcoming calendar-fix executable.
An earlier remaining iOS run stopped at an incorrect Chinese tab label; this was a harness issue and did not establish a product failure.
The subsequent English/light historical-meal case passed in 115.949 seconds in `/tmp/leanon-daily-meal-harness.log` and `/tmp/leanon-daily-meal-harness.xcresult`.
Its immutable seven-image manifest `/tmp/leanon-daily-ios-evidence/meal-366-checkpoint/evidence-manifest.json` pins the same binary/bundle identity and covers create/edit, delete cancel/confirm, Undo, delete again, relaunch with durable trash, and restore.
The reviewer inspected the restored meal image: explicit 2026-10-03, dinner, 150 g and 195 kcal are visible.
Android `pre-restart-session-report.json`, `final-process-restarted.json` and `final-restart-exercise-restored.json` under `/tmp/leanon-android-daily-qa` establish historical food edit, 72 kg, 500 ml and walking correction to 45 minutes / 133.5 kcal; the root verified force-stop and a new process.
The reviewer inspected the restored image and matching revision-14 snapshot: the same exercise ID is active and trash is empty; display rounds 133.5 to 134 kcal.
The report retains identical before/after hashes for the original synthetic `com.zzzode.leanon.uiqa` app-files store while actions used the separate isolated cache repository.
The formal `com.zzzode.leanon` user store was not read; no OS permission/provider operations occurred.
The earlier 133-test iOS and 147/151 Android checkpoints must not be presented as proof of a newer executable without its source/binary identity.

| Current source anchor | Reviewed boundary |
|---|---|
| `packages/bridge/src/lynx-transport.ts:30`, `:152` | JSON wrapper retains null/false/zero; rejects nonfinite/nonserializable values; wraps only records mutation. |
| `apps/ios/LeanOn/Modules/RecordsModule.swift:47` | Exactly one string envelope key, decoded object root; plain-map compatibility remains strict. |
| `apps/android/app/src/main/java/com/zzzode/leanon/modules/RecordsModule.kt:98` | Exactly one string envelope key, strict operation ID and safe-integer revision; no invented nullable fields. |
| `apps/android/app/src/main/java/com/zzzode/leanon/data/JsonConversions.kt:34` | Native callback maps explicitly put null; arrays explicitly push null at line 45. Actual bundle-366 setup/null path has partial UI proof above. |
| `apps/ios/LeanOn/Storage/RecordsStore.swift:610`, `:641` | Receipt lookup precedes stale revision checks; state/receipt/trash persist before success. |
| `apps/android/app/src/main/java/com/zzzode/leanon/data/RecordsRepository.kt:45`, `:646` | Virtual migration read; serialized mutation persists before returning; replay does not rewrite. |
| `apps/ios/LeanOn/Storage/record-schema.swift:279` | Exercise/intake IDs still in trash cannot be silently recreated. |
| `apps/ios/LeanOn/Storage/record-schema.swift:135`, `apps/android/app/src/main/java/com/zzzode/leanon/data/DailyRecordsSchema.kt:38` | Established legacy roots require primary weights/intake arrays before optional defaults; malformed roots cannot become empty journals. The new iOS byte-preservation fixture at `record-transaction-tests.swift:86` passed in the final 138-test run. |
| `apps/ios/LeanOn/Storage/RecordsStore.swift:463`, `apps/ios/LeanOn/Bridge/ServiceRegistry.swift:51` | Gregorian calendar with current time zone; next-day timer and clock/zone/day notifications. |
| `apps/android/app/src/main/java/com/zzzode/leanon/MainActivity.kt:77`, `:244` | Active minute-boundary refresh plus date/time/zone receiver and foreground refresh. |
| `packages/pages/src/state/record-mutation.ts:47`, `packages/pages/src/App.tsx:189`, `:259`, `:272`, `:303` | Frozen request-order guard retains current today/hour/streak when a later presentation arrived during an equal-revision RPC; new native events can legitimately move the clock backward. Baseline 235 controlled clock/foreground cases passed; a delayed RPC race and natural midnight were not injected in UI. |

No additional P0 was found in the reviewed ordinary JSON-envelope path.
Android `JSONObject` parsing is permissive for some nonstandard JSON syntax; transport-generated JSON is standard and domain validation remains strict, but arbitrary direct malformed envelopes are a separate parity hardening boundary.
The deletion-receipt corruption finding is source-resolved in all three validators: core `records/validation.ts:157–170`, iOS `record-schema.swift:410–430`, and Android `DailyRecordsSchema.kt:163–205`.
Live tombstones now match the originating delete receipt's token/revision/kind/ID, delete receipts retain undo tokens after restoration, and non-delete receipts cannot carry undo tokens.
The reviewer verified the source; core's 83-test executed pass at 17:52:54 UTC is in `/tmp/leanon-receipt-link-core-tests.log`.
The final iOS 138-test and Android 154-test runs include missing-receipt/revision/identity corruption and byte-preservation fixtures.

## Baseline 235 checkpoint and scope

Final bundle SHA-256 independently checked: `23593dc3f5eecd295b451d9068aa33d5a3f550d62dceb1961e2b7dc071b636e1`.
It includes the request-order clock fix, deletion-receipt validation, visible food draft date, localized duration, and truthful empty-trash copy.
Intermediate `5bb0923a078ccd93ea791217a5a641f7dddce5bb3f007433d57e7721cba63b9a` was superseded before any final UI pass was claimed.
Current shared typecheck/build/test passed; `/tmp/leanon-daily-workspace-final-tests.log` independently records 307 passing tests at 18:04:47–48 UTC, including pages 81 and core 83.
Preserved `source-checkpoint-pre-p1.json`, refreshed at 18:31:52 UTC, pins baseline bundle 235 and canonical file-array SHA-256 `6fe1334390f8095397500f825565e94b0cac0267c4989b4005934ee883c8065b` with its hash input recorded.
Only four final Android documentation files changed from the prior checkpoint; app and test source hashes remain unchanged.
Subsequent actual iOS legacy save/error/retry testing found a product blocker: a background failed read sets global load error while the editor remains open; after the isolated store is recovered, Save stays blocked and global Retry is hidden behind the modal.
The page owner implemented a narrow validated re-read before retry, preserving the original operation ID and expected revision without automatic rebasing.
The reviewer checked `state/record-mutation.ts:67` and `App.tsx:305`; malformed recovery data never invokes mutation, and a newer recovered revision still produces an explicit conflict with the original request.
`/tmp/leanon-daily-calendar-recovery-tests.log` independently records 10 passing scoped tests at 18:03:54 UTC, including both clock fixtures and both new recovery fixtures.
Candidate 827 remains rejected; final 235 includes the source/unit fix and passed observable failure recovery on both platforms.
The matching native identities and actual manifests below establish the tested closure; unverified matrix rows remain outside it.

| Final evidence slot | Required result / current state |
|---|---|
| Shared | Final 235: 307 tests passed in `/tmp/leanon-daily-workspace-final-tests.log`, including pages 81; refreshed source checkpoint above independently verified. |
| iOS native | 138 tests passed with zero failures in `/tmp/leanon-daily-ios-unit-final-138.log` and paired `.xcresult`, including strict legacy-root and receipt linkage. Binary SHA-256 `57d73ccdacea1f078fe88cbae8fb8161446022d5d08745b6843d7a3b0e507a09`; unit run staged intermediate 5bb, actual UI must stage candidate 235. |
| Android native | Independently aggregated 26 XML suites: 154 tests, zero failures/errors/skips. Final APK SHA-256 `35dd007aff2e99630a1dd23995ea25c9911cb144570bd495cdc588d26986399f`, matching bundle 235. |
| iOS actual UI | Eleven unique cases pass: initial 7 selected passes, targeted 2 legacy-recovery passes, targeted 2 Chinese-setup passes; 59 selected original PNG hashes independently match. Raw initial failures remain preserved. |
| Android actual UI | Android 15 / API 35 `sdk_gphone64_arm64`, 1080×2400; seven actual groups pass with stated coverage, 69 original PNG hashes independently match. PID 31870→force-stop/no PID→31946, persisted rev13→actual restore rev14/same exercise ID. |
| Shared delivery | Root saved bundle-366 setup overview `libfile_1d0b1f2fb44c8191a26aaa021d9158eb` and actual history overview `libfile_ccd09424db488191bf162f163dff9857` to Library; they are prior-checkpoint evidence, not final-candidate reports. |
| Final delivery | Root saved the final actual overview to Library ID `libfile_8afdcad7744c819198fcc09596aad501`. |

Candidate-235 iOS initial evidence: `/tmp/leanon-daily-ios-evidence/recovery-final-235/initial-run/evidence-manifest.json` pins binary `57d73ccd…`, UI runner `29e16fba…`, three iOS 26.5 simulator destinations, screenshots and record attachments per case.
The reviewer inspected the Chinese/light corrected-weight image (2026-10-02, 79.5 kg) and Chinese/dark restored-meal image (2026-10-03, dinner, 150 g, 195 kcal).
The four initial failed cases remain preserved; qualified runners `29e16fba…`, `0bc18fca…`, and `621406fe…` correspond to the initial, error-rerun and exact-setup manifests.
Final `/tmp/leanon-daily-ios-evidence/recovery-final-235/evidence-manifest.json` selects all 11 passing unique cases and 59 original PNGs; the reviewer also inspected the recovered 400 kcal legacy total.
Same-modal recovery after 65 seconds of corrupt exposure is observable; the internal periodic-read flag remains inferred because the background notice is hidden from accessibility by the modal.
Android final `/tmp/leanon-android-daily-recovery-qa/evidence-manifest.json` pins all seven groups, 69 PNGs, APK/instrumentation hashes, restart proof and QA scope.
Android's original synthetic app-files hash remained unchanged; only disposable cache records were written, no OS date/time/timezone changed, and cleanup is a session receipt rather than an available final screenshot.
P1 follow-up: the Android form error is initially below the viewport; the reviewer inspected `visible-error-body-scroll.png` with Oct5 / 175 g and visible red save error.
Place failed-save feedback near the fixed Save control or scroll it into view so users discover recovery immediately; no further product edits were made in this batch.

## P1 feedback follow-up

Current candidate SHA-256 independently checked: `ae747dd3bbe6ddac6cf56a5ac4172522784ab2bbc61bfa9ea363c41954443497`.
The observed issue was the intake editor's failed-save feedback initially below the viewport.
`SheetFeedback.tsx:2` now renders the existing localized message in a nonshrinking normal-flow wrapper with an accessible text label, outside the scrolling fields and above the actions.
The same structure is applied to six render nodes; this does not establish every form's runtime coverage or automatic screen-reader announcement.

| Reviewed render node | Current source anchor | Source result |
|---|---|---|
| Profile setup/edit | `components/ProfileSheet.tsx:192` | After body scroll, before actions |
| Weight entry | `components/WeightSheet.tsx:113` | After body scroll, before actions |
| Exercise entry | `components/ExerciseSheet.tsx:187` | After body scroll, before existing estimate guidance/actions |
| Intake entry edit | `components/IntakeEditSheet.tsx:46` | After body scroll, before actions |
| Weight/water/exercise record edit | `components/RecordEditSheet.tsx:90` | After body scroll, before actions |
| Legacy aggregate edit | `components/RecordEditSheet.tsx:127` | After body scroll, before actions |

`App.css:1462`, `:1478`, `:1481` and the generated literal theme styles retain a shrinking scroll body and nonshrinking actions.
Compared with the frozen 235 file hashes, the changed existing files are those five sheet components and both native UI test harnesses; the new shared feedback component is added.
The P1 `source-checkpoint.json` refreshed at 18:59:19 UTC records 402 files, canonical file-array SHA-256 `89badea701ad3e027cd79b001d9d74975f5cc320832fa738558d0afdf3b74122`; all 402 file hashes and the eight-path difference from the preserved baseline were independently checked.
The Android harness correction explicitly identifies standard finger/touchscreen events so Gboard does not classify the test action as handwriting; it changes no product code.
`App.tsx`, bridge/core contracts and all native transaction/store sources remained byte-identical at this check: operation IDs, expected revisions, receipts, mutation payloads and recovery behavior are unchanged.
The new full workspace logs `/tmp/leanon-daily-p1-workspace-{typecheck,build,tests}.log` pass; the test log independently records 307 passing tests at 18:37:54–55 UTC, including pages 81.

| P1 acceptance | Current evidence/status |
|---|---|
| Error visible without body scroll | Passed four actual Android intake-editor cells: light/dark × IME closed/bottom-docked numeric IME open. All four images individually inspected. Other keyboard configurations and whole-form visibility are unverified. |
| Draft retained; Retry and Cancel remain usable | Passed actual Android same-modal exact-repair Save: 180 g at revision 15, then retained 195 g at revision 16; dark 190 g Cancel leaves revision-15 file byte-identical. |
| Legacy failed-write/read recovery regression | Passed two bounded iOS cases: English/light 146.393 s and Chinese/dark 147.061 s; 0 failures/skips. Pre-scroll error is visible above Cancel/Save with a retained 400 kcal draft and IME closed. No iOS IME-on claim. |
| Remaining sheets / whole daily-life suite | Four other render nodes are source-reviewed only; each platform exercised one form. Baseline 235's eleven iOS cases and seven Android groups remain historical evidence, not new-bundle reruns. |
| Accessibility | Accessible label is source-reviewed; VoiceOver/TalkBack announcement and enlarged-text behavior unverified |

`FoodSheet` and other catalog/new-meal flows are outside this six-node patch and have not been classified as newly fixed or defective from structure alone.
The iOS P1 manifest `/tmp/leanon-ios-p1-feedback-evidence/evidence-manifest.json` has SHA-256 `887e4de79d36317629adb24bd811f1f4df220d75c53803a1ace7c72dd77a43b1`; all 14 official PNG hashes and four before/final record-attachment hashes independently match.
It pins iPhone 17 Pro / iOS 26.5 (23F77), native binary `57d73ccd…`, bundle `ae747dd3…` and runner `da625798…`.
Both official pre-scroll images were individually inspected; `daily-life-ui-tests.swift:254`–`:260` asserts feedback frame/hittability before the later draft scroll.
The test log `/tmp/leanon-ios-p1-feedback-ui.log` proves Cancel, failed-write draft retention, same-sheet recovery and explicit read-error Retry; the background poll trigger remains inferred, as in the baseline.
Cleanup receipt records the isolated QA app absent and unchanged normal-app hashes without reading its contents or requesting OS permissions.
The Android P1 manifest `/tmp/leanon-android-bounded-p1-qa/evidence-manifest.json` has SHA-256 `964d114dad7314b1e0f58865e861bf01173c1365f5fd02a675495008ac0021fe`; all 53 PNG hashes match, including four authoritative cells and 49 supporting/diagnostic captures that are not additional passing cases.
All four matrix metadata hashes, three closure capture/metadata pairs, and Cancel's byte equality were independently checked.
The manifest pins Android 15 / API 35 / `sdk_gphone64_arm64`, zh-CN, 1080×2400; APK SHA-256 `eac3243490dbe725a83da2595d34130917db88efda8ebdf39f5bad255fc4a74c` and its embedded `ae747dd3…` bundle independently match.
IME-closed cells used runner `e4bc51f1…` / PID 32703; docked-open cells used corrected runner `37e9e2d2…` / PID 2629; both runner APK hashes independently match.
Save closes the IME; the two IME-open images refocus the same failed 195 g draft without changing its value or swiping the form body, then switch appearance in the same modal/process.
Replacing only disposable cache state with `{}` tests store-unavailable handling, not an actual disk outage; exact repair and Save preserve entry/date/meal and persist 253.5 kcal at revision 16.
Original `.uiqa` app-files hashes remain unchanged; the production Android store was not accessed, original keyboard settings were restored, and only the QA app was stopped.
The bounded P1 runtime rows are closed with matching manifests; the root owns final report and Library replacement.

## Completion gate

The specified local core is closed on final 235 with the evidence above; remaining matrix boundaries are explicitly outside that pass.
Natural active midnight, all six-screen exceptional states, full VoiceOver/TalkBack/Back behavior and physical integrations remain unverified.
Record provider/device-only boundaries explicitly; account login and partner synchronization remain outside this local closure unless separately implemented and verified.
