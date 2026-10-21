import XCTest

/// Read-only error/retry QA; never saves or requests notification permission.
final class ReminderReadUITests: XCTestCase {
  func testCorruptReminderSettingsAreNotInventedAndReadonlyRetryRecoversInBothModes() throws {
    let records = URL(fileURLWithPath: "/tmp/leanon-reminder-read-ios-records.json")
    let settings = records.deletingPathExtension().appendingPathExtension("reminders.json")
    let fixture: [String: Any] = [
      "today": "2026-10-06", "todayHour": 12, "streak": 0,
      "profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "goalWeightKg": 72, "weeklyLossKg": 0.6,
      "weights": [], "intake": [], "exercises": [], "water": [], "customFoods": [],
      "favoriteFoodIds": [], "recentFoodIds": [],
    ]
    let before = try JSONSerialization.data(withJSONObject: fixture)
    let corrupt = Data("{isolated corrupt reminder settings".utf8)
    try before.write(to: records, options: .atomic)
    try corrupt.write(to: settings, options: .atomic)
    let app = XCUIApplication()
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records.path, "LEANON_LOCALE": "en",
      "LEANON_INITIAL_ROUTE": "me", "LEANON_QA_NOW": "2026-10-06T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC"]
    continueAfterFailure = false
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Me"].waitForExistence(timeout: 10))
    for mode in ["Light", "Dark"] {
      try corrupt.write(to: settings, options: .atomic)
      app.tabBars.buttons["Me"].tap()
      let entry = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Settings")).firstMatch
      XCTAssertTrue(entry.waitForExistence(timeout: 5)); entry.tap()
      XCTAssertTrue(app.buttons[mode].waitForExistence(timeout: 5)); app.buttons[mode].tap()
      XCTAssertTrue(app.staticTexts["Current appearance: \(mode)"].waitForExistence(timeout: 5))
      app.navigationBars.buttons.firstMatch.tap()
      app.buttons["Reminders"].tap()
      let error = app.staticTexts["Reminder settings could not be loaded. Retry to view your saved settings."]
      XCTAssertTrue(error.waitForExistence(timeout: 5), app.debugDescription)
      XCTAssertFalse(app.staticTexts["Morning weight"].exists)
      XCTAssertFalse(app.staticTexts["Daily meals"].exists)
      let save = app.descendants(matching: .any).matching(identifier: "Save").firstMatch
      XCTAssertFalse(save.isEnabled)
      capture(app, "\(mode.lowercased())-reminder-read-error")
      app.buttons["Cancel"].tap()
      XCTAssertEqual(try Data(contentsOf: records), before)
      XCTAssertEqual(try Data(contentsOf: settings), corrupt)
      app.buttons["Reminders"].tap()
      XCTAssertTrue(error.waitForExistence(timeout: 5))
      // Stay mounted: deleting this isolated file and retrying getSettings does
      // not invoke foreground scheduling or updateSettings.
      try FileManager.default.removeItem(at: settings)
      app.buttons["Retry"].tap()
      XCTAssertTrue(app.staticTexts["Morning weight"].waitForExistence(timeout: 5), app.debugDescription)
      XCTAssertTrue(app.staticTexts["Daily meals"].exists)
      XCTAssertFalse(error.exists)
      capture(app, "\(mode.lowercased())-reminder-read-recovered")
      app.buttons["Cancel"].tap()
      XCTAssertEqual(try Data(contentsOf: records), before)
      XCTAssertFalse(FileManager.default.fileExists(atPath: settings.path))
    }
    // Leave a corrupt QA-only file until the test app closes so no later
    // foreground refresh can schedule its native enabled defaults.
    try corrupt.write(to: settings, options: .atomic)
  }

  private func capture(_ app: XCUIApplication, _ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }
}
