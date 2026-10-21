# LeanOn barcode recording: implementation and native verification

[简体中文](leanon-barcode-report-20261007.zh-CN.md)

2026-10-07 · `main` · HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`.
This is an uncommitted working tree including earlier parallel changes, not a clean build of that HEAD.
Implementation follows the user's subsequent request to make unavailable features work; the earlier design review is retained separately.
The approved tab bar and existing themes remain in place.
Remote `origin`: `https://github.com/Zzzode/LeanOn.git`.
No commit, push or overwrite of parallel work occurred.

## Observed causes

1. Both native hosts already implemented scanning, OFF lookup and product import.
   The old page launched the camera directly and lacked manual barcode input or recovery when camera, permission or host support was unavailable.
2. Bridge transport discarded native `details/retriable`, while the helper merged different failures.
   Android malformed OFF responses were also treated as missing products.
   Subsequent Android UI verification exposed same-value native barcode prefill clearing failure feedback; SDK bytecode and real lookup support this cause.
3. The actual installed normal iOS binary and page bundle on this Mac are older than the working tree.
   Only artifact bytes were read; the app was not launched and records were not read.
   This does not establish the cause on the user's unknown device.
4. The iOS simulator explicitly has no camera; Android QA camera permission was never requested.
   Physical camera and permission tests require separate authorization and a suitable device.
5. Native UI verification found Android Back closing the whole food sheet and an iOS numeric keyboard obscuring the amount field.
   The first `ab498113…` candidate passed three iOS UI cases and failed one; finding a product did not prove meal saving.

## Implemented changes

- Read-only camera, permission and host preflight, plus independent manual barcode lookup.
  Only an explicit camera action can request permission; manual lookup does not open a camera.
- Separate camera/permission/host/capability errors from offline, timeout, response, missing product, missing energy, volume basis and persistence failures.
  Keep the barcode and offer retry, food search and manual creation.
  Same-value native prefill retains errors and retry; only an actual barcode edit clears feedback.
- Validate GTIN-8/12/13/14, reject all-zero codes, normalize UPC-A and expand UPC-E.
  Filter invalid frames and gate duplicate delivery; preserve existing 12-digit UPC product identities.
- Send only public product codes to OFF.
  Convert kcal/kJ and sodium/salt in pure TS, reject explicit volume basis rather than invent density, and do not treat unknown serving units as grams.
- Separate lookup, catalog import and meal recording.
  Cancelled or stale reads cannot import; active writes block dismissal; the same product can be selected again.
  Catalog/favorite updates do not reset portions, and name edits retain unexposed micronutrients.
- Preserve the record's original date and meal.
  Confirm products at 100 g before the user changes portion and saves.
  Form continuity fixes use supported native Lynx scrolling APIs.

See the [source audit](audit.md) for contracts, source lines and qualified findings, and [RFC 0033](../../rfcs/0033-barcode-recovery-and-product-units.md) for the design decision.

## Build and verification limits

Final shared bundle SHA-256: `3a598649f5f5ed6b02929cb351677a05579c0d6da894e191f0305b13a3f7a134`.
Workspace build → typecheck → **335 TS tests passed** (Pages 101, Bridge 47, food-data 42); `git diff --check` passed.
**170 Android native unit tests** and **36 targeted iOS native tests** passed before subsequent page/harness-only changes; no claim is made that all native tests were repeated.

| Actual execution | Result | Identity / evidence |
|---|---|---|
| iOS: English light / Chinese dark, read-only no camera, invalid code, cancel preserving search draft | Four UI cases all passed in one final run, zero failures. | Native `6487dea3c5582ef63bb158ad025d8a12d61227258c0ed623250a56dab4e67ee3`; UI plugin `6981d55909df7cdfd5d48a01b801f695a1c395e470eb06540a890343aa67c14b`. |
| iOS: real missing product, manual-create cancel, real product→portion→historical lunch→restart | Focused 100 g field fully above actions; second tap changed to 150 g; saved 2026-10-03 lunch, 809 kcal; same ID and byte-identical JSON after restart. | Captures 02:32:53–02:34:42 UTC; XCTest logs and per-screen manifest archived. |
| Android: Chinese light, read-only preflight, one Back, real missing product and retry | Four bounded UI flows passed: real loading, one Back retaining `nut`/2026-10-05, missing-product error/retry retained, and manual-create cancel without a record; three final camera-free Instrumentation checks passed. | APK `cae8ecc33b0783bc274b1de295b921f94b8c38dded8d05285b3ecf1d47380499`; runner `83c5e621805dc11e8d5274aea5071a18a45f2e99545e59be5c7eda7a7c365bce`. |
| Android: final bundle real product→150 g lunch→save→restart | Saved 2026-10-05 lunch, 150 g, 809 kcal; force-stop confirmed no PID, then a new process reopened the same ID/revision 2/file SHA. Nutella, 150 g, Lunch and 809 kcal are visible. | Both final Android sessions, process boundaries and per-screen manifest archived; original QA file SHA remains `bf2eb866a8d4011f4329d5f50eee9b587c8821c969606172cae4dd8b208c088b`. |

