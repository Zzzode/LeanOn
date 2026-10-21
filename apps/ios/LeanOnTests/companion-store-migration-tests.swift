import XCTest
import CryptoKit
@testable import LeanOn

/// Disposable QA Keychain service and synthetic local stores; never a relay or app Documents.
final class CompanionStoreMigrationTests: XCTestCase {
  private final class Fixture {
    let root: URL, service: String, access: KeychainStoreAccess
    let old: URL, moved: URL
    var keys: [StoreKeyRole: Data] = [:]
    var before: [String: Data] = [:]
    var current: [String: Data] = [:]
    let operation = UUID().uuidString
    let proof = Data(repeating: 23, count: 32).base64EncodedString()
    init(phase: String = "prepared", removeCurrentRows: Bool = false,
         corruptBeforeImage: Bool = false, unknownParticipant: Bool = false,
         differentBeforeImageKey: Bool = false) throws {
      root = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-consumer-migration-" + UUID().uuidString)
      old = root.appendingPathComponent("old-container"); moved = root.appendingPathComponent("new-container")
      service = "com.zzzode.leanon.uiqa.consumer-migration-" + UUID().uuidString
      access = KeychainStoreAccess(service: service)
      try FileManager.default.createDirectory(at: old, withIntermediateDirectories: true)
      try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
      func legacyKey(_ role: StoreKeyRole) throws -> KeychainDataKey {
        let key = KeychainDataKey(service: service, account: legacy(role))
        keys[role] = try key.key(create: true).withUnsafeBytes { Data($0) }
        return key
      }
      let records = RecordsStore(recordsURL: url("records", in: old), keys: try legacyKey(.records))
      let personalFile = EncryptedAtomicFile(url: url("personal", in: old), keys: try legacyKey(.personal), context: context(.personal))
      let personal = PersonalStore(collection: PersonalCollection(file: personalFile), today: { "2026-10-07" })
      _ = try records.addWeight(date: "2026-10-05", weightKg: 80)
      _ = try personal.mutate(["operationId": "public-migration-preference", "expectedRevision": 0,
        "mutation": ["type": "set-dietary-preferences", "preferences": ["pattern": "none", "excludedFoodIds": [String](), "notes": "PUBLIC local fixture"]]])
      let companion = EncryptedAtomicFile(url: url("companion", in: old), keys: try legacyKey(.companion), context: context(.companion), maximumBytes: 128 * 1024 * 1024)
      var state = CompanionStateFile.empty()
      state["pendingAccountDeletion"] = ["version": 1, "operationId": operation, "proof": proof,
        "endpoint": "https://public-migration.example", "accountId": "public-migration-account",
        "displayName": "PUBLIC migration", "login": "publicmigration", "deleteLocalData": true,
        "expectedRecordsRevision": 1, "expectedPersonalRevision": 1, "phase": "prepared", "localDataCleared": false]
      try CompanionStateFile(file: companion).write(state)
      for name in ["records", "personal", "companion"] { before[name] = try Data(contentsOf: url(name, in: old)) }
      if differentBeforeImageKey {
        let other = KeychainDataKey(service: service, account: StoreKeyRole.records.legacyPrefix + String(repeating: "f", count: 64))
        before["records"] = EncryptedRecordsFile.prefix + (try NativeCrypto.seal(records.encryptedFile.read(), key: other.key(create: true), aad: EncryptedRecordsFile.aad))
      }
      _ = try records.addWeight(date: "2026-10-06", weightKg: 79)
      state["latestTimestamp"] = 11; try CompanionStateFile(file: companion).write(state)
      if removeCurrentRows { for name in ["records", "personal"] { try FileManager.default.removeItem(at: url(name, in: old)) } }
      var images: [String: Any] = before.mapValues { $0.base64EncodedString() }
      if corruptBeforeImage { var bytes = before["companion"]!; bytes[15] ^= 1; images["companion"] = bytes.base64EncodedString() }
      if unknownParticipant { images["unknown"] = NSNull() }
      let journal = EncryptedAtomicFile(url: url("journal", in: old), keys: try legacyKey(.journal), context: context(.journal), maximumBytes: 384 * 1024 * 1024)
      try journal.write(JSONSerialization.data(withJSONObject: ["version": 1, "phase": phase, "files": images], options: .sortedKeys))
      for name in ["records", "personal", "companion", "journal"] {
        if FileManager.default.fileExists(atPath: url(name, in: old).path) { current[name] = try Data(contentsOf: url(name, in: old)) }
      }
      try FileManager.default.moveItem(at: old, to: moved)
    }
    func url(_ name: String, in directory: URL? = nil) -> URL { (directory ?? moved).appendingPathComponent(name + ".enc") }
    func legacy(_ role: StoreKeyRole) -> String {
      let path = role == .records ? url("records", in: old).path : url("personal", in: old).path
      return role.legacyPrefix + SHA256.hash(data: Data(path.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    func context(_ role: StoreKeyRole) -> String { role == .records ? "LeanOn records v2" : "PUBLIC consumer " + role.rawValue }
    func consumer(failingCopy: StoreKeyRole? = nil, registerCompanion: Bool = true) throws -> Consumer {
      func key(_ role: StoreKeyRole) -> RelocatableStoreKey {
        let accessPort: StoreKeychainAccess = role == failingCopy ? FailingCopyAccess(access) : access
        return RelocatableStoreKey(role: role, url: url(role == .healthLedger ? "health" : role.rawValue), context: context(role),
          prefix: role == .records ? EncryptedRecordsFile.prefix : nil,
          maximumBytes: role == .journal ? 384 * 1024 * 1024 : role == .companion ? 128 * 1024 * 1024 : 64 * 1024 * 1024,
          service: service, access: accessPort)
      }
      let records = RecordsStore(recordsURL: url("records"), keys: key(.records))
      let personal = PersonalStore(collection: PersonalCollection(file: EncryptedAtomicFile(url: url("personal"), keys: key(.personal), context: context(.personal))), today: { "2026-10-07" })
      let photos = PrivatePhotoStore(collection: personal.collection, cacheDirectory: moved.appendingPathComponent("previews"))
      let journal = EncryptedAtomicFile(url: url("journal"), keys: key(.journal), context: context(.journal), maximumBytes: 384 * 1024 * 1024)
      let companion = EncryptedAtomicFile(url: url("companion"), keys: key(.companion), context: context(.companion), maximumBytes: 128 * 1024 * 1024)
      let coordinator = BackupCoordinator(records: records, personal: personal, photos: photos, journal: journal)
      if registerCompanion { try coordinator.registerParticipant("companion", file: companion, recoverImmediately: false) }
      return Consumer(records: records, personal: personal, companion: companion, coordinator: coordinator)
    }
    func assertUnchanged(_ test: XCTestCase, file: StaticString = #filePath, line: UInt = #line) throws {
      for name in ["records", "personal", "companion", "journal"] {
        if let bytes = current[name] { XCTAssertEqual(try Data(contentsOf: url(name)), bytes, file: file, line: line) }
        else { XCTAssertFalse(FileManager.default.fileExists(atPath: url(name).path), file: file, line: line) }
      }
    }
    func clean() {
      NativeStoreRecoveryGate.unblock([url("records"), url("personal"), url("companion")])
      for account in (try? access.accounts()) ?? [] { try? access.remove(account) }
      try? FileManager.default.removeItem(at: root)
    }
  }
  private struct Consumer {
    let records: RecordsStore, personal: PersonalStore, companion: EncryptedAtomicFile, coordinator: BackupCoordinator
  }
  private final class FailingCopyAccess: StoreKeychainAccess {
    let delegate: KeychainStoreAccess
    init(_ delegate: KeychainStoreAccess) { self.delegate = delegate }
    func read(_ account: String) throws -> Data? { try delegate.read(account) }
    func accounts() throws -> [String] { try delegate.accounts() }
    func installIfAbsent(_ account: String, bytes: Data) throws { throw NativeCryptoError.keyUnavailable }
    func remove(_ account: String) throws { try delegate.remove(account) }
  }
  private final class AcknowledgmentPort: CompanionHTTPTransport {
    var requests = 0
    func request(endpoint: URL, method: String, path: String, body: [String: Any]?, token: String?) throws -> [String: Any] {
      requests += 1
      guard method == "POST", path.hasSuffix("/ack"), token == nil else { throw CompanionError.invalidRequest }
      return ["version": 1, "operationId": path.split(separator: "/")[2].description, "status": "acknowledged"]
    }
  }
  private func completedService(_ f: Fixture, _ c: Consumer, _ port: AcknowledgmentPort) throws -> CompanionService {
    var state = try CompanionStateFile(file: c.companion).load()
    var intent = try XCTUnwrap(state["pendingAccountDeletion"] as? [String: Any])
    intent["phase"] = "local-complete"; intent["localDataCleared"] = true
    state["pendingAccountDeletion"] = intent
    try CompanionStateFile(file: c.companion).write(state)
    var adapter = CompanionDataAdapter(exportPayload: { throw CompanionError.persistence },
      attach: { _, _, _ in throw CompanionError.persistence }, commitPayload: { _, _, _, _, _ in throw CompanionError.persistence },
      hostData: { try c.records.currentSnapshot() }, personal: { try c.personal.snapshot() },
      deleteLocalData: { throw CompanionError.persistence }, clearPreviews: { _ in throw CompanionError.persistence })
    adapter.validateAccountDeletionCompletion = { try c.coordinator.validateAccountDeletionCompletion() }
    return CompanionService(storage: CompanionStateFile(file: c.companion), http: port, data: adapter)
  }

  func testPreparedJournalMigrationPreflightIsReadOnlyAndRestoresExactPendingProof() throws {
    let f = try Fixture(); defer { f.clean() }; let c = try f.consumer()
    try c.coordinator.preflightRecovery(); try f.assertUnchanged(self)
    for role in [StoreKeyRole.records, .personal, .companion, .journal] { XCTAssertNil(try f.access.read(role.stableAccount)) }
    try c.coordinator.recover()
    for name in ["records", "personal", "companion"] { XCTAssertEqual(try Data(contentsOf: f.url(name)), f.before[name]) }
    let intent = try XCTUnwrap(CompanionStateFile(file: c.companion).load()["pendingAccountDeletion"] as? [String: Any])
    XCTAssertEqual(intent["operationId"] as? String, f.operation); XCTAssertEqual(intent["proof"] as? String, f.proof)
    XCTAssertEqual((try c.records.loadSnapshot()["weights"] as? NSArray)?.count, 1)
    for role in [StoreKeyRole.records, .personal, .companion, .journal] {
      XCTAssertEqual(try f.access.read(role.stableAccount), f.keys[role]); XCTAssertEqual(try f.access.read(f.legacy(role)), f.keys[role])
    }
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.url("journal").path))
  }
  func testPreparedDeletedCurrentRowsUseAuthenticatedBeforeImagesWithoutReplacementKeys() throws {
    let f = try Fixture(removeCurrentRows: true); defer { f.clean() }; let c = try f.consumer()
    try c.coordinator.preflightRecovery(); try f.assertUnchanged(self)
    try c.coordinator.recover()
    for name in ["records", "personal", "companion"] { XCTAssertEqual(try Data(contentsOf: f.url(name)), f.before[name]) }
    XCTAssertEqual(try f.access.read(StoreKeyRole.records.stableAccount), f.keys[.records])
    XCTAssertEqual(try f.access.read(StoreKeyRole.personal.stableAccount), f.keys[.personal])
  }
  func testCopyFailureCannotRollbackOrDeleteJournalAndFreshConsumerCanRetry() throws {
    for phase in ["prepared", "committed"] {
      let f = try Fixture(phase: phase); defer { f.clean() }; let c = try f.consumer(failingCopy: .personal)
      try c.coordinator.preflightRecovery(); XCTAssertThrowsError(try c.coordinator.recover()); try f.assertUnchanged(self)
      for role in [StoreKeyRole.records, .personal, .companion, .journal] { XCTAssertEqual(try f.access.read(f.legacy(role)), f.keys[role]) }
      XCTAssertThrowsError(try c.records.loadSnapshot())
      let retry = try f.consumer(); try retry.coordinator.recover()
      XCTAssertEqual(try Data(contentsOf: f.url("records")), phase == "prepared" ? f.before["records"] : f.current["records"])
    }
  }
  func testCorruptLastBeforeImageFailsBeforeAnyAliasCopyOrFileMutation() throws {
    let f = try Fixture(corruptBeforeImage: true); defer { f.clean() }; let c = try f.consumer()
    XCTAssertThrowsError(try c.coordinator.preflightRecovery()); try f.assertUnchanged(self)
    XCTAssertThrowsError(try c.coordinator.recover()); try f.assertUnchanged(self)
    for role in [StoreKeyRole.records, .personal, .companion, .journal] { XCTAssertNil(try f.access.read(role.stableAccount)) }
  }
  func testUnknownParticipantCannotTriggerPartialRollbackOrPromotion() throws {
    let f = try Fixture(unknownParticipant: true); defer { f.clean() }; let c = try f.consumer()
    XCTAssertThrowsError(try c.coordinator.preflightRecovery()); XCTAssertThrowsError(try c.coordinator.recover())
    try f.assertUnchanged(self)
    for role in [StoreKeyRole.records, .personal, .companion, .journal] { XCTAssertNil(try f.access.read(role.stableAccount)) }
  }
  func testUnavailableCompanionParticipantFailsBeforeAnyFilesystemOrKeyMutation() throws {
    let f = try Fixture(); defer { f.clean() }; let c = try f.consumer(registerCompanion: false)
    XCTAssertThrowsError(try c.coordinator.preflightRecovery()); XCTAssertThrowsError(try c.coordinator.recover())
    try f.assertUnchanged(self)
    for role in [StoreKeyRole.records, .personal, .companion, .journal] { XCTAssertNil(try f.access.read(role.stableAccount)) }
  }
  func testDifferentAuthenticatedKeysAcrossGenerationsFailClosed() throws {
    let f = try Fixture(differentBeforeImageKey: true); defer { f.clean() }; let c = try f.consumer()
    XCTAssertThrowsError(try c.coordinator.preflightRecovery()); XCTAssertThrowsError(try c.coordinator.recover())
    try f.assertUnchanged(self)
    for role in [StoreKeyRole.records, .personal, .companion, .journal] { XCTAssertNil(try f.access.read(role.stableAccount)) }
  }
  func testCommittedJournalAuthenticatesBothGenerationsBeforeCleanupAndKeepsCurrentBytes() throws {
    let f = try Fixture(phase: "committed"); defer { f.clean() }; let c = try f.consumer()
    try c.coordinator.preflightRecovery(); try f.assertUnchanged(self); try c.coordinator.recover()
    for name in ["records", "personal", "companion"] { XCTAssertEqual(try Data(contentsOf: f.url(name)), f.current[name]) }
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.url("journal").path))
    let intent = try XCTUnwrap(CompanionStateFile(file: c.companion).load()["pendingAccountDeletion"] as? [String: Any])
    XCTAssertEqual(intent["proof"] as? String, f.proof)
  }
  func testDirectDeletionRequiresStableAnchorsBeforeJournalWriteOrLastCiphertextRemoval() throws {
    let f = try Fixture(); defer { f.clean() }
    try FileManager.default.removeItem(at: f.url("journal")); f.current.removeValue(forKey: "journal")
    let c = try f.consumer(failingCopy: .personal)
    var state = try CompanionStateFile(file: c.companion).load()
    var intent = try XCTUnwrap(state["pendingAccountDeletion"] as? [String: Any])
    intent["phase"] = "confirmed"; intent["localDataCleared"] = true
    state["pendingAccountDeletion"] = intent
    XCTAssertThrowsError(try c.coordinator.commitAccountDeletion(expectedRecordsRevision: 2,
      expectedPersonalRevision: 1, companionFile: c.companion, companionState: state as NSDictionary))
    try f.assertUnchanged(self)
    for role in [StoreKeyRole.records, .personal, .companion] { XCTAssertEqual(try f.access.read(f.legacy(role)), f.keys[role]) }
    let retry = try f.consumer()
    try retry.coordinator.commitAccountDeletion(expectedRecordsRevision: 2, expectedPersonalRevision: 1,
      companionFile: retry.companion, companionState: state as NSDictionary)
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.url("records").path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.url("personal").path))
    XCTAssertEqual(try f.access.read(StoreKeyRole.records.stableAccount), f.keys[.records])
    XCTAssertEqual(try f.access.read(StoreKeyRole.personal.stableAccount), f.keys[.personal])
    let committed = try XCTUnwrap(CompanionStateFile(file: retry.companion).load()["pendingAccountDeletion"] as? [String: Any])
    XCTAssertEqual(committed["proof"] as? String, f.proof); XCTAssertEqual(committed["localDataCleared"] as? Bool, true)
    try retry.coordinator.finishAccountDeletionCleanup()
    XCTAssertNil(try f.access.read(StoreKeyRole.records.stableAccount)); XCTAssertNil(try f.access.read(f.legacy(.records)))
    XCTAssertNil(try f.access.read(StoreKeyRole.personal.stableAccount)); XCTAssertNil(try f.access.read(f.legacy(.personal)))
  }
  func testLegacyLocalCompleteOrphanAliasesKeepProofWithoutAcknowledgmentOrKeyDeletion() throws {
    let f = try Fixture(); defer { f.clean() }; let c = try f.consumer(), port = AcknowledgmentPort()
    for name in ["records", "personal", "journal"] { try FileManager.default.removeItem(at: f.url(name)) }
    let service = try completedService(f, c, port)
    let companionBytes = try Data(contentsOf: f.url("companion"))
    let response = try service.execute("getState")
    XCTAssertEqual(port.requests, 0)
    XCTAssertEqual(((response["runtime"] as! NSDictionary)["accountDeletion"] as! NSDictionary)["phase"] as? String, "local-complete")
    let intent = try XCTUnwrap(CompanionStateFile(file: c.companion).load()["pendingAccountDeletion"] as? [String: Any])
    XCTAssertEqual(intent["proof"] as? String, f.proof); XCTAssertEqual(intent["operationId"] as? String, f.operation)
    XCTAssertEqual(try Data(contentsOf: f.url("companion")), companionBytes)
    for role in [StoreKeyRole.records, .personal, .journal] {
      XCTAssertNil(try f.access.read(role.stableAccount)); XCTAssertEqual(try f.access.read(f.legacy(role)), f.keys[role])
    }
  }
  func testLocalCompletePreservesRecreatedWeightPhotoCiphertextAndKeysWhileAcknowledging() throws {
    let f = try Fixture(); defer { f.clean() }; let c = try f.consumer(), port = AcknowledgmentPort()
    for role in [StoreKeyRole.records, .personal, .journal] {
      try FileManager.default.removeItem(at: f.url(role.rawValue)); try f.access.remove(f.legacy(role))
    }
    let service = try completedService(f, c, port)
    _ = try c.records.addWeight(date: "2026-10-07", weightKg: 77)
    let fixtureURL = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "public-backup-v1", withExtension: "json"))
    let vector = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL)) as? NSDictionary)
    let payload = try XCTUnwrap(vector["payload"] as? NSDictionary)
    let personal = try XCTUnwrap(payload["personal"] as? NSDictionary)
    let metadata = try XCTUnwrap((personal["photos"] as? [NSDictionary])?.first)
    let blob = try XCTUnwrap((payload["photos"] as? [NSDictionary])?.first)
    let photoBytes = try XCTUnwrap(Data(base64Encoded: try XCTUnwrap(blob["bytesBase64"] as? String)))
    _ = try c.personal.mutate(["operationId": "public-new-generation-photo", "expectedRevision": 0,
      "mutation": ["type": "add-photo", "photo": metadata]], photoBytes: photoBytes)
    let recordsBytes = try Data(contentsOf: f.url("records")), personalBytes = try Data(contentsOf: f.url("personal"))
    let recordKey = try XCTUnwrap(f.access.read(StoreKeyRole.records.stableAccount))
    let personalKey = try XCTUnwrap(f.access.read(StoreKeyRole.personal.stableAccount))
    XCTAssertNotEqual(recordKey, f.keys[.records]); XCTAssertNotEqual(personalKey, f.keys[.personal])
    _ = try service.execute("getState")
    XCTAssertEqual(port.requests, 1); XCTAssertTrue(try CompanionStateFile(file: c.companion).load()["pendingAccountDeletion"] is NSNull)
    XCTAssertEqual(try Data(contentsOf: f.url("records")), recordsBytes); XCTAssertEqual(try Data(contentsOf: f.url("personal")), personalBytes)
    XCTAssertEqual(try f.access.read(StoreKeyRole.records.stableAccount), recordKey); XCTAssertEqual(try f.access.read(StoreKeyRole.personal.stableAccount), personalKey)
    let stored = try c.personal.collection.load()["photoBytes"] as! NSDictionary
    XCTAssertEqual(Data(base64Encoded: stored[metadata["id"] as! String] as! String), photoBytes)
  }
}
