import XCTest
import CryptoKit
@testable import LeanOn

extension CompanionLiveTests {
  private final class MigrationControlWriteFaultKey: NativeDataKeyProviding {
    let value = try! MemoryDataKey()
    var callsBeforeFailure = 0
    func key(create: Bool) throws -> SymmetricKey {
      if callsBeforeFailure > 0 { callsBeforeFailure -= 1; if callsBeforeFailure == 0 { throw NativeCryptoError.keyUnavailable } }
      return try value.key(create: create)
    }
  }
  /// Seed the actual app composition root, then leave it for the separate UI process.
  /// This is permitted only for a dedicated disposable simulator and explicit /tmp fixture.
  func testSeedActualMigrationSettingsFixture() throws {
    guard ProcessInfo.processInfo.environment["LEANON_MIGRATION_ENTRY_QA"] == "isolated-loopback",
      ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"] == "/tmp/leanon-migration-entry-ios-20261007/records.json",
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit isolated migration entry fixture required") }
    let password = "PUBLIC fictional migration password 2026"
    var registry: ServiceRegistry!
    if Thread.isMainThread { registry = ServiceRegistry.shared }
    else { DispatchQueue.main.sync { registry = ServiceRegistry.shared } }
    let own = try registry.companion.storage.load()
    XCTAssertTrue(own["identity"] is NSNull, "Never overwrite an existing account")
    _ = try registry.companion.execute("configure", params: ["endpoint": "http://127.0.0.1:64041"])
    _ = try registry.companion.execute("register", params: ["login": "migration-owner", "password": password])
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "public-backup-v1", withExtension: "json"))
    let vector = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! NSDictionary
    let preview = try registry.backup.inspect(JSONSerialization.data(withJSONObject: vector["envelope"]!), password: vector["password"] as! String)
    _ = try registry.backup.restore(token: preview["token"] as! String, recordsRevision: preview["expectedRecordsRevision"] as! Int, personalRevision: preview["expectedPersonalRevision"] as! Int)
    _ = try registry.companion.execute("attachLocalData", params: ["expectedRecordsRevision": registry.recordsStore.currentSnapshot()["revision"]!, "expectedPersonalRevision": registry.personal.snapshot()["revision"]!])
    _ = try registry.companion.execute("sync")
    let peer = try makeClient(endpoint: "http://127.0.0.1:64041", login: "migration-partner", password: password)
    defer { cleanup(peer, deleteAccount: false) }
    try restorePublicPhoto(peer); try attach(peer); _ = try peer.service.execute("sync")
    _ = try CompanionHTTP().request(endpoint: URL(string: "http://127.0.0.1:64042")!, method: "POST", path: "/v1/prepare", body: [:], token: nil)
    let payload = try registry.backup.exportPayload()
    try CompanionCrypto.json(payload).write(to: URL(fileURLWithPath: "/tmp/leanon-migration-entry-ios-20261007/source-health.json"))
    let attachment = XCTAttachment(data: try CompanionCrypto.json(payload), uniformTypeIdentifier: "public.json")
    attachment.name = "migration-source-public-health-snapshot"; attachment.lifetime = .keepAlways; add(attachment)
    XCTAssertNotNil(registry.migration)
    XCTAssertEqual((try registry.migration!.state()["migration"] as! NSDictionary)["phase"] as? String, "idle")
  }
  func testActualMigrationCheckpointPreservesHealthAndRepeatedAction() throws {
    guard ProcessInfo.processInfo.environment["LEANON_MIGRATION_ENTRY_QA"] == "isolated-loopback",
      let expected = ProcessInfo.processInfo.environment["LEANON_MIGRATION_EXPECTED_PHASE"],
      ["active", "rolled-back", "paused"].contains(expected),
      ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"] == "/tmp/leanon-migration-entry-ios-20261007/records.json",
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit isolated checkpoint verification required") }
    var registry: ServiceRegistry!
    if Thread.isMainThread { registry = ServiceRegistry.shared } else { DispatchQueue.main.sync { registry = ServiceRegistry.shared } }
    let manager = try XCTUnwrap(registry.migration)
    XCTAssertEqual((try manager.state()["migration"] as! NSDictionary)["phase"] as? String, expected)
    func health(_ payload: NSDictionary) throws -> Data {
      let copy = try JSONSerialization.jsonObject(with: CompanionCrypto.json(payload), options: .mutableContainers) as! NSMutableDictionary
      copy.removeObject(forKey: "createdAt")
      (copy["records"] as! NSMutableDictionary).removeObject(forKey: "revision")
      (copy["personal"] as! NSMutableDictionary).removeObject(forKey: "revision")
      return try JSONSerialization.data(withJSONObject: copy, options: .sortedKeys)
    }
    let before = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: "/tmp/leanon-migration-entry-ios-20261007/source-health.json"))) as! NSDictionary
    XCTAssertEqual(try health(registry.backup.exportPayload()), try health(before), "Records, preferences, measurements and original photo bytes must survive")
    if expected == "active" {
      XCTAssertEqual((try manager.start(token: "repeat-original-confirmation", password: "PUBLIC fictional migration password 2026", backupPassword: "PUBLIC encrypted cutover backup 2026", consent: true)["migration"] as! NSDictionary)["phase"] as? String, "active")
      XCTAssertEqual((try manager.publish(password: "PUBLIC fictional migration password 2026", backupPassword: "PUBLIC encrypted cutover backup 2026", consent: true)["migration"] as! NSDictionary)["phase"] as? String, "active")
    }
    if expected == "rolled-back" {
      XCTAssertEqual((try manager.rollback(consent: true)["migration"] as! NSDictionary)["phase"] as? String, "rolled-back")
    }
    let journal = NativeCapabilityPaths.file("companion-migration").appendingPathExtension("cutover.enc")
    XCTAssertTrue(FileManager.default.fileExists(atPath: journal.path), "Encrypted original source checkpoint must remain")
  }
  func testAddExplicitSyntheticHealthRecordsBeforeUIReview() throws {
    guard ProcessInfo.processInfo.environment["LEANON_MIGRATION_ENTRY_QA"] == "isolated-loopback",
      ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"] == "/tmp/leanon-migration-entry-ios-20261007/records.json",
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit public migration fixture required") }
    var registry: ServiceRegistry!
    if Thread.isMainThread { registry = ServiceRegistry.shared } else { DispatchQueue.main.sync { registry = ServiceRegistry.shared } }
    XCTAssertEqual((try registry.migration!.state()["migration"] as! NSDictionary)["phase"] as? String, "idle")
    XCTAssertEqual((try registry.recordsStore.currentSnapshot()["weights"] as! [Any]).count, 0)
    _ = try registry.recordsStore.addWeight(date: "2026-10-06", weightKg: 80.6)
    _ = try registry.recordsStore.addWeight(date: "2026-10-07", weightKg: 80.4)
    _ = try registry.recordsStore.upsertWater(date: "2026-10-07", amountMl: 750)
    _ = try registry.recordsStore.addExercise(date: "2026-10-07", typeId: "walking", durationMin: 20, kcal: 80)
    _ = try registry.recordsStore.addIntake(date: "2026-10-07", kcal: 140, proteinG: 12, carbsG: 1, fatG: 9)
    _ = try registry.companion.execute("sync")
    try CompanionCrypto.json(registry.backup.exportPayload()).write(to: URL(fileURLWithPath: "/tmp/leanon-migration-entry-ios-20261007/source-health.json"))
  }
  func testActualPreviewUsesAuthenticatedTargetAndCancelsWithoutSwitching() throws {
    guard ProcessInfo.processInfo.environment["LEANON_MIGRATION_ENTRY_QA"] == "isolated-loopback",
      ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"] == "/tmp/leanon-migration-entry-ios-20261007/records.json",
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit public migration fixture required") }
    var registry: ServiceRegistry!
    if Thread.isMainThread { registry = ServiceRegistry.shared } else { DispatchQueue.main.sync { registry = ServiceRegistry.shared } }
    // A fixture restart intentionally drops ephemeral relay sessions. Reauthenticate
    // this approved fictional device; its ownership/keyring and health data remain.
    _ = try registry.companion.execute("login", params: ["login": "migration-owner", "password": "PUBLIC fictional migration password 2026"])
    let manager = try XCTUnwrap(registry.migration)
    let preview = try manager.preview(endpoint: "http://127.0.0.1:64043", password: "PUBLIC fictional migration password 2026")
    XCTAssertEqual((preview["migration"] as! NSDictionary)["phase"] as? String, "review")
    XCTAssertEqual((try manager.pause()["migration"] as! NSDictionary)["phase"] as? String, "idle")
    XCTAssertEqual(try registry.companion.storage.load()["endpoint"] as? String, "http://127.0.0.1:64041")
  }
  func testMigrationControlWriteFailureReleasesLockForNextStatusRead() throws {
    guard ProcessInfo.processInfo.environment["LEANON_MIGRATION_ENTRY_QA"] == "isolated-loopback",
      ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"] == "/tmp/leanon-migration-entry-ios-20261007/records.json",
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit disposable migration fault fixture required") }
    var registry: ServiceRegistry!
    if Thread.isMainThread { registry = ServiceRegistry.shared } else { DispatchQueue.main.sync { registry = ServiceRegistry.shared } }
    let own = try registry.companion.storage.load(), identity = try XCTUnwrap(own["identity"] as? [String: Any])
    let endpoint = own["endpoint"] as! String
    let service = try CompanionHTTP().request(endpoint: URL(string: endpoint)!, method: "GET", path: "/v2/service", body: nil, token: nil)
    let payload = try registry.backup.exportPayload()
    let directory = URL(fileURLWithPath: "/tmp/leanon-migration-entry-ios-20261007/fault-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let keys = MigrationControlWriteFaultKey()
    let control = EncryptedAtomicFile(url: directory.appendingPathComponent("control.enc"), keys: keys, context: "PUBLIC migration control write fault")
    try control.write(CompanionCrypto.json(["phase": "review", "sourceEndpoint": endpoint, "targetEndpoint": endpoint,
      "targetServiceId": service["serviceId"]!, "accountId": identity["accountId"]!, "accountName": identity["login"]!,
      "operationId": "PUBLIC-control-fault", "previewToken": "PUBLIC-review", "expiresAt": Date().timeIntervalSince1970 + 60,
      "recordsRevision": (payload["records"] as! NSDictionary)["revision"]!, "personalRevision": (payload["personal"] as! NSDictionary)["revision"]!]))
    let manager = CompanionMigrationController(source: registry.companion, backup: registry.backup,
      target: try CompanionMigrationCollection(directory: directory.appendingPathComponent("target")),
      journal: EncryptedAtomicFile(url: directory.appendingPathComponent("journal.enc"), keys: try MemoryDataKey(), context: "PUBLIC migration fault journal"), control: control)
    // Two checkpoint reads precede the first phase write. Fail its encryption,
    // then ask for state from a different thread to detect a leaked recursive lock.
    keys.callsBeforeFailure = 3
    XCTAssertThrowsError(try manager.start(token: "PUBLIC-review", password: "PUBLIC fictional migration password 2026", backupPassword: "PUBLIC encrypted cutover backup 2026", consent: true))
    let status = expectation(description: "Status is still readable after a phase write failed")
    DispatchQueue.global().async {
      do { XCTAssertEqual((try manager.state()["migration"] as! NSDictionary)["phase"] as? String, "review") }
      catch { XCTFail("Checkpoint unexpectedly became unreadable") }
      status.fulfill()
    }
    wait(for: [status], timeout: 3)
  }
}
