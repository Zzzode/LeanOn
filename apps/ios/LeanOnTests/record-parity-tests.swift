import XCTest
import ObjectiveC
@testable import LeanOn

/// All writes target synthetic fixtures in a disposable directory.
final class RecordParityTests: XCTestCase {
  private var directory: URL!
  private var url: URL!
  private var store: RecordsStore!

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-parity-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    url = directory.appendingPathComponent("records.json")
    try JSONSerialization.data(withJSONObject: [
      "weights": [], "intake": [], "exercises": [], "water": [], "customFoods": [],
      "favoriteFoodIds": [], "recentFoodIds": [], "future": ["preserve": true],
    ]).write(to: url)
    store = RecordsStore(recordsURL: url, seedURL: nil)
  }

  override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

  func testWaterIsAbsoluteDailyTotalAndZeroSurvivesReload() throws {
    try store.upsertWater(date: "2026-10-06", amountMl: 250)
    try store.upsertWater(date: "2026-10-07", amountMl: 500)
    try store.upsertWater(date: "2026-10-06", amountMl: 0)
    let host = RecordsStore(recordsURL: url).loadHostData()
    let water = rows(host, "water")
    XCTAssertEqual(water.count, 2)
    XCTAssertEqual(water.first { $0["date"] as? String == "2026-10-06" }?["amountMl"] as? Double, 0)
    XCTAssertEqual(water.first { $0["date"] as? String == "2026-10-07" }?["amountMl"] as? Double, 500)
    XCTAssertEqual((host["future"] as? NSDictionary)?["preserve"] as? Bool, true)
  }

  func testCustomFoodLifecyclePersistsNutritionAndRemovesReferencesWithoutChangingIntake() throws {
    var fields = RecordsStore.FoodFields(name: "  手作豆腐  ", kcal: 120)
    fields.proteinG = 12; fields.sodiumMg = 50; fields.defaultGrams = 200
    let created = try store.addCustomFood(fields)
    let food = try XCTUnwrap(rows(created, "customFoods").first)
    let id = try XCTUnwrap(food["id"] as? String)
    XCTAssertTrue(id.hasPrefix("custom-"))
    XCTAssertEqual((food["name"] as? [String: String])?["zh-CN"], "手作豆腐")
    XCTAssertEqual((food["macros"] as? [String: Double])?["proteinG"], 12)
    XCTAssertEqual((food["micros"] as? [String: Double])?["fiberG"], 0)
    try store.setFoodFavorite(id: id, favorite: true)
    try store.addIntake(date: "2026-10-06", kcal: 120, proteinG: 12, carbsG: 0, fatG: 0, foodId: id)
    fields = .init(name: "Revised", kcal: 120)
    try store.updateCustomFood(id: id, fields: fields)
    let updated = rows(RecordsStore(recordsURL: url).loadHostData(), "customFoods").first
    XCTAssertEqual(updated?["id"] as? String, id)
    XCTAssertEqual(updated?["source"] as? String, "custom")
    XCTAssertNil(updated?["defaultGrams"])
    XCTAssertEqual((food["name"] as? [String: String])?["en"], "手作豆腐", "Previous snapshot is immutable")
    let deleted = try store.deleteCustomFood(id: id)
    XCTAssertTrue(rows(deleted, "customFoods").isEmpty)
    XCTAssertEqual(deleted["favoriteFoodIds"] as? [String], [])
    XCTAssertEqual(deleted["recentFoodIds"] as? [String], [])
    XCTAssertEqual(rows(deleted, "intake").first?["kcal"] as? Double, 120)
    XCTAssertTrue(rows(RecordsStore(recordsURL: url).loadHostData(), "customFoods").isEmpty)
  }

  func testScannedFoodUpsertAndEditPreserveBarcodeAndOrigin() throws {
    let barcode = "1234567890123"
    try store.upsertScannedFood(barcode: barcode, fields: .init(name: "Original", kcal: 80))
    var fields = RecordsStore.FoodFields(name: "Replacement", kcal: 90)
    fields.defaultGrams = 150
    try store.upsertScannedFood(barcode: barcode, fields: fields)
    try store.updateCustomFood(id: "off-\(barcode)", fields: .init(name: "Edited", kcal: 100))
    let foods = rows(RecordsStore(recordsURL: url).loadHostData(), "customFoods")
    XCTAssertEqual(foods.count, 1)
    XCTAssertEqual(foods.first?["barcode"] as? String, barcode)
    XCTAssertEqual(foods.first?["source"] as? String, "open-food-facts")
    XCTAssertEqual(foods.first?["kcal"] as? Double, 100)
    XCTAssertNil(foods.first?["defaultGrams"])
  }

  func testFavoritesTolerateUnknownIdsAndAreIdempotentAcrossReload() throws {
    try store.setFoodFavorite(id: "bundled-rice", favorite: true)
    try store.setFoodFavorite(id: "unknown-future-food", favorite: true)
    try store.setFoodFavorite(id: "bundled-rice", favorite: true)
    XCTAssertEqual(RecordsStore(recordsURL: url).loadHostData()["favoriteFoodIds"] as? [String],
                   ["bundled-rice", "unknown-future-food"])
    let host = try store.setFoodFavorite(id: "bundled-rice", favorite: false)
    XCTAssertEqual(host["favoriteFoodIds"] as? [String], ["unknown-future-food"])
  }

  func testMissingFoodAndInvalidInputsPreserveBytes() throws {
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try store.upsertWater(date: "2026-02-30", amountMl: 250))
    XCTAssertThrowsError(try store.upsertWater(date: "2026-10-06", amountMl: -.infinity))
    XCTAssertThrowsError(try store.addCustomFood(.init(name: " ", kcal: 100)))
    XCTAssertThrowsError(try store.addCustomFood(.init(name: "Food", kcal: .nan)))
    XCTAssertThrowsError(try store.updateCustomFood(id: "missing", fields: .init(name: "Food", kcal: 100)))
    XCTAssertThrowsError(try store.deleteCustomFood(id: "missing"))
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testBundledSourceCannotBeEditedOrDeletedThroughUserFoodMethods() throws {
    let data = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url), options: .mutableContainers) as? NSMutableDictionary)
    data["customFoods"] = [["id": "protected", "name": ["en": "Bundled", "zh-CN": "Bundled"],
      "source": "table", "kcal": 100, "macros": ["proteinG": 0, "carbsG": 0, "fatG": 0],
      "micros": ["fiberG": 0, "sugarG": 0, "saturatedFatG": 0, "sodiumMg": 0]]]
    try JSONSerialization.data(withJSONObject: data).write(to: url)
    let before = try Data(contentsOf: url)
    XCTAssertThrowsError(try store.updateCustomFood(id: "protected", fields: .init(name: "Changed", kcal: 150)))
    XCTAssertThrowsError(try store.deleteCustomFood(id: "protected"))
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testConcurrentCustomFoodsDoNotLoseWrites() {
    let lock = NSLock(); var errors: [Error] = []
    DispatchQueue.concurrentPerform(iterations: 25) { index in
      do { try store.addCustomFood(.init(name: "Food \(index)", kcal: 100)) }
      catch { lock.lock(); errors.append(error); lock.unlock() }
    }
    XCTAssertTrue(errors.isEmpty)
    let foods = rows(RecordsStore(recordsURL: url).loadHostData(), "customFoods")
    XCTAssertEqual(foods.count, 25)
    XCTAssertEqual(Set(foods.compactMap { $0["id"] as? String }).count, 25)
  }

  func testModuleOnlyPublishesPersistedSnapshotsAndReturnsNotFound() throws {
    var events: [NSDictionary] = []
    let module = HealthModule(recordsStore: store) { host in
      XCTAssertEqual(host, try? RecordsStore(recordsURL: self.url).currentSnapshot())
      events.append(host)
    }
    module.writeWater(["date": "2026-10-06", "amountMl": 250]) { XCTAssertEqual($0["success"] as? Bool, true) }
    module.writeCustomFood(["name": "Meal", "kcal": 100, "defaultGrams": 100]) { XCTAssertEqual($0["success"] as? Bool, true) }
    let id = try XCTUnwrap(rows(store.loadHostData(), "customFoods").first?["id"] as? String)
    module.updateCustomFood(["id": id, "name": "Edited", "kcal": 80, "defaultGrams": NSNull()]) { XCTAssertEqual($0["success"] as? Bool, true) }
    module.setFoodFavorite(["id": id, "favorite": true]) { XCTAssertEqual($0["success"] as? Bool, true) }
    module.writeScannedFood(["barcode": "3017620422003", "name": "Scanned", "kcal": 90]) { XCTAssertEqual($0["success"] as? Bool, true) }
    module.deleteCustomFood(["id": id]) { XCTAssertEqual($0["success"] as? Bool, true) }
    XCTAssertEqual(events.count, 6)
    module.deleteCustomFood(["id": "missing"]) { XCTAssertEqual($0["code"] as? String, "not-found"); XCTAssertNil($0["success"]) }
    XCTAssertEqual(events.count, 6)
  }

  func testModuleWrongTypesNeverWriteOrPublish() throws {
    var events = 0
    let module = HealthModule(recordsStore: store) { _ in events += 1 }
    let before = try Data(contentsOf: url)
    for request: NSDictionary in [["date": "2026-10-06", "amountMl": true], ["date": "2026-02-30", "amountMl": 250], ["date": "2026-10-06", "amountMl": "250"], ["date": "2026-10-06", "amountMl": -1]] {
      module.writeWater(request) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    }
    for request: NSDictionary in [["name": "Food", "kcal": true], ["name": "Food", "kcal": 100, "proteinG": NSNull()], ["name": "Food", "kcal": 100, "sodiumMg": "1"], ["name": "Food", "kcal": 100, "defaultGrams": 0], ["name": " ", "kcal": 100]] {
      module.writeCustomFood(request) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    }
    module.setFoodFavorite(["id": "rice", "favorite": 1]) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    module.writeScannedFood(["barcode": " ", "name": "Food", "kcal": 100]) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    XCTAssertEqual(events, 0)
    XCTAssertEqual(try Data(contentsOf: url), before)
  }

  func testCorruptStoreAndFailedAtomicWriteNeverPublishSuccess() throws {
    var events = 0
    let module = HealthModule(recordsStore: store) { _ in events += 1 }
    let before = try Data(contentsOf: url)
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: directory.path)
    module.writeWater(["date": "2026-10-06", "amountMl": 250]) { XCTAssertEqual($0["code"] as? String, "unavailable"); XCTAssertNil($0["success"]) }
    module.writeCustomFood(["name": "Food", "kcal": 100]) { XCTAssertEqual($0["code"] as? String, "unavailable") }
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
    XCTAssertEqual(try Data(contentsOf: url), before)
    let corrupt = Data("{invalid fixture".utf8); try corrupt.write(to: url)
    module.setFoodFavorite(["id": "rice", "favorite": true]) { XCTAssertEqual($0["code"] as? String, "unavailable") }
    XCTAssertEqual(try Data(contentsOf: url), corrupt)
    XCTAssertEqual(events, 0)
  }

  func testEveryAdvertisedHealthMethodHasRequestAndCallbackSignature() throws {
    for methodName in ["writeWeight", "writeIntake", "writeExercise", "updateExercise", "deleteExercise",
                       "writeWater", "setFoodFavorite", "writeCustomFood", "updateCustomFood", "deleteCustomFood", "writeScannedFood"] {
      let name = "health.\(methodName)"
      XCTAssertTrue(CapabilityRegistry().supports(method: name), name)
      let exported = try XCTUnwrap(HealthModule.methodLookup[methodName], name)
      let method = try XCTUnwrap(class_getInstanceMethod(HealthModule.self, NSSelectorFromString(exported)), name)
      XCTAssertEqual(method_getNumberOfArguments(method), 4, name)
    }
  }

  func testGenericHealthPlaceholdersReturnUnavailableWithoutFalseEmptyData() throws {
    let module = HealthModule(recordsStore: store) { _ in XCTFail("No record event is expected") }
    module.authorize([:]) { XCTAssertEqual($0["code"] as? String, "unavailable") }
    module.readSamples([:]) {
      XCTAssertEqual($0["code"] as? String, "unavailable")
      XCTAssertNil($0["samples"])
    }
    for name in ["authorize", "readSamples"] {
      XCTAssertFalse(CapabilityRegistry().supports(method: "health.\(name)"))
      let selector = try XCTUnwrap(HealthModule.methodLookup[name])
      let method = try XCTUnwrap(class_getInstanceMethod(HealthModule.self, NSSelectorFromString(selector)))
      XCTAssertEqual(method_getNumberOfArguments(method), 4)
    }
  }

  private func rows(_ host: NSDictionary, _ key: String) -> [[String: Any]] { host[key] as? [[String: Any]] ?? [] }
}
