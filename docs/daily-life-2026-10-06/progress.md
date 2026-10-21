# Personal daily-life implementation checkpoint

[简体中文](progress.zh-CN.md)

2026-10-06 17:38 UTC · Implementation complete; native button acceptance in progress.
This is an intermediate checkpoint, not a completed acceptance report.

Implemented locally: first personal setup and profile/goal editing, safety-aware tracking, selected-date history/backfill, individual food/meal corrections, weight/exercise/water corrections, deletion confirmation, durable Undo/recently-deleted recovery, revision conflict review and safe retries.
The existing native bottom bar and previous parity work are preserved.
No commit, push or deployment has occurred.

Fresh formal stores are empty.
Migration preserves valid historical records and identifiable legacy daily nutrition totals without inventing meals; reads do not commit upgrades.
Only a successful mutation commits migration, revision, operation receipt and recoverable deletion together.
Native local time/date are authoritative; an opened draft keeps its selected date across refresh and foreground changes.

Executed checks: workspace typecheck/build pass; 300 TypeScript tests, 133 iOS tests and 151 Android JVM tests pass.
Ten successful transactions and three rejected transactions match across the core and both native stores in all sixteen schema fields, including receipts and trash.
These are executed synthetic store tests, not button acceptance.
The 133-test iOS checkpoint predates the final adapter/clock additions; the updated full native suite is still to run.

Final shared bundle SHA-256: `366dc77526603038448f2b0b5f1c0de50661e9898f9196f931b435e194601ea7`.
Branch `main`, HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`; concurrent uncommitted source is part of the build, so HEAD alone does not identify it.
Origin remains `https://github.com/Zzzode/LeanOn.git`.

Android's official runner initialization race is corrected in the test harness.
The first actual Android 15 emulator screenshot has been inspected: Chinese Light mode shows personal setup, no food or weight records and water zero; the isolated schema-2 snapshot has revision 0 and null profile/goals.
This verifies the initial visible state only; button-save/relaunch acceptance remains in progress.
Both hosts have now completed actual first setup Save through the final bridge/native path.
iOS saved revision 1 with the synthetic 178 cm profile and 80 kg weight; Android saved revision 1 with the synthetic 170 cm profile and 70 kg weight.
Both preserve explicitly unknown flags and nullable goals.
Actual restart, historical corrections and deletion/recovery acceptance is continuing.
Actual runtime exposed two Lynx conversion defects: void null arguments were rejected, and null-valued request map keys were dropped.
Void calls now use empty objects; record mutations use a private JSON envelope with strict native decoding, preserving explicit null versus missing fields.
Actual successful setup on both hosts proves this fix; old failed captures remain separately qualified.
New exercise saves require an actual weight on or before the selected day rather than saving a fabricated zero estimate.

All verification uses disposable QA stores/app namespaces.
No normal health-record contents are accessed or changed; no OS notification, camera, health or Bluetooth permission is requested or granted.
Physical providers, account login and partner synchronization remain outside this local daily-life scope.

Supporting files: `checkpoint.json`, `compare-conformance.py`, `conformance.json`, and the paired acceptance plan in this directory.
The final report will attach original native screenshots, exact build identities, actual actions and passed/unverified boundaries.
