import XCTest

/// Exercises status queries and explanatory UI only; never requests HealthKit access.
final class HealthStatusUITests: XCTestCase {
  func testHealthStatusInBothModesDoesNotMutateRecordsOrRequestAccess() throws {
    let records = URL(fileURLWithPath: "/tmp/leanon-health-status-ios-records.json")
    let fixture: [String: Any] = [
      "today": "2026-10-06", "todayHour": 12, "streak": 0,
      "profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "goalWeightKg": 72, "weeklyLossKg": 0.6,
      "weights": [], "intake": [], "exercises": [], "water": [], "customFoods": [],
      "favoriteFoodIds": [], "recentFoodIds": [],
    ]
    let initial = try JSONSerialization.data(withJSONObject: fixture)
    try initial.write(to: records, options: .atomic)
    let state = records.deletingPathExtension().appendingPathExtension("health-kit.json")
    if FileManager.default.fileExists(atPath: state.path) { try FileManager.default.removeItem(at: state) }
    let app = XCUIApplication()
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records.path, "LEANON_LOCALE": "en",
      "LEANON_INITIAL_ROUTE": "me", "LEANON_QA_NOW": "2026-10-06T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC"]
    continueAfterFailure = false
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Me"].waitForExistence(timeout: 10))
    for mode in ["Light", "Dark"] {
      app.tabBars.buttons["Me"].tap()
      let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Settings")).firstMatch
      XCTAssertTrue(settings.waitForExistence(timeout: 5)); settings.tap()
      let option = app.buttons[mode]
      XCTAssertTrue(option.waitForExistence(timeout: 5)); option.tap()
      XCTAssertTrue(app.staticTexts["Current appearance: \(mode)"].waitForExistence(timeout: 5))
      app.navigationBars.buttons.firstMatch.tap()
      let health = app.buttons["Health app"]
      XCTAssertTrue(health.waitForExistence(timeout: 5)); health.tap()
      XCTAssertTrue(app.staticTexts["Apple Health"].waitForExistence(timeout: 5))
      let privacy = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "nutrition is write-only")).firstMatch
      XCTAssertTrue(privacy.waitForExistence(timeout: 5), app.debugDescription)
      let unavailable = app.staticTexts["Apple Health is unavailable on this device."]
      let nutrition = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Nutrition writes (8 types):")).firstMatch
      XCTAssertTrue(unavailable.waitForExistence(timeout: 2) || nutrition.waitForExistence(timeout: 5), app.debugDescription)
      XCTAssertFalse(app.buttons["Granted"].exists)
      let attachment = XCTAttachment(screenshot: app.screenshot())
      attachment.name = "\(mode.lowercased())-health-status-readonly"
      attachment.lifetime = .keepAlways; add(attachment)
      app.buttons["Done"].tap()
    }
    XCTAssertEqual(try Data(contentsOf: records), initial)
    XCTAssertFalse(FileManager.default.fileExists(atPath: state.path), "Status reads must not enable sync or persist permission completion")
  }
}
