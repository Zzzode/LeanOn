import XCTest
import HealthKit
import ObjectiveC.runtime
import CryptoKit
@testable import LeanOn

private final class FakeHealthKitClient: HealthKitClient {
  var supported = true
  var writeAuthorized = true
  var authorizedKinds: Set<HealthKitExport.Kind>? = nil
  func isWriteAuthorized(for kind: HealthKitExport.Kind) -> Bool {
    if let authorizedKinds { return authorizedKinds.contains(kind) }
    return !HealthKitExport.Kind.nutrition.contains(kind) && writeAuthorized
  }
  var permissionCalls = 0
  var readCalls = 0
  var saved: [(HealthKitExport, Int)] = []
  var deleted: [(String, HealthKitExport.Kind)] = []
  var weights: [HealthKitExternalWeight] = []
  var workouts: [HealthKitExternalWorkout] = []
  var failSave = false
  var failRead = false
  var failDelete = false
  var deferWeights: (() async -> Void)?
  func requestPermission() async throws { permissionCalls += 1 }
  func readWeights(since: Date, until: Date) async throws -> [HealthKitExternalWeight] {
    readCalls += 1
    if let deferWeights { await deferWeights() }
    if failRead { throw HealthKitSyncError.operationFailed }
    return weights
  }
  func readWorkouts(since: Date, until: Date) async throws -> [HealthKitExternalWorkout] { workouts }
  func save(_ record: HealthKitExport, version: Int) async throws {
    if failSave { throw HealthKitSyncError.operationFailed }
    saved.append((record, version))
  }
  func delete(id: String, kind: HealthKitExport.Kind) async throws {
    if failDelete { throw HealthKitSyncError.operationFailed }
    deleted.append((id, kind))
  }
}

