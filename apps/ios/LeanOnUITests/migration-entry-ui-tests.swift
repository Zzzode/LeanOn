import XCTest
import Foundation

/// Actual Settings entry + Lynx/native bridge. Only a pre-seeded isolated loopback app is allowed.
final class MigrationEntryUITests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.zzzode.leanon.uiqa")
  private let password = "PUBLIC fictional migration password 2026"
  private let backupPassword = "PUBLIC encrypted cutover backup 2026"
  private let records = "/tmp/leanon-migration-entry-ios-20261007/records.json"
  override func setUpWithError() throws {
    guard ProcessInfo.processInfo.environment["LEANON_MIGRATION_ENTRY_QA"] == "isolated-loopback" else { throw XCTSkip("Explicit disposable migration UI required") }
    continueAfterFailure = false
  }
  private func launch() {
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records, "LEANON_INITIAL_ROUTE": "me", "LEANON_LOCALE": "en", "LEANON_QA_NOW": "2026-10-07T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC"]
    app.launch()
    tap("Settings")
  }
  private func item(_ label: String) -> XCUIElement {
    let predicate = NSPredicate(format: "label == %@ OR identifier == %@ OR label BEGINSWITH %@", label, label, label + " · ")
    let button = app.buttons.matching(predicate).firstMatch
    if button.exists { return button }
    return app.descendants(matching: .any).matching(predicate).firstMatch
  }
  private func tap(_ label: String) {
    let node = item(label); XCTAssertTrue(node.waitForExistence(timeout: 12), app.debugDescription)
    for _ in 0..<18 where !node.isHittable {
      let origin = app.coordinate(withNormalizedOffset: .zero)
      let region = app.frame
      origin.withOffset(CGVector(dx: region.midX, dy: region.height * 0.70)).press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: region.midX, dy: region.height * 0.48)))
    }
    XCTAssertTrue(node.isHittable, app.debugDescription); node.tap()
  }
  private func fill(_ label: String, _ text: String, secure: Bool = true) {
    let node = secure ? app.secureTextFields[label].firstMatch : app.textFields[label].firstMatch
    XCTAssertTrue(node.waitForExistence(timeout: 8), app.debugDescription)
    for _ in 0..<12 where !node.isHittable { app.swipeUp() }
    node.tap()
    let previous = secure ? "" : (node.value as? String ?? "")
    node.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + text)
    let done = app.buttons["Done"]
    if done.exists && done.isHittable { done.tap() }
    else if app.keyboards.buttons["Return"].exists { app.keyboards.buttons["Return"].tap() }
  }
  private func capture(_ name: String) {
    let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "migration-ios-" + name; screenshot.lifetime = .keepAlways; add(screenshot)
    let tree = XCTAttachment(string: app.debugDescription); tree.name = "migration-ios-" + name + "-tree"; tree.lifetime = .keepAlways; add(tree)
  }
  private func control(_ action: String) {
    var request = URLRequest(url: URL(string: "http://127.0.0.1:64042/v1/" + action)!)
    request.httpMethod = "POST"; request.httpBody = Data("{}".utf8)
    let finished = expectation(description: "Local synthetic fixture control")
    URLSession(configuration: .ephemeral).dataTask(with: request) { _, response, error in
      XCTAssertNil(error); XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200); finished.fulfill()
    }.resume(); wait(for: [finished], timeout: 12)
  }
  private func open() { tap("Move to private cloud") }
  func testSettingsPreviewConsentPauseRestartResumeAndActive() {
    launch(); capture("settings-entry"); open()
    if item("Review before confirming").exists { tap("Pause migration") }
    XCTAssertTrue(item("Not prepared").waitForExistence(timeout: 10)); capture("unprepared")
    fill("Target service URL", "http://127.0.0.1:64043", secure: false)
    fill("Account password", password); tap("Check target")
    XCTAssertTrue(item("Review before confirming").waitForExistence(timeout: 15)); capture("preview-identity-counts")
    XCTAssertEqual(item("Confirm migration").value as? String, "Unavailable")
    tap("Confirm migration")
    XCTAssertTrue(item("Review before confirming").exists, "Consent-free tap must not start publication")
    fill("Account password", password); fill("Source backup password", backupPassword)
    tap("I confirm the target identity, account and data scope above, and authorize encrypted republication and switching this device.")
    control("hold"); tap("Confirm migration")
    XCTAssertTrue(item("Preparing target and publishing encrypted data").waitForExistence(timeout: 15)); capture("publishing")
    tap("Pause migration"); capture("pause-requested"); control("release")
    XCTAssertTrue(item("Paused — ready to resume").waitForExistence(timeout: 20)); capture("paused")
    app.terminate(); launch(); open()
    XCTAssertTrue(item("Paused — ready to resume").waitForExistence(timeout: 12)); capture("paused-after-restart")
    XCTAssertEqual(item("Resume migration").value as? String, "Unavailable")
    fill("Account password", password); fill("Source backup password", backupPassword)
    tap("I confirm the target identity, account and data scope above, and authorize encrypted republication and switching this device.")
    tap("Resume migration")
    XCTAssertTrue(item("Connected to target service").waitForExistence(timeout: 30)); capture("active")
    app.terminate(); launch(); open()
    XCTAssertTrue(item("Connected to target service").waitForExistence(timeout: 12)); capture("active-after-restart")
    app.terminate()
  }
  func testSettingsConfirmedRollbackAndRestart() {
    launch(); open(); XCTAssertTrue(item("Connected to target service").waitForExistence(timeout: 12))
    XCTAssertEqual(item("Return to source").value as? String, "Unavailable")
    tap("I confirm returning this device to the source while keeping its current local data.")
    capture("rollback-confirmation"); tap("Return to source")
    XCTAssertTrue(item("Returned to source service").waitForExistence(timeout: 15)); capture("rolled-back")
    app.terminate(); launch(); open()
    XCTAssertTrue(item("Returned to source service").waitForExistence(timeout: 12)); capture("rolled-back-after-restart")
    app.terminate()
  }
}
