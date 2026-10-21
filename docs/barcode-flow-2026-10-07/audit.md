# Barcode recovery: source audit

[简体中文](audit.zh-CN.md)

Reviewed on 2026-10-07 against `main`, HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`, with implementation changes still uncommitted and being written concurrently.
This audit reads current source; it does not establish that any screen, permission prompt, camera frame, network state, or persistence failure was observed at runtime.
No product source, tests, simulator data, or user records were changed by the audit.
The initial page freeze at 02:07 UTC was superseded after the main task found native interaction defects.
This audit re-read the 02:20 UTC follow-up and the 02:30 UTC feedback freeze, including topmost Back, amount prefill, focus/resize reveal and native-prefill error retention.
The audited rebuilt bundle is `3a598649f5f5ed6b02929cb351677a05579c0d6da894e191f0305b13a3f7a134`; its local SHA-256 was independently read.
Line references below identify that working-tree version; final native retest results remain the main task's responsibility and are unknown to this audit at refresh time.

## Findings delivered to owners

| Finding | Impact | Current source status and evidence |
|---|---|---|
| iOS accepted a nonempty first Code 128 value and returned compressed UPC-E without expansion. | Invalid frames ended a scan; a valid UPC-E could be rejected or use the wrong product identity. | Owner corrected candidate filtering and expansion: `apps/ios/LeanOn/Scanner/barcode-scan-view-controller.swift:103`, `product-barcode.swift:5`, `product-barcode.swift:21`. Runtime and native test results belong to the final validation. |
| iOS network and scanned-food persistence endpoints accepted arbitrary food-ID strings; Android already enforced GTIN validation. | Direct native calls could create identities the shared page rejected. | Owner added canonical validation at `apps/ios/LeanOn/Net/open-food-facts-client.swift:42` and `apps/ios/LeanOn/Modules/HealthModule.swift:133`. The internal store API remains permissive for existing records. |
| Android accepted all-zero GTINs; shared TypeScript rejected them. | Decoder and page disagreed on what constitutes a product. | Owner added the zero rejection at `apps/android/app/src/main/java/com/zzzode/leanon/scanner/ProductBarcode.kt:7`. |
| Sheet-level import close protection did not cover global native dismissal. | Dismissal during an already-started catalog import could hide the outcome while persistence completed. | Owner added operation-gate import protection: `packages/pages/src/App.tsx:149`, `packages/pages/src/state/scan-food.ts:107`. This imports a food into the catalog; it does not log an intake entry. |
| A repeated lookup of the same existing product did not change effect dependencies after returning to the list. | The second lookup could close the barcode sheet without opening portion review. | Owner added an explicit selection version: `packages/pages/src/App.tsx:480`, `packages/pages/src/components/FoodSheet.tsx:200`. |
| Catalog/favorite refresh reapplied the original selected food and 100 g portion. | A user-edited portion could silently reset during the same form session. | Selection tokens are now consumed once: `packages/pages/src/state/food-selection.ts:6`, `FoodSheet.tsx:198`. A new barcode result has a new version; unresolved selections can still wait for catalog arrival. |
| Editing an imported food omitted micronutrients from a replacement RPC. | Renaming the food could zero its existing fiber, sugar, saturated fat and sodium. | The form now preserves those unexposed fields: `packages/pages/src/state/food-edit.ts:14`, `FoodSheet.tsx:344`, `App.tsx:416`. |
| An unqualified OFF serving quantity became a gram default. | Unknown units could be assigned a mass meaning contrary to RFC 0033. | New imports now require an explicit gram unit or a known mass serving description: `packages/food-data/src/barcode.ts:49`. Old persisted foods are untouched. |

These fixes were re-read in source; none is reported here as a runtime pass.

## Native follow-up supplied by the main task

The main agent reported the following observations on candidate bundle `ab4981135d7f08e837b7575020b5db8ed2a83ade2fe9aa8715e70493ab088054`.
This is the historical candidate hash supplied by the main agent; [source-checkpoint.json](source-checkpoint.json) is maintained by the main task for the current checkpoint.
The auditor did not run these native interactions or independently capture their screenshots.
The observations below are attributed to the main task; the fix assessment is source-only.

| Evidence type | Finding and impact | Follow-up frozen source |
|---|---|---|
| Main-agent Android observation | One system Back from the barcode child closed the whole FoodSheet instead of returning to its parent. This discarded the expected search/draft context. | `App.tsx:148` dispatches through `state/modal-dismiss.ts:11`; `BarcodeLookupSheet.tsx:44` synchronously cancels its operation and closes the child, and `:45` registers/unregisters that handler. `FoodSheet.tsx:953` passes the registration through. The controller prioritizes blocked imports and protects newer handlers from stale cleanup (`modal-dismiss.ts:7`). |
| Main-agent iOS observation | With the numeric keyboard open, the Amount field was covered by the footer; a second tap hit a close action. | Amount precedes Meal (`FoodSheet.tsx:797`, `:817`); its target has `flatten={false}` at `:798`. Focus calls `scrollIntoView` with center/start/none (`:142`, `:806`), and detail-scroll height changes reveal the field again only while focused (`:148`, `:766`). Actual keyboard hit targets and visibility require the main task's rebuilt native retest. |
| Source diagnosis, not an independently observed UI failure | Prefill used `selected.defaultGrams` while the portion state could be forced to 100 g for a barcode review. A product with an 80 g default could show 80 while nutrition used 100. | `FoodSheet.tsx:232` now calls `setValue` with the current `grams`, matching the portion calculation at `:210`. The native display must still be checked on the new candidate. |

The topmost handler intentionally closes only the barcode child; a later Back after child cleanup can close its parent.
The portion reveal change is narrowly scoped to the focused field and actual viewport-height changes, with no repeated timer or record mutation.

## Native-prefill feedback follow-up

On candidate `a2c05ca4783880224c8b0ea93a4a5d3351e4e6877a835cf23d5235781dd2dde8`, the main agent reported that a real missing-product/404 lookup lost its visible error, while the same button successfully looked up another known product.
This evidence does not support a diagnosis that the tap failed.
The auditor did not execute those interactions.

The Android SDK bytecode supplied by the page owner and read by this audit shows `setValue` calling `Editable.replace` (`/tmp/leanon-input-bytecode.txt:1694`, `:1766`).
The registered TextWatcher emits a Lynx `input` event containing the text (`/tmp/leanon-input-watcher-bytecode.txt:18`).
The old input handler unconditionally cleared the lookup error after programmatic barcode prefill.
This connects the native event path with the observed lost feedback; it is a source/SDK diagnosis supported by the main task's observation.

The frozen fix first synchronously records the normalized barcode and error in a ref, then invokes native `setValue` (`BarcodeLookupSheet.tsx:23`, `:29`, `:56`).
The matching programmatic input retains the failure/retry state; a changed barcode clears it (`state/barcode-feedback.ts:13`, `BarcodeLookupSheet.tsx:74`).
Manual lookup uses the latest ref value rather than a potentially stale render closure (`BarcodeLookupSheet.tsx:53`).
Two event-sequence regressions cover unchanged prefill and normalized UPC prefill followed by a real edit (`state/barcode-feedback.test.ts:4`, `:12`).
The fix is source-reviewed and automatically tested; final native behavior on `3a598…` is not asserted here.

## Contract, nutrition, cancellation and compatibility

- Native preflight returns `{cameraAvailable, permission, hostAvailable}`; reading it must not request permission or open the camera (`packages/bridge/src/contracts.ts:37`, `:279`; iOS coordinator `:55`; Android ScannerModule `:21`).
- Camera, product lookup, catalog import and intake logging are distinct operations (`contracts.ts:246`, `:280`, `:284`; `packages/pages/src/state/scan-food.ts:65`).
- Manual lookup normalizes a GTIN without calling a camera API (`scan-food.ts:41`).
- UPC-A is normalized to its leading-zero EAN-13 identity; a known legacy `off-<12 digits>` entry is reopened by its existing ID (`scan-food.ts:46`).
  No ID rewrite, favorite/recent remapping, deletion or migration is performed by this path.
- Both hosts return raw OFF product data; shared TypeScript owns kcal/kJ, sodium/salt and portion conversion (`packages/food-data/src/barcode.ts:60`, `:80`, `:98`).
  The request includes serving/product units on both hosts (iOS client `:37`; Android client `:71`).
- Explicit volume metadata is rejected rather than treating 100 ml as 100 g (`barcode.ts:102`).
  The UI opens a 100 g review instead of silently trusting a serving size (`App.tsx:481`).
- Native lookup timeouts are eight seconds; the shared read-only deadline is fifteen seconds (`scan-food.ts:30`; both OFF clients).
  A late read-only response cannot resume the discarded import path.
- Sheet pending references prevent repeated taps; cancellation revisions suppress old UI results (`packages/pages/src/components/BarcodeLookupSheet.tsx:34`, `:44`).
  The helper checks cancellation before persistence (`scan-food.ts:62`).
  App request ownership prevents an older cancelled operation from releasing a newer import lock (`App.tsx:458`, `:488`; `scan-food.ts:112`).
- Native scan completion is single-flight: iOS coordinator `:42`; Android launcher `:19` and frame gate `ProductBarcodeDecoder.kt:10`.
  Actual cancel/back/background lifecycle behavior still needs native validation.

An open food draft retains its date when catalog import advances the storage revision (`packages/pages/src/state/record-mutation.ts:37`).
Intake save explicitly uses the captured draft date (`App.tsx:330`), and `FoodSheet` retains meal selection in local state across its nested barcode overlay (`FoodSheet.tsx:123`).
The food-list query survives child cancellation in the reviewed source; successful product selection clears it to enter portion review (`FoodSheet.tsx:205`).
The original Android Back observation above disproved an initial claim that all native Back paths already preserved it; the follow-up needs its own runtime result.
These are source-reviewed relationships, not runtime continuity passes.

Two model limitations remain separate from the recovery fixes: missing nutrient values become numeric zero (`barcode.ts:75`), and products with absent nutrition-basis metadata cannot be proven mass-based solely from a `_100g` property name.
Unknown nutrients are not proven zero; known volume products are rejected, but unknown metadata is not equivalent to verified mass metadata.
A fuller solution needs explicit nutrient completeness/basis metadata and UI treatment; the present source does not provide those guarantees.
The default-serving issue above is fixed in source and is not an unresolved model limitation.

## Visible unavailable-entry inventory

| Entry | Current root cause | Scope of a usable solution |
|---|---|---|
| Barcode camera | Device camera, permission, active host, or missing host capability. | Existing native chain plus recovery UI; manual lookup remains independent. No account service needed. |
| Barcode lookup/import | Network/service response, product absence, missing usable energy, volume basis, persistence error, or older host capability. | Existing local chain; preserve barcode and offer retry/search/manual creation. |
| Me dietary preferences | Always read-only, no handler (`MeScreen.tsx:35`); no dietary-preference field or RPC in the current profile/records contract. | Medium local feature: define semantics, persist preferences, apply filtering, handle unknown food attributes. Avoid promising allergy safety from incomplete catalog data. |
| Me data/export | Always read-only, no handler (`MeScreen.tsx:36`); no export/share RPC. | Medium local feature: complete versioned snapshot or documented CSV, native file/share destination, failure/cancel states and sensitive-data handling. It does not inherently require sign-in or cloud backup. |
| Partner linking/messages/sharing | Explicit local-only screen (`PartnerScreen.tsx:11`, `:15`); no partner/account/link/share contracts. | Large new capability: identity, reciprocal consent, authorization, synchronization and conflict/privacy design. Merely enabling a button cannot implement it. Local ideas/settings already work without claiming messages were sent. |
| Health connection | Missing advertised host methods or device-level HealthKit/Health Connect support/permission. | Existing platform integration; distinguish unsupported device from denied/unknown permission and temporary sync failure. |
| Reminders | Missing notification methods or permission, load/persistence failure. | Existing local/native chain. Owner corrected the inconsistent partial-host gate: Me and Settings now use the complete method group (`state/capabilities.ts:23`, `MeScreen.tsx:34`, `App.tsx:595`). Advertised methods do not prove device permission or provider operation. |
| Connected scale | Missing native methods, Bluetooth status/permission, no discovered device, connection/subscription error. | Existing BLE chain; hardware verification is separate from simulator UI. Owner corrected scan-only gating to the complete group (`state/capabilities.ts:24`, `MeScreen.tsx:33`). Advertised methods do not prove a real scale connection. |
| Record/profile/water save | Missing `records.mutate`, journal refresh failure or an explicitly unavailable safe estimate. | Existing local record service/capability recovery; do not invent a weight or enable unsafe guidance to remove the empty state. |

The full current iOS and Android capability registries advertise scanner, food, record, reminders, health-provider and scale methods.
The conditional unavailable branches therefore cannot be equated with "not implemented" on these hosts without checking the actual installed build and device state.
`review.unavailableBody` is a broad fallback, not a diagnosis of every failure.

## Final validation coverage required

The page owner supplied the interim `/tmp/leanon-scanner-pages-tests.log` (24 targeted tests passed) and `/tmp/leanon-scanner-bridge-tests.log` (14 passed), and this audit read the logs.
The follow-up owner log `/tmp/leanon-scanner-p1-tests.log` reports 26 targeted tests passed at 02:20 UTC, including two modal-dismiss cases; `/tmp/leanon-scanner-p1-typecheck.log` contains the successful page typecheck invocation.
The feedback owner log `/tmp/leanon-barcode-feedback-tests.log` reports 28 targeted tests passed at 02:30 UTC; its typecheck log was also read.
Earlier main-task workspace checks passed 331 tests for `ab498…` and 333 for `a2c05…`; those checks did not establish native UI acceptance and are interim for the current source.
For bundle `3a598649f5f5ed6b02929cb351677a05579c0d6da894e191f0305b13a3f7a134`, the main task reports build → typecheck → 335 TypeScript tests passed; this audit read all three `/tmp/leanon-scan-workspace-recovery-{build,typecheck,tests}.log` files and confirmed the package summaries.
The counts are Pages 101, Bridge 47, food-data 42, core 83, i18n 18, data 14, delivery 23 and exercise-data 7, with no reported failed tests.
The bundle hash also matches the audited local output.
These are owner/main-task executions, not this audit's own test execution.
The current build and automated checks pass; final native reruns are still in progress and unknown here, and the successful TypeScript checks do not prove them.

| Area | Source audit | Required runtime/automated evidence from main task |
|---|---|---|
| Camera status and permission | Reviewed across TS/iOS/Android. | No camera, first request, denied/restricted, authorized, detached host; status read must not prompt. |
| Decoder | Reviewed normalization, UPC-E expansion and result gates. | Valid EAN/UPC frames, invalid/unreadable frames keep scanning, repeated frame resolves once. Physical-camera behavior is separate from bitmap tests. |
| Recovery | Reviewed distinct errors, barcode retention and the native-prefill feedback fix; event-sequence tests and current workspace tests pass in supplied logs. | New-candidate native missing-product feedback stays visible with retry; genuine edits clear it. Also invalid check digit, timeout, offline, HTTP/service malformed response, missing energy, volume product and import failure. |
| Cancellation/concurrency | Reviewed revisions, locks and native single-flight. | Cancel/back/background, close during lookup, retry before old response, double tap, protected import and reopening same product twice. |
| Nutrition/legacy identity | Reviewed conversion and legacy alias path. | Fixed kcal/kJ/sodium/salt fixtures, mass vs volume, old UPC ID remains usable with favorites/recent intact, catalog import does not log intake. |
| Native page continuity | Main-task `ab498…` failures are attributed above; not observed by this audit. Follow-up handling is source-reviewed only. | New candidate hash and native retest: one Back preserves the FoodSheet/query/date, focused Amount remains visible and editable, displayed grams match computation, keyboard and safe area, Chinese/English and dark/light. |

Do not turn this source audit into a screenshot or device-test claim.
Main-task final reporting should distinguish source-reviewed, automated-pass, native-runtime-pass, physical-device-only and blocked states.
