import XCTest
@testable import LeanOn

final class ScannedFoodBarcodeTests: XCTestCase {
  func testGS1WorkedExamplesAndCanonicalUPCIdentity() {
    XCTAssertEqual(ProductBarcode.normalize("96385074"), "96385074")
    XCTAssertEqual(ProductBarcode.normalize(" 3017620422003 "), "3017620422003")
    XCTAssertEqual(ProductBarcode.normalize("10012345000017"), "10012345000017")
    XCTAssertEqual(ProductBarcode.normalize("036000291452"), "0036000291452")
    XCTAssertEqual(ProductBarcode.normalize("0036000291452"), "0036000291452")
    for value in ["3017620422004", "00000000", "https://example.com", "12345", "3017-620422003",
                  "3017620422003\nX", "１２３４５６７８"] {
      XCTAssertNil(ProductBarcode.normalize(value), value)
    }
  }

  func testUPCEExpandsBeforeCheckingGS1Digit() {
    XCTAssertEqual(ProductBarcode.expandUPCE("04252614"), "0042100005264")
    XCTAssertEqual(ProductBarcode.expandUPCE("09847531"), "0098400000751")
    XCTAssertEqual(ProductBarcode.expandUPCE("01234558"), "0012345000058")
    for value in ["04252615", "00000000", "94252614", "425261", "arbitrary"] {
      XCTAssertNil(ProductBarcode.expandUPCE(value), value)
    }
  }

  func testScannedWriteRejectsInvalidCodeBeforeMutationOrEvents() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("records.json")
    try Data(#"{"weights":[],"intake":[],"exercises":[],"water":[],"customFoods":[]}"#.utf8).write(to: url)
    let before = try Data(contentsOf: url)
    var events = 0
    let module = HealthModule(recordsStore: RecordsStore(recordsURL: url, seedURL: nil)) { _ in events += 1 }
    for value: Any in ["123", "3017620422004", "00000000", "junk", true, 3017620422003, NSNull()] {
      module.writeScannedFood(["barcode": value, "name": "Fixture", "kcal": 90]) {
        XCTAssertEqual($0["code"] as? String, "invalid-request")
        XCTAssertNil($0["success"])
      }
    }
    XCTAssertEqual(events, 0)
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testUPCAndEANWritesReuseCanonicalIDAndSurviveReload() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("records.json")
    try Data(#"{"weights":[],"intake":[],"exercises":[],"water":[],"customFoods":[]}"#.utf8).write(to: url)
    var events = 0
    let module = HealthModule(recordsStore: RecordsStore(recordsURL: url, seedURL: nil)) { _ in events += 1 }
    for barcode in ["036000291452", "0036000291452"] {
      module.writeScannedFood(["barcode": barcode, "name": "Public-code synthetic fixture", "kcal": 90]) {
        XCTAssertEqual($0["success"] as? Bool, true)
      }
    }
    let snapshot = try RecordsStore(recordsURL: url, seedURL: nil).currentSnapshot()
    let foods = try XCTUnwrap(snapshot["customFoods"] as? [[String: Any]])
    XCTAssertEqual(foods.count, 1)
    XCTAssertEqual(foods[0]["id"] as? String, "off-0036000291452")
    XCTAssertEqual(foods[0]["barcode"] as? String, "0036000291452")
    XCTAssertEqual(events, 2)
  }
}
