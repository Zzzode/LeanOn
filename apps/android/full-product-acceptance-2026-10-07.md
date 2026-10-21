# Android private-data and companion acceptance

English · [简体中文](full-product-acceptance-2026-10-07.zh-CN.md)

This is separate from the earlier daily-journal, theme and barcode acceptance records.
All runtime fixtures use the debug `com.zzzode.leanon.uiqa` application and disposable cache directories.
The production application was not started, and no OS permission, camera, photo/document picker or real health provider was operated.

## Implemented boundaries

- `personal.*` validates versioned preferences, measurement and sanitized-photo mutations, preserves explicit JSON nulls, and atomically stores metadata plus JPEG bytes with operation receipts.
- Keystore wraps random collection keys; existing plaintext records and export ledgers are read-compatible and encrypt on the next successful explicit write.
- Backup validates the entire payload before preparing writes; inspection is read-only and expires after five minutes, restoration checks both revisions and uses authenticated, recoverable transaction pieces.
- Companion merge commits health collections and prepared encrypted cursor metadata in the same journal, checks both captured revisions, and preserves the merge model's single revision increment.
- Local data deletion invalidates queued health commits, durably disables automatic Health Connect import, clears its completion timestamp and deletes only this namespace's derived ledger and wrapping keys.
- Preview caches support simultaneous images, bounded deduplication and independent partner revocation; foreground/background events and generation leases prevent old requests from recreating cleared plaintext files.
- Photo rendering uses the matching official Lynx 3.9 image service and Fresco 2.3, behind current issued preview URI, generation, digest, canonical-child and foreground checks at request and delivery.
Disk, encoded and bitmap caches are disabled; cleanup revokes capabilities before unlinking and reports failure.
The SDK image-service bytecode requests full resolution, so an injected JPEG decoder caps encoded input at 20 MiB and sampled pixels at 4,194,304; stored canonical JPEG bytes are preserved.
Cleanup failure blocks new preview issuance until successful foreground cleanup, and modal RPCs return `unavailable` while releasing their ownership safely.
- Android font scale is applied through the supported Lynx SDK; full TalkBack interaction remains a separate device acceptance boundary.

## Checkpoints

| Checkpoint | Actual evidence | Qualification |
|---|---|---|
| Final bounded image host build | 224 JVM cases: 223 passed, one opt-in HTTP case skipped; zero failures/errors; debug, Android-test and release APK builds passed | `/tmp/leanon-android-full-product-final-bounded-image-build.log`; frozen binaries `final-bounded-3bbe` |
| Personal native device run | Fourteen real Keystore/JCA/Bitmap and image authorization checks passed on API 35, including Unicode-password interoperability, exact JPEG bytes, ledger migration, local deletion and denied revoked in-flight delivery | `final-bounded-3bbe/personal-native-report.json`; final APK includes bounded decoding and modal cleanup guards |
| Actual personal UI | Final shared bundle: note Save/reopen, Cancel with exact encrypted bytes unchanged, 81 cm measurement edit/Save; 320 dp window with 1.5× Lynx scale preserves focused draft and visible actions | `final-3bbe-isolated/ui`; earlier native checkpoint, unchanged form implementation |
| Actual photo UI | Two generated gray JPEGs rendered; background preview files cleared, stable foreground frame loaded new generation URIs; dark and light images inspected | `final-bounded-3bbe/ui`; eight official actions, two grouped photo cases; stable frames inspected, without an instant-transition latency claim |
| Actual Partner bridge | Configured the sole local relay, registered a fictional account, rendered authorized status and an unchecked named-account preview with seven counts | Nineteen official UI actions in the image checkpoint; attachment consent was rejected before execution and remains unverified |
| Local relay HTTP | Dedicated companion owner reports eleven targeted real HTTP/pure-fixture cases passed | Separate from the routine skipped opt-in case and from cross-native runtime acceptance |
| Cross-native runtime | Specifically approved A/B verification, delivery ACK, revocation and cleanup, plus C deletion recovery after process restart, passed on the fictional local relay | Companion owner stage reports retain their original APK identity; D attachment remains separate |
| Portable backup interoperability | Actual Swift export → Kotlin decrypt/schema/atomic restore and actual Kotlin export → Swift atomic restore passed with exact public JPEG bytes | Public synthetic fixture; original `e039` native checkpoint, unchanged crypto/schema implementation |

The native-069-v2 checkpoint uses shared bundle `069ae69cd5051fbc99b74e250f462562c5395731d25491db868ecb3baa78d695`.
Its APK SHA-256 is `be05c82690bb270856b6f9a2e76b1cf6453407403c6029307f52677a729e9c2e` and runner SHA-256 is `c978e73ea50a23fdee619087935a344f26bab1dd90fc1f3b3ed80a3cbd350809`.
Artifacts are pinned under `/tmp/leanon-android-full-product-2026-10-07/native-069-v2`.
This shared bundle is an intermediate UI checkpoint; final shared UI and its screenshots must have their own manifest identity.

The final evidence manifest, per-image capture UTC/hashes and frozen source checkpoint are under `/tmp/leanon-android-full-product-2026-10-07/final-bounded-3bbe`.
The final APK SHA-256 is `30e04a2acea9807d1f6f039dd44db5fcc8a606fb5b0706787b1e46648e19eff8`; unsigned release SHA-256 is `d35c646e9fc33fee8819f7aad86d914e287c37a632075441e8680cb12fd5d478`.
Earlier `24e9` personal UI and `01b0` Partner UI evidence retain their original binaries and qualifications.

## Evidence limits

Generated gray image fixtures demonstrate pixel sanitization, encrypted storage, byte-preserving backup and preview behavior; they do not demonstrate an OS photo-picker interaction.
Document export/import code uses explicit system document selection, but no actual OS picker delivery is claimed in this run.
Native persistence checks and pure injected failure tests do not substitute for real UI Save/Cancel actions or real provider/hardware acceptance.
The original QA record file remains SHA-256 `bf2eb866a8d4011f4329d5f50eee9b587c8821c969606172cae4dd8b208c088b` before and after the completed personal run.
No raw session credentials, device proofs, invitation secrets or keys belong in the public evidence archive.

The final shared bundle for these UI checkpoints is `3bbe6225013ec611f0cde9c69a614d5ab15250234448f1d8ecf99d190606387d`.
Each native checkpoint keeps its original APK, runner, UTC and screenshot hashes in its own evidence manifest.
No broad gallery permission, real provider access, OS clock/font setting or TalkBack service was changed.
Full read-screen interaction, physical power-loss and large-gallery decode residency stress remain unverified.

The new fictional D account attachment checkbox was rejected before execution, within UTC 07:17:47–07:19:03.
The checkbox alone changes local UI state; a separate submit is required, and neither was executed.
Its preview contained zero weight/water/exercise/meal/legacy rows, one fictional measurement and two generated gray images.
The D account and cache remain retained separately from the specifically authorized A/B/C interoperability cleanup.
