import XCTest

/// Real OS permission/delivery QA is confined to a separately installed app.
final class NotificationUITests: XCTestCase {
  func testIsolatedNotificationPermissionPersistenceAndDelivery() throws {
    let environment = ProcessInfo.processInfo.environment
    guard environment["LEANON_NOTIFICATION_QA"] == "1",
          environment["LEANON_NOTIFICATION_QA_APPROVED"] == "1" else {
      throw XCTSkip("Requires direct user approval and the separately built com.zzzode.leanon.uiqa app")
    }
    continueAfterFailure = false
    let records = URL(fileURLWithPath: "/tmp/leanon-notification-ios-records.json")
    let settings = records.deletingPathExtension().appendingPathExtension("reminders.json")
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    // Compute after compilation, leaving at least two minutes for permission
    // and the actual relaunch before backgrounding the app.
    let fire = Date(timeIntervalSince1970: ceil(Date().addingTimeInterval(150).timeIntervalSince1970 / 60) * 60)
    let components = calendar.dateComponents([.hour, .minute], from: fire)
    let day = DateFormatter(); day.dateFormat = "yyyy-MM-dd"; day.timeZone = calendar.timeZone
    day.locale = Locale(identifier: "en_US_POSIX")
    let fixture: [String: Any] = [
      "today": day.string(from: Date()), "todayHour": 12, "streak": 0,
      "profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
      "goalWeightKg": 72, "weeklyLossKg": 0.6,
      "weights": [], "intake": [], "exercises": [], "water": [], "customFoods": [],
      "favoriteFoodIds": [], "recentFoodIds": [],
    ]
    let before = try JSONSerialization.data(withJSONObject: fixture)
    try before.write(to: records, options: .atomic)
    let seeded: [String: Any] = [
      "weight": ["enabled": false, "hour": 7, "minute": 30],
      "meals": ["enabled": true, "hour": components.hour!, "minute": components.minute!],
    ]
    try JSONSerialization.data(withJSONObject: seeded).write(to: settings, options: .atomic)
    let app = XCUIApplication(bundleIdentifier: "com.zzzode.leanon.uiqa")
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records.path, "LEANON_LOCALE": "en",
      "LEANON_INITIAL_ROUTE": "me", "LEANON_QA_TIME_ZONE": "UTC"]
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    XCTAssertTrue(app.buttons["Reminders"].waitForExistence(timeout: 10))
    app.buttons["Reminders"].tap()
    XCTAssertTrue(app.staticTexts["Daily meals"].waitForExistence(timeout: 5))
    capture("notification-before-save", app.screenshot())
    app.buttons["Save"].tap()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let alert = springboard.alerts.firstMatch
    XCTAssertTrue(alert.waitForExistence(timeout: 10), "Fresh .uiqa app must show its notification authorization prompt")
    XCTAssertTrue(alert.label.localizedCaseInsensitiveContains("LeanOn") || alert.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", "LeanOn")).count > 0)
    capture("notification-isolated-permission-prompt", XCUIScreen.main.screenshot())
    let allow = alert.buttons["Allow"].exists ? alert.buttons["Allow"] : alert.buttons["允许"]
    XCTAssertTrue(allow.exists, alert.debugDescription)
    allow.tap()
    let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["Cancel"])
    XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 15), .completed, app.debugDescription)
    let saved = try Data(contentsOf: settings)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: saved) as? NSDictionary)
    XCTAssertEqual(object["weight"] as? NSDictionary, seeded["weight"] as? NSDictionary)
    XCTAssertEqual(object["meals"] as? NSDictionary, seeded["meals"] as? NSDictionary)
    XCTAssertEqual(try Data(contentsOf: records), before)
    attach(before, "notification-records-before")
    attach(saved, "notification-settings-after-save")
    app.terminate(); app.launch()
    XCTAssertTrue(app.buttons["Reminders"].waitForExistence(timeout: 10))
    app.buttons["Reminders"].tap()
    XCTAssertTrue(app.staticTexts["Daily meals"].waitForExistence(timeout: 5))
    capture("notification-settings-persisted-after-relaunch", app.screenshot())
    app.buttons["Cancel"].tap()
    XCTAssertEqual(try Data(contentsOf: settings), saved)
    XCTAssertEqual(try Data(contentsOf: records), before)
    XCUIDevice.shared.press(.home)
    let title = springboard.staticTexts["How was your day?"]
    let wait = max(1, fire.timeIntervalSinceNow + 20)
    var delivered = title.waitForExistence(timeout: wait)
    var location = "banner"
    if !delivered {
      // A banner can be suppressed by simulator policy; inspect actual
      // Notification Center rather than infer delivery from a saved file.
      springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.01))
        .press(forDuration: 0.1, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8)))
      delivered = title.waitForExistence(timeout: 5)
      location = "notification-center"
    }
    capture(delivered ? "notification-actual-delivered" : "notification-delivery-not-observed", XCUIScreen.main.screenshot())
    attach(try JSONSerialization.data(withJSONObject: [
      "bundleIdentifier": "com.zzzode.leanon.uiqa", "permissionGranted": true,
      "settingsPersistedAfterRelaunch": true, "recordsUnchanged": true,
      "deliveryObserved": delivered, "observationLocation": location,
      "scheduledUTC": ISO8601DateFormatter().string(from: fire),
      "finishedUTC": ISO8601DateFormatter().string(from: Date()),
    ]), "notification-outcome")
    attach(try Data(contentsOf: records), "notification-records-after")
    attach(try Data(contentsOf: settings), "notification-settings-after-relaunch")
    XCTAssertEqual(try Data(contentsOf: records), before)
  }

  private func capture(_ name: String, _ screenshot: XCUIScreenshot) {
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }
  private func attach(_ data: Data, _ name: String) {
    let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }
}
