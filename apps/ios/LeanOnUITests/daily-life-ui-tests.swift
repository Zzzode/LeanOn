import XCTest

/// The explicit application namespace and record file are both disposable.
/// These scenarios never invoke health, camera, Bluetooth or notification access.
final class DailyLifeUITests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.zzzode.leanon.uiqa")
  private var records: URL!
  private var chinese = false
  private var prefix = ""
  private func label(_ english: String, _ chinese: String) -> String { self.chinese ? chinese : english }
  private var cancel: String { label("Cancel", "取消") }
  private var save: String { label("Save", "保存") }
  private var diary: String { label("Diary", "饮食") }
  private var journalDate: String { label("Journal date", "日记日期") }

  override func setUpWithError() throws {
    continueAfterFailure = false
    addUIInterruptionMonitor(withDescription: "Abort unexpected OS permission") { [weak self] alert in
      let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      image.name = "unexpected-os-alert-aborted"; image.lifetime = .keepAlways; self?.add(image)
      XCTFail("Unexpected OS alert; no permission button will be tapped: \(alert.label)")
      return false
    }
  }
  override func tearDownWithError() throws {
    if app.state == .runningForeground {
      let dismiss = element(cancel)
      if dismiss.exists && dismiss.isHittable {
        noSystemAlert(); dismiss.tap()
      }
    }
    if let records, let data = try? Data(contentsOf: records) { attach(data, "\(prefix)-records-final") }
    app.terminate()
  }

  private func configure(_ locale: String, _ mode: String, scenario: String, fixture: NSDictionary? = nil, clock: Bool = false) throws {
    chinese = locale == "zh-CN"; prefix = "\(locale)-\(mode.lowercased())-\(scenario)"
    records = URL(fileURLWithPath: "/tmp/leanon-daily-ui-\(prefix).json")
    if FileManager.default.fileExists(atPath: records.path) { try FileManager.default.removeItem(at: records) }
    if let fixture { try JSONSerialization.data(withJSONObject: fixture).write(to: records, options: .atomic) }
    if let bytes = try? Data(contentsOf: records) { attach(bytes, "\(prefix)-records-before") }
    app.launchEnvironment = ["LEANON_RECORDS_PATH": records.path, "LEANON_LOCALE": locale,
      "LEANON_INITIAL_ROUTE": "me", "LEANON_QA_NOW": "2026-10-06T12:00:00Z", "LEANON_QA_TIME_ZONE": "UTC"]
    if clock {
      try writeClock("2026-10-06T12:00:00Z", "UTC")
      app.launchEnvironment["LEANON_QA_CLOCK_PATH"] = records.path + ".clock.json"
    }
    app.launch()
    XCTAssertTrue(app.tabBars.buttons[label("Me", "我的")].waitForExistence(timeout: 10), app.debugDescription)
    let settings = chinese ? element("设置 · 中文") : app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Settings")).firstMatch
    scrollTo(settings); settings.tap()
    tap(mode == "Light" ? label("Light", "浅色") : label("Dark", "深色"))
    XCTAssertTrue(app.staticTexts[label("Current appearance: \(mode)", "当前显示：\(mode == "Light" ? "浅色" : "深色")")].waitForExistence(timeout: 5))
    app.navigationBars.buttons.firstMatch.tap()
  }
  private func element(_ name: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: name).firstMatch }
  private func noSystemAlert() {
    XCTAssertFalse(XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch.exists, "Abort before interacting with any unexpected OS permission")
  }
  private func scrollTo(_ target: XCUIElement) {
    XCTAssertTrue(target.waitForExistence(timeout: 5), app.debugDescription)
    for _ in 0..<12 where !target.isHittable {
      let above = target.frame.minY < app.frame.height * 0.2
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: above ? 0.23 : 0.44))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: above ? 0.44 : 0.23)))
    }
    XCTAssertTrue(target.isHittable, target.debugDescription)
  }
  private func tap(_ name: String) { noSystemAlert(); let target = element(name); scrollTo(target); target.tap() }
  private func replace(_ name: String, _ value: String) {
    noSystemAlert(); let fields = app.textFields.matching(identifier: name)
    let field = fields.count > 1 ? fields.element(boundBy: fields.count - 1) : fields.firstMatch
    scrollTo(field)
    // A long press transfers focus to the contextual menu; the far trailing
    // edge can hit a unit accessory. Short numeric drafts end before the center.
    field.tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    let previous = field.value as? String ?? ""
    if !previous.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + value)
    } else { field.typeText(value) }
    XCTAssertEqual(field.value as? String, value, "The visible native field must contain the intended draft")
  }
  private func snapshot() throws -> NSDictionary { try EncryptedQARecordReader.snapshot(records) }
  private func rows(_ data: NSDictionary, _ key: String) -> [NSDictionary] { data[key] as? [NSDictionary] ?? [] }
  private func awaitRecord(_ check: @escaping (NSDictionary) -> Bool) {
    let predicate = NSPredicate { _, _ in guard let data = try? self.snapshot() else { return false }; return check(data) }
    expectation(for: predicate, evaluatedWith: records); waitForExpectations(timeout: 10)
  }
  private func closed() {
    expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element(cancel)); waitForExpectations(timeout: 5)
  }
  private func capture(_ name: String) {
    // Lynx sheet transitions finish after the native tap becomes idle.
    RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "\(prefix)-\(name)"; attachment.lifetime = .keepAlways; add(attachment)
  }
  private func writeClock(_ instant: String, _ zone: String) throws {
    try JSONSerialization.data(withJSONObject: ["now": instant, "timeZone": zone])
      .write(to: URL(fileURLWithPath: records.path + ".clock.json"), options: .atomic)
  }
  private func attach(_ bytes: Data, _ name: String) {
    let attachment = XCTAttachment(data: bytes, uniformTypeIdentifier: "public.json"); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }

  private func setupFlow(_ locale: String, _ mode: String) throws {
    try configure(locale, mode, scenario: "setup")
    tap(label("Set up my journal", "设置我的日记"))
    capture("fresh-unconfigured")
    XCTAssertFalse(FileManager.default.fileExists(atPath: records.path))
    replace(label("Date of birth", "出生日期"), "1993-05-12")
    tap(cancel); closed()
    XCTAssertFalse(FileManager.default.fileExists(atPath: records.path), "Cancel does not persist the first draft")
    tap(label("Set up my journal", "设置我的日记"))
    tap(label("Male", "男")); replace(label("Date of birth", "出生日期"), "1993-05-12")
    replace(label("Height", "身高"), "178")
    tap(label("Lightly active", "轻度活动"))
    replace(label("Starting weight", "起始体重"), "80")
    capture("setup-draft-keyboard")
    tap(label("Finish setup", "完成设置"))
    capture("after-finish-tap")
    let diagnostic = XCTAttachment(string: app.debugDescription)
    diagnostic.name = "setup-after-finish-accessibility"; diagnostic.lifetime = .keepAlways; add(diagnostic)
    awaitRecord { ($0["setupCompleted"] as? Bool) == true }; closed()
    let saved = try snapshot()
    XCTAssertEqual((saved["profile"] as? NSDictionary)?["heightCm"] as? Int, 178)
    XCTAssertEqual(rows(saved, "weights").first?["date"] as? String, "2026-10-06")
    XCTAssertEqual(saved["guidanceMode"] as? String, "tracking-only")
    capture("setup-saved")
    app.terminate(); app.launch()
    tap(label("Edit profile and goals", "编辑资料与目标"))
    XCTAssertEqual(app.textFields[label("Height", "身高")].value as? String, "178")
    replace(label("Height", "身高"), "180")
    tap(cancel); closed()
    XCTAssertEqual((try snapshot()["profile"] as? NSDictionary)?["heightCm"] as? Int, 178)
    tap(label("Edit profile and goals", "编辑资料与目标")); replace(label("Height", "身高"), "180")
    tap(label("Save profile and goals", "保存资料与目标"))
    awaitRecord { ($0["profile"] as? NSDictionary)?["heightCm"] as? Int == 180 }; closed()
    capture("profile-edited-after-relaunch")
  }

  func testEnglishLightSetupCancelSaveEditAndRelaunch() throws { try setupFlow("en", "Light") }
  func testEnglishDarkSetupCancelSaveEditAndRelaunch() throws { try setupFlow("en", "Dark") }
  func testChineseLightSetupCancelSaveEditAndRelaunch() throws { try setupFlow("zh-CN", "Light") }
  func testChineseDarkSetupCancelSaveEditAndRelaunch() throws { try setupFlow("zh-CN", "Dark") }

  private func legacyFixture() -> NSDictionary {
    ["profile": ["sex": "male", "birthDate": "1993-05-12", "heightCm": 178, "activityLevel": "lightly_active"],
     "goalWeightKg": 72, "weeklyLossKg": 0.6,
     "weights": [["date": "2026-10-03", "weightKg": 80]],
     "intake": [], "water": [], "exercises": [], "customFoods": [], "favoriteFoodIds": [], "recentFoodIds": [],
     "auditMetadata": ["fixture": "synthetic daily UI"]]
  }
  private func selectDay(_ date: String) {
    replace(journalDate, date); tap(label("Show this day", "查看这一天"))
  }
  private func mealHistory(_ locale: String, _ mode: String) throws {
    try configure(locale, mode, scenario: "meal-history", fixture: legacyFixture())
    app.tabBars.buttons[diary].tap(); selectDay("2026-10-03")
    capture("historical-day-before")
    tap(label("Log food", "记录饮食"))
    replace(label("Search foods", "搜索食物"), label("White rice", "白米饭"))
    let food = label("White rice, cooked", "白米饭")
    tap(food); replace(label("Amount", "食用量"), "100")
    capture("historical-meal-new-draft")
    tap(label("Add meal", "添加")); closed()
    awaitRecord { self.rows($0, "intakeEntries").count == 1 }
    let original = try XCTUnwrap(rows(try snapshot(), "intakeEntries").first)
    let id = try XCTUnwrap(original["id"] as? String)
    XCTAssertEqual(original["date"] as? String, "2026-10-03")
    tap(label("Edit", "编辑") + " · " + food)
    replace(label("Portion (g)", "份量（g）"), "150"); tap(label("Dinner", "晚餐"))
    capture("historical-meal-edited-draft-keyboard"); tap(save); closed()
    awaitRecord { self.rows($0, "intakeEntries").first?["grams"] as? Int == 150 }
    XCTAssertEqual(rows(try snapshot(), "intakeEntries").first?["id"] as? String, id)
    XCTAssertEqual(rows(try snapshot(), "intakeEntries").first?["meal"] as? String, "dinner")
    let before = try Data(contentsOf: records)
    tap(label("Delete", "删除") + " · " + food); capture("delete-confirmation"); tap(cancel); closed()
    XCTAssertEqual(try Data(contentsOf: records), before)
    tap(label("Delete", "删除") + " · " + food); tap(label("Delete record", "删除记录"))
    awaitRecord { self.rows($0, "intakeEntries").isEmpty && self.rows($0, "deletedRecords").count == 1 }
    capture("deleted-undo-visible"); tap(label("Undo delete", "撤销删除"))
    awaitRecord { self.rows($0, "intakeEntries").count == 1 && self.rows($0, "deletedRecords").isEmpty }
    tap(label("Delete", "删除") + " · " + food); tap(label("Delete record", "删除记录"))
    awaitRecord { self.rows($0, "deletedRecords").count == 1 }
    app.terminate(); app.launch(); app.tabBars.buttons[diary].tap()
    tap(label("Recently deleted", "最近删除"))
    let restoreMeal = label("Restore", "恢复") + " · " + food + " · 2026-10-03"
    scrollTo(element(restoreMeal)); capture("trash-after-relaunch")
    tap(restoreMeal)
    awaitRecord { self.rows($0, "deletedRecords").isEmpty && self.rows($0, "intakeEntries").first?["id"] as? String == id }
    selectDay("2026-10-03"); scrollTo(element(label("Edit", "编辑") + " · " + food)); capture("historical-meal-restored")
    XCTAssertEqual(rows(try snapshot(), "intakeEntries").first?["grams"] as? Int, 150)
  }
  func testEnglishLightHistoricalMealEditDeleteUndoAndRestartRestore() throws { try mealHistory("en", "Light") }
  func testChineseDarkHistoricalMealEditDeleteUndoAndRestartRestore() throws { try mealHistory("zh-CN", "Dark") }

  private func dailyRecords(_ locale: String, _ mode: String) throws {
    let fixture = legacyFixture().mutableCopy() as! NSMutableDictionary
    fixture["water"] = [["date": "2026-10-03", "amountMl": 250]]
    fixture["exercises"] = [["id": "qa-walk", "date": "2026-10-03", "typeId": "walking", "durationMin": 30, "kcal": 100]]
    try configure(locale, mode, scenario: "daily-records", fixture: fixture)
    app.tabBars.buttons[diary].tap(); selectDay("2026-10-03")
    let weight = label("Weight", "体重"), water = label("Water (ml)", "饮水（ml）"), walk = label("Walking (slow)", "散步")
    tap(label("Edit", "编辑") + " · " + weight)
    replace(label("Weight (kg)", "体重 (kg)"), "79.5")
    replace(journalDate, "2026-10-02"); capture("weight-date-correction-draft"); tap(save); closed()
    awaitRecord { self.rows($0, "weights").first?["date"] as? String == "2026-10-02" }
    tap(label("Edit", "编辑") + " · " + water)
    replace(water, "500"); tap(save); closed()
    awaitRecord { self.rows($0, "water").first?["amountMl"] as? Int == 500 }
    tap(label("Edit", "编辑") + " · " + walk)
    replace(label("Duration (min)", "时长（分钟）"), "45"); capture("exercise-edit-keyboard"); tap(save); closed()
    awaitRecord { self.rows($0, "exercises").first?["durationMin"] as? Int == 45 }
    capture("historical-water-exercise-edited")
    for (name, key) in [(water, "water"), (walk, "exercises")] {
      tap(label("Delete", "删除") + " · " + name); tap(label("Delete record", "删除记录"))
      awaitRecord { self.rows($0, key).isEmpty }
      tap(label("Undo delete", "撤销删除")); awaitRecord { self.rows($0, key).count == 1 }
    }
    selectDay("2026-10-02")
    tap(label("Delete", "删除") + " · " + weight); tap(label("Delete record", "删除记录"))
    awaitRecord { self.rows($0, "weights").isEmpty }
    app.terminate(); app.launch(); app.tabBars.buttons[diary].tap()
    tap(label("Recently deleted", "最近删除"))
    let restoreWeight = label("Restore", "恢复") + " · " + weight + " · 2026-10-02"
    scrollTo(element(restoreWeight)); capture("weight-trash-after-relaunch")
    tap(restoreWeight)
    awaitRecord { self.rows($0, "weights").first?["weightKg"] as? Double == 79.5 }
    selectDay("2026-10-02"); capture("weight-restored-corrected-date")
    XCTAssertEqual(rows(try snapshot(), "weights").first?["id"] as? String, "weight-2026-10-03")
    XCTAssertEqual((try snapshot()["auditMetadata"] as? NSDictionary)?["fixture"] as? String, "synthetic daily UI")
  }
  func testEnglishDarkHistoricalWeightWaterExerciseEditDeleteAndRestore() throws { try dailyRecords("en", "Dark") }
  func testChineseLightHistoricalWeightWaterExerciseEditDeleteAndRestore() throws { try dailyRecords("zh-CN", "Light") }

  private func legacyAndFailure(_ locale: String, _ mode: String) throws {
    let fixture = legacyFixture().mutableCopy() as! NSMutableDictionary
    fixture["intake"] = [["date": "2026-10-03", "kcal": 300, "macros": ["proteinG": 10, "carbsG": 40, "fatG": 5], "originNote": "legacy aggregate only"]]
    try configure(locale, mode, scenario: "legacy-errors", fixture: fixture)
    let original = try Data(contentsOf: records)
    app.tabBars.buttons[diary].tap(); selectDay("2026-10-03")
    let legacy = label("Legacy daily total", "旧版每日汇总")
    tap(label("Edit", "编辑") + " · " + legacy); capture("legacy-aggregate-edit")
    replace("kcal", "350"); tap(cancel); closed()
    XCTAssertEqual(try Data(contentsOf: records), original, "Read and Cancel leave legacy bytes unchanged")
    tap(label("Edit", "编辑") + " · " + legacy); replace("kcal", "350"); tap(save); closed()
    awaitRecord { self.rows($0, "legacyIntake").first?["kcal"] as? Int == 350 }
    XCTAssertTrue(rows(try snapshot(), "intakeEntries").isEmpty)
    tap(label("Edit", "编辑") + " · " + legacy); replace("kcal", "400")
    let valid = try Data(contentsOf: records)
    let corrupt = Data("{isolated read failure".utf8); try corrupt.write(to: records, options: .atomic)
    tap(save)
    let feedback = element(label("Could not save. Your draft remains here; try again.", "未能保存，草稿仍保留在此，请重试。"))
    XCTAssertTrue(feedback.waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertTrue(feedback.isHittable, "Save failure must be visible beside the actions without scrolling")
    XCTAssertGreaterThanOrEqual(feedback.frame.minY, app.frame.minY)
    XCTAssertLessThanOrEqual(feedback.frame.maxY, element(cancel).frame.minY)
    XCTAssertTrue(element(cancel).isHittable); XCTAssertTrue(element(save).isHittable)
    capture("feedback-visible-without-scrolling")
    XCTAssertEqual(try Data(contentsOf: records), corrupt)
    scrollTo(element(label("Could not save. Your draft remains here; try again.", "未能保存，草稿仍保留在此，请重试。")))
    capture("failed-write-draft-preserved")
    let refreshError = label("Could not refresh your journal. Retry before making changes.", "未能刷新日记，请重试后再修改。")
    let periodicReadErrorVisible = element(refreshError).waitForExistence(timeout: 65)
    XCTAssertEqual(try Data(contentsOf: records), corrupt)
    let readFailure = XCTAttachment(string: app.debugDescription)
    readFailure.name = periodicReadErrorVisible ? "confirmed-periodic-read-error-with-open-draft" : "background-notice-hidden-by-modal-periodic-trigger-unverified"
    readFailure.lifetime = .keepAlways; add(readFailure)
    capture("poll-read-error-while-draft-open")
    try valid.write(to: records, options: .atomic); tap(save); closed()
    awaitRecord { self.rows($0, "legacyIntake").first?["kcal"] as? Int == 400 }
    capture("failed-write-retry-recovered")
    let recovered = try Data(contentsOf: records)
    try corrupt.write(to: records, options: .atomic); app.terminate(); app.launch()
    XCTAssertTrue(element(label("Retry", "重试")).waitForExistence(timeout: 10)); capture("corrupt-store-read-error")
    XCTAssertEqual(try Data(contentsOf: records), corrupt)
    try recovered.write(to: records, options: .atomic); tap(label("Retry", "重试"))
    app.tabBars.buttons[diary].tap(); selectDay("2026-10-03"); capture("read-error-retry-recovered")
    XCTAssertEqual(try Data(contentsOf: records), recovered)
  }
  func testEnglishLightLegacyCancelAndReadWriteFailureRetry() throws { try legacyAndFailure("en", "Light") }
  func testChineseDarkLegacyCancelAndReadWriteFailureRetry() throws { try legacyAndFailure("zh-CN", "Dark") }

  func testControlledClockForegroundRefreshPreservesHistoricalOpenDraft() throws {
    try configure("en", "Dark", scenario: "controlled-clock", fixture: legacyFixture(), clock: true)
    app.tabBars.buttons[diary].tap(); selectDay("2026-10-03")
    tap("Water (ml)"); replace("Water (ml)", "400")
    let before = try Data(contentsOf: records)
    try writeClock("2026-10-07T00:30:00Z", "UTC")
    XCUIDevice.shared.press(.home); app.activate()
    XCTAssertEqual(app.textFields.matching(identifier: journalDate).allElementsBoundByIndex.last?.value as? String, "2026-10-03")
    XCTAssertEqual(app.textFields["Water (ml)"].value as? String, "400")
    XCTAssertEqual(try Data(contentsOf: records), before)
    capture("foreground-clock-advanced-historical-draft-kept")
    tap(save); closed()
    awaitRecord { self.rows($0, "water").first?["date"] as? String == "2026-10-03" }
    app.tabBars.buttons["Today"].tap(); tap("Log weight")
    XCTAssertTrue(element("Journal date · 2026-10-07").waitForExistence(timeout: 5), app.debugDescription)
    capture("new-today-draft-after-controlled-day-change"); tap(cancel); closed()
    try writeClock("2026-10-07T00:30:00Z", "America/Los_Angeles")
    XCUIDevice.shared.press(.home); app.activate(); tap("Log weight")
    XCTAssertTrue(element("Journal date · 2026-10-06").waitForExistence(timeout: 5), app.debugDescription)
    capture("new-today-draft-after-controlled-zone-change"); tap(cancel); closed()
    XCTAssertEqual(rows(try snapshot(), "water").first?["date"] as? String, "2026-10-03")
  }
}
