import XCTest
@testable import LeanOn

/// End-to-end coverage of the health.writeWeight bridge method: validation,
/// store mutation, HostData response (RFC 0010).
final class HealthModuleWriteWeightTests: XCTestCase {

  private var directory: URL!
  private var store: RecordsStore!

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    store = RecordsStore(recordsURL: directory.appendingPathComponent("records.json"))
  }

  func testWriteWeightReturnsUpdatedHostData() {
    let module = HealthModule(recordsStore: store)
    let exp = expectation(description: "writeWeight success callback")

    module.writeWeight(["date": "2026-10-03", "weightKg": 79.5]) { result in
      XCTAssertEqual(result["success"] as? Bool, true)
      let host = result["hostData"] as? NSDictionary
      let weights = host?["weights"] as? [[String: Any]] ?? []
      let match = weights.first { $0["date"] as? String == "2026-10-03" }
      XCTAssertEqual(match?["weightKg"] as? Double, 79.5)
      exp.fulfill()
    }

    wait(for: [exp], timeout: 3)
  }

  func testWriteWeightRejectsMissingAndOutOfRange() {
    let module = HealthModule(recordsStore: store)
    let cases: [(NSDictionary, String)] = [
      (["weightKg": 79.5], "missing date"),
      (["date": "2026-10-03"], "missing weightKg"),
      (["date": "2026-10-03", "weightKg": 10], "below range"),
      (["date": "2026-10-03", "weightKg": 400], "above range"),
    ]

    for (params, label) in cases {
      let exp = expectation(description: label)
      module.writeWeight(params) { result in
        XCTAssertEqual(result["code"] as? String, "invalid-request", label)
        exp.fulfill()
      }
      wait(for: [exp], timeout: 3)
    }
  }

  override func tearDownWithError() throws {
    try FileManager.default.removeItem(at: directory)
  }

  func testIntakeAggregateAndExerciseEditSurviveReload() throws {
    let module = HealthModule(recordsStore: store)
    let date = "2026-10-03"
    let macros: NSDictionary = ["proteinG": 2.7, "carbsG": 28, "fatG": 0.3]
    module.writeIntake(["date": date, "kcal": 130, "macros": macros, "foodId": "rice-white-cooked"]) {
      XCTAssertEqual($0["success"] as? Bool, true)
    }
    module.writeIntake(["date": date, "kcal": 130, "macros": macros]) {
      XCTAssertEqual($0["success"] as? Bool, true)
      let intake = ($0["hostData"] as? NSDictionary)?["intake"] as? [[String: Any]] ?? []
      XCTAssertEqual(intake.first { $0["date"] as? String == date }?["kcal"] as? Double, 260)
    }
    var id = ""
    module.writeExercise(["date": date, "typeId": "walking-brisk", "durationMin": 20, "kcal": 102]) {
      XCTAssertEqual($0["success"] as? Bool, true)
      let exercises = ($0["hostData"] as? NSDictionary)?["exercises"] as? [[String: Any]] ?? []
      id = exercises.last?["id"] as? String ?? ""
    }
    XCTAssertFalse(id.isEmpty)
    module.updateExercise(["id": id, "date": date, "typeId": "walking-brisk", "durationMin": 25, "kcal": 127]) {
      XCTAssertEqual($0["success"] as? Bool, true)
    }
    let fresh = RecordsStore(recordsURL: directory.appendingPathComponent("records.json")).loadHostData()
    let exercises = fresh["exercises"] as? [[String: Any]] ?? []
    XCTAssertEqual(exercises.filter { $0["id"] as? String == id }.count, 1)
    XCTAssertEqual(exercises.first { $0["id"] as? String == id }?["durationMin"] as? Double, 25)
    module.deleteExercise(["id": id]) { XCTAssertEqual($0["success"] as? Bool, true) }
    let remaining = store.loadHostData()["exercises"] as? [[String: Any]] ?? []
    XCTAssertFalse(remaining.contains { $0["id"] as? String == id })
  }

  func testInvalidIntakeAndExerciseNeverMutateStore() throws {
    let url = directory.appendingPathComponent("records.json")
    // Formal empty reads do not create a file; this regression explicitly
    // establishes a synthetic file before checking unchanged persisted bytes.
    try JSONSerialization.data(withJSONObject: store.loadHostData()).write(to: url)
    let before = try Data(contentsOf: url)
    let module = HealthModule(recordsStore: store)
    let cases: [NSDictionary] = [
      ["date": "2026-02-30", "kcal": 100, "macros": ["proteinG": 0, "carbsG": 0, "fatG": 0]],
      ["date": "2026-10-03", "kcal": true, "macros": ["proteinG": 0, "carbsG": 0, "fatG": 0]],
      ["date": "2026-10-03", "kcal": 100, "macros": ["proteinG": -1, "carbsG": 0, "fatG": 0]],
      ["date": "2026-10-03", "kcal": 100, "macros": ["proteinG": 0, "carbsG": 0, "fatG": 0], "micros": ["sodiumMg": "bad"]],
    ]
    for params in cases {
      module.writeIntake(params) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    }
    module.writeExercise(["date": "2026-10-03", "typeId": "walking-brisk", "durationMin": 1441, "kcal": 100]) {
      XCTAssertEqual($0["code"] as? String, "invalid-request")
    }
    module.updateExercise(["id": "missing", "date": "2026-10-03", "typeId": "walking-brisk", "durationMin": 20, "kcal": 100]) {
      XCTAssertNotNil($0["code"])
      XCTAssertNil($0["success"])
    }
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testStoreFailureReturnsErrorInsteadOfSuccess() throws {
    let url = directory.appendingPathComponent("unwritable")
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    let module = HealthModule(recordsStore: RecordsStore(recordsURL: url))
    module.writeExercise(["date": "2026-10-03", "typeId": "walking-brisk", "durationMin": 20, "kcal": 100]) {
      XCTAssertEqual($0["code"] as? String, "unavailable")
      XCTAssertNil($0["success"])
    }
  }

}