final class HealthKitSyncTests: XCTestCase {
  private var directory: URL!
  private var stateURL: URL { directory.appendingPathComponent("health-kit.json") }
  private let instant = Date(timeIntervalSince1970: 1_791_244_800)
  private var host: NSDictionary {
    ["weights": [["date": "2026-10-03", "weightKg": 80.0]],
     "exercises": [["id": "ex-1", "date": "2026-10-03", "typeId": "walking",
       "durationMin": 30.0, "kcal": 100.0]]]
  }

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }
  override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

  private func manager(_ client: FakeHealthKitClient,
    load: (() throws -> NSDictionary)? = nil,
    replace: (([[String: Any]], [[String: Any]]) throws -> NSDictionary)? = nil) -> HealthKitManager {
    HealthKitManager(client: client, stateURL: stateURL, loadHostData: load ?? { self.host },
      replaceMirrors: replace ?? { _, _ in self.host }, onRecordsChanged: { _ in },
      now: { self.instant }, bundle: "com.zzzode.leanon", timeZone: TimeZone(secondsFromGMT: 0)!)
  }
  private func enable(_ manager: HealthKitManager) async throws {
    _ = try await manager.requestPermission()
    _ = try await manager.setEnabled(true)
  }

  func testLegacyLedgerReadPreservesBytesAndNextExplicitWriteEncrypts() async throws {
    let original = Data("{\"enabled\":false,\"authorizationRequested\":true,\"lastSyncEpochMs\":0,\"exported\":{}}".utf8)
    try original.write(to:stateURL)
    let fake=FakeHealthKitClient(), adapter=manager(fake)
    _ = try await adapter.status()
    XCTAssertEqual(try Data(contentsOf:stateURL),original)
    _ = try await adapter.setEnabled(true)
    let encrypted=try Data(contentsOf:stateURL)
    XCTAssertNil(encrypted.range(of:Data("authorizationRequested".utf8)))
    XCTAssertThrowsError(try JSONSerialization.jsonObject(with:encrypted))
    let reopened=try await manager(fake).status()
    XCTAssertEqual(reopened["enabled"] as? Bool,true)
    try await adapter.clearLocalState()
    XCTAssertFalse(FileManager.default.fileExists(atPath:stateURL.path))
    XCTAssertTrue(fake.deleted.isEmpty,"Deleting local data does not delete system HealthKit records")
  }
  func testLocalDeletionCancelsInFlightMirrorsBeforeTheyCanRepopulateRecords() async throws {
    let entered=expectation(description:"synthetic read suspended")
    var resume:CheckedContinuation<Void,Never>?
    let fake=FakeHealthKitClient()
    fake.deferWeights={await withCheckedContinuation { resume=$0;entered.fulfill() }}
    let adapter=manager(fake,replace:{_,_ in XCTFail("Cancelled sync cannot write mirrors");return self.host})
    try await enable(adapter)
    let task=Task { try await adapter.sync() }
    await fulfillment(of:[entered],timeout:5)
    try await adapter.clearLocalState(); resume?.resume()
    do { _ = try await task.value; XCTFail("Cancelled sync must report failure") } catch {}
    XCTAssertFalse(FileManager.default.fileExists(atPath:stateURL.path))
    XCTAssertTrue(fake.saved.isEmpty); XCTAssertTrue(fake.deleted.isEmpty)
  }
  func testActualQAKeychainRecreatedLedgerAfterDeletionReceiptIsPreservedOnCleanupRetry() async throws {
    let keyService = "com.zzzode.leanon.uiqa.deletion-ledger-boundary"
    let namespace = UUID().uuidString
    let keys = ["records", "personal", "journal", "companion", "ledger"].map {
      KeychainDataKey(service: keyService, account: namespace + "-" + $0)
    }
    defer { for key in keys { try? key.remove() } }
    let records = RecordsStore(recordsURL: directory.appendingPathComponent("records.json"), keys: keys[0])
    let collection = PersonalCollection(file: EncryptedAtomicFile(url: directory.appendingPathComponent("personal.enc"), keys: keys[1], context: "ledger-boundary-personal"))
    let personal = PersonalStore(collection: collection, today: { "2026-10-07" })
    let photos = PrivatePhotoStore(collection: collection, cacheDirectory: directory.appendingPathComponent("previews"))
    let coordinator = BackupCoordinator(records: records, personal: personal, photos: photos,
      journal: EncryptedAtomicFile(url: directory.appendingPathComponent("journal.enc"), keys: keys[2], context: "ledger-boundary-journal"))
    let companionFile = EncryptedAtomicFile(url: directory.appendingPathComponent("companion.enc"), keys: keys[3], context: "ledger-boundary-companion")
    let fake = FakeHealthKitClient()
    let health = HealthKitManager(client: fake, stateURL: stateURL, loadHostData: { try records.loadSnapshot() },
      replaceMirrors: { try records.replaceHealthKitMirrors(weights: $0, exercises: $1) },
      onRecordsChanged: { _ in }, keys: keys[4])
    _ = try await health.setEnabled(false)
    XCTAssertTrue(FileManager.default.fileExists(atPath: stateURL.path))
    let receipt: NSDictionary = ["pendingAccountDeletion": ["phase": "confirmed", "deleteLocalData": true, "localDataCleared": true]]
    try await health.clearLocalState()
    try coordinator.commitAccountDeletion(expectedRecordsRevision: 0, expectedPersonalRevision: 0,
      companionFile: companionFile, companionState: receipt)
    XCTAssertFalse(FileManager.default.fileExists(atPath: stateURL.path))
    // Explicitly changing a local preference can recreate a ledger without OS permission.
    _ = try await health.setEnabled(false)
    let recreated = try Data(contentsOf: stateURL)
    let keyBefore = try keys[4].key(create: false).withUnsafeBytes { Data($0) }
    XCTAssertThrowsError(try coordinator.finishAccountDeletionCleanup {
      guard !FileManager.default.fileExists(atPath: self.stateURL.path) else {
        throw RecordTransactionError.conflict("local health ledger recreated after account deletion")
      }
      XCTFail("The recreated ledger must block key cleanup")
    })
    XCTAssertEqual(try Data(contentsOf: stateURL), recreated)
    XCTAssertEqual(try keys[4].key(create: false).withUnsafeBytes { Data($0) }, keyBefore)
    XCTAssertEqual(fake.permissionCalls, 0); XCTAssertTrue(fake.saved.isEmpty); XCTAssertTrue(fake.deleted.isEmpty)
  }
  func testCancelledQueuedLedgerCleanupCannotDeleteAfterTheCallerChangesChoice() async throws {
    let fake = FakeHealthKitClient()
    let adapter = manager(fake)
    _ = try await adapter.setEnabled(false)
    let original = try Data(contentsOf: stateURL)
    let entered = expectation(description: "cleanup waiting before actor entry")
    var resume: CheckedContinuation<Void, Never>?
    let cleanup = Task {
      await withCheckedContinuation { resume = $0; entered.fulfill() }
      try await adapter.clearLocalState()
    }
    await fulfillment(of: [entered], timeout: 5)
    cleanup.cancel(); resume?.resume()
    do { try await cleanup.value; XCTFail("Cancelled cleanup must not erase the ledger") }
    catch { XCTAssertTrue(error is CancellationError) }
    XCTAssertEqual(try Data(contentsOf: stateURL), original)
    XCTAssertEqual(fake.permissionCalls, 0)
  }
  func testPreferenceSurvivesRelaunchWithoutClaimingReadAuthorization() async throws {
    let fake = FakeHealthKitClient()
    let first = manager(fake)
    let initial = try await first.status()
    XCTAssertEqual(initial["enabled"] as? Bool, false)
    XCTAssertEqual(fake.permissionCalls, 0)
    try await enable(first)
    let relaunched = try await manager(fake).status()
    XCTAssertEqual(relaunched["enabled"] as? Bool, true)
    XCTAssertEqual(relaunched["authorizationRequested"] as? Bool, true)
    XCTAssertEqual(relaunched["readAccess"] as? String, "unknown")
  }

  func testCompletedPermissionFlowDoesNotMeanWritesWereGranted() async throws {
    let fake = FakeHealthKitClient(); fake.writeAuthorized = false
    let adapter = manager(fake)
    let response = try await adapter.requestPermission()
    XCTAssertEqual(response["completed"] as? Bool, true)
    XCTAssertEqual(response["writeAuthorized"] as? Bool, false)
    _ = try await adapter.setEnabled(true)
    _ = try await adapter.sync()
    XCTAssertEqual(fake.readCalls, 1)
    XCTAssertTrue(fake.saved.isEmpty)
    XCTAssertTrue(fake.deleted.isEmpty)
  }

  func testExplicitPermissionRequestRequiredBeforeEnable() async throws {
    let fake = FakeHealthKitClient()
    do { _ = try await manager(fake).setEnabled(true); XCTFail("No implicit permission request") } catch {}
    XCTAssertEqual(fake.permissionCalls, 0)
  }

  func testUnsupportedAndDisabledNeverReadOrWrite() async throws {
    let fake = FakeHealthKitClient()
    let adapter = manager(fake)
    do { _ = try await adapter.sync(); XCTFail("Disabled") } catch {}
    fake.supported = false
    do { _ = try await adapter.requestPermission(); XCTFail("Unsupported") } catch {}
    XCTAssertEqual(fake.permissionCalls, 0)
    XCTAssertEqual(fake.readCalls, 0)
    XCTAssertTrue(fake.saved.isEmpty)
  }

  func testIdempotentExportUpdateAndDeletionSurviveRelaunch() async throws {
    let fake = FakeHealthKitClient()
    var current = host
    let first = manager(fake, load: { current })
    try await enable(first)
    _ = try await first.sync()
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.saved.count, 2)
    XCTAssertEqual(Set(fake.saved.map { $0.0.id }), ["leanon-weight-2026-10-03", "leanon-exercise-ex-1"])
    current = ["weights": [["date": "2026-10-03", "weightKg": 79.5]], "exercises": []]
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.saved.count, 3)
    XCTAssertEqual(fake.saved.last?.1, 2)
    XCTAssertEqual(fake.deleted.first?.0, "leanon-exercise-ex-1")
    let state = try await first.status()
    XCTAssertEqual(state["lastSyncEpochMs"] as? Int64, Int64(instant.timeIntervalSince1970 * 1000))
  }

  func testFailedExportRetriesWithNewVersionWithoutFalseTimestamp() async throws {
    let fake = FakeHealthKitClient(); fake.failSave = true
    let adapter = manager(fake)
    try await enable(adapter)
    do { _ = try await adapter.sync(); XCTFail("Save must fail") } catch {}
    let failed = try await adapter.status()
    XCTAssertEqual(failed["lastSyncEpochMs"] as? Int64, 0)
    fake.failSave = false
    _ = try await manager(fake).sync()
    XCTAssertEqual(fake.saved.first?.1, 2)
  }

  func testReadAndMirrorPersistenceFailuresDoNotStampSuccess() async throws {
    let fake = FakeHealthKitClient(); fake.failRead = true
    let adapter = manager(fake, replace: { _, _ in throw HealthKitSyncError.operationFailed })
    try await enable(adapter)
    do { _ = try await adapter.sync(); XCTFail("Read failed") } catch {}
    XCTAssertTrue(fake.saved.isEmpty)
    fake.failRead = false
    do { _ = try await adapter.sync(); XCTFail("Mirror save failed") } catch {}
    let state = try await adapter.status()
    XCTAssertEqual(state["lastSyncEpochMs"] as? Int64, 0)
  }

  func testFailedDeletionIsRetriedRatherThanForgettingExportIdentity() async throws {
    let fake = FakeHealthKitClient()
    var current = host
    let adapter = manager(fake, load: { current })
    try await enable(adapter)
    _ = try await adapter.sync()
    current = ["weights": [], "exercises": []]
    fake.failDelete = true
    do { _ = try await adapter.sync(); XCTFail("Deletion failed") } catch {}
    fake.failDelete = false
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.deleted.count, 2)
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.deleted.count, 2)
    current = host
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.saved.suffix(2).map { $0.1 }, [2, 2])
  }

  func testDisablingPreservesSystemRecordsAndExportLedger() async throws {
    let fake = FakeHealthKitClient()
    let adapter = manager(fake)
    try await enable(adapter); _ = try await adapter.sync()
    _ = try await adapter.setEnabled(false)
    XCTAssertTrue(fake.deleted.isEmpty)
    let state = try await manager(fake).status()
    XCTAssertEqual(state["enabled"] as? Bool, false)
  }

  func testReadOnlyMirrorsAndPendingDeletionReconcileWhenWriteAccessReturns() async throws {
    let fake = FakeHealthKitClient()
    var current = host
    var mirroredCount = 0
    let adapter = manager(fake, load: { current }, replace: { weights, _ in
      mirroredCount = weights.count
      return current
    })
    try await enable(adapter)
    _ = try await adapter.sync()
    fake.writeAuthorized = false
    fake.weights = [.init(id: "scale", date: instant, weightKg: 78, syncIdentifier: nil, sourceBundle: "scale.app")]
    current = ["weights": [], "exercises": []]
    _ = try await adapter.sync()
    XCTAssertEqual(mirroredCount, 1)
    XCTAssertEqual(fake.saved.count, 2)
    XCTAssertTrue(fake.deleted.isEmpty)
    fake.writeAuthorized = true
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.deleted.count, 2)
  }

  func testFreshExternalWeightSupportsWorkoutMathWhenLocalHistoryIsEmpty() throws {
    let date = try HealthKitMapping.date("2026-10-03", hour: 18)
    let weight = HealthKitExternalWeight(id: "scale", date: date, weightKg: 80, syncIdentifier: nil, sourceBundle: "scale.app")
    let workout = HealthKitExternalWorkout(id: "walk", start: date, end: date.addingTimeInterval(1800),
      activity: .walking, syncIdentifier: nil, sourceBundle: "workout.app")
    let mapped = HealthKitMapping.mirrors(weights: [weight], workouts: [workout],
      host: ["weights": [], "exercises": []], bundle: "com.zzzode.leanon", timeZone: TimeZone(secondsFromGMT: 0)!)
    XCTAssertEqual(mapped.1.first?["kcal"] as? Double, 100)
  }

  func testMirrorsUseLatestLocalDayMETAndSuppressOwnSourceAndMetadataEcho() throws {
    let start = try HealthKitMapping.date("2026-10-03", hour: 18)
    let weights = [
      HealthKitExternalWeight(id: "external1", date: start, weightKg: 79, syncIdentifier: nil, sourceBundle: "scale.app"),
      HealthKitExternalWeight(id: "external2", date: start.addingTimeInterval(10), weightKg: 78, syncIdentifier: nil, sourceBundle: "scale.app"),
      HealthKitExternalWeight(id: "echo", date: start.addingTimeInterval(20), weightKg: 100, syncIdentifier: "leanon-weight-2026-10-03", sourceBundle: "other"),
      HealthKitExternalWeight(id: "own", date: start.addingTimeInterval(30), weightKg: 100, syncIdentifier: nil, sourceBundle: "com.zzzode.leanon"),
    ]
    let external = HealthKitExternalWorkout(id: "workout-uuid", start: start, end: start.addingTimeInterval(1800),
      activity: .walking, syncIdentifier: nil, sourceBundle: "workout.app")
    let mapped = HealthKitMapping.mirrors(weights: weights, workouts: [external, external], host: host,
      bundle: "com.zzzode.leanon", timeZone: TimeZone(secondsFromGMT: 0)!)
    XCTAssertEqual(mapped.0.count, 1)
    XCTAssertEqual(mapped.0.first?["weightKg"] as? Double, 78)
    XCTAssertEqual(mapped.0.first?["id"] as? String, "hk-weight-2026-10-03")
    XCTAssertEqual(mapped.1.count, 1)
    XCTAssertEqual(mapped.1.first?["kcal"] as? Double, 100)
    XCTAssertEqual(mapped.1.first?["source"] as? String, "healthkit")
  }

  func testExternalSamplesAreNeverReexportedAndCorruptLocalDataFailsBeforeIO() async throws {
    let fake = FakeHealthKitClient()
    let mirror: NSDictionary = ["weights": [["date": "2026-10-03", "weightKg": 80.0, "source": "healthkit"]],
      "exercises": [["id": "hk-uuid", "date": "2026-10-03", "typeId": "walking", "durationMin": 30.0, "source": "healthkit"]]]
    XCTAssertTrue(try HealthKitMapping.exports(mirror).isEmpty)
    let adapter = manager(fake, load: { [:] })
    try await enable(adapter)
    do { _ = try await adapter.sync(); XCTFail("Corrupt host") } catch {}
    XCTAssertEqual(fake.readCalls, 0)
  }

  func testStateWriteFailureDoesNotClaimEnableAndWrongTypeCannotMutate() async throws {
    let fake = FakeHealthKitClient()
    let adapter = manager(fake)
    _ = try await adapter.requestPermission()
    try FileManager.default.removeItem(at: stateURL)
    try FileManager.default.createDirectory(at: stateURL, withIntermediateDirectories: true)
    do { _ = try await adapter.setEnabled(true); XCTFail("State storage failure") } catch {}
    XCTAssertEqual(fake.readCalls, 0)
    let module = HealthKitModule(manager: adapter)
    module.setEnabled(["enabled": 1]) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    module.setEnabled(["enabled": "true"]) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
  }

  func testPermissionFlowStateCommitFailureReturnsFailureWithoutSyncing() async throws {
    let fake = FakeHealthKitClient()
    let blocker = directory.appendingPathComponent("not-a-directory")
    try Data("blocker".utf8).write(to: blocker)
    let adapter = HealthKitManager(client: fake, stateURL: blocker.appendingPathComponent("state.json"),
      loadHostData: { self.host }, replaceMirrors: { _, _ in self.host }, onRecordsChanged: { _ in })
    do { _ = try await adapter.requestPermission(); XCTFail("Failed durable commit must not return completed") } catch {}
    XCTAssertEqual(fake.permissionCalls, 1)
    XCTAssertEqual(fake.readCalls, 0)
    XCTAssertTrue(fake.saved.isEmpty)
  }

  func testAllModuleExportsAcceptRequestAndCallback() {
    for selectorName in HealthKitModule.methodLookup.values {
      let selector = NSSelectorFromString(selectorName)
      guard let method = class_getInstanceMethod(HealthKitModule.self, selector) else {
        XCTFail("Missing exported selector \(selectorName)"); continue
      }
      XCTAssertEqual(method_getNumberOfArguments(method), 4)
    }
  }

  private var nutritionHost: NSDictionary {
    let result = host.mutableCopy() as! NSMutableDictionary
    result["intake"] = [["date": "2026-10-03", "kcal": 1800.0,
      "macros": ["proteinG": 90.0, "carbsG": 200.0, "fatG": 60.0],
      "micros": ["fiberG": 25.0, "sugarG": 30.0, "saturatedFatG": 12.0, "sodiumMg": 2300.0]]]
    return result
  }

  func testDailyNutritionExportsMatchEightAndroidFieldsAndSDKUnits() throws {
    let mapped = try HealthKitMapping.exports(nutritionHost).filter { HealthKitExport.Kind.nutrition.contains($0.kind) }
    XCTAssertEqual(mapped.count, 8)
    XCTAssertEqual(Set(mapped.map(\.id)).count, 8)
    XCTAssertTrue(mapped.allSatisfy { $0.id.hasPrefix("leanon-nutrition-2026-10-03-") })
    XCTAssertEqual(mapped.first { $0.kind == .energy }?.quantityValue, 1800)
    XCTAssertEqual(mapped.first { $0.kind == .sodium }?.quantityValue ?? .nan, 2.3, accuracy: 0.000001)
    XCTAssertEqual(HealthKitExport.Kind.energy.nutritionUnit, HKUnit.kilocalorie())
    XCTAssertEqual(HealthKitExport.Kind.sodium.nutritionUnit, HKUnit.gram())
    XCTAssertTrue(mapped.allSatisfy { $0.end.timeIntervalSince($0.start) == 3600 })
  }

  func testOptionalZeroMicrosAreOmittedAndInvalidNutritionFailsBeforeIO() async throws {
    let emptyMicros: NSDictionary = ["weights": [], "exercises": [], "intake": [[
      "date": "2026-10-03", "kcal": 100.0, "macros": ["proteinG": 0.0, "carbsG": 0.0, "fatG": 0.0],
      "micros": ["fiberG": 0.0, "sugarG": 0.0, "saturatedFatG": 0.0, "sodiumMg": 0.0]]]]
    XCTAssertEqual(try HealthKitMapping.exports(emptyMicros).count, 4)
    let invalidValues: [Any] = [-1.0, Double.infinity, true, "100"]
    for bad in invalidValues {
      let invalid: NSDictionary = ["weights": [], "exercises": [], "intake": [[
        "date": "2026-10-03", "kcal": bad, "macros": ["proteinG": 1.0, "carbsG": 1.0, "fatG": 1.0]]]]
      let fake = FakeHealthKitClient()
      let adapter = manager(fake, load: { invalid })
      try await enable(adapter)
      do { _ = try await adapter.sync(); XCTFail("Invalid nutrition must fail") } catch {}
      XCTAssertEqual(fake.readCalls, 0)
      XCTAssertTrue(fake.saved.isEmpty)
    }
  }

  func testNutritionDenialDoesNotBlockWeightAndWorkoutExports() async throws {
    let fake = FakeHealthKitClient()
    fake.authorizedKinds = [.weight, .workout]
    let adapter = manager(fake, load: { self.nutritionHost })
    try await enable(adapter)
    _ = try await adapter.sync()
    XCTAssertEqual(Set(fake.saved.map { $0.0.kind }), [.weight, .workout])
    let status = try await adapter.status()
    XCTAssertEqual(status["writeAuthorized"] as? Bool, true)
    XCTAssertEqual(status["nutritionWriteAuthorized"] as? Bool, false)
  }

  func testPartialNutritionPermissionExportsOnlyAllowedQuantitiesWithoutOtherWriteAccess() async throws {
    let fake = FakeHealthKitClient()
    fake.writeAuthorized = false
    fake.authorizedKinds = [.energy, .protein]
    let adapter = manager(fake, load: { self.nutritionHost })
    try await enable(adapter)
    _ = try await adapter.sync()
    XCTAssertEqual(Set(fake.saved.map { $0.0.kind }), [.energy, .protein])
    XCTAssertEqual(fake.readCalls, 1)
    let status = try await adapter.status()
    XCTAssertEqual(status["nutritionWriteAuthorized"] as? Bool, false)
  }

  func testNutritionUpdateZeroRemovalDeletionRestoreAndRetryKeepStableIdentity() async throws {
    let fake = FakeHealthKitClient()
    fake.authorizedKinds = Set(HealthKitExport.Kind.allCases)
    var current = nutritionHost
    let adapter = manager(fake, load: { current })
    try await enable(adapter)
    _ = try await adapter.sync()
    XCTAssertEqual(fake.saved.count, 10)
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.saved.count, 10)
    current = ["weights": [], "exercises": [], "intake": [["date": "2026-10-03", "kcal": 1900.0,
      "macros": ["proteinG": 90.0, "carbsG": 200.0, "fatG": 60.0],
      "micros": ["fiberG": 25.0, "sugarG": 0.0, "saturatedFatG": 12.0, "sodiumMg": 2300.0]]]]
    fake.failSave = true
    do { _ = try await adapter.sync(); XCTFail("Failed save") } catch {}
    fake.failSave = false
    _ = try await adapter.sync()
    XCTAssertEqual(fake.saved.last?.0.id, "leanon-nutrition-2026-10-03-energy")
    XCTAssertEqual(fake.saved.last?.1, 3)
    XCTAssertTrue(fake.deleted.contains { $0.0 == "leanon-nutrition-2026-10-03-sugar" })
    current = ["weights": [], "exercises": [], "intake": []]
    _ = try await adapter.sync()
    current = nutritionHost
    _ = try await adapter.sync()
    XCTAssertEqual(fake.saved.last { $0.0.kind == .energy }?.1, 4)
    XCTAssertEqual(fake.saved.last { $0.0.kind == .sugar }?.1, 2)
  }

  func testDeniedNutritionDeletionRetainsLedgerUntilThatScopeIsRestored() async throws {
    let fake = FakeHealthKitClient()
    fake.authorizedKinds = [.energy]
    var current = nutritionHost
    let adapter = manager(fake, load: { current })
    try await enable(adapter); _ = try await adapter.sync()
    current = ["weights": [], "exercises": [], "intake": []]
    fake.authorizedKinds = []
    _ = try await adapter.sync()
    XCTAssertTrue(fake.deleted.isEmpty)
    fake.authorizedKinds = [.energy]
    _ = try await manager(fake, load: { current }).sync()
    XCTAssertEqual(fake.deleted.first?.0, "leanon-nutrition-2026-10-03-energy")
  }

  func testStationaryCyclingExportsIndoorMetadataAndImportsConservativeMET() throws {
    let stationary: NSDictionary = ["weights": [], "exercises": [["id": "stationary", "date": "2026-10-03",
      "typeId": "cycling-stationary", "durationMin": 30.0]]]
    let exported = try HealthKitMapping.exports(stationary)
    XCTAssertEqual(exported.first?.indoor, true)
    let start = try HealthKitMapping.date("2026-10-03", hour: 18)
    let indoor = HealthKitExternalWorkout(id: "indoor", start: start, end: start.addingTimeInterval(1800),
      activity: .cycling, syncIdentifier: nil, sourceBundle: "exercise.app", indoor: true)
    let outdoor = HealthKitExternalWorkout(id: "outdoor", start: start, end: start.addingTimeInterval(1800),
      activity: .cycling, syncIdentifier: nil, sourceBundle: "exercise.app", indoor: false)
    let mapped = HealthKitMapping.mirrors(weights: [], workouts: [indoor, outdoor], host: host,
      bundle: "com.zzzode.leanon", timeZone: TimeZone(secondsFromGMT: 0)!).1
    XCTAssertEqual(mapped.first { $0["id"] as? String == "hk-indoor" }?["kcal"] as? Double, 280)
    XCTAssertEqual(mapped.first { $0["id"] as? String == "hk-outdoor" }?["kcal"] as? Double, 300)
    XCTAssertEqual(mapped.first { $0["id"] as? String == "hk-indoor" }?["typeId"] as? String, "cycling-stationary")
  }

  func testSyncUsesChangedTimeZoneWhileExplicitTestTimeZoneStaysFixed() async throws {
    let fake = FakeHealthKitClient()
    let date = try HealthKitMapping.date("2026-10-03", hour: 0).addingTimeInterval(1800)
    fake.weights = [.init(id: "scale", date: date, weightKg: 79, syncIdentifier: nil, sourceBundle: "scale.app")]
    fake.workouts = [.init(id: "walk", start: date, end: date.addingTimeInterval(1800),
      activity: .walking, syncIdentifier: nil, sourceBundle: "workout.app")]
    var currentTimeZone = TimeZone(secondsFromGMT: -8 * 3600)!
    var mirroredWeightDays: [String] = []
    var mirroredWorkoutDays: [String] = []
    let capture: ([[String: Any]], [[String: Any]]) -> NSDictionary = { weights, workouts in
      mirroredWeightDays.append(contentsOf: weights.compactMap { $0["date"] as? String })
      mirroredWorkoutDays.append(contentsOf: workouts.compactMap { $0["date"] as? String })
      return self.host
    }
    let adapter = HealthKitManager(client: fake, stateURL: stateURL, loadHostData: { self.host },
      replaceMirrors: capture, onRecordsChanged: { _ in }, now: { self.instant },
      timeZoneProvider: { currentTimeZone })
    try await enable(adapter)
    _ = try await adapter.sync()
    currentTimeZone = TimeZone(secondsFromGMT: 9 * 3600)!
    _ = try await adapter.sync()
    XCTAssertEqual(mirroredWeightDays, ["2026-10-02", "2026-10-03"])
    XCTAssertEqual(mirroredWorkoutDays, ["2026-10-02", "2026-10-03"])

    mirroredWeightDays = []; mirroredWorkoutDays = []
    let fixed = HealthKitManager(client: fake, stateURL: stateURL, loadHostData: { self.host },
      replaceMirrors: capture, onRecordsChanged: { _ in }, now: { self.instant },
      timeZone: TimeZone(secondsFromGMT: 0)!, timeZoneProvider: { currentTimeZone })
    _ = try await fixed.sync()
    currentTimeZone = TimeZone(secondsFromGMT: -8 * 3600)!
    _ = try await fixed.sync()
    XCTAssertEqual(mirroredWeightDays, ["2026-10-03", "2026-10-03"])
    XCTAssertEqual(mirroredWorkoutDays, ["2026-10-03", "2026-10-03"])
  }
}
