# Code evidence

Paths and lines refer to this uncommitted checkout at HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`.

| Behavior | Source | SHA-256 |
|---|---|---|
| Admission and password hashing | `server/companion-worker/src/auth.ts:79` | `c119782042cdc758beb09cc5c09acce751db0a179f7010697379139e8285c1fd` |
| Normalized schema | `server/companion-worker/migrations/0001-private-relay.sql:11` | `c79d4d3a55a4b1c4d6de84f8642ed070e7f9e22dbb053748107e442ad9b16fe5` |
| D1 CAS guard | `server/companion-worker/src/database.ts:9` | `2890dcbd2b3d395ef62d67282d83f07c239ad212a79700c79022fa1a2499fb9d` |
| Bounded sync and authenticated references | `server/companion-worker/src/sync.ts:19` | `9e791290ea2cc444b092a7ef55f548b984ba732f1a9490192321da4d16f06978` |
| Private immutable photo upload | `server/companion-worker/src/objects.ts:22` | `33b70be7c5bdc2553fad3e6c7747894748d156ac2f9a7f3d2c01c5ecaee97cee` |
| Permanent cleanup fences | `server/companion-worker/src/objects.ts:56` | `33b70be7c5bdc2553fad3e6c7747894748d156ac2f9a7f3d2c01c5ecaee97cee` |
| Durable deletion and receipt | `server/companion-worker/src/deletion.ts:10` | `f62c036a9ed508047aa9e8aa59839a144a425a4e2d8c3bfdae4ae043a81e06e3` |
| Scheduled recovery | `server/companion-worker/src/worker.ts:67` | `c8d98144525d24d4b82775a94c74b8eac25033932b40cb8fca965f61c7ef9570` |
| Checkpointed offline restore | `server/companion-worker/src/admin.ts:35` | `9dcd47badd0eca1c2d8b4aff63f14a59a46c96904e1324adebf088c431979bb2` |
| Authenticated backup and deletion floor | `server/companion-worker/src/admin.ts:54` | `9dcd47badd0eca1c2d8b4aff63f14a59a46c96904e1324adebf088c431979bb2` |
| Android photo protocol | `apps/android/app/src/main/java/com/zzzode/leanon/companion/CompanionPhotoProtocol.kt:9` | `82454cc7c92bed148fc22945b109dbda9a56d9713d04fdf2474a2bf9253c25c8` |
| iOS photo protocol | `apps/ios/LeanOn/Companion/companion-photos.swift:5` | `240759ad9d5057cd66f85d285865c78730eb8cc6a1d2b9301bd793e70b3725bb` |
| Android actual native test | `apps/android/app/src/androidTest/java/com/zzzode/leanon/companion/CloudflareNativeChecks.kt:19` | `054cc3a305a007e0253daee86148d907ea1044ef7760012d9d17efbf2647f82e` |
| iOS actual native test | `apps/ios/LeanOnTests/companion-cloudflare-tests.swift:22` | `d5abe42ff29d6fa8573498e177f2b845acac70e6672ddb806de33b9bdb9ef637` |
| Local actual process profiler | `server/companion-worker/scripts/local-profile.mjs:18` | `a054172318f073c4a34ac3caddb70a8b3ae87f5aff7200e1677e00ee29be5cb7` |
| Staged legacy import | `server/companion-worker/src/admin.ts:157` | `9dcd47badd0eca1c2d8b4aff63f14a59a46c96904e1324adebf088c431979bb2` |
| iOS durable native cutover | `apps/ios/LeanOn/Companion/companion-cloudflare-migration.swift:8` | `a146b12aceb0b7738e837995187cdd885e343df8cfdac69dbfc63555c8e91097` |
| Android durable native cutover | `apps/android/app/src/main/java/com/zzzode/leanon/companion/CompanionCloudflareMigration.kt:25` | `57827594b3befca669ec884c453c14696e8391f24b67bfa76521ab05f79c55b8` |
| Android actual cross-platform partner test | `apps/android/app/src/androidTest/java/com/zzzode/leanon/companion/CloudflareInteropChecks.kt:23` | `b3325274013d8c7591e3eecccfe66a8582e45a9a63636618a802d5473a808910` |
| iOS actual cross-platform partner test | `apps/ios/LeanOnTests/companion-cloudflare-tests.swift:136` | `d5abe42ff29d6fa8573498e177f2b845acac70e6672ddb806de33b9bdb9ef637` |
