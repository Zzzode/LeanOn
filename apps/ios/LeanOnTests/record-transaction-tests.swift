import XCTest
import ObjectiveC
@testable import LeanOn

final class RecordTransactionTests: XCTestCase {
  private var directory: URL!
  private var url: URL!
  private var store: RecordsStore!
  private let now = ISO8601DateFormatter().date(from: "2026-10-06T12:00:00Z")!

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-daily-\(UUID().uuidString)")
    url = directory.appendingPathComponent("nested/records.json")
    store = subject()
  }
  override func tearDownWithError() throws {
    if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
  }
  private func subject() -> RecordsStore {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return RecordsStore(recordsURL: url, clock: { self.now }, calendar: { calendar })
  }
  private func rows(_ data: NSDictionary, _ key: String) -> [NSDictionary] { data[key] as? [NSDictionary] ?? [] }
  private func profile(_ overrides: [String: Any] = [:]) -> NSDictionary {
    let result = NSMutableDictionary(dictionary: ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"])
    for (key, value) in overrides { result[key] = value }; return result
  }
  private func setup(_ mode: String = "tracking-only", overrides: [String: Any] = [:]) -> NSDictionary {
    let result = NSMutableDictionary(dictionary: ["type": "save-profile", "profile": profile(),
      "goalWeightKg": NSNull(), "weeklyLossKg": 0, "guidanceMode": mode,
      "safetyFlags": ["pregnant": false, "breastfeeding": false, "eatingDisorderRisk": false]])
    for (key, value) in overrides { result[key] = value }; return result
  }
  private func request(_ mutation: NSDictionary, operation: String = UUID().uuidString, revision: Int? = nil) throws -> NSDictionary {
    let current = try store.currentSnapshot()["revision"] as! Int
    return ["operationId": operation, "expectedRevision": revision ?? current, "mutation": mutation]
  }
  @discardableResult private func write(_ mutation: NSDictionary, operation: String = UUID().uuidString, revision: Int? = nil) throws -> NSDictionary {
    let response = try store.transact(request(mutation, operation: operation, revision: revision))
    return try XCTUnwrap(response["hostData"] as? NSDictionary)
  }
  private func entry(_ id: String = "meal-1", kcal: Double = 200, date: String = "2026-10-05") -> NSDictionary {
    ["id": id, "date": date, "meal": "lunch", "name": "Synthetic rice", "grams": 100,
     "kcal": kcal, "macros": ["proteinG": 5, "carbsG": 40, "fatG": 2],
     "micros": ["fiberG": 1, "sugarG": 0, "saturatedFatG": 0, "sodiumMg": 10], "foodId": "rice"]
  }

  func testFreshStoreIsEmptyWithoutDemonstrationProfile() throws {
    let fresh = try store.currentSnapshot()
    XCTAssertEqual(fresh["schemaVersion"] as? Int, 2); XCTAssertEqual(fresh["revision"] as? Int, 0)
    XCTAssertEqual(fresh["setupCompleted"] as? Bool, false)
    XCTAssertTrue(fresh["profile"] is NSNull); XCTAssertTrue(fresh["goalWeightKg"] is NSNull)
    for key in ["weights", "intake", "legacyIntake", "intakeEntries", "exercises", "water"] { XCTAssertTrue(rows(fresh, key).isEmpty) }
    XCTAssertEqual(try subject().currentSnapshot(), fresh)
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "Read/cancel does not create records")
  }

  func testLegacyMigrationPreservesAggregatesAndOtherFieldsWithoutInventingMeals() throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let legacy: NSDictionary = ["profile": profile(), "goalWeightKg": 72, "weeklyLossKg": 0.6,
      "weights": [["date": "2026-10-05", "weightKg": 80]], "exercises": [],
      "intake": [["date": "2026-10-05", "kcal": 300, "macros": ["proteinG": 8, "carbsG": 45, "fatG": 3]]],
      "futureMetadata": ["preserve": true]]
    try JSONSerialization.data(withJSONObject: legacy).write(to: url)
    let before = try Data(contentsOf: url)
    let migrated = try store.currentSnapshot()
    XCTAssertEqual(rows(migrated, "legacyIntake").first?["kcal"] as? Int, 300)
    XCTAssertTrue(rows(migrated, "intakeEntries").isEmpty)
    XCTAssertEqual(migrated["guidanceMode"] as? String, "tracking-only")
    XCTAssertEqual(migrated["weeklyLossKg"] as? Double, 0.6)
    XCTAssertEqual(rows(migrated, "weights").first?["id"] as? String, "weight-2026-10-05")
    XCTAssertEqual((migrated["futureMetadata"] as? NSDictionary)?["preserve"] as? Bool, true)
    XCTAssertEqual(try subject().currentSnapshot(), migrated)
    XCTAssertEqual(try Data(contentsOf: url), before, "Reading legacy data does not commit migration")
  }

  func testIncompleteLegacyProfileFailsClosedAndRemainsPreserved() throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONSerialization.data(withJSONObject: ["profile": ["displayName": "Fixture"], "intake": []]).write(to: url)
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try store.currentSnapshot())
    XCTAssertThrowsError(try write(["type": "set-water", "date": "2026-10-06", "amountMl": 250]))
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testEstablishedLegacyRootRequiresPrimaryArraysAndPreservesIncompleteBytes() throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    for value: NSDictionary in [[:], ["weights": []], ["intake": []], ["weights": NSNull(), "intake": []]] {
      let bytes = try JSONSerialization.data(withJSONObject: value); try bytes.write(to: url, options: .atomic)
      XCTAssertThrowsError(try store.currentSnapshot())
      XCTAssertThrowsError(try store.transact(["operationId": "incomplete-root", "expectedRevision": 0,
                                             "mutation": ["type": "set-water", "date": "2026-10-06", "amountMl": 250]]))
      XCTAssertEqual(try Data(contentsOf: url), bytes)
    }
  }

  func testSetupInitialWeightPersistsAndCannotBeInjectedDuringProfileEdit() throws {
    let snapshot = try write(setup(overrides: ["initialWeightKg": 80]))
    XCTAssertEqual(snapshot["setupCompleted"] as? Bool, true)
    XCTAssertEqual(rows(snapshot, "weights").first?["id"] as? String, "weight-2026-10-06")
    XCTAssertEqual(rows(try subject().currentSnapshot(), "weights").first?["weightKg"] as? Int, 80)
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try write(setup(overrides: ["initialWeightKg": 79])))
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testWeightLossRequiresAdultScreeningAndHealthyCurrentAndGoalBMI() throws {
    let base: [String: Any] = ["initialWeightKg": 80, "goalWeightKg": 72, "weeklyLossKg": 0.6]
    for overrides in [
      ["profile": profile(["birthDate": "2007-10-06"])],
      ["safetyFlags": ["pregnant": NSNull(), "breastfeeding": false, "eatingDisorderRisk": false]],
      ["safetyFlags": ["pregnant": false, "breastfeeding": false, "eatingDisorderRisk": true]],
      ["initialWeightKg": 50], ["goalWeightKg": 50], ["weeklyLossKg": 0.4],
    ] {
      var values = base; for (key, value) in overrides { values[key] = value }
      XCTAssertThrowsError(try write(setup("weight-loss", overrides: values)))
    }
    let safe = try write(setup("weight-loss", overrides: base))
    XCTAssertEqual(safe["guidanceMode"] as? String, "weight-loss")
  }

  func testTrackingOnlyAllowsUnknownScreenAndNullGoalsButNoDeficitRate() throws {
    let snapshot = try write(setup(overrides: ["goalWeightKg": NSNull(), "weeklyLossKg": NSNull(),
      "safetyFlags": ["pregnant": NSNull(), "breastfeeding": NSNull(), "eatingDisorderRisk": NSNull()]]))
    XCTAssertTrue(snapshot["weeklyLossKg"] is NSNull)
    XCTAssertThrowsError(try write(setup(overrides: ["weeklyLossKg": 0.5])))
  }

  func testFactualTrackingBeforeSetupDoesNotFabricateProfileOrGuidance() throws {
    let snapshot = try write(["type": "set-water", "date": "2026-10-06", "amountMl": 250])
    XCTAssertFalse(snapshot["setupCompleted"] as! Bool); XCTAssertTrue(snapshot["profile"] is NSNull)
    XCTAssertEqual(snapshot["guidanceMode"] as? String, "tracking-only")
  }

  func testWeightLossWithoutAnyActualWeightRejectsWhileTrackingSetupSucceeds() throws {
    XCTAssertThrowsError(try write(setup("weight-loss", overrides: ["goalWeightKg": 72, "weeklyLossKg": 0.6])))
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    XCTAssertTrue((try write(setup()))["setupCompleted"] as! Bool)
  }

  func testMovedDailyIdentitySurvivesLegacyWritesAndNewDayGetsUniqueId() throws {
    try write(["type": "set-weight", "date": "2026-10-05", "weightKg": 80])
    try write(["type": "set-weight", "id": "weight-2026-10-05", "date": "2026-10-04", "weightKg": 79])
    let added = try store.addWeight(date: "2026-10-05", weightKg: 81)
    XCTAssertEqual(rows(added, "weights").count, 2)
    XCTAssertEqual(Set(rows(added, "weights").map { $0["id"] as! String }).count, 2)
    let edited = try store.addWeight(date: "2026-10-04", weightKg: 78)
    XCTAssertEqual(rows(edited, "weights").first?["id"] as? String, "weight-2026-10-05")
  }

  func testLegacyCorrectionDeleteRestorePreservesDuplicateDateRowsAndMetadata() throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let nutrition: [String: Any] = ["date": "2026-10-05", "kcal": 100, "macros": ["proteinG": 1, "carbsG": 2, "fatG": 3],
      "micros": ["fiberG": 0, "sugarG": 0, "saturatedFatG": 0, "sodiumMg": 0], "originalMetadata": "keep"]
    try JSONSerialization.data(withJSONObject: ["weights": [], "intake": [nutrition, nutrition]]).write(to: url)
    let legacy = rows(try store.currentSnapshot(), "legacyIntake")
    XCTAssertEqual(legacy.count, 2); XCTAssertNotEqual(legacy[0]["id"] as? String, legacy[1]["id"] as? String)
    let correction = legacy[0].mutableCopy() as! NSMutableDictionary; correction["kcal"] = 50
    try write(["type": "save-legacy-intake", "sample": correction])
    XCTAssertEqual(rows(try store.currentSnapshot(), "intake").first?["kcal"] as? Int, 150)
    let deleted = try store.transact(request(["type": "delete-record", "kind": "legacy-intake", "id": correction["id"]!]))
    let token = deleted["undoToken"] as! String
    store = subject()
    let restored = try write(["type": "restore-record", "token": token])
    XCTAssertEqual(rows(restored, "legacyIntake").count, 2)
    XCTAssertEqual(rows(restored, "intake").first?["kcal"] as? Int, 150)
    XCTAssertEqual(rows(restored, "legacyIntake").first?["originalMetadata"] as? String, "keep")
  }

  func testMissingSchemaTwoRecoveryCollectionsAndMalformedReceiptsFailClosed() throws {
    try write(setup()); let original = try store.encryptedFile.read()
    for key in ["weights", "exercises", "intakeEntries", "deletedRecords", "processedOperations"] {
      let data = try JSONSerialization.jsonObject(with: original, options: .mutableContainers) as! NSMutableDictionary
      data.removeObject(forKey: key)
      let corrupt = try JSONSerialization.data(withJSONObject: data); try corrupt.write(to: url)
      XCTAssertThrowsError(try store.currentSnapshot())
      XCTAssertEqual(try Data(contentsOf: url), corrupt)
    }
    let data = try JSONSerialization.jsonObject(with: original, options: .mutableContainers) as! NSMutableDictionary
    data["processedOperations"] = [["operationId": "bad", "mutation": ["type": "set-water", "date": "2026-10-06", "amountMl": true], "appliedRevision": 1]]
    let corrupt = try JSONSerialization.data(withJSONObject: data); try corrupt.write(to: url)
    XCTAssertThrowsError(try store.currentSnapshot())
    XCTAssertEqual(try Data(contentsOf: url), corrupt)
  }

  func testUnknownLegacySourceFailsClosedWithoutNormalization() throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let original = try JSONSerialization.data(withJSONObject: ["weights": [], "intake": [], "exercises": [["id": "ex-old", "date": "2026-10-05", "typeId": "walking", "durationMin": 20, "kcal": 80, "source": "manual"]]])
    try original.write(to: url)
    XCTAssertThrowsError(try store.currentSnapshot()); XCTAssertEqual(try Data(contentsOf: url), original)
  }

  func testFixedCrossHostConformance() throws {
    let environment = ProcessInfo.processInfo.environment
    guard let input = environment["LEANON_CONFORMANCE_INPUT"], let output = environment["LEANON_CONFORMANCE_OUTPUT"],
          output.hasPrefix("/tmp/leanon-daily-") else { throw XCTSkip("Requires an explicit isolated conformance file") }
    let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: input))) as! NSDictionary
    var operations: [NSDictionary] = [], rejections: [NSDictionary] = []
    for step in fixture["operations"] as! [NSDictionary] {
      let response = try store.transact(step["request"] as! NSDictionary)
      let host = response["hostData"] as! NSDictionary, expect = step["expect"] as! NSDictionary
      XCTAssertEqual(host["revision"] as? Int, expect["revision"] as? Int)
      for (field, key) in [("entries", "intakeEntries"), ("weights", "weights"), ("deletedRecords", "deletedRecords")] {
        if let count = expect[field] as? Int { XCTAssertEqual(rows(host, key).count, count) }
      }
      if let kcal = expect["kcal"] as? Double { XCTAssertEqual(rows(host, "intake").first?["kcal"] as? Double, kcal) }
      for key in ["replayed", "appliedRevision", "undoToken"] { if let expected = expect[key] as? NSObject { XCTAssertEqual(response[key] as? NSObject, expected) } }
      if let id = expect["stableWeightId"] as? String { XCTAssertNotNil(rows(host, "weights").first { $0["id"] as? String == id && $0["date"] as? String == expect["weightDate"] as? String }) }
      if let id = expect["newWeightId"] as? String { XCTAssertNotNil(rows(host, "weights").first { $0["id"] as? String == id }) }
      operations.append(["request": step["request"]!, "result": response, "hostData": host])
    }
    for step in fixture["rejections"] as! [NSDictionary] {
      let before = try Data(contentsOf: url)
      do { _ = try store.transact(step["request"] as! NSDictionary); XCTFail("Expected rejection") }
      catch let error as RecordTransactionError {
        XCTAssertEqual(error.code, (step["expect"] as! NSDictionary)["code"] as? String)
        rejections.append(["request": step["request"]!, "code": error.code, "hostData": try store.currentSnapshot()])
      }
      XCTAssertEqual(try Data(contentsOf: url), before)
    }
    try JSONSerialization.data(withJSONObject: ["platform": "iOS", "clock": fixture["clock"]!, "operations": operations, "rejections": rejections], options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: output), options: .atomic)
  }

  func testEntryEditReprojectsDailyTotalWithoutChangingLegacyAggregate() throws {
    try write(setup())
    try store.addIntake(date: "2026-10-05", kcal: 300, proteinG: 8, carbsG: 45, fatG: 3)
    try write(["type": "save-intake", "entry": entry()])
    let edited = try write(["type": "save-intake", "entry": entry(kcal: 100)])
    XCTAssertEqual(rows(edited, "intake").first?["kcal"] as? Int, 400)
    XCTAssertEqual(rows(edited, "legacyIntake").first?["kcal"] as? Int, 300)
    XCTAssertEqual(rows(edited, "intakeEntries").count, 1)
    XCTAssertEqual(rows(try subject().currentSnapshot(), "intake").first?["kcal"] as? Int, 400)
  }

  func testReplayPrecedesRevisionCheckAndDoesNotDuplicateOrOverwriteLaterEdits() throws {
    try write(setup())
    let mutation: NSDictionary = ["type": "save-intake", "entry": entry()]
    let firstRequest = try request(mutation, operation: "repeat-op")
    let first = try store.transact(firstRequest)
    try write(["type": "save-intake", "entry": entry(kcal: 100)])
    let bytes = try Data(contentsOf: url)
    let replay = try store.transact(firstRequest)
    XCTAssertEqual(replay["replayed"] as? Bool, true)
    XCTAssertEqual(replay["appliedRevision"] as? Int, first["appliedRevision"] as? Int)
    XCTAssertEqual(rows(replay["hostData"] as! NSDictionary, "intake").first?["kcal"] as? Int, 100)
    XCTAssertEqual(try Data(contentsOf: url), bytes)
    XCTAssertThrowsError(try write(["type": "save-intake", "entry": entry(kcal: 99)], operation: "repeat-op"))
  }

  func testReplayUsesJSONTypeSemanticsAndRejectsBooleanNumberReuse() throws {
    let mutation: NSDictionary = ["type": "set-water", "date": "2026-10-06", "amountMl": 1, "extra": true]
    try write(mutation, operation: "json-types")
    let original = try Data(contentsOf: url)
    XCTAssertThrowsError(try write(["type": "set-water", "date": "2026-10-06", "amountMl": 1, "extra": 1], operation: "json-types"))
    XCTAssertEqual(try Data(contentsOf: url), original)
  }

  func testFirstSetupInitialWeightPreservesAnAlreadyMovedDailyId() throws {
    try write(["type": "set-weight", "date": "2026-10-05", "weightKg": 80])
    try write(["type": "set-weight", "id": "weight-2026-10-05", "date": "2026-10-06", "weightKg": 79])
    let snapshot = try write(setup(overrides: ["initialWeightKg": 78]))
    XCTAssertEqual(rows(snapshot, "weights").first?["id"] as? String, "weight-2026-10-05")
    XCTAssertEqual(rows(snapshot, "weights").first?["weightKg"] as? Int, 78)
  }

  func testStaleRevisionAndFutureDateRejectWithoutChangingBytes() throws {
    try write(setup()); let revision = try store.currentSnapshot()["revision"] as! Int
    try store.upsertWater(date: "2026-10-06", amountMl: 250)
    let bytes = try Data(contentsOf: url)
    XCTAssertThrowsError(try write(["type": "set-water", "date": "2026-10-06", "amountMl": 500], revision: revision))
    XCTAssertThrowsError(try write(["type": "set-weight", "date": "2026-10-07", "weightKg": 79]))
    XCTAssertEqual(try Data(contentsOf: url), bytes)
  }

  func testDeleteUndoSurvivesRestartAndPreservesReceipt() throws {
    try write(setup()); try write(["type": "save-intake", "entry": entry()])
    let response = try store.transact(request(["type": "delete-record", "kind": "intake", "id": "meal-1"], operation: "delete-meal"))
    let token = try XCTUnwrap(response["undoToken"] as? String)
    XCTAssertEqual(token, "undo-delete-meal")
    XCTAssertTrue(rows(response["hostData"] as! NSDictionary, "intake").isEmpty)
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try write(["type": "save-intake", "entry": entry()]))
    XCTAssertEqual(try Data(contentsOf: url), before)
    store = subject()
    let restored = try write(["type": "restore-record", "token": token])
    XCTAssertEqual(rows(restored, "intake").first?["kcal"] as? Int, 200)
    XCTAssertTrue(rows(restored, "deletedRecords").isEmpty)
    XCTAssertEqual(rows(restored, "processedOperations").count, 4)
  }

  func testDeletedRecordRequiresItsExactDurableDeleteReceiptAfterReopen() throws {
    try write(["type": "save-intake", "entry": entry()])
    let response = try store.transact(request(["type": "delete-record", "kind": "intake", "id": "meal-1"], operation: "linked-delete"))
    let original = try Data(contentsOf: url)
    let originalJSON = try store.encryptedFile.read()
    for defect in ["removed", "token", "kind", "id", "revision"] {
      let state = try JSONSerialization.jsonObject(with: originalJSON, options: .mutableContainers) as! NSMutableDictionary
      let receipts = state["processedOperations"] as! NSMutableArray
      let deletion = receipts.lastObject as! NSMutableDictionary
      switch defect {
      case "removed": receipts.removeLastObject()
      case "token": deletion.removeObject(forKey: "undoToken")
      case "kind": (deletion["mutation"] as! NSMutableDictionary)["kind"] = "weight"
      case "id": (deletion["mutation"] as! NSMutableDictionary)["id"] = "other-id"
      default: deletion["appliedRevision"] = 1
      }
      let bytes = try JSONSerialization.data(withJSONObject: state); try bytes.write(to: url, options: .atomic)
      XCTAssertThrowsError(try subject().currentSnapshot(), defect)
      let module = RecordsModule(store: subject(), publish: { _ in XCTFail("Invalid store cannot publish") })
      module.getSnapshot(nil) { XCTAssertEqual($0["code"] as? String, "unavailable") }
      XCTAssertEqual(try Data(contentsOf: url), bytes)
    }
    try original.write(to: url, options: .atomic)
    try write(["type": "restore-record", "token": response["undoToken"]!])
    let state = try JSONSerialization.jsonObject(with: store.encryptedFile.read(), options: .mutableContainers) as! NSMutableDictionary
    let receipts = state["processedOperations"] as! NSMutableArray
    (receipts[1] as! NSMutableDictionary).removeObject(forKey: "undoToken")
    let bytes = try JSONSerialization.data(withJSONObject: state); try bytes.write(to: url, options: .atomic)
    XCTAssertThrowsError(try subject().currentSnapshot(), "Restoring consumes the tombstone, not the original undo receipt")
    XCTAssertEqual(try Data(contentsOf: url), bytes)
  }

  func testRestoreOccupiedDateDoesNotOverwriteNewerWeightOrConsumeTombstone() throws {
    try write(setup(overrides: ["initialWeightKg": 80]))
    let deleted = try store.transact(request(["type": "delete-record", "kind": "weight", "id": "weight-2026-10-06"]))
    let token = try XCTUnwrap(deleted["undoToken"] as? String)
    try write(["type": "set-weight", "date": "2026-10-06", "weightKg": 79])
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try write(["type": "restore-record", "token": token]))
    XCTAssertEqual(try Data(contentsOf: url), before)
    XCTAssertEqual(rows(try store.currentSnapshot(), "weights").first?["weightKg"] as? Int, 79)
  }

  func testMirrorsCannotBeEditedOrDeletedByGenericTransactions() throws {
    try write(setup()); try store.replaceHealthKitMirrors(weights: [["date": "2026-10-05", "weightKg": 80]], exercises: [])
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try write(["type": "set-weight", "id": "hk-weight-2026-10-05", "date": "2026-10-05", "weightKg": 79]))
    XCTAssertThrowsError(try write(["type": "delete-record", "kind": "weight", "id": "hk-weight-2026-10-05"]))
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testNativeBoundaryRejectsBooleanNumbersAndMalformedDate() throws {
    try write(setup()); let before = try Data(contentsOf: url)
    for mutation: NSDictionary in [
      ["type": "set-water", "date": "2026-10-06", "amountMl": true],
      ["type": "set-weight", "date": "2026-02-30", "weightKg": 79],
      ["type": "save-exercise", "exercise": ["id": "ex-1", "date": "2026-10-06", "typeId": "walking", "durationMin": false, "kcal": 0]],
    ] { XCTAssertThrowsError(try write(mutation)) }
    XCTAssertThrowsError(try store.transact(["operationId": "bool-revision", "expectedRevision": true, "mutation": setup()]))
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testUnreadableExistingFileAndFailedAtomicMigrationDoNotReplaceContents() throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let corrupt = Data("{broken".utf8); try corrupt.write(to: url)
    XCTAssertThrowsError(try store.currentSnapshot())
    XCTAssertThrowsError(try store.transact(["operationId": "error", "expectedRevision": 0, "mutation": setup()]))
    XCTAssertEqual(try Data(contentsOf: url), corrupt)
    let blocked = directory.appendingPathComponent("blocked"); try Data("block".utf8).write(to: blocked)
    let failing = RecordsStore(recordsURL: blocked.appendingPathComponent("records.json"))
    XCTAssertThrowsError(try failing.transact(["operationId": "setup", "expectedRevision": 0, "mutation": setup()]))
    XCTAssertEqual(try Data(contentsOf: blocked), Data("block".utf8))
  }

  func testModuleSignaturesAndNoEventsOnReplayOrFailure() throws {
    for method in RecordsModule.methodLookup.values {
      let selector = NSSelectorFromString(method)
      XCTAssertEqual(method_getNumberOfArguments(try XCTUnwrap(class_getInstanceMethod(RecordsModule.self, selector))), 4)
    }
    var events = 0
    let module = RecordsModule(store: store) { _ in events += 1 }
    module.getSnapshot(nil) { XCTAssertNotNil($0["hostData"]) }
    let setupRequest = try request(setup(), operation: "module-setup")
    module.mutate(setupRequest) { XCTAssertEqual($0["success"] as? Bool, true) }
    module.mutate(setupRequest) { XCTAssertEqual($0["replayed"] as? Bool, true) }
    module.mutate(["operationId": "stale", "expectedRevision": 0, "mutation": setup()]) { XCTAssertEqual($0["code"] as? String, "conflict") }
    XCTAssertEqual(events, 1)
  }

  func testPrivateWireEnvelopePreservesNullFlagsAndGoalsWithoutAcceptingMissingKeys() throws {
    let mutation = setup(overrides: ["weeklyLossKg": NSNull(), "safetyFlags": ["pregnant": NSNull(), "breastfeeding": NSNull(), "eatingDisorderRisk": NSNull()]])
    let original = try request(mutation, operation: "wire-setup")
    let json = String(data: try JSONSerialization.data(withJSONObject: original), encoding: .utf8)!
    let module = RecordsModule(store: store, publish: { _ in })
    module.mutate(["__leanonRecordsRequestJSON": json]) { response in
      XCTAssertEqual(response["success"] as? Bool, true)
      let host = response["hostData"] as? NSDictionary
      XCTAssertTrue(host?["goalWeightKg"] is NSNull)
      XCTAssertTrue(host?["weeklyLossKg"] is NSNull)
      XCTAssertTrue((host?["safetyFlags"] as? NSDictionary)?["pregnant"] is NSNull)
    }
    let before = try Data(contentsOf: url)
    let missing = mutation.mutableCopy() as! NSMutableDictionary; missing["safetyFlags"] = [:]
    module.mutate(try request(missing)) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testPrivateWireEnvelopeRejectsMalformedNonObjectAndAmbiguousPayloads() throws {
    let module = RecordsModule(store: store, publish: { _ in })
    for value: NSDictionary in [
      ["__leanonRecordsRequestJSON": "{"], ["__leanonRecordsRequestJSON": "null"],
      ["__leanonRecordsRequestJSON": "[]"], ["__leanonRecordsRequestJSON": true],
      ["__leanonRecordsRequestJSON": "{}", "operationId": "mixed"],
    ] { module.mutate(value) { XCTAssertEqual($0["code"] as? String, "invalid-request") } }
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
  }
}
