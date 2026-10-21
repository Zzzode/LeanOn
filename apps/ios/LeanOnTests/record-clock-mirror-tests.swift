import XCTest
@testable import LeanOn

final class RecordClockMirrorTests: XCTestCase {
  private var directory: URL!
  private var url: URL!

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-clock-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    url = directory.appendingPathComponent("records.json")
  }

  override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

  private func seed(weights: [[String: Any]] = [], intake: [[String: Any]] = [],
                    exercises: [[String: Any]] = [], water: [[String: Any]] = []) throws {
    let completeIntake = intake.map { row -> [String: Any] in
      var value = row
      value["macros"] = ["proteinG": 0, "carbsG": 0, "fatG": 0]
      value["micros"] = ["fiberG": 0, "sugarG": 0, "saturatedFatG": 0, "sodiumMg": 0]
      return value
    }
    try JSONSerialization.data(withJSONObject: [
      "today": "2026-10-01", "todayHour": 19, "streak": 99,
      "profile": ["private": "unchanged", "sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"], "weights": weights, "intake": completeIntake,
      "exercises": exercises, "water": water, "customFoods": [],
    ]).write(to: url)
  }

  private func store(at instant: String, zone: String = "UTC") -> RecordsStore {
    let now = ISO8601DateFormatter().date(from: instant)!
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: zone)!
    return RecordsStore(recordsURL: url, seedURL: nil, clock: { now }, calendar: { calendar })
  }

  func testCurrentSnapshotUsesLocalDayHourAndRealStreakWithoutPersistingMetadata() throws {
    try seed(weights: [["date": "2026-10-05", "weightKg": 80]],
             intake: [["date": "2026-10-07", "kcal": 100]],
             exercises: [["id": "ex-local", "date": "2026-10-06", "typeId": "walking", "durationMin": 10, "kcal": 40]],
             water: [["date": "2026-10-04", "amountMl": 250], ["date": "2026-10-03", "amountMl": 0]])
    let before = try Data(contentsOf: url)
    let la = try store(at: "2026-10-07T00:30:00Z", zone: "America/Los_Angeles").currentSnapshot()
    XCTAssertEqual(la["today"] as? String, "2026-10-06")
    XCTAssertEqual(la["todayHour"] as? Int, 17)
    XCTAssertEqual(la["streak"] as? Int, 3, "Future dates and zero water do not extend streak")
    let utc = try store(at: "2026-10-07T00:30:00Z").currentSnapshot()
    XCTAssertEqual(utc["today"] as? String, "2026-10-07")
    XCTAssertEqual(utc["todayHour"] as? Int, 0)
    XCTAssertEqual(utc["streak"] as? Int, 4)
    XCTAssertEqual((utc["profile"] as? NSDictionary)?["private"] as? String, "unchanged")
    XCTAssertEqual(try Data(contentsOf: url), before)
    let raw = try store(at: "2026-10-07T00:30:00Z").loadSnapshot()
    XCTAssertEqual(raw["today"] as? String, "2026-10-01")
    XCTAssertEqual(raw["streak"] as? Int, 99)
  }

  func testMidnightAndDstPreserveYesterdayStreakUntilGap() throws {
    try seed(water: [["date": "2026-10-31", "amountMl": 250], ["date": "2026-11-01", "amountMl": 250]])
    let snapshot = try store(at: "2026-11-02T05:30:00Z", zone: "America/New_York").currentSnapshot()
    XCTAssertEqual(snapshot["today"] as? String, "2026-11-02")
    XCTAssertEqual(snapshot["todayHour"] as? Int, 0)
    XCTAssertEqual(snapshot["streak"] as? Int, 2)
    let afterGap = try store(at: "2026-11-03T05:30:00Z", zone: "America/New_York").currentSnapshot()
    XCTAssertEqual(afterGap["streak"] as? Int, 0)
  }

  func testMutationResponseHasCurrentMetadataButPersistedHistoryKeepsOriginalMetadata() throws {
    try seed()
    let subject = store(at: "2026-10-06T23:30:00Z", zone: "Asia/Shanghai")
    let response = try subject.upsertWater(date: "2026-10-07", amountMl: 250)
    XCTAssertEqual(response["today"] as? String, "2026-10-07")
    XCTAssertEqual(response["todayHour"] as? Int, 7)
    XCTAssertEqual(response["streak"] as? Int, 1)
    XCTAssertEqual(try subject.loadSnapshot()["today"] as? String, "2026-10-01")
  }

  func testHealthKitReplacementPreservesLocalAndOtherSourcesAndSuppressesOwnWeightDates() throws {
    try seed(weights: [["date": "2026-10-06", "weightKg": 80],
                       ["date": "2026-10-05", "weightKg": 81, "source": "health_connect", "originMetadata": "other"],
                       ["date": "2026-10-04", "weightKg": 82, "source": "healthkit"]],
             exercises: [["id": "ex-own", "date": "2026-10-06", "typeId": "walking", "durationMin": 10, "kcal": 50],
                         ["id": "hk-old", "date": "2026-10-04", "typeId": "walking", "durationMin": 10, "kcal": 50, "source": "healthkit"]])
    let subject = store(at: "2026-10-06T12:00:00Z")
    let host = try subject.replaceHealthKitMirrors(
      weights: [["date": "2026-10-06", "weightKg": 70], ["date": "2026-10-03", "weightKg": 83]],
      exercises: [["id": "hk-new", "date": "2026-10-06", "typeId": "cycling", "durationMin": 20, "kcal": 100]])
    let weights = host["weights"] as? [[String: Any]] ?? []
    XCTAssertEqual(weights.count, 3)
    XCTAssertEqual(weights.first { $0["date"] as? String == "2026-10-06" }?["weightKg"] as? Double, 80)
    XCTAssertEqual(weights.first { $0["date"] as? String == "2026-10-03" }?["id"] as? String, "hk-weight-2026-10-03")
    let sessions = host["exercises"] as? [[String: Any]] ?? []
    XCTAssertEqual(Set(sessions.compactMap { $0["id"] as? String }), ["ex-own", "hk-new"])
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try subject.deleteExercise(id: "hk-new"))
    XCTAssertThrowsError(try subject.updateExercise(id: "hk-new", date: "2026-10-06", typeId: "walking", durationMin: 10, kcal: 50))
    XCTAssertEqual(try Data(contentsOf: url), before)
    let cleared = try subject.replaceHealthKitMirrors(weights: [], exercises: [])
    XCTAssertEqual((cleared["weights"] as? [[String: Any]])?.count, 2)
    XCTAssertEqual((cleared["exercises"] as? [[String: Any]])?.count, 1)
  }

  func testOlderImportsAndHistoricalLocalWritesKeepLatestWeightLast() throws {
    try seed(weights: [["date": "2026-10-03", "weightKg": 80]])
    let subject = store(at: "2026-10-06T12:00:00Z")
    let imported = try subject.replaceHealthKitMirrors(weights: [["date": "2026-10-01", "weightKg": 81]], exercises: [])
    XCTAssertEqual((imported["weights"] as? [[String: Any]])?.last?["weightKg"] as? Double, 80)
    let local = try subject.addWeight(date: "2026-09-30", weightKg: 82)
    XCTAssertEqual((local["weights"] as? [[String: Any]])?.last?["weightKg"] as? Double, 80)
    XCTAssertEqual((local["weights"] as? [[String: Any]])?.first?["weightKg"] as? Double, 82)
  }

  func testOwnWeightReplacesMirroredDayAndNextImportCannotOverrideIt() throws {
    try seed(weights: [["id": "hk-weight-2026-10-06", "date": "2026-10-06", "weightKg": 81, "source": "healthkit"]])
    let subject = store(at: "2026-10-06T12:00:00Z")
    try subject.addWeight(date: "2026-10-06", weightKg: 80)
    let host = try subject.replaceHealthKitMirrors(weights: [["date": "2026-10-06", "weightKg": 79]], exercises: [])
    let weight = (host["weights"] as? [[String: Any]])?.first
    XCTAssertEqual(weight?["weightKg"] as? Double, 80)
    XCTAssertNil(weight?["source"])
    XCTAssertEqual(weight?["id"] as? String, "weight-2026-10-06")
  }

  func testInvalidMirrorsAndThrowingReadsPreserveCorruptFile() throws {
    try seed()
    let subject = store(at: "2026-10-06T12:00:00Z")
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try subject.replaceHealthKitMirrors(weights: [["date": "2026-02-30", "weightKg": 80]], exercises: []))
    XCTAssertThrowsError(try subject.replaceHealthKitMirrors(weights: [["date": "2026-10-06", "weightKg": true]], exercises: []))
    XCTAssertEqual(try Data(contentsOf: url), before)
    let corrupt = Data("{invalid fixture".utf8); try corrupt.write(to: url)
    XCTAssertThrowsError(try subject.loadSnapshot())
    XCTAssertThrowsError(try subject.currentSnapshot())
    XCTAssertThrowsError(try subject.replaceHealthKitMirrors(weights: [], exercises: []))
    XCTAssertEqual(try Data(contentsOf: url), corrupt)
  }
}
