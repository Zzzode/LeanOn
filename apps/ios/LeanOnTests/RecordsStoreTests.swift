import XCTest
@testable import LeanOn

/// Every fixture and mutation stays in a disposable temporary directory.
final class RecordsStoreTests: XCTestCase {
  private var directory: URL!
  private var recordsURL: URL!
  private var seedURL: URL!

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-store-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    recordsURL = directory.appendingPathComponent("records.json")
    seedURL = directory.appendingPathComponent("seed.json")
    try writeSeed([
      "today": "2026-10-01", "profile": ["displayName": "Fixture", "sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "weights": [["date": "2026-10-01", "weightKg": 80]],
      "intake": [], "exercises": [], "customFoods": [],
      "recentFoodIds": [], "unrecognizedFutureField": ["keep": true],
    ])
  }

  override func tearDownWithError() throws {
    try FileManager.default.removeItem(at: directory)
  }

  func testSeedsOnFirstLoad() {
    XCTAssertEqual(weight(store().loadHostData(), for: "2026-10-01"), 80)
  }

  func testAddWeightPersistsAcrossRelaunch() throws {
    let host = try store().addWeight(date: "2026-10-03", weightKg: 79.5)
    XCTAssertEqual(weight(host, for: "2026-10-03"), 79.5)
    XCTAssertEqual(weight(store().loadHostData(), for: "2026-10-03"), 79.5)
  }

  func testAddWeightReplacesSameDateInsteadOfDuplicating() throws {
    let subject = store()
    try subject.addWeight(date: "2026-10-03", weightKg: 79.5)
    let host = try subject.addWeight(date: "2026-10-03", weightKg: 78.9)
    let matches = rows(host, "weights").filter { $0["date"] as? String == "2026-10-03" }
    XCTAssertEqual(matches.count, 1)
    XCTAssertEqual(matches.first?["weightKg"] as? Double, 78.9)
  }

  func testFoodAccumulatesMacrosMicrosAndKeepsSeparateDates() throws {
    let subject = store()
    try subject.addIntake(date: "2026-10-01", kcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6,
                          fiberG: 0.8, sugarG: 0.1, saturatedFatG: 0.2, sodiumMg: 2, foodId: "rice")
    try subject.addIntake(date: "2026-10-02", kcal: 120, proteinG: 10, carbsG: 6, fatG: 5, foodId: "yogurt")
    let firstSnapshot = try subject.addIntake(date: "2026-10-01", kcal: 140, proteinG: 12, carbsG: 1, fatG: 9,
                                            fiberG: 1.2, sugarG: 0.4, saturatedFatG: 2.8, sodiumMg: 140, foodId: "eggs")
    let persisted = store().loadHostData()
    let intake = rows(persisted, "intake")
    XCTAssertEqual(intake.count, 2)
    let day = try XCTUnwrap(intake.first { $0["date"] as? String == "2026-10-01" })
    XCTAssertEqual(day["kcal"] as? Double, 400)
    let macros = try XCTUnwrap(day["macros"] as? [String: Double])
    XCTAssertEqual(try XCTUnwrap(macros["proteinG"]), 17.4, accuracy: 0.0001)
    XCTAssertEqual(macros["carbsG"], 57)
    XCTAssertEqual(try XCTUnwrap(macros["fatG"]), 9.6, accuracy: 0.0001)
    let micros = try XCTUnwrap(day["micros"] as? [String: Double])
    XCTAssertEqual(micros["fiberG"], 2)
    XCTAssertEqual(micros["sugarG"], 0.5)
    XCTAssertEqual(micros["saturatedFatG"], 3)
    XCTAssertEqual(micros["sodiumMg"], 142)
    XCTAssertEqual(persisted["recentFoodIds"] as? [String], ["eggs", "yogurt", "rice"])
    XCTAssertEqual((persisted["unrecognizedFutureField"] as? NSDictionary)?["keep"] as? Bool, true)
    // Returned snapshots must not change when a later operation updates the day.
    try subject.addIntake(date: "2026-10-01", kcal: 50, proteinG: 0, carbsG: 0, fatG: 0)
    XCTAssertEqual(rows(firstSnapshot, "intake").first?["kcal"] as? Double, 400)
  }

  func testRecentFoodsMoveToFrontAndAreCappedAtTwelve() throws {
    let subject = store()
    for index in 0..<15 {
      try subject.addIntake(date: "2026-10-01", kcal: 1, proteinG: 0, carbsG: 0, fatG: 0, foodId: "food-\(index)")
    }
    let host = try subject.addIntake(date: "2026-10-01", kcal: 1, proteinG: 0, carbsG: 0, fatG: 0, foodId: "food-8")
    let recent = try XCTUnwrap(host["recentFoodIds"] as? [String])
    XCTAssertEqual(recent.count, 12)
    XCTAssertEqual(recent.first, "food-8")
    XCTAssertEqual(recent.filter { $0 == "food-8" }.count, 1)
    XCTAssertFalse(recent.contains("food-0"))
  }

  func testExerciseAddUpdateDeletePreservesIdentifiersAndOtherSessions() throws {
    let subject = store()
    let first = try subject.addExercise(date: "2026-10-01", typeId: "walking", durationMin: 20.5, kcal: 80)
    let id = try XCTUnwrap(rows(first, "exercises").first?["id"] as? String)
    try subject.addExercise(date: "2026-10-01", typeId: "cycling", durationMin: 30, kcal: 180)
    let updated = try subject.updateExercise(id: id, date: "2026-10-02", typeId: "walking", durationMin: 40, kcal: 160)
    XCTAssertEqual(rows(updated, "exercises").count, 2)
    let session = try XCTUnwrap(rows(updated, "exercises").first { $0["id"] as? String == id })
    XCTAssertEqual(session["durationMin"] as? Double, 40)
    XCTAssertEqual(session["date"] as? String, "2026-10-02")
    let deleted = try subject.deleteExercise(id: id)
    XCTAssertEqual(rows(deleted, "exercises").count, 1)
    XCTAssertEqual(rows(store().loadHostData(), "exercises").first?["typeId"] as? String, "cycling")
  }

