import XCTest

/// Uses the existing DEBUG record-path isolation; never opens normal user records.
final class AppearanceUITests: XCTestCase {
  private let app = XCUIApplication()

  override func setUp() {
    continueAfterFailure = false
    app.launchEnvironment["LEANON_RECORDS_PATH"] = "/tmp/leanon-theme-ios-ui-records.json"
    app.launchEnvironment["LEANON_LOCALE"] = "en"
    app.launchEnvironment["LEANON_QA_NOW"] = "2026-10-01T19:00:00Z"
    app.launchEnvironment["LEANON_QA_TIME_ZONE"] = "UTC"
    app.launchEnvironment["LEANON_INITIAL_ROUTE"] = "me"
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Me"].waitForExistence(timeout: 10), app.debugDescription)
  }

  private func element(_ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: label).firstMatch
  }

  private func tap(_ label: String, timeout: TimeInterval = 5) {
    let target = element(label)
    XCTAssertTrue(target.waitForExistence(timeout: timeout), "Missing \(label): \(app.debugDescription)")
    if !target.isHittable { app.swipeUp() }
    XCTAssertTrue(target.isHittable, "Not hittable: \(label)")
    target.tap()
  }

  private func openSettings() {
    app.tabBars.buttons["Me"].tap()
    let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Settings")).firstMatch
    XCTAssertTrue(settings.waitForExistence(timeout: 5), app.debugDescription)
    settings.tap()
    XCTAssertTrue(element("Appearance").waitForExistence(timeout: 5), app.debugDescription)
  }

  private func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func replaceText(_ label: String, with value: String) {
    let nativeField = app.textFields.matching(identifier: label).firstMatch
    let field = nativeField.exists ? nativeField : element(label)
    XCTAssertTrue(field.waitForExistence(timeout: 5), app.debugDescription)
    field.tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), app.debugDescription)
    let previous = field.value as? String ?? ""
    if !previous.isEmpty {
      field.press(forDuration: 1)
      let candidates = [app.menuItems["Select All"], app.buttons["Select All"], app.menuItems["全选"], app.buttons["全选"]]
      let selectAll = candidates.first(where: { $0.exists }) ?? app.buttons["Select All"]
      if selectAll.waitForExistence(timeout: 2) {
        selectAll.tap()
        field.typeText(value)
      } else {
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + value)
      }
    } else {
      field.typeText(value)
    }
  }

  private func waitUntilClosed() {
    let predicate = NSPredicate(format: "exists == false")
    expectation(for: predicate, evaluatedWith: element("Cancel"))
    waitForExpectations(timeout: 5)
  }

  private func prepareForm(_ mode: String = "Dark") {
    openSettings()
    tap(mode)
    XCTAssertTrue(element("Current appearance: \(mode)").waitForExistence(timeout: 5))
    app.navigationBars.buttons.firstMatch.tap()
    app.tabBars.buttons["Today"].tap()
  }

  private func restoreSystem() {
    openSettings()
    tap("Follow system")
  }

  func testAppearanceSelectionPersistsAndEveryScreenRendersInBothModes() {
    openSettings()
    for mode in ["Light", "Dark"] {
      tap(mode)
      XCTAssertTrue(element("Current appearance: \(mode)").waitForExistence(timeout: 5))
      capture("\(mode.lowercased())-settings")
      app.terminate()
      app.launch()
      openSettings()
      // The current appearance label is shared UI; seeing the persisted value
      // after relaunch verifies the native bootstrap and preference together.
      let label = "Current appearance: \(mode)"
      XCTAssertTrue(element(label).waitForExistence(timeout: 5), app.debugDescription)
      app.navigationBars.buttons.firstMatch.tap()
      for tab in ["Today", "Diary", "Progress", "Partner", "Me"] {
        app.tabBars.buttons[tab].tap()
        capture("\(mode.lowercased())-\(tab.lowercased())")
      }
      openSettings()
    }
    tap("Follow system")
    capture("system-settings")
  }

  func testWeightKeyboardValidationCancelSaveAndRelaunch() {
    prepareForm()
    tap("Log weight")
    let input = app.textFields.matching(identifier: "Weight").firstMatch
    let initial = input.exists ? input.value as? String : nil
    replaceText("Weight", with: "0")
    tap("Save")
    XCTAssertTrue(element("Enter a weight between 20 and 300 kg.").waitForExistence(timeout: 5))
    capture("weight-keyboard-invalid")
    tap("Cancel")
    waitUntilClosed()
    tap("Log weight")
    if let initial {
      XCTAssertEqual(app.textFields.matching(identifier: "Weight").firstMatch.value as? String, initial)
    }
    replaceText("Weight", with: "80.3")
    capture("weight-keyboard-ready")
    tap("Save")
    waitUntilClosed()
    app.terminate()
    app.launch()
    app.tabBars.buttons["Today"].tap()
    tap("Log weight")
    XCTAssertEqual(app.textFields.matching(identifier: "Weight").firstMatch.value as? String, "80.3")
    capture("weight-persisted")
    tap("Cancel")
    restoreSystem()
  }

  func testFoodSearchKeyboardPortionCancelAndSave() throws {
    prepareForm()
    let path = URL(fileURLWithPath: "/tmp/leanon-theme-ios-ui-records.json")
    let before = try Data(contentsOf: path)
    tap("Log food")
    replaceText("Search foods", with: "rice")
    capture("food-search-keyboard")
    tap("White rice, cooked")
    replaceText("Amount", with: "250")
    capture("food-portion-keyboard")
    tap("Cancel")
    waitUntilClosed()
    XCTAssertEqual(try Data(contentsOf: path), before)
    tap("Log food")
    replaceText("Search foods", with: "rice")
    tap("White rice, cooked")
    replaceText("Amount", with: "100")
    tap("Add meal")
    waitUntilClosed()
    XCTAssertNotEqual(try Data(contentsOf: path), before)
    capture("food-saved")
    restoreSystem()
  }

  func testExerciseKeyboardCancelAndSave() throws {
    prepareForm()
    let path = URL(fileURLWithPath: "/tmp/leanon-theme-ios-ui-records.json")
    let before = try Data(contentsOf: path)
    tap("Log exercise")
    tap("Walking (brisk)")
    replaceText("Duration", with: "18")
    capture("exercise-keyboard-cancel")
    tap("Cancel")
    waitUntilClosed()
    XCTAssertEqual(try Data(contentsOf: path), before)
    tap("Log exercise")
    tap("Walking (brisk)")
    replaceText("Duration", with: "20")
    capture("exercise-keyboard-ready")
    tap("Save")
    waitUntilClosed()
    XCTAssertNotEqual(try Data(contentsOf: path), before)
    capture("exercise-saved")
    restoreSystem()
  }

  func testSystemChangesPropagateWhileAppRemainsOpen() throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["LEANON_SYSTEM_UI_TESTS"] == "1",
                      "Requires the external simctl appearance handoff")
    openSettings()
    tap("Follow system")
    let marker = URL(fileURLWithPath: "/tmp/leanon-theme-ios-system-step.txt")
    try "await-dark".write(to: marker, atomically: true, encoding: .utf8)
    XCTAssertTrue(element("Current appearance: Dark").waitForExistence(timeout: 45))
    capture("system-dark-settings")
    tap("Light")
    XCTAssertTrue(element("Current appearance: Light").waitForExistence(timeout: 5))
    capture("explicit-light-on-dark-system")
    tap("Follow system")
    XCTAssertTrue(element("Current appearance: Dark").waitForExistence(timeout: 5))
    try "await-light".write(to: marker, atomically: true, encoding: .utf8)
    XCTAssertTrue(element("Current appearance: Light").waitForExistence(timeout: 45))
    capture("system-light-settings")
    app.navigationBars.buttons.firstMatch.tap()
    app.tabBars.buttons["Today"].tap()
    let records = URL(fileURLWithPath: "/tmp/leanon-theme-ios-ui-records.json")
    let before = try Data(contentsOf: records)
    tap("Log weight")
    replaceText("Weight", with: "79.9")
    capture("system-light-weight-draft")
    for (request, acknowledgement, name) in [
      ("await-keyboard-dark", "keyboard-dark-sent", "system-dark-weight-draft"),
      ("await-keyboard-light", "keyboard-light-sent", "system-light-weight-draft-restored"),
    ] {
      try request.write(to: marker, atomically: true, encoding: .utf8)
      let switched = NSPredicate { _, _ in
        (try? String(contentsOf: marker, encoding: .utf8)) == acknowledgement
      }
      expectation(for: switched, evaluatedWith: marker)
      waitForExpectations(timeout: 45)
      XCTAssertEqual(app.textFields.matching(identifier: "Weight").firstMatch.value as? String, "79.9")
      let visibleKeyboard = NSPredicate { _, _ in
        self.app.keyboards.firstMatch.exists && self.app.keyboards.keys["1"].isHittable
      }
      expectation(for: visibleKeyboard, evaluatedWith: app)
      waitForExpectations(timeout: 8)
      capture(name)
    }
    tap("Cancel")
    waitUntilClosed()
    XCTAssertEqual(try Data(contentsOf: records), before)
    try "done".write(to: marker, atomically: true, encoding: .utf8)
  }

  func testLightFormKeyboardsAndCancelKeepRecordsUnchanged() throws {
    prepareForm("Light")
    let path = URL(fileURLWithPath: "/tmp/leanon-theme-ios-ui-records.json")
    let before = try Data(contentsOf: path)
    tap("Log weight")
    replaceText("Weight", with: "80.8")
    capture("light-weight-keyboard")
    tap("Cancel")
    waitUntilClosed()
    tap("Log food")
    tap("White rice, cooked")
    replaceText("Amount", with: "200")
    capture("light-food-keyboard")
    tap("Cancel")
    waitUntilClosed()
    tap("Log exercise")
    tap("Walking (brisk)")
    replaceText("Duration", with: "25")
    capture("light-exercise-keyboard")
    tap("Cancel")
    waitUntilClosed()
    XCTAssertEqual(try Data(contentsOf: path), before)
    restoreSystem()
  }
}
