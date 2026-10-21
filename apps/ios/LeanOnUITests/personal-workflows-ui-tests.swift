import XCTest
import Foundation
import CryptoKit
import Security
import UIKit

/// Actual shared pages and native encrypted stores, using only disposable fictional data.
final class PersonalWorkflowsUITests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.zzzode.leanon.uiqa")
  private var path: URL!
  private var chinese = false
  private var fontFixture: URL?
  private var publicAccountPassword: String?
  private var publicRelayURL: String?
  private func label(_ en: String, _ zh: String) -> String { chinese ? zh : en }
  override func setUpWithError() throws {
    continueAfterFailure = false
    addUIInterruptionMonitor(withDescription: "Abort any OS permission prompt") { [weak self] alert in
      self?.capture("unexpected-permission-aborted"); XCTFail("Unexpected OS alert; no permission tapped: \(alert.label)"); return false
    }
  }
  override func tearDownWithError() throws {
    if let path {
      if let password=publicAccountPassword,let state=try? companionDocument(),let identity=state["identity"] as? NSDictionary,let token=identity["token"] as? String {
        let relay = publicRelayURL ?? "http://127.0.0.1:8787"
        let operation = UUID().uuidString
        let proof = Data((UUID().uuidString + UUID().uuidString).utf8).prefix(32).base64EncodedString()
        var request=URLRequest(url:URL(string:relay + "/v1/accounts/current")!)
        request.httpMethod="DELETE";request.timeoutInterval=10
        request.setValue("Bearer "+token,forHTTPHeaderField:"Authorization")
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.httpBody=try JSONSerialization.data(withJSONObject: publicRelayURL == nil ? ["password":password] : ["password":password,"operationId":operation,"proof":proof])
        let done=expectation(description:"Remove disposable loopback UI account")
        URLSession(configuration:.ephemeral).dataTask(with:request){_,response,error in
          XCTAssertNil(error);XCTAssertEqual((response as? HTTPURLResponse)?.statusCode,200);done.fulfill()
        }.resume();wait(for:[done],timeout:12)
        if publicRelayURL != nil {
          var ack=URLRequest(url:URL(string:relay + "/v1/account-deletions/" + operation + "/ack")!)
          ack.httpMethod="POST";ack.timeoutInterval=10;ack.setValue("application/json",forHTTPHeaderField:"Content-Type")
          ack.httpBody=try JSONSerialization.data(withJSONObject:["proof":proof])
          let acknowledged=expectation(description:"Clean the fictional deletion receipt")
          URLSession(configuration:.ephemeral).dataTask(with:ack){_,response,error in
            XCTAssertNil(error);XCTAssertEqual((response as? HTTPURLResponse)?.statusCode,200);acknowledged.fulfill()
          }.resume();wait(for:[acknowledged],timeout:12)
        }
      }
      if let state = try? personal(), let bytes = try? JSONSerialization.data(withJSONObject:state,options:[.sortedKeys,.prettyPrinted]) {
        let attachment=XCTAttachment(data:bytes,uniformTypeIdentifier:"public.json");attachment.name="fictional-personal-final";attachment.lifetime = .keepAlways;add(attachment)
      }
      app.terminate()
      let account="personal-"+SHA256.hash(data:Data(personalURL.path.utf8)).map{String(format:"%02x",$0)}.joined()
      let recordAccount="records-"+SHA256.hash(data:Data(path.standardizedFileURL.path.utf8)).map{String(format:"%02x",$0)}.joined()
      for name in [account,recordAccount,"journal-"+account,"companion-"+account,"health-ledger-"+account] {
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.zzzode.leanon.uiqa.encrypted-data",kSecAttrAccount as String:name]
        let result=SecItemDelete(query as CFDictionary)
        XCTAssertTrue(result==errSecSuccess || result==errSecItemNotFound,"QA Keychain cleanup status \(result)")
      }
      let base=path.deletingPathExtension().lastPathComponent
      for file in try FileManager.default.contentsOfDirectory(at:path.deletingLastPathComponent(),includingPropertiesForKeys:nil) where file.lastPathComponent.hasPrefix(base+".") {
        try FileManager.default.removeItem(at:file)
      }
    } else { app.terminate() }
    if let fontFixture { try? FileManager.default.removeItem(at:fontFixture) }
  }
  private func element(_ name: String) -> XCUIElement {
    if app.buttons[name].exists {return app.buttons[name].firstMatch}
    return app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR identifier == %@ OR label BEGINSWITH %@", name, name, name + " · ")).firstMatch
  }
  private func tap(_ name: String) {
    let item = element(name)
    XCTAssertTrue(item.waitForExistence(timeout: 10), app.debugDescription)
    for _ in 0..<20 where !item.isHittable {
      var region=app.frame
      for scroll in app.scrollViews.allElementsBoundByIndex {
        let visible=region.intersection(scroll.frame)
        if !visible.isNull && visible.height>60 {region=visible}
      }
      if let keyboard=app.keyboards.allElementsBoundByIndex.first {region.size.height=min(region.height,keyboard.frame.minY-region.minY-8)}
      guard region.height>60 else{break}
      let origin=app.coordinate(withNormalizedOffset:CGVector(dx:0,dy:0))
      let start=origin.withOffset(CGVector(dx:region.midX,dy:region.maxY-18))
      let end=origin.withOffset(CGVector(dx:region.midX,dy:region.minY+18))
      start.press(forDuration:0.05,thenDragTo:end)
    }
    XCTAssertTrue(item.isHittable, app.debugDescription); XCTAssertEqual(app.alerts.count, 0); item.tap()
  }
  private func replace(_ name: String, _ value: String) {
    let item = name.lowercased().contains("password") ? app.secureTextFields[name] : app.textFields[name]
    XCTAssertTrue(item.waitForExistence(timeout: 5), app.debugDescription); item.tap()
    let current = item.value as? String ?? ""
    let old = current == item.placeholderValue ? "" : current
    var selected=false
    if !old.isEmpty {
      item.press(forDuration:1)
      for title in ["Select All","全选"] {
        let menu=app.menuItems[title].exists ? app.menuItems[title] : app.buttons[title]
        if menu.exists && menu.isHittable {menu.tap();selected=true;break}
      }
    }
    item.typeText((selected ? "" : String(repeating:XCUIKeyboardKey.delete.rawValue,count:old.count))+value)
    if item.elementType != .secureTextField { XCTAssertEqual(item.value as? String, value) }
  }
  private func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "personal-" + name; attachment.lifetime = .keepAlways; add(attachment)
  }
  private func assertPublicPhotoPixels(_ name: String) {
    let image = app.images[name]
    XCTAssertTrue(image.waitForExistence(timeout: 10), app.debugDescription)
    for _ in 0..<8 {
      let center = image.frame.midY
      if (180...(app.frame.maxY - 155)).contains(center) { break }
      let origin = app.coordinate(withNormalizedOffset: .zero)
      let above = center < 180
      origin.withOffset(CGVector(dx: 185, dy: above ? 280 : 480)).press(forDuration: 0.05,
        thenDragTo: origin.withOffset(CGVector(dx: 185, dy: above ? 480 : 280)))
    }
    XCTAssertTrue((180...(app.frame.maxY - 155)).contains(image.frame.midY), app.debugDescription)
    let loaded = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      guard let screenshot = self.app.screenshot().image.cgImage else { return false }
      let point = CGPoint(x: image.frame.midX, y: image.frame.midY)
      let x = Int(point.x / self.app.frame.width * CGFloat(screenshot.width))
      let y = Int(point.y / self.app.frame.height * CGFloat(screenshot.height))
      guard x >= 0, y >= 0, x < screenshot.width, y < screenshot.height,
        let sample = screenshot.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)) else { return false }
      var rgba = [UInt8](repeating: 0, count: 4)
      let read = rgba.withUnsafeMutableBytes { buffer -> Bool in
        guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8,
          bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        context.draw(sample, in: CGRect(x: 0, y: 0, width: 1, height: 1)); return true
      }
      return read && rgba.prefix(3).allSatisfy { (115...145).contains(Int($0)) }
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 12), .completed,
      "PUBLIC synthetic JPEG center must render grey pixels, beyond an accessibility image node")
  }
  private var personalURL: URL { path.deletingPathExtension().appendingPathExtension("personal.json.enc") }
  private func companionDocument() throws -> NSDictionary {
    let personalAccount="personal-"+SHA256.hash(data:Data(personalURL.path.utf8)).map{String(format:"%02x",$0)}.joined()
    let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.zzzode.leanon.uiqa.encrypted-data",kSecAttrAccount as String:"companion-"+personalAccount,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
    var raw:CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary,&raw)==errSecSuccess,let key=raw as? Data else {throw CocoaError(.fileReadNoPermission)}
    let url=path.deletingPathExtension().appendingPathExtension("companion.json.enc")
    let bytes=try AES.GCM.open(AES.GCM.SealedBox(combined:Data(contentsOf:url)),using:SymmetricKey(data:key),authenticating:Data("LeanOn companion v1".utf8))
    return try XCTUnwrap(JSONSerialization.jsonObject(with:bytes) as? NSDictionary)
  }
  private func personal() throws -> NSDictionary {
    let account = "personal-" + SHA256.hash(data: Data(personalURL.path.utf8)).map { String(format: "%02x", $0) }.joined()
    let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.zzzode.leanon.uiqa.encrypted-data",
      kSecAttrAccount as String:account,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
    var raw:CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary,&raw)==errSecSuccess,let key=raw as? Data else { throw CocoaError(.fileReadNoPermission) }
    let bytes = try AES.GCM.open(AES.GCM.SealedBox(combined:Data(contentsOf:personalURL)),using:SymmetricKey(data:key),authenticating:Data("LeanOn personal v1".utf8))
    return (try JSONSerialization.jsonObject(with:bytes) as! NSDictionary)["personal"] as! NSDictionary
  }
  private func waitPersonal(_ predicate: @escaping (NSDictionary)->Bool) throws {
    let expectation = XCTNSPredicateExpectation(predicate:NSPredicate { _,_ in (try? self.personal()).map(predicate) ?? false },object:nil)
    XCTAssertEqual(XCTWaiter.wait(for:[expectation],timeout:10),.completed)
  }
  private func launch(_ locale: String, photoFixture: Bool = false, useRealClock: Bool = false, photoCount: Int = 1) throws {
    chinese = locale == "zh-CN"
    path = URL(fileURLWithPath:"/tmp/leanon-personal-ui-" + UUID().uuidString + ".json")
    let state: NSDictionary = ["schemaVersion":2,"revision":0,"setupCompleted":false,"profile":NSNull(),"goalWeightKg":NSNull(),"weeklyLossKg":NSNull(),"guidanceMode":"tracking-only",
      "safetyFlags":["pregnant":NSNull(),"breastfeeding":NSNull(),"eatingDisorderRisk":NSNull()],"weights":[],"water":[],"exercises":[],"legacyIntake":[],"intakeEntries":[],"intake":[],"deletedRecords":[],"processedOperations":[],"customFoods":[],"favoriteFoodIds":[],"recentFoodIds":[]]
    try JSONSerialization.data(withJSONObject:state).write(to:path)
    if photoFixture {
      let fixtureURL = try XCTUnwrap(Bundle(for:Self.self).url(forResource:"public-backup-v1",withExtension:"json"))
      let vector = try JSONSerialization.jsonObject(with:Data(contentsOf:fixtureURL)) as! NSDictionary
      let payload = vector["payload"] as! NSDictionary
      var blobs:[String:String]=[:]
      for row in payload["photos"] as! [NSDictionary] { blobs[row["id"] as! String]=row["bytesBase64"] as? String }
      let own = (payload["personal"] as! NSDictionary).mutableCopy() as! NSMutableDictionary
      if photoCount > 1 {
        let prototype = (own["photos"] as! [NSDictionary])[0]
        let bytes = blobs[prototype["id"] as! String]!
        own["photos"] = (0..<photoCount).map { index -> NSDictionary in
          let row = prototype.mutableCopy() as! NSMutableDictionary
          let id = "public-photo-\(index + 1)"
          row["id"] = id; row["date"] = String(format: "2026-10-%02d", 7 - index)
          blobs[id] = bytes; return row
        }
      }
      let document:NSDictionary=["personal":own,"photoBytes":blobs]
      let account = "personal-" + SHA256.hash(data:Data(personalURL.path.utf8)).map{String(format:"%02x",$0)}.joined()
      var key = Data(count:32)
      XCTAssertEqual(key.withUnsafeMutableBytes{SecRandomCopyBytes(kSecRandomDefault,32,$0.baseAddress!)},errSecSuccess)
      let attributes:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.zzzode.leanon.uiqa.encrypted-data",kSecAttrAccount as String:account,kSecValueData as String:key,kSecAttrAccessible as String:kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
      XCTAssertEqual(SecItemAdd(attributes as CFDictionary,nil),errSecSuccess)
      let box = try AES.GCM.seal(JSONSerialization.data(withJSONObject:document),using:SymmetricKey(data:key),authenticating:Data("LeanOn personal v1".utf8))
      try XCTUnwrap(box.combined).write(to:personalURL,options:.completeFileProtection)
    }
    app.launchEnvironment=["LEANON_RECORDS_PATH":path.path,"LEANON_INITIAL_ROUTE":"me","LEANON_LOCALE":locale,"LEANON_QA_NOW":"2026-10-07T12:00:00Z","LEANON_QA_TIME_ZONE":"UTC"]
    if useRealClock {app.launchEnvironment.removeValue(forKey:"LEANON_QA_NOW")}
    if let fontFixture {
      app.launchEnvironment["LEANON_QA_CONTENT_SIZE_CATEGORY_PATH"] = fontFixture.path
    }
    app.launch(); XCTAssertTrue(app.tabBars.buttons[label("Me","我的")].waitForExistence(timeout:10))
  }
  func testEnglishDietaryPreferencesSaveCancelAndRelaunchInEncryptedStore() throws {
    try launch("en"); tap("Dietary preferences"); tap("Vegan")
    replace("Personal notes","Fictional QA preference")
    capture("dietary-keyboard"); tap("Save")
    try waitPersonal { (($0["dietaryPreferences"] as? NSDictionary)?["pattern"] as? String)=="vegan" }
    let encrypted = try Data(contentsOf:personalURL)
    XCTAssertNil(encrypted.range(of:Data("Fictional QA preference".utf8)))
    tap("Dietary preferences"); replace("Personal notes","Cancelled draft"); tap("Cancel")
    XCTAssertEqual(try Data(contentsOf:personalURL),encrypted)
    app.terminate(); app.launch(); tap("Dietary preferences")
    XCTAssertEqual(app.textFields["Personal notes"].value as? String,"Fictional QA preference")
    capture("dietary-reopened"); tap("Cancel")
  }
  func testWorkflowChoiceSelectionIsExposedInActualAccessibilityLabels() throws {
    try launch("en"); tap("Dietary preferences"); try waitForStableForm("Save")
    let vegan = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Vegan · ")).firstMatch
    XCTAssertTrue(vegan.waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertEqual(vegan.label, "Vegan · Not selected")
    vegan.tap()
    let selected = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in vegan.label == "Vegan · Selected" }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed)
    capture("choice-actual-ax-selected"); tap("Cancel")
    XCTAssertFalse(FileManager.default.fileExists(atPath: personalURL.path), "Cancelling the AX check must retain the empty isolated store")
  }
  func testDietaryCancelReturnsToVisibleOriginAndPreservesEmptyStore() throws {
    try launch("en"); tap("Dietary preferences")
    replace("Personal notes", "PUBLIC cancelled visibility draft"); tap("Cancel")
    let origin = app.buttons["Dietary preferences"]
    XCTAssertTrue(origin.waitForExistence(timeout: 5))
    let visible = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      origin.isHittable && origin.frame.minY >= 0 && origin.frame.maxY <= self.app.tabBars.firstMatch.frame.minY
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 5), .completed, app.debugDescription)
    capture("dietary-cancel-origin-visible-above-native-bar")
    XCTAssertFalse(FileManager.default.fileExists(atPath: personalURL.path))
  }
  func testDynamicTypeForegroundUpdatePreservesActualDietaryDraftAndFocus() throws {
    let file = URL(fileURLWithPath: "/tmp/leanon-content-size-" + UUID().uuidString + ".json")
    fontFixture = file
    try JSONSerialization.data(withJSONObject:["category": "UICTContentSizeCategoryL"]).write(to:file)
    try launch("en"); tap("Dietary preferences"); replace("Personal notes","Dynamic type draft")
    let normalHeight=app.textFields["Personal notes"].frame.height
    capture("font-before")
    try JSONSerialization.data(withJSONObject:["category": "UICTContentSizeCategoryAccessibilityXXXL"]).write(to:file)
    XCUIDevice.shared.press(.home); app.activate()
    let notes = app.textFields["Personal notes"]
    XCTAssertTrue(notes.waitForExistence(timeout:10)); XCTAssertEqual(notes.value as? String,"Dynamic type draft")
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout:5), "Font updates must preserve the mounted input focus")
    XCTAssertTrue(notes.isHittable)
    XCTAssertGreaterThanOrEqual(notes.frame.height,normalHeight)
    let footer = element("Save")
    XCTAssertGreaterThanOrEqual(footer.frame.height,44)
    capture("font-accessibility-largest-draft")
    tap("Save"); try waitPersonal { (($0["dietaryPreferences"] as? NSDictionary)?["notes"] as? String)=="Dynamic type draft" }
    try JSONSerialization.data(withJSONObject:["category":"UICTContentSizeCategoryL"]).write(to:file)
    XCUIDevice.shared.press(.home);app.activate();tap("Dietary preferences")
    XCTAssertEqual(app.textFields["Personal notes"].value as? String,"Dynamic type draft")
    capture("font-restored-draft-saved");tap("Cancel")
  }
  func testChineseMeasurementSaveEditDeleteCancelAndRelaunch() throws {
    try launch("zh-CN"); tap("身体围度"); tap("新增围度")
    replace("日记日期","2026-10-03"); replace("腰围 · cm","80")
    capture("measurement-keyboard"); tap("保存")
    try waitPersonal { ($0["measurements"] as? [NSDictionary])?.first?["waistCm"] as? Int == 80 }
    let original = try personal(), row = try XCTUnwrap((original["measurements"] as? [NSDictionary])?.first), id = row["id"] as! String
    tap("编辑 身体围度 2026-10-03"); replace("腰围 · cm","79"); tap("保存")
    try waitPersonal { ($0["measurements"] as? [NSDictionary])?.first?["waistCm"] as? Int == 79 }
    XCTAssertEqual((try personal()["measurements"] as! [NSDictionary]).first?["id"] as? String,id)
    app.terminate(); app.launch(); tap("身体围度"); capture("measurement-reopened")
    tap("删除 身体围度 2026-10-03"); capture("measurement-delete-confirmation"); tap("取消")
    XCTAssertEqual((try personal()["measurements"] as! [NSDictionary]).count,1)
    tap("删除 身体围度 2026-10-03"); tap("删除")
    try waitPersonal { ($0["measurements"] as? [NSDictionary])?.isEmpty == true }
    capture("measurement-deleted")
  }
  func testGeneratedPhotoReadMetadataEditDeleteThroughRealNativeWithoutPicker() throws {
    try launch("en",photoFixture:true); tap("Progress photos")
    assertPublicPhotoPixels("2026-10-07 : Other")
    capture("generated-photo-visible")
    tap("Edit photo details 2026-10-07 Other"); tap("Side"); replace("Personal notes","Synthetic metadata edit"); tap("Save")
    try waitPersonal { ($0["photos"] as? [NSDictionary])?.first?["view"] as? String == "side" }
    assertPublicPhotoPixels("2026-10-07 : Side"); capture("generated-photo-metadata-updated")
    XCUIDevice.shared.press(.home); app.activate()
    assertPublicPhotoPixels("2026-10-07 : Side"); capture("generated-photo-foreground-reloaded")
    tap("Delete this local photo? 2026-10-07 Side"); capture("generated-photo-delete-confirmation"); tap("Delete")
    try waitPersonal { ($0["photos"] as? [NSDictionary])?.isEmpty == true }
    capture("generated-photo-empty-after-delete")
  }
  func testGeneratedPhotoPaginationMountsFourAndForegroundReloadsActualPixels() throws {
    try launch("en", photoFixture: true, photoCount: 5); tap("Progress photos")
    let mounted = app.images.matching(NSPredicate(format: "label MATCHES %@", "2026-10-0[3-7] : Other"))
    func waitForCount(_ count: Int) {
      let loaded = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in mounted.count == count }, object: nil)
      XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 10), .completed, app.debugDescription)
    }
    assertPublicPhotoPixels("2026-10-07 : Other"); waitForCount(4); capture("gallery-first-four-real-pixels")
    tap("Next photos")
    XCTAssertTrue(element("Page 2 of 2").exists)
    assertPublicPhotoPixels("2026-10-03 : Other"); waitForCount(1); capture("gallery-second-page-real-pixels")
    XCUIDevice.shared.press(.home); app.activate()
    assertPublicPhotoPixels("2026-10-03 : Other"); waitForCount(1); capture("gallery-second-page-foreground-pixels")
    tap("Previous photos")
    let firstPhoto = app.images["2026-10-07 : Other"]
    let returned = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      firstPhoto.exists && firstPhoto.frame.minY >= 140 && firstPhoto.frame.maxY < self.element("Cancel").frame.minY
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [returned], timeout: 5), .completed,
      "Previous must reveal the first photo automatically, without a compensating test scroll")
    assertPublicPhotoPixels("2026-10-07 : Other"); waitForCount(4)
    XCTAssertEqual((try personal()["photos"] as? NSArray)?.count, 5)
    capture("gallery-returned-first-four")
  }
  func testBackupExportPickerCancelDoesNotChangeRecordsOrPersonal() throws {
    try launch("en"); let recordsBefore = try Data(contentsOf:path)
    tap("Encrypted backup"); replace("Backup password","PUBLIC fixture backup password")
    tap("Export encrypted backup")
    let navigation = app.navigationBars.firstMatch
    XCTAssertTrue(navigation.waitForExistence(timeout:15),app.debugDescription)
    capture("backup-document-export-picker")
    let start=app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.16))
    let end=app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.94))
    start.press(forDuration:0.1,thenDragTo:end)
    let dismissed=XCTNSPredicateExpectation(predicate:NSPredicate{_,_ in !navigation.exists},object:nil)
    XCTAssertEqual(XCTWaiter.wait(for:[dismissed],timeout:10),.completed)
    XCTAssertNotEqual(app.buttons["Export encrypted backup"].value as? String,"Unavailable")
    XCTAssertEqual(try Data(contentsOf:path),recordsBefore)
    XCTAssertFalse(FileManager.default.fileExists(atPath:personalURL.path))
    capture("backup-export-cancelled")
  }
  func testActualDocumentExportInspectReadOnlyAndExplicitRestoreGeneratedPhoto() throws {
    try launch("en",photoFixture:true)
    let recordsBefore=try Data(contentsOf:path),personalBefore=try Data(contentsOf:personalURL)
    tap("Encrypted backup");replace("Backup password","PUBLIC document workflow fixture password");tap("Export encrypted backup")
    XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout:15))
    capture("backup-export-real-location")
    let save=app.navigationBars.buttons["保存"].exists ? app.navigationBars.buttons["保存"] : app.navigationBars.buttons["Save"]
    XCTAssertTrue(save.waitForExistence(timeout:5));save.tap()
    XCTAssertTrue(element("Encrypted backup exported").waitForExistence(timeout:15),app.debugDescription)
    XCTAssertEqual(try Data(contentsOf:path),recordsBefore);XCTAssertEqual(try Data(contentsOf:personalURL),personalBefore)
    capture("backup-export-real-completed")
    tap("Choose and inspect backup")
    XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout:10))
    let document=app.descendants(matching:.any).matching(NSPredicate(format:"label BEGINSWITH %@","LeanOn-backup-")).firstMatch
    XCTAssertTrue(document.waitForExistence(timeout:10),app.debugDescription);document.tap()
    XCTAssertTrue(element("Review backup before restoring").waitForExistence(timeout:15),app.debugDescription)
    XCTAssertEqual(try Data(contentsOf:path),recordsBefore);XCTAssertEqual(try Data(contentsOf:personalURL),personalBefore)
    capture("backup-inspected-read-only")
    tap("I understand this replaces my local data");tap("Restore this backup")
    XCTAssertTrue(element("Backup restored").waitForExistence(timeout:15),app.debugDescription)
    XCTAssertEqual(try personal()["revision"] as? Int,1)
    XCTAssertEqual(try EncryptedQARecordReader.snapshot(path)["revision"] as? Int,1)
    XCTAssertEqual((try personal()["photos"] as! [NSDictionary]).first?["id"] as? String,"public-photo-1")
    capture("backup-explicit-restore-real-completed")
  }
  func testPublicLoopbackPartnerUIRegisterExplicitAttachmentLogoutLoginAndDelete() throws {
    // Explicitly public one-use fixture; raw typing activities stay outside deliverables.
    let password="PUBLIC LeanOn loopback UI fixture only"
    publicAccountPassword=password
    let login="leanon_uiqa_"+UUID().uuidString.lowercased().replacingOccurrences(of:"-",with:"")
    try launch("en",useRealClock:true);app.tabBars.buttons["Partner"].tap()
    tap("Self-hosted server");replace("Server address","http://127.0.0.1:8787");tap("Self-hosted server")
    tap("Create account");replace("Account login",login);replace("Account password",password);tap("Create account")
    XCTAssertTrue(element("Device authorized").waitForExistence(timeout:15),app.debugDescription)
    let state=try companionDocument()
    XCTAssertTrue(state["localDataAccountId"] is NSNull)
    XCTAssertTrue((state["outbox"] as! NSDictionary).count==0)
    capture("partner-real-account-unattached")
    tap("Import this device’s data into this account")
    XCTAssertTrue(element(login).waitForExistence(timeout:5))
    XCTAssertTrue(element("Body measurements : 0").exists)
    XCTAssertTrue(element("Progress photos : 0").exists)
    let attach=app.buttons["Import this device’s data into this account"].firstMatch
    XCTAssertEqual(attach.value as? String,"Unavailable")
    capture("partner-named-import-preview")
    tap("I approve importing these local records into this named account.")
    tap("Import this device’s data into this account")
    let attached=XCTNSPredicateExpectation(predicate:NSPredicate{_,_ in
      guard let doc=try? self.companionDocument(),let identity=doc["identity"] as? NSDictionary else{return false}
      return doc["localDataAccountId"] as? String == identity["accountId"] as? String
    },object:nil)
    XCTAssertEqual(XCTWaiter.wait(for:[attached],timeout:15),.completed)
    capture("partner-explicit-import-attached")
    tap("Sign out");tap("I understand this action");tap("Sign out")
    XCTAssertTrue(element("Local use · no account connected").waitForExistence(timeout:10))
    tap("Sign in");replace("Account login",login);replace("Account password",password);tap("Sign in")
    XCTAssertTrue(element("Device authorized").waitForExistence(timeout:15));capture("partner-relogin-real-state")
    tap("Delete account");replace("Account password",password);tap("I understand this action");tap("Delete account permanently")
    XCTAssertTrue(element("Local use · no account connected").waitForExistence(timeout:15))
    XCTAssertTrue(try companionDocument()["identity"] is NSNull)
    publicAccountPassword=nil;capture("partner-account-deleted-local-kept")
  }

  func testApprovedLoopbackPartnerDetailsKeepIdentityAndDeviceToolsSecondary() throws {
    guard let endpoint=ProcessInfo.processInfo.environment["LEANON_QA_RELAY_URL"],
      let url=URL(string:endpoint),url.scheme=="http",url.host=="127.0.0.1",url.port != nil else {
      throw XCTSkip("Requires the explicitly approved new loopback relay")
    }
    let password=UUID().uuidString + UUID().uuidString
    let login="qa_partner_"+UUID().uuidString.lowercased().replacingOccurrences(of:"-",with:"")
    publicRelayURL=endpoint
    try launch("en",useRealClock:true);app.tabBars.buttons["Partner"].tap()
    XCTAssertFalse(element("Not supported by this app version").exists)
    tap("Self-hosted server");replace("Server address",endpoint);tap("Self-hosted server")
    tap("Create account");replace("Account login",login);replace("Account password",password);tap("Create account")
    publicAccountPassword=password
    XCTAssertTrue(element("Connection details").waitForExistence(timeout:15))
    let identity=try XCTUnwrap(try companionDocument()["identity"] as? NSDictionary)
    let accountID=try XCTUnwrap(identity["accountId"] as? String)
    XCTAssertFalse(element(accountID).exists)
    XCTAssertTrue(element("Invite a partner").exists)
    XCTAssertFalse(element("Pair another device").exists)
    capture("partner-primary-support-actions-details-collapsed")
    tap("Connection details")
    XCTAssertTrue(element(accountID).exists)
    XCTAssertTrue(element("Pair another device").exists)
    capture("partner-connection-details-expanded")
    tap("Hide connection details")
    XCTAssertFalse(element(accountID).exists)
    XCTAssertFalse(element("Pair another device").exists)
    tap("Connection details");tap("Delete account")
    replace("Account password",password);tap("I understand this action");tap("Delete account permanently")
    XCTAssertTrue(element("Local use · no account connected").waitForExistence(timeout:15))
    XCTAssertTrue(try companionDocument()["identity"] is NSNull)
    publicAccountPassword=nil
    capture("partner-new-protocol-account-cleaned")
  }

  /// Official audit coverage is deliberately separate from real VoiceOver speech/gesture testing.
  @available(iOS 17.0, *)
  private func auditCurrentScreen(_ name: String, types: XCUIAccessibilityAuditType = .all) throws {
    continueAfterFailure = true
    capture("audit-" + name + "-before")
    var issues: [[String: Any]] = []
    try app.performAccessibilityAudit(for: types) { issue in
      let element = issue.element
      let frame = element?.frame ?? .zero
      issues.append(["auditType": issue.auditType.rawValue, "description": issue.compactDescription,
        "details": issue.detailedDescription, "elementLabel": element?.label ?? "",
        "elementIdentifier": element?.identifier ?? "", "frame": NSCoder.string(for: frame)])
      // Preserve every issue in a structured attachment and fail explicitly below, without
      // letting the first issue prevent the remaining audit categories from being collected.
      return true
    }
    let report: [String: Any] = ["screen": name, "capturedAt": ISO8601DateFormatter().string(from: Date()),
      "device": "disposable iPhone SE (3rd generation)", "api": "XCUIApplication.performAccessibilityAudit", "auditTypes": types.rawValue,
      "voiceOverSpeechOrGestureTest": false, "issues": issues]
    let bytes = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
    let attachment = XCTAttachment(data: bytes, uniformTypeIdentifier: "public.json")
    attachment.name = "accessibility-audit-" + name; attachment.lifetime = .keepAlways; add(attachment)
    capture("audit-" + name + "-after")
    XCTAssertEqual(issues.count, 0, "Official accessibility audit issues are retained in accessibility-audit-\(name)")
  }

  @available(iOS 17.0, *)
  func testOfficialAccessibilityAuditDietaryForm() throws {
    try launch("en"); tap("Dietary preferences"); try waitForStableForm("Save")
    try auditCurrentScreen("dietary-form")
  }

  @available(iOS 17.0, *)
  func testOfficialAccessibilityAuditMeasurementForm() throws {
    try launch("en"); tap("Body measurements"); tap("Add measurement"); try waitForStableForm("Save")
    try auditCurrentScreen("measurement-form")
  }

  @available(iOS 17.0, *)
  func testOfficialAccessibilityAuditSignedOutPartner() throws {
    try launch("en"); app.tabBars.buttons["Partner"].tap()
    XCTAssertTrue(element("Local use · no account connected").waitForExistence(timeout: 10))
    try auditCurrentScreen("partner-signed-out")
  }
  @available(iOS 17.0, *)
  func testOfficialAccessibilityContrastStableSignedOutPartner() throws {
    try launch("en"); app.tabBars.buttons["Partner"].tap()
    XCTAssertTrue(element("Local use · no account connected").waitForExistence(timeout: 10))
    try auditCurrentScreen("partner-signed-out-stable-contrast", types: .contrast)
  }

  private func waitForStableForm(_ action: String) throws {
    var lastFrame = CGRect.zero, stableObservations = 0
    let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      let field = self.element(action)
      guard field.exists, field.isHittable else { return false }
      let frame = field.frame
      if frame == lastFrame { stableObservations += 1 } else { stableObservations = 0; lastFrame = frame }
      return stableObservations >= 3
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 10), .completed)
  }

  @available(iOS 17.0, *)
  func testOfficialAccessibilityContrastStableDietaryForm() throws {
    try launch("en"); tap("Dietary preferences"); try waitForStableForm("Save")
    try auditCurrentScreen("dietary-form-stable-contrast", types: .contrast)
  }

  @available(iOS 17.0, *)
  func testOfficialAccessibilityContrastStableMeasurementForm() throws {
    try launch("en"); tap("Body measurements"); tap("Add measurement"); try waitForStableForm("Save")
    try auditCurrentScreen("measurement-form-stable-contrast", types: .contrast)
  }

  @available(iOS 17.0, *)
  func testOfficialAccessibilityAuditRecordedProgressChart() throws {
    try prepareRecordedProgressChart()
    try auditCurrentScreen("progress-recorded-chart")
  }

  @available(iOS 17.0, *)
  func testOfficialAccessibilityContrastStableRecordedProgressChart() throws {
    try prepareRecordedProgressChart()
    XCTAssertGreaterThanOrEqual(element("Weight").frame.minY, 28)
    try auditCurrentScreen("progress-recorded-chart-stable-contrast", types: .contrast)
    let origin = app.coordinate(withNormalizedOffset: .zero)
    origin.withOffset(CGVector(dx: 185, dy: 470)).press(forDuration: 0.05,
      thenDragTo: origin.withOffset(CGVector(dx: 185, dy: 170)), withVelocity: .slow, thenHoldForDuration: 0.2)
    try waitForStableForm("Active days")
    let activeDays = element("Active days")
    for _ in 0..<3 where activeDays.frame.maxY > 520 {
      let distance = min(200, activeDays.frame.maxY - 510)
      origin.withOffset(CGVector(dx: 185, dy: 470)).press(forDuration: 0.05,
        thenDragTo: origin.withOffset(CGVector(dx: 185, dy: 470 - distance)), withVelocity: .slow, thenHoldForDuration: 0.2)
      try waitForStableForm("Active days")
    }
    XCTAssertTrue(element("Not enough data yet").isHittable)
    XCTAssertTrue(element("Exercise").isHittable)
    XCTAssertTrue(element("Active days").isHittable)
    XCTAssertLessThanOrEqual(activeDays.frame.maxY, 520, "Audit the complete label above the native bar's edge wash")
    try auditCurrentScreen("progress-secondary-stable-contrast", types: .contrast)
  }

  private func prepareRecordedProgressChart() throws {
    try launch("en"); app.terminate()
    var state = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: path)) as? [String: Any])
    state["weights"] = [
      ["id": "weight-2026-10-03", "date": "2026-10-03", "weightKg": 80.0],
      ["id": "weight-2026-10-05", "date": "2026-10-05", "weightKg": 79.8],
      ["id": "weight-2026-10-07", "date": "2026-10-07", "weightKg": 79.7]
    ]
    try JSONSerialization.data(withJSONObject: state).write(to: path)
    app.launch(); app.tabBars.buttons["Progress"].tap()
    XCTAssertTrue(element("Thu, Oct 1 – Wed, Oct 7 · 3 weights").waitForExistence(timeout: 10), app.debugDescription)
    let legend = element("··· Unlogged dates")
    for _ in 0..<3 where legend.frame.maxY > 520 {
      let origin = app.coordinate(withNormalizedOffset: .zero)
      let distance = min(max(0, legend.frame.maxY - 510), max(0, element("Weight").frame.minY - 28))
      guard distance > 1 else { break }
      origin.withOffset(CGVector(dx: 185, dy: 470)).press(forDuration: 0.05,
        thenDragTo: origin.withOffset(CGVector(dx: 185, dy: 470 - distance)), withVelocity: .slow, thenHoldForDuration: 0.2)
      try waitForStableForm("··· Unlogged dates")
    }
    XCTAssertTrue(legend.isHittable, "The recorded chart and legend must be in the audited viewport")
    XCTAssertLessThanOrEqual(legend.frame.maxY, 520)
  }
}
