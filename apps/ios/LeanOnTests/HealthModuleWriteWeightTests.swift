import XCTest
@testable import LeanOn

/// End-to-end coverage of the health.writeWeight bridge method: validation,
/// store mutation, HostData response (RFC 0010).
final class HealthModuleWriteWeightTests: XCTestCase {

  override func setUp() {
    super.setUp()
    let docs = FileManager.default.urls(for: .documentDirectory,
                                        in: .userDomainMask)[0]
    try? FileManager.default.removeItem(at: docs.appendingPathComponent("records.json"))
  }

  func testWriteWeightReturnsUpdatedHostData() {
    let module = HealthModule()
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
    let module = HealthModule()
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
}
