import XCTest
import CryptoKit
@testable import LeanOn

final class BackupCoordinatorTests: XCTestCase {
  private struct Fixture {
    let records: RecordsStore; let personal: PersonalStore; let photos: PrivatePhotoStore
    let journal: EncryptedAtomicFile; let coordinator: BackupCoordinator; let directory: URL
  }
  private func fixture(write: @escaping (Data, URL) throws -> Void = ProtectedAtomicBytes.write,
                       uptime: @escaping () -> TimeInterval = { 100 }) throws -> Fixture {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-backup-fixture-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let records = RecordsStore(recordsURL: dir.appendingPathComponent("records.json"), keys: try MemoryDataKey())
    let collection = PersonalCollection(file: EncryptedAtomicFile(url: dir.appendingPathComponent("personal.enc"), keys: try MemoryDataKey(), context: "personal-test"))
    let personal = PersonalStore(collection: collection, today: { "2026-10-07" })
    let photos = PrivatePhotoStore(collection: collection, cacheDirectory: dir.appendingPathComponent("previews"))
    let journal = EncryptedAtomicFile(url: dir.appendingPathComponent("journal.enc"), keys: try MemoryDataKey(), context: "journal-test", maximumBytes: 384 * 1024 * 1024)
    let coordinator = BackupCoordinator(records: records, personal: personal, photos: photos, journal: journal,
      clock: { Date(timeIntervalSince1970: 1791331200) }, uptime: uptime, write: write)
    return Fixture(records: records, personal: personal, photos: photos, journal: journal, coordinator: coordinator, directory: dir)
  }
  private func cleanup(_ f: Fixture) {
    NativeStoreRecoveryGate.unblock([f.records.encryptedFile.url, f.personal.file.url])
    try? FileManager.default.removeItem(at: f.directory)
  }
  private func publicFixture() throws -> NSDictionary {
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "public-backup-v1", withExtension: "json"))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? NSDictionary)
  }
  func testActualCommonCryptoAndCryptoKitDecryptIndependentNodeEnvelopeExactly() throws {
    let vector = try publicFixture(), password = vector["password"] as! String
    let key = try NativeCrypto.derive(password: password, salt: Data(0..<16))
    XCTAssertEqual(key.withUnsafeBytes { $0.map { String(format: "%02x", $0) }.joined() }, vector["derivedKeyHex"] as? String)
    let bytes = try BackupCodec.decode(JSONSerialization.data(withJSONObject: vector["envelope"]!), password: password)
    XCTAssertEqual(bytes, Data(base64Encoded: vector["plaintextUtf8Base64"] as! String))
    let payload = try BackupSchema.validate(try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? NSDictionary))
    let photo = (payload["photos"] as! [NSDictionary])[0]
    XCTAssertEqual(Data(base64Encoded: photo["bytesBase64"] as! String)?.count, 264)
  }
  func testActualPublicSwiftBackupExportAndPeerNativeImport() throws {
    let vector = try publicFixture(), password = vector["password"] as! String
    let plaintext = try XCTUnwrap(Data(base64Encoded: vector["plaintextUtf8Base64"] as! String))
    let encoded = try BackupCodec.encode(plaintext, password: password)
    XCTAssertEqual(try BackupCodec.decode(encoded, password: password), plaintext)
    guard let configured = ProcessInfo.processInfo.environment["LEANON_PUBLIC_BACKUP_INTEROP_DIR"] else { return }
    // An explicit public-only handoff; never consume the private Companion stage directory.
    XCTAssertEqual(configured, "/tmp/leanon-native-backup-interop-public-2026-10-07")
    guard configured == "/tmp/leanon-native-backup-interop-public-2026-10-07" else { return }
    let directory = URL(fileURLWithPath: configured, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700])
    let output = directory.appendingPathComponent("swift-export.envelope.json")
    try encoded.write(to: output, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: output.path)
    var report: [String: Any] = ["formatVersion": 1, "exportedBy": "actual Swift BackupCodec/CommonCrypto/CryptoKit",
      "swiftEnvelopeSHA256": SHA256.hash(data: encoded).map { String(format: "%02x", $0) }.joined(),
      "plaintextSHA256": SHA256.hash(data: plaintext).map { String(format: "%02x", $0) }.joined(), "peerImported": false]
    let peer = directory.appendingPathComponent("kotlin-export.envelope.json")
    if FileManager.default.fileExists(atPath: peer.path) {
      let bytes = try ProtectedAtomicBytes.read(peer, maximumBytes: BackupCodec.maximumEnvelopeBytes)
      let decoded = try BackupCodec.decode(bytes, password: password)
      let payload = try BackupSchema.validate(try XCTUnwrap(JSONSerialization.jsonObject(with: decoded) as? NSDictionary))
      XCTAssertEqual(payload, vector["payload"] as? NSDictionary)
      let f = try fixture(); defer { cleanup(f) }
      let preview = try f.coordinator.inspect(bytes, password: password)
      _ = try f.coordinator.restore(token: preview["token"] as! String, recordsRevision: 0, personalRevision: 0)
      let expected = (((vector["payload"] as! NSDictionary)["photos"] as! [NSDictionary])[0])["bytesBase64"] as! String
      XCTAssertEqual(try f.photos.bytes("public-photo-1"), Data(base64Encoded: expected))
      XCTAssertEqual((try f.records.loadSnapshot()["weights"] as? [NSDictionary])?.count,
        ((vector["payload"] as! NSDictionary)["records"] as! NSDictionary)["weights"].map { ($0 as! NSArray).count })
      report["peerImported"] = true
      report["kotlinEnvelopeSHA256"] = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
      report["peerPhotoSHA256"] = SHA256.hash(data: try f.photos.bytes("public-photo-1")).map { String(format: "%02x", $0) }.joined()
      report["atomicRestore"] = true
    }
    let reportURL = directory.appendingPathComponent("swift-backup-report.json")
    try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys, .prettyPrinted]).write(to: reportURL, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: reportURL.path)
  }
  func testInspectIsReadOnlyRestoreAdvancesBothRevisionsAndPreservesPhotoBytes() throws {
    let f = try fixture(); defer { cleanup(f) }; let vector = try publicFixture()
    let encoded = try JSONSerialization.data(withJSONObject: vector["envelope"]!)
    let preview = try f.coordinator.inspect(encoded, password: vector["password"] as! String)
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.records.encryptedFile.url.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.personal.file.url.path))
    let result = try f.coordinator.restore(token: preview["token"] as! String, recordsRevision: 0, personalRevision: 0)
    XCTAssertEqual((result["personal"] as! NSDictionary)["revision"] as? Int, 1)
    XCTAssertEqual((result["hostData"] as! NSDictionary)["revision"] as? Int, 1)
    let expected = (((vector["payload"] as! NSDictionary)["photos"] as! [NSDictionary])[0])["bytesBase64"] as! String
    XCTAssertEqual(try f.photos.bytes("public-photo-1"), Data(base64Encoded: expected))
    XCTAssertThrowsError(try f.coordinator.restore(token: preview["token"] as! String, recordsRevision: 0, personalRevision: 0))
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.journal.url.path))
  }
  func testExpiryAndStaleCASNeverChangeCurrentBytes() throws {
    var time: TimeInterval = 10
    let f = try fixture(uptime: { time }); defer { cleanup(f) }
    let encoded = try f.coordinator.exportEncrypted(password: "PUBLIC password fixture")
    let first = try f.coordinator.inspect(encoded, password: "PUBLIC password fixture")
    time = 311
    XCTAssertThrowsError(try f.coordinator.restore(token: first["token"] as! String, recordsRevision: 0, personalRevision: 0))
    let second = try f.coordinator.inspect(encoded, password: "PUBLIC password fixture")
    _ = try f.records.addWeight(date: "2026-10-03", weightKg: 80)
    let current = try Data(contentsOf: f.records.encryptedFile.url)
    XCTAssertThrowsError(try f.coordinator.restore(token: second["token"] as! String, recordsRevision: 0, personalRevision: 0))
    XCTAssertEqual(try Data(contentsOf: f.records.encryptedFile.url), current)
  }
  func testSecondWriteFailureRollsBackBothEncryptedStores() throws {
    var calls = 0
    let f = try fixture(write: { bytes, url in calls += 1; if calls == 2 { throw CocoaError(.fileWriteUnknown) }; try ProtectedAtomicBytes.write(bytes, to: url) })
    defer { cleanup(f) }
    _ = try f.records.addWeight(date: "2026-10-03", weightKg: 80)
    _ = try f.personal.mutate(["operationId": "prefs-1", "expectedRevision": 0,
      "mutation": ["type": "set-dietary-preferences", "preferences": ["pattern": "vegan", "notes": "synthetic", "excludedFoodIds": []]]])
    let oldRecord = try Data(contentsOf: f.records.encryptedFile.url), oldPersonal = try Data(contentsOf: f.personal.file.url)
    let vector = try publicFixture()
    let preview = try f.coordinator.inspect(JSONSerialization.data(withJSONObject: vector["envelope"]!), password: vector["password"] as! String)
    XCTAssertThrowsError(try f.coordinator.restore(token: preview["token"] as! String, recordsRevision: 1, personalRevision: 1))
    XCTAssertEqual(try Data(contentsOf: f.records.encryptedFile.url), oldRecord)
    XCTAssertEqual(try Data(contentsOf: f.personal.file.url), oldPersonal)
    XCTAssertEqual(try f.records.loadSnapshot()["revision"] as? Int, 1)
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.journal.url.path))
  }
  func testPreparedCrashJournalRestoresPreimagesAndCommittedJournalKeepsNewState() throws {
    let f = try fixture(); defer { cleanup(f) }
    _ = try f.records.addWeight(date: "2026-10-03", weightKg: 80)
    let old = try Data(contentsOf: f.records.encryptedFile.url)
    _ = try f.records.addWeight(date: "2026-10-04", weightKg: 79)
    try f.journal.write(JSONSerialization.data(withJSONObject: ["version": 1, "phase": "prepared", "files": ["records": old.base64EncodedString(), "personal": NSNull()]]))
    try f.coordinator.recover()
    XCTAssertEqual(try Data(contentsOf: f.records.encryptedFile.url), old)
    _ = try f.records.addWeight(date: "2026-10-04", weightKg: 78)
    let current = try Data(contentsOf: f.records.encryptedFile.url)
    try f.journal.write(JSONSerialization.data(withJSONObject: ["version": 1, "phase": "committed", "files": ["records": old.base64EncodedString(), "personal": NSNull()]]))
    try f.coordinator.recover()
    XCTAssertEqual(try Data(contentsOf: f.records.encryptedFile.url), current)
  }
  func testDamagedRecoveryJournalBlocksRecordsAndPersonalUntilRepaired() throws {
    let f = try fixture(); defer { cleanup(f) }
    let peer = EncryptedAtomicFile(url:f.directory.appendingPathComponent("companion.enc"),keys:try MemoryDataKey(),context:"companion-test")
    defer { NativeStoreRecoveryGate.unblock([peer.url]) }
    try f.coordinator.registerParticipant("companion",file:peer)
    try peer.write(Data("original authenticated metadata".utf8))
    let originalPeer = try Data(contentsOf:peer.url)
    try f.journal.write(Data("damaged fixture".utf8))
    XCTAssertThrowsError(try f.coordinator.recover())
    XCTAssertThrowsError(try f.records.loadSnapshot())
    XCTAssertThrowsError(try f.personal.snapshot())
    XCTAssertThrowsError(try peer.read())
    XCTAssertThrowsError(try peer.write(Data("must not replace uncertain metadata".utf8)))
    XCTAssertEqual(try Data(contentsOf:peer.url),originalPeer)
    try f.journal.write(JSONSerialization.data(withJSONObject: ["version": 1, "phase": "prepared", "files": ["records": NSNull(), "personal": NSNull(),"companion":originalPeer.base64EncodedString()]]))
    try f.coordinator.recover()
    XCTAssertEqual(try f.records.loadSnapshot()["revision"] as? Int, 0)
    XCTAssertEqual(try f.personal.snapshot()["revision"] as? Int, 0)
    XCTAssertEqual(try peer.read(),Data("original authenticated metadata".utf8))
  }
  func testThreeStoreCASCommitAndAttachConsentUsesCurrentSnapshot() throws {
    let f = try fixture(); defer { cleanup(f) }
    let peer = EncryptedAtomicFile(url: f.directory.appendingPathComponent("companion.enc"), keys: try MemoryDataKey(), context: "companion-test")
    defer { NativeStoreRecoveryGate.unblock([peer.url]) }
    try f.coordinator.registerParticipant("companion", file: peer)
    var attached: NSDictionary?
    try f.coordinator.attach(expectedRecordsRevision: 0, expectedPersonalRevision: 0) { attached = $0 }
    XCTAssertNotNil(attached)
    XCTAssertThrowsError(try f.coordinator.attach(expectedRecordsRevision: 1, expectedPersonalRevision: 0) { _ in XCTFail("stale consent must not export") })
    try f.coordinator.commitPayload(try f.coordinator.exportPayload(), expectedRecordsRevision: 0, expectedPersonalRevision: 0,
      companionFile: peer, companionState: ["cursor": 17])
    XCTAssertEqual((try JSONSerialization.jsonObject(with: XCTUnwrap(peer.read())) as? NSDictionary)?["cursor"] as? Int, 17)
  }
  func testExplicitDeleteClearsEncryptedOwnFilesAndInvalidatesRestorePreview() throws {
    let f = try fixture(); defer { cleanup(f) }
    _ = try f.records.addWeight(date: "2026-10-03", weightKg: 80)
    let preview = try f.coordinator.inspect(f.coordinator.exportEncrypted(password: "PUBLIC password fixture"), password: "PUBLIC password fixture")
    try f.coordinator.deleteLocalData()
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.records.encryptedFile.url.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: f.personal.file.url.path))
    XCTAssertThrowsError(try f.coordinator.restore(token: preview["token"] as! String, recordsRevision: 1, personalRevision: 0))
  }
}
