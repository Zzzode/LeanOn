import XCTest

final class ScannerUITests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.zzzode.leanon.uiqa")

  override func setUpWithError() throws {
    continueAfterFailure = false
    addUIInterruptionMonitor(withDescription: "Abort unexpected permission") { alert in
      XCTFail("Unexpected system dialog; no permission button will be tapped: \(alert.label)")
      return false
    }
  }

  override func tearDownWithError() throws { app.terminate() }

  func testEnglishLightReadOnlyCameraStatusManualValidationAndCancelKeepsFoodDraft() throws {
    try runUnavailableChain(chinese: false, dark: false)
  }

  func testChineseDarkReadOnlyCameraStatusManualValidationAndCancelKeepsFoodDraft() throws {
    try runUnavailableChain(chinese: true, dark: true)
  }

  func testLiveMissingProductKeepsBarcodeAndManualCreateCancelDoesNotWrite() throws {
    #if targetEnvironment(simulator)
    let records = URL(fileURLWithPath: "/tmp/leanon-scan-chain-ios-live-missing.json")
    let fixture: [String: Any] = [
      "today": "2026-10-07", "todayHour": 12, "streak": 0,
      "profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "goalWeightKg": 72, "weeklyLossKg": 0.6, "weights": [], "intake": [], "exercises": [], "water": [],
      "customFoods": [], "favoriteFoodIds": [], "recentFoodIds": [],
    ]
    try JSONSerialization.data(withJSONObject: fixture).write(to: records, options: .atomic)
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records.path, "LEANON_LOCALE": "en",
      "LEANON_INITIAL_ROUTE": "today", "LEANON_QA_NOW": "2026-10-07T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC"]
    app.launch()
    tap(app.buttons["Log food"])
    XCTAssertTrue(app.textFields["Search foods"].waitForExistence(timeout: 5))
    let before = try Data(contentsOf: records)
    tap(app.buttons["Scan or enter barcode"])
    XCTAssertTrue(app.staticTexts["This device has no available camera. Enter the barcode manually."].waitForExistence(timeout: 5))
    let barcode = app.textFields["Product barcode"]
    replace(barcode, "96385074")
    tap(app.buttons["Look up barcode"])
    XCTAssertTrue(app.staticTexts["No product was found for this barcode. Check the digits or create the food manually."].waitForExistence(timeout: 20), app.debugDescription)
    XCTAssertEqual(barcode.value as? String, "96385074")
    XCTAssertEqual(try Data(contentsOf: records), before)
    capture("barcode-live-off-404-keeps-code")
    tap(app.buttons["Create food manually"])
    let name = app.textFields["Name"]
    replace(name, "QA manual fallback draft")
    capture("barcode-live-off-manual-fallback-draft")
    tap(app.buttons["Cancel"])
    XCTAssertTrue(app.textFields["Search foods"].waitForExistence(timeout: 5))
    XCTAssertEqual(try Data(contentsOf: records), before)
    tap(app.buttons["Cancel"])
    XCTAssertEqual(try Data(contentsOf: records), before)
    #else
    throw XCTSkip("This integration scenario never requests physical camera access.")
    #endif
  }

  /// This explicit integration case uses the public product service, never a mock or camera.
  func testManualPublicBarcodeLookupHistoricalMealSaveAndRestart() throws {
    #if targetEnvironment(simulator)
    let records = URL(fileURLWithPath: "/tmp/leanon-scan-chain-ios-live-meal.json")
    let fixture: [String: Any] = [
      "today": "2026-10-07", "todayHour": 12, "streak": 0,
      "profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "goalWeightKg": 72, "weeklyLossKg": 0.6,
      "weights": [["date": "2026-10-03", "weightKg": 80]], "intake": [], "exercises": [], "water": [],
      "customFoods": [], "favoriteFoodIds": [], "recentFoodIds": [],
    ]
    try JSONSerialization.data(withJSONObject: fixture).write(to: records, options: .atomic)
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records.path, "LEANON_LOCALE": "en",
      "LEANON_INITIAL_ROUTE": "diary", "LEANON_QA_NOW": "2026-10-07T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC"]
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Diary"].waitForExistence(timeout: 10))
    replace(app.textFields["Journal date"], "2026-10-03")
    tap(app.buttons["Show this day"])
    tap(app.buttons["Log food"])
    tap(app.buttons["Scan or enter barcode"])
    XCTAssertTrue(app.staticTexts["This device has no available camera. Enter the barcode manually."].waitForExistence(timeout: 5))
    replace(app.textFields["Product barcode"], "3017620422003")
    tap(app.buttons["Look up barcode"])
    let amount = app.textFields["Amount"]
    // A live failure remains a failed test with evidence; it never becomes a simulated success.
    XCTAssertTrue(amount.waitForExistence(timeout: 20), app.debugDescription)
    let imported = try snapshot(records)
    let food = try XCTUnwrap((imported["customFoods"] as? [[String: Any]])?.first)
    XCTAssertEqual(food["id"] as? String, "off-3017620422003")
    XCTAssertEqual(food["source"] as? String, "open-food-facts")
    replace(amount, "100")
    XCTAssertLessThanOrEqual(amount.frame.maxY, app.buttons["Add meal"].frame.minY,
      "The focused portion value must be fully above the fixed action footer.")
    capture("barcode-live-off-100g-portion")
    replace(amount, "150")
    tap(app.buttons["Lunch"])
    capture("barcode-live-off-historical-150g-lunch-draft")
    tap(app.buttons["Add meal"])
    let predicate = NSPredicate { _, _ in
      guard let data = try? self.snapshot(records), let rows = data["intakeEntries"] as? [[String: Any]] else { return false }
      return rows.contains { ($0["foodId"] as? String) == "off-3017620422003" && ($0["grams"] as? Double) == 150 }
    }
    expectation(for: predicate, evaluatedWith: records)
    waitForExpectations(timeout: 10)
    let beforeRestart = try snapshot(records)
    let entry = try XCTUnwrap((beforeRestart["intakeEntries"] as? [[String: Any]])?.first)
    XCTAssertEqual(entry["date"] as? String, "2026-10-03")
    XCTAssertEqual(entry["meal"] as? String, "lunch")
    let id = try XCTUnwrap(entry["id"] as? String)
    let kcal = try XCTUnwrap(food["kcal"] as? Double)
    XCTAssertEqual(try XCTUnwrap(entry["kcal"] as? Double), floor(kcal * 1.5 + 0.5), accuracy: 0.01)
    let bytes = try Data(contentsOf: records)
    app.terminate(); app.launch()
    XCTAssertTrue(app.tabBars.buttons["Diary"].waitForExistence(timeout: 10))
    replace(app.textFields["Journal date"], "2026-10-03")
    tap(app.buttons["Show this day"])
    XCTAssertTrue(app.staticTexts["Nutella"].waitForExistence(timeout: 5), app.debugDescription)
    let reloaded = try snapshot(records)
    XCTAssertEqual((reloaded["intakeEntries"] as? [[String: Any]])?.first?["id"] as? String, id)
    XCTAssertEqual(try Data(contentsOf: records), bytes)
    capture("barcode-live-off-historical-meal-after-restart")
    let attachment = XCTAttachment(data: bytes, uniformTypeIdentifier: "public.json")
    attachment.name = "barcode-live-off-synthetic-records-final"; attachment.lifetime = .keepAlways; add(attachment)
    #else
    throw XCTSkip("This integration scenario must not request physical camera access.")
    #endif
  }

  private func runUnavailableChain(chinese: Bool, dark: Bool) throws {
    #if targetEnvironment(simulator)
    func label(_ english: String, _ chineseText: String) -> String { chinese ? chineseText : english }
    let records = URL(fileURLWithPath: "/tmp/leanon-scan-chain-ios-\(chinese ? "zh-dark" : "en-light").json")
    let fixture: [String: Any] = [
      "today": "2026-10-07", "todayHour": 12, "streak": 0,
      "profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "goalWeightKg": 72, "weeklyLossKg": 0.6,
      "weights": [], "intake": [], "exercises": [], "water": [], "customFoods": [],
      "favoriteFoodIds": [], "recentFoodIds": [],
    ]
    try JSONSerialization.data(withJSONObject: fixture).write(to: records, options: .atomic)
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records.path, "LEANON_LOCALE": chinese ? "zh-CN" : "en",
      "LEANON_INITIAL_ROUTE": "me", "LEANON_QA_NOW": "2026-10-07T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC"]
    app.launch()
    XCTAssertTrue(app.tabBars.buttons[label("Me", "我的")].waitForExistence(timeout: 10))
    let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label("Settings", "设置"))).firstMatch
    if !settings.isHittable { app.swipeUp() }
    tap(settings)
    tap(app.buttons[label(dark ? "Dark" : "Light", dark ? "深色" : "浅色")])
    let mode = app.staticTexts[label("Current appearance: \(dark ? "Dark" : "Light")", "当前显示：\(dark ? "深色" : "浅色")")]
    XCTAssertTrue(mode.waitForExistence(timeout: 5))
    tap(app.navigationBars.buttons.firstMatch)
    tap(app.tabBars.buttons[label("Today", "今日")])
    tap(app.buttons[label("Log food", "记录饮食")])
    let search = app.textFields[label("Search foods", "搜索食物")]
    XCTAssertTrue(search.waitForExistence(timeout: 5)); tap(search); noSystemAlert(); search.typeText("QA scan draft")
    let before = try Data(contentsOf: records)
    tap(app.buttons[label("Scan or enter barcode", "扫描或输入条码")])
    XCTAssertTrue(app.staticTexts[label("Find a packaged food", "查找包装食品")].waitForExistence(timeout: 5))
    let unavailable = app.staticTexts[label("This device has no available camera. Enter the barcode manually.", "此设备没有可用相机，请手动输入条码。")]
    XCTAssertTrue(unavailable.waitForExistence(timeout: 5), app.debugDescription)
    noSystemAlert()
    let barcode = app.textFields[label("Product barcode", "产品条码")]
    XCTAssertTrue(barcode.waitForExistence(timeout: 5)); tap(barcode); noSystemAlert(); barcode.typeText("3017620422004")
    tap(app.buttons[label("Look up barcode", "查询条码")])
    let invalid = app.staticTexts[label("Enter a valid product barcode: 8, 12, 13 or 14 digits with a valid check digit.", "请输入合法产品条码：8、12、13 或 14 位数字，且校验位正确。")]
    XCTAssertTrue(invalid.waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertEqual(barcode.value as? String, "3017620422004")
    XCTAssertEqual(try Data(contentsOf: records), before)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "barcode-readonly-nocamera-invalid-\(chinese ? "zh-dark" : "en-light")"
    attachment.lifetime = .keepAlways; add(attachment)
    tap(app.buttons[label("Back to food list", "返回食品列表")])
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    XCTAssertEqual(search.value as? String, "QA scan draft")
    // Scan can blur search. The retained draft must remain editable afterward.
    tap(search)
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    XCTAssertEqual(search.value as? String, "QA scan draft")
    XCTAssertEqual(try Data(contentsOf: records), before)
    tap(app.buttons[label("Cancel", "取消")])
    XCTAssertTrue(app.tabBars.buttons[label("Today", "今日")].waitForExistence(timeout: 5))
    XCTAssertEqual(try Data(contentsOf: records), before)
    #else
    throw XCTSkip("This case intentionally never requests a physical camera permission.")
    #endif
  }

  private func noSystemAlert() {
    XCTAssertFalse(XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch.exists,
      "Stop before interacting with any system permission dialog")
  }

  private func replace(_ field: XCUIElement, _ value: String) {
    tap(field)
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    let old = field.value as? String ?? ""
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count) + value)
    XCTAssertEqual(field.value as? String, value)
  }

  private func snapshot(_ records: URL) throws -> NSDictionary {
    try EncryptedQARecordReader.snapshot(records)
  }

  private func capture(_ name: String) {
    noSystemAlert()
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }

  private func tap(_ element: XCUIElement) {
    noSystemAlert()
    XCTAssertTrue(element.waitForExistence(timeout: 5), app.debugDescription)
    element.tap()
  }
}
