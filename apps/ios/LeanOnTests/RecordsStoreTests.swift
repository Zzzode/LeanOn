import XCTest
@testable import LeanOn

/// Verifies the native persistence authority: seeding, upsert semantics and
/// durability across an app relaunch (RFC 0010).
final class RecordsStoreTests: XCTestCase {

  override func setUp() {
    super.setUp()
    Self.cleanRecords()
  }

  override func tearDown() {
    Self.cleanRecords()
    super.tearDown()
  }

  func testSeedsOnFirstLoad() {
    let host = RecordsStore().loadHostData()
    let weights = host["weights"] as? [[String: Any]] ?? []
    XCTAssertFalse(weights.isEmpty, "first load must seed weight history")
  }

  func testAddWeightPersistsAcrossRelaunch() {
    let host = RecordsStore().addWeight(date: "2026-10-03", weightKg: 79.5)
    XCTAssertEqual(Self.weight(host, for: "2026-10-03"), 79.5)

    // A brand-new store simulates process relaunch: it must read persisted data.
    let reloaded = RecordsStore().loadHostData()
    XCTAssertEqual(Self.weight(reloaded, for: "2026-10-03"), 79.5,
                   "weight must be persisted across relaunch")
  }

  func testAddWeightReplacesSameDateInsteadOfDuplicating() {
    let store = RecordsStore()
    store.addWeight(date: "2026-10-03", weightKg: 79.5)
    let host = store.addWeight(date: "2026-10-03", weightKg: 78.9)

    let weights = host["weights"] as? [[String: Any]] ?? []
    let matches = weights.filter { $0["date"] as? String == "2026-10-03" }
    XCTAssertEqual(matches.count, 1, "same date must upsert, not duplicate")
    XCTAssertEqual(matches.first?["weightKg"] as? Double, 78.9)
  }

  // MARK: Helpers

  private static func cleanRecords() {
    let docs = FileManager.default.urls(for: .documentDirectory,
                                        in: .userDomainMask)[0]
    try? FileManager.default.removeItem(at: docs.appendingPathComponent("records.json"))
  }

  private static func weight(_ host: NSDictionary, for date: String) -> Double? {
    let weights = host["weights"] as? [[String: Any]] ?? []
    return weights.first { $0["date"] as? String == date }?["weightKg"] as? Double
  }
}