809 kcal follows existing integer rounding in `portion.ts:29` (539 × 1.5 = 808.5); model precision was not changed.
The intermediate `a2c05…` iOS test incorrectly expected 808.5 and failed after saving; after correcting that expectation the focused case passed, and all four final `3a598…` cases passed.
The intermediate Android feedback-loss observation and one harness swipe-parameter error remain diagnostic evidence, not final acceptance.

The first candidate bundle SHA-256 was `ab4981135d7f08e837b7575020b5db8ed2a83ade2fe9aa8715e70493ab088054`.
That candidate passed workspace build, typecheck and 331 TS tests, 170 Android native unit tests and 36 targeted iOS native tests.
These results do not validate the subsequent Back/layout fixes or constitute acceptance of a newer bundle.
The first typecheck read stale i18n declarations before build regenerated them; the subsequent build→typecheck passed, with the earlier failure log retained.

Real public lookup returned Nutella at 539 kcal/100 g for `3017620422003`; `96385074` returned HTTP 404/status 0.
Both actual native clients were exercised, without a canned product response; final save/restart verification is recorded above.
Actual Android MLKit decoding of generated EAN pixels delivered one result from repeated frames; this is not physical camera evidence.
No OS permission prompt or camera image capture occurred.

Devices: iPhone 17 Pro / iOS Simulator 26.5; Android SDK arm64 / Android 15 API 35 / emulator-5554.
Writes were confined to explicit isolated `.uiqa` test stores; normal app data, user profiles and real records were not changed.
Language, theme and visible-state coverage is defined by evidence manifests, not inferred from source.

## Remaining work and limits

| Entry or limitation | Current state | Decision or verification needed |
|---|---|---|
| Physical camera and OS permission | Native flow changed, separate authorization absent, no real-device acceptance. | Select and authorize a device; test first request, denial/restriction, cancellation/background, invalid/valid codes and duplicates. |
| Offline, timeout, malformed response, import failure | Typed implementation and fixtures. | Fixtures do not prove real disconnected or native failure UI captures. |
| Me dietary preferences | Still unimplemented. | Define local semantics, persistence, filtering and unknown food attributes; do not imply allergy safety. |
| Me data export | No export/share contract. | Choose CSV or a complete versioned snapshot, destination and handling of sensitive data, then implement local file/native sharing. |
| Partner | Local mode; no pairing, account or sharing backend. | Decide identity, mutual consent, authorization, sync and conflicts; no pretend cheer or login completion. |
| Health, reminders, scales | Existing native services; complete method-group capability checks. | Actual provider permissions, devices and scale hardware require separate acceptance. |
| Nutrition completeness | Missing values still become numeric zero; complete nutrition basis metadata is absent. | Unknown is not measured zero; a model/UI extension is needed to guarantee basis for every OFF product. |

For preferences, start with local tags and filtering, with explicit behavior for unknown food attributes.
For export, start with separate CSVs by record type and a native share destination chosen by the user; a restorable backup would require a versioned snapshot format.
For Partner, establish identity and mutual authorization in an RFC before choosing a sync service.

For old Android installations without an earlier permission-request marker, public APIs alone may not fully distinguish historical permanent denial; actual device state is needed.

The normal installed iOS app remains older; this round verifies isolated QA builds.
Source completion does not mean the user's installed app was updated.
Real-device acceptance requires the user to identify iPhone or Android and device/OS version, and separately authorize requesting camera permission and capturing fixed public barcodes; no photographs or health records are uploaded.

## Evidence

A P2 visual issue remains: English Breakfast wraps across two lines in the meal choices; this round did not expand into a full redesign.
The iOS post-restart screenshot shows the historical date and 809 kcal; the food row is below the viewport, with its presence verified by native accessibility and persistence assertions.

Original native pixels are retained; the overview only scales them proportionally with captions outside captures.
The archive includes artifact identities, screen manifests, run logs, tests, failed-candidate diagnostics and per-file SHA-256.
It excludes real health records, camera photographs, application binaries and invented captures of unexecuted states.
Native Library identities are recorded from successful publication receipts in `library-delivery.json`.