  func testMissingExerciseAndInvalidValuesDoNotChangeExistingFile() throws {
    let subject = store()
    _ = subject.loadHostData()
    let original = try Data(contentsOf: recordsURL)
    XCTAssertThrowsError(try subject.updateExercise(id: "absent", date: "2026-10-01", typeId: "walking", durationMin: 20, kcal: 80))
    XCTAssertThrowsError(try subject.deleteExercise(id: "absent"))
    XCTAssertThrowsError(try subject.addIntake(date: "2026-10-01", kcal: .nan, proteinG: 0, carbsG: 0, fatG: 0))
    XCTAssertThrowsError(try subject.addExercise(date: "2026-10-01", typeId: "walking", durationMin: 0, kcal: 80))
    XCTAssertEqual(try Data(contentsOf: recordsURL), original)
  }

  func testOlderRecordsGainMicrosAndStableExerciseIdsWithoutLosingFields() throws {
    try writeSeed([
      "weights": [], "profile": ["displayName": "Older fixture", "sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "intake": [["date": "2026-10-01", "kcal": 100, "macros": ["proteinG": 1, "carbsG": 2, "fatG": 3]]],
      "exercises": [["date": "2026-10-01", "typeId": "walking", "durationMin": 20, "kcal": 80, "source": "leanon", "legacyLabel": "manual"]],
    ])
    let subject = store()
    let host = try subject.addIntake(date: "2026-10-01", kcal: 50, proteinG: 2, carbsG: 4, fatG: 6, fiberG: 3)
    XCTAssertEqual(rows(host, "intake").first?["kcal"] as? Double, 150)
    XCTAssertEqual((rows(host, "intake").first?["micros"] as? [String: Double])?["fiberG"], 3)
    let id = try XCTUnwrap(rows(host, "exercises").first?["id"] as? String)
    XCTAssertFalse(id.isEmpty)
    let edited = try subject.updateExercise(id: id, date: "2026-10-01", typeId: "walking", durationMin: 25, kcal: 100)
    XCTAssertEqual(rows(edited, "exercises").first?["source"] as? String, "leanon")
    XCTAssertEqual(rows(edited, "exercises").first?["legacyLabel"] as? String, "manual")
    XCTAssertEqual(rows(store().loadHostData(), "exercises").first?["id"] as? String, id)
    XCTAssertEqual((edited["profile"] as? NSDictionary)?["displayName"] as? String, "Older fixture")
  }

  func testCorruptEstablishedStoreIsNotReseeded() throws {
    let original = Data("corrupted fixture that must be preserved".utf8)
    try original.write(to: recordsURL)
    let subject = store()
    XCTAssertTrue(subject.loadHostData().count == 0)
    XCTAssertThrowsError(try subject.addWeight(date: "2026-10-01", weightKg: 79))
    XCTAssertThrowsError(try subject.addIntake(date: "2026-10-01", kcal: 50, proteinG: 0, carbsG: 0, fatG: 0))
    XCTAssertEqual(try Data(contentsOf: recordsURL), original)
  }

  func testAtomicWriteFailureThrowsAndPreservesPersistedData() throws {
    let subject = store()
    _ = subject.loadHostData()
    let original = try Data(contentsOf: recordsURL)
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: directory.path)
    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path) }
    XCTAssertThrowsError(try subject.addWeight(date: "2026-10-01", weightKg: 78))
    XCTAssertThrowsError(try subject.addIntake(date: "2026-10-01", kcal: 50, proteinG: 0, carbsG: 0, fatG: 0))
    XCTAssertThrowsError(try subject.addExercise(date: "2026-10-01", typeId: "walking", durationMin: 20, kcal: 80))
    XCTAssertEqual(try Data(contentsOf: recordsURL), original)
  }

  func testConcurrentDailyWritesDoNotLoseMeals() throws {
    let subject = store()
    let errorLock = NSLock()
    var errors: [Error] = []
    DispatchQueue.concurrentPerform(iterations: 30) { _ in
      do { try subject.addIntake(date: "2026-10-01", kcal: 10, proteinG: 1, carbsG: 2, fatG: 0) }
      catch { errorLock.lock(); errors.append(error); errorLock.unlock() }
    }
    XCTAssertTrue(errors.isEmpty)
    let day = try XCTUnwrap(rows(store().loadHostData(), "intake").first)
    XCTAssertEqual(day["kcal"] as? Double, 300)
    XCTAssertEqual((day["macros"] as? [String: Double])?["proteinG"], 30)
  }

  private func store() -> RecordsStore { RecordsStore(recordsURL: recordsURL, seedURL: seedURL) }
  private func writeSeed(_ fixture: [String: Any]) throws {
    try JSONSerialization.data(withJSONObject: fixture).write(to: seedURL)
  }
  private func rows(_ host: NSDictionary, _ key: String) -> [[String: Any]] {
    host[key] as? [[String: Any]] ?? []
  }
  private func weight(_ host: NSDictionary, for date: String) -> Double? {
    rows(host, "weights").first { $0["date"] as? String == date }?["weightKg"] as? Double
  }
}
