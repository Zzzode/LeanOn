import XCTest

/// Runs only against an explicit synthetic record file and isolated QA preferences.
final class BasicRecordsUITests: XCTestCase {
  private let app = XCUIApplication()
  private let records = URL(fileURLWithPath: "/tmp/leanon-basic-parity-ios-records.json")

  override func setUpWithError() throws {
    continueAfterFailure = false
    let fixture: [String: Any] = [
      "today": "2026-10-01", "todayHour": 19, "streak": 999,
      "profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "goalWeightKg": 72, "weeklyLossKg": 0.6,
      "weights": [["date": "2026-10-06", "weightKg": 80]],
      "intake": [], "exercises": [], "water": [], "customFoods": [],
      "favoriteFoodIds": [], "recentFoodIds": [],
    ]
    try JSONSerialization.data(withJSONObject: fixture).write(to: records, options: .atomic)
    attachRecords("qa-before-records")
    app.launchEnvironment["LEANON_RECORDS_PATH"] = records.path
    app.launchEnvironment["LEANON_LOCALE"] = "en"
    app.launchEnvironment["LEANON_INITIAL_ROUTE"] = "today"
    app.launchEnvironment["LEANON_QA_NOW"] = "2026-10-06T12:00:00Z"
    app.launchEnvironment["LEANON_QA_TIME_ZONE"] = "UTC"
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 10))
    if let mode = ProcessInfo.processInfo.environment["LEANON_PARITY_UI_APPEARANCE"], ["Light", "Dark"].contains(mode) {
      app.tabBars.buttons["Me"].tap()
      let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Settings")).firstMatch
      XCTAssertTrue(settings.waitForExistence(timeout: 5)); settings.tap()
      tap(mode)
      XCTAssertTrue(element("Current appearance: \(mode)").waitForExistence(timeout: 5))
      app.navigationBars.buttons.firstMatch.tap()
      app.tabBars.buttons["Today"].tap()
    }
  }

  override func tearDownWithError() throws {
    attachRecords("qa-after-records")
  }

  private func attachRecords(_ name: String) {
    guard let bytes = try? Data(contentsOf: records) else { return }
    let attachment = XCTAttachment(data: bytes, uniformTypeIdentifier: "public.json")
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }

  private func element(_ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: name).firstMatch
  }

  private func tap(_ name: String) {
    let target = element(name)
    XCTAssertTrue(target.waitForExistence(timeout: 5), app.debugDescription)
    for _ in 0..<4 where !target.isHittable { app.swipeUp() }
    XCTAssertTrue(target.isHittable, name)
    target.tap()
  }

  private func replace(_ name: String, _ value: String) {
    let field = app.textFields.matching(identifier: name).firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), app.debugDescription)
    for _ in 0..<4 where !field.isHittable { app.swipeUp() }
    field.tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    let previous = field.value as? String ?? ""
    if !previous.isEmpty {
      field.press(forDuration: 1)
      let choices = [app.menuItems["Select All"], app.buttons["Select All"], app.menuItems["全选"], app.buttons["全选"]]
      if let selectAll = choices.first(where: { $0.exists }) { selectAll.tap(); field.typeText(value) }
      else { field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + value) }
    } else { field.typeText(value) }
  }

  private func snapshot() throws -> NSDictionary {
    try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: records)) as? NSDictionary)
  }

  private func waitForRecord(_ check: @escaping (NSDictionary) -> Bool) {
    let predicate = NSPredicate { _, _ in
      guard let host = try? self.snapshot() else { return false }
      return check(host)
    }
    expectation(for: predicate, evaluatedWith: records)
    waitForExpectations(timeout: 8)
  }

  private func capture(_ name: String) {
    if name.hasPrefix("water-"), element("+250 ml").frame.maxY > app.frame.height * 0.7 {
      app.swipeUp()
    }
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }

  private func waitClosed() {
    expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element("Cancel"))
    waitForExpectations(timeout: 5)
  }

  func testWaterAddRemoveRelaunchAndFailedWriteKeepDisplayedTotal() throws {
    tap("+250 ml")
    waitForRecord { ($0["water"] as? [[String: Any]])?.first?["amountMl"] as? Double == 250 }
    tap("+250 ml")
    waitForRecord { ($0["water"] as? [[String: Any]])?.first?["amountMl"] as? Double == 500 }
    tap("−250 ml")
    waitForRecord { ($0["water"] as? [[String: Any]])?.first?["amountMl"] as? Double == 250 }
    capture("water-250-saved")
    XCTAssertEqual((try snapshot()["water"] as? [[String: Any]])?.first?["date"] as? String, "2026-10-06")
    app.terminate(); app.launch()
    tap("+250 ml")
    waitForRecord { ($0["water"] as? [[String: Any]])?.first?["amountMl"] as? Double == 500 }
    capture("water-after-relaunch")
    let valid = try Data(contentsOf: records)
    let corrupt = Data("{invalid isolated write fixture".utf8)
    try corrupt.write(to: records, options: .atomic)
    tap("+250 ml")
    XCTAssertTrue(element("Could not save water. Try again.").waitForExistence(timeout: 5))
    XCTAssertEqual(try Data(contentsOf: records), corrupt)
    capture("water-write-error")
    try valid.write(to: records, options: .atomic)
    tap("+250 ml")
    waitForRecord { ($0["water"] as? [[String: Any]])?.first?["amountMl"] as? Double == 750 }
    capture("water-error-recovered")
  }

  func testCustomFoodCancelCreateFavoriteRecentEditDeleteAndRelaunch() throws {
    let before = try Data(contentsOf: records)
    tap("Log food"); replace("Search foods", "QA smoothie"); tap("Create custom food")
    replace("Calories per 100 g", "100")
    capture("custom-food-draft")
    tap("Cancel"); tap("Cancel"); waitClosed()
    XCTAssertEqual(try Data(contentsOf: records), before)
    tap("Log food"); replace("Search foods", "QA smoothie"); tap("Create custom food")
    replace("Calories per 100 g", "100"); tap("Create food")
    waitForRecord { ($0["customFoods"] as? [[String: Any]])?.count == 1 }
    let id = try XCTUnwrap((try snapshot()["customFoods"] as? [[String: Any]])?.first?["id"] as? String)
    capture("custom-food-created")
    tap("Favorites")
    waitForRecord { ($0["favoriteFoodIds"] as? [String]) == [id] }
    replace("Amount", "100"); tap("Add meal"); waitClosed()
    waitForRecord { ($0["recentFoodIds"] as? [String])?.first == id }
    app.terminate(); app.launch(); tap("Log food")
    XCTAssertTrue(element("QA smoothie").waitForExistence(timeout: 5))
    capture("custom-food-favorite-recent-relaunch")
    tap("QA smoothie"); tap("Edit")
    let saved = try Data(contentsOf: records)
    replace("Name", "Cancelled draft"); tap("Cancel")
    XCTAssertEqual(try Data(contentsOf: records), saved)
    tap("Edit"); replace("Name", "QA revised smoothie"); replace("Calories per 100 g", "150")
    tap("Save changes")
    waitForRecord { (($0["customFoods"] as? [[String: Any]])?.first?["name"] as? [String: String])?["en"] == "QA revised smoothie" }
    capture("custom-food-edited")
    tap("Delete"); capture("custom-food-delete-confirmation"); tap("Delete now")
    waitForRecord { ($0["customFoods"] as? [[String: Any]])?.isEmpty == true }
    let deleted = try snapshot()
    XCTAssertEqual(deleted["favoriteFoodIds"] as? [String], [])
    XCTAssertEqual(deleted["recentFoodIds"] as? [String], [])
    XCTAssertEqual((deleted["intake"] as? [[String: Any]])?.first?["kcal"] as? Double, 100)
    // App closes the food sheet after durable deletion.
    waitClosed(); capture("custom-food-deleted-history-retained")
    app.terminate(); app.launch()
    XCTAssertTrue((try snapshot()["customFoods"] as? [[String: Any]])?.isEmpty == true)
  }
}
