import XCTest
final class ReviewUITests: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "com.zzzode.leanon.uiqa")
  let root = "/tmp/leanon-review-20261007-"
  override func setUp() { continueAfterFailure = false }
  override func tearDown() { app.terminate() }
  func launch(_ scenario: String, locale: String = "en", empty: Bool = false) {
    app.launchEnvironment = ["LEANON_RECORDS_PATH": root + (empty ? "empty" : "main") + ".json", "LEANON_LOCALE": locale, "LEANON_QA_NOW": "2026-10-07T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC", "LEANON_INITIAL_ROUTE": "me"]
    app.launch(); XCTAssertTrue(app.tabBars.buttons[locale == "en" ? "Me" : "我的"].waitForExistence(timeout: 15))
  }
  func e(_ label: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: label).firstMatch }
  func tap(_ label: String) {
    let target = e(label); XCTAssertTrue(target.waitForExistence(timeout: 7), app.debugDescription)
    for _ in 0..<18 where !target.isHittable { let above=target.frame.minY < app.frame.height * 0.2; app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:above ? 0.24:0.46)).press(forDuration:0.05,thenDragTo:app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:above ? 0.46:0.24))) }
    XCTAssertTrue(target.isHittable, target.debugDescription); target.tap()
  }
  func capture(_ name: String) {
    RunLoop.current.run(until: Date().addingTimeInterval(0.6))
    let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    let t = XCTAttachment(string: app.debugDescription); t.name = name + "-tree"; t.lifetime = .keepAlways; add(t)
  }
  func settings() {
    app.tabBars.buttons["Me"].tap()
    let s = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Settings")).firstMatch
    for _ in 0..<6 where !s.isHittable { app.swipeUp() }; XCTAssertTrue(s.isHittable); s.tap()
  }
  func text(_ label: String, _ value: String) {
    let f = app.textFields.matching(identifier: label).firstMatch
    XCTAssertTrue(f.waitForExistence(timeout: 5))
    for _ in 0..<6 where !f.isHittable { app.swipeUp() }; f.tap()
    let old = f.value as? String ?? ""
    f.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count) + value)
  }
  func test01SixScreensBothThemes() {
    launch("main")
    settings()
    for mode in ["Light", "Dark"] {
      tap(mode); capture("ios-en-\(mode.lowercased())-settings")
      app.navigationBars.buttons.firstMatch.tap()
      for tab in ["Today", "Diary", "Progress", "Partner", "Me"] {
        app.tabBars.buttons[tab].tap(); capture("ios-en-\(mode.lowercased())-\(tab.lowercased())")
      }
      settings()
    }
    tap("Follow system")
  }
  func test02FoodAndWeightForms() {
    launch("main"); app.tabBars.buttons["Today"].tap()
    tap("Log weight"); capture("ios-en-weight-new")
    text("Weight", "0"); tap("Save"); capture("ios-en-weight-invalid-keyboard"); tap("Cancel")
    tap("Log food"); text("Search foods", "rice"); capture("ios-en-food-search-keyboard")
    app.textFields["Search foods"].typeText("\n"); tap("White rice, cooked"); text("Amount", "150"); capture("ios-en-food-portion-keyboard"); tap("Cancel")
    tap("Log exercise"); capture("ios-en-exercise-new"); tap("Cancel")
  }
  func test03EmptyAndError() {
    launch("empty", empty: true)
    for tab in ["Today", "Diary", "Progress", "Partner", "Me"] { app.tabBars.buttons[tab].tap(); capture("ios-en-empty-\(tab.lowercased())") }
    app.terminate()
    try! "invalid-isolated-review-fixture".write(toFile: root + "error.json", atomically: true, encoding: .utf8)
    app.launchEnvironment["LEANON_RECORDS_PATH"] = root + "error.json"
    app.launch(); app.tabBars.buttons["Today"].tap(); capture("ios-en-read-error")
  }
  func test04ChineseScreens() {
    launch("main", locale: "zh-CN")
    for (index, tab) in ["today", "diary", "progress", "partner", "me"].enumerated() {
      app.tabBars.buttons.element(boundBy:index).tap(); capture("ios-zh-light-\(tab)")
    }
  }
  func test05EditAndDeleteForms() {
    launch("main"); app.tabBars.buttons["Diary"].tap()
    tap("Edit · Legacy daily total"); capture("ios-en-legacy-edit"); tap("Cancel")
    tap("Edit · Weight"); capture("ios-en-weight-edit"); text("Weight (kg)", "0"); tap("Save"); capture("ios-en-weight-edit-invalid"); tap("Cancel")
    tap("Delete · Weight"); capture("ios-en-delete-confirmation"); tap("Cancel")
    app.tabBars.buttons["Me"].tap(); tap("Edit profile and goals"); capture("ios-en-profile-edit"); tap("Cancel")
  }

  func test06RecordedMealEditAndChart() {
    launch("main"); app.tabBars.buttons["Today"].tap()
    tap("Log food"); text("Search foods", "rice"); app.textFields["Search foods"].typeText("\n"); tap("White rice, cooked"); text("Amount", "150"); tap("Add meal"); app.tabBars.buttons["Diary"].tap()
    tap("Edit · White rice, cooked"); capture("ios-en-meal-edit"); text("Portion (g)", "0"); tap("Save"); capture("ios-en-meal-edit-invalid"); tap("Cancel")
    app.tabBars.buttons["Diary"].tap(); capture("ios-en-diary-with-meal")
  }

  func test07MultiplePointsChart() {
    launch("main"); app.terminate()
    let fixture:[String:Any] = ["profile":["sex":"male","birthDate":"1993-05-12","heightCm":178,"activityLevel":"lightly_active"],"goalWeightKg":72,"weeklyLossKg":0.6,"weights":[["date":"2026-10-01","weightKg":81.0],["date":"2026-10-03","weightKg":80.8],["date":"2026-10-06","weightKg":80.5],["date":"2026-10-07","weightKg":80.4]],"intake":[],"water":[],"exercises":[],"customFoods":[],"favoriteFoodIds":[],"recentFoodIds":[]]
    try! JSONSerialization.data(withJSONObject:fixture).write(to:URL(fileURLWithPath:root+"chart.json"))
    app.launchEnvironment["LEANON_RECORDS_PATH"]=root+"chart.json"; app.launchEnvironment["LEANON_INITIAL_ROUTE"]="progress";app.launch()
    capture("ios-en-progress-multiple-points"); app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.48)).press(forDuration:0.05,thenDragTo:app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.27))); capture("ios-en-progress-chart-details");app.swipeDown();tap("30 days");capture("ios-en-progress-30-days")
  }

}
