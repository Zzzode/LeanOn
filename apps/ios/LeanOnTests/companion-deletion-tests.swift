import XCTest
import CryptoKit
@testable import LeanOn

/// Fresh disposable encrypted stores only. No old A/B/C/D account, Documents or permission.
final class CompanionDeletionTests: XCTestCase {
  private let instant = Date(timeIntervalSince1970: 1_791_367_200)
  private let password = "PUBLIC deletion fixture password"
  private final class Faults {
    var failPrepared = false, failConfirmed = false, failLocalComplete = false
    var failJournalParticipant = false, failAfterCommit = false, failCleanup = false
    var commits = 0, cleanups = 0
  }
  private struct Fixture {
    let store: CompanionStateFile, records: RecordsStore, personal: PersonalStore
    let coordinator: BackupCoordinator, adapter: CompanionDataAdapter, directory: URL
    let relay: Relay, faults: Faults
    let recordsKey: TrackingKey, personalKey: TrackingKey
  }
  private final class TrackingKey: NativeDataKeyProviding {
    let delegate: MemoryDataKey
    var removals = 0
    init() throws { delegate = try MemoryDataKey() }
    func key(create: Bool) throws -> SymmetricKey { try delegate.key(create: create) }
    func remove() throws { removals += 1 }
  }
  private func fixture() throws -> Fixture {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-deletion-public-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let recordsKey = try TrackingKey(), personalKey = try TrackingKey()
    let faults = Faults(), records = RecordsStore(recordsURL: directory.appendingPathComponent("records.json"), keys: recordsKey)
    let personalFile = EncryptedAtomicFile(url: directory.appendingPathComponent("personal.enc"), keys: personalKey, context: "public-deletion-personal")
    let personal = PersonalStore(collection: PersonalCollection(file: personalFile), today: { "2026-10-07" })
    let photos = PrivatePhotoStore(collection: personal.collection, cacheDirectory: directory.appendingPathComponent("previews"))
    let journal = EncryptedAtomicFile(url: directory.appendingPathComponent("journal.enc"), keys: try MemoryDataKey(), context: "public-deletion-journal", maximumBytes: 384 * 1024 * 1024)
    let companion = EncryptedAtomicFile(url: directory.appendingPathComponent("companion.enc"), keys: try MemoryDataKey(), context: "public-deletion-companion", maximumBytes: 128 * 1024 * 1024)
    let coordinator = BackupCoordinator(records: records, personal: personal, photos: photos, journal: journal, write: { bytes, url in
      if faults.failJournalParticipant && url == companion.url { throw CompanionError.persistence }
      try ProtectedAtomicBytes.write(bytes, to: url)
    })
    try coordinator.registerParticipant("companion", file: companion)
    let store = CompanionStateFile(file: companion, write: { bytes in
      let value = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
      if let intent = value["pendingAccountDeletion"] as? [String: Any] {
        if faults.failPrepared && intent["phase"] as? String == "prepared" { throw CompanionError.persistence }
        if faults.failConfirmed && intent["phase"] as? String == "confirmed" { throw CompanionError.persistence }
        if faults.failLocalComplete && intent["phase"] as? String == "local-complete" { throw CompanionError.persistence }
      }
      try companion.write(bytes)
    })
    _ = try records.addWeight(date: "2026-10-05", weightKg: 80)
    _ = try personal.mutate(["operationId": "public-preference", "expectedRevision": 0,
      "mutation": ["type": "set-dietary-preferences", "preferences": ["pattern": "none", "excludedFoodIds": [String](), "notes": "PUBLIC fixture"]]])
    let endpoint = "https://public-deletion.example", account = "public-deletion-account"
    var state = CompanionStateFile.empty()
    state["endpoint"] = endpoint; state["deviceId"] = "public-deletion-device"
    state["deviceProof"] = Data(repeating: 7, count: 32).base64EncodedString()
    state["identity"] = ["accountId": account, "login": "publicdeletion", "deviceId": "public-deletion-device", "vaultId": "public-vault", "token": "PUBLIC-ONLY-TOKEN", "expiresAt": Int64((instant.timeIntervalSince1970 + 1800) * 1000)]
    state["deviceAuthorized"] = true
    let namespace = SHA256.hash(data: Data(endpoint.utf8)).map { String(format: "%02x", $0) }.joined() + ":" + account
    state["accountKeys"] = [namespace: ["vaultId": "public-vault", "key": Data(repeating: 8, count: 32).base64EncodedString()]]
    try store.write(state)
    var adapter = CompanionDataAdapter(exportPayload: { try coordinator.exportPayload() as! [String: Any] }, attach: { r, p, persist in
      try coordinator.attach(expectedRecordsRevision: r, expectedPersonalRevision: p) { try persist($0 as! [String: Any]) }
    }, commitPayload: { _, _, _, _, _ in throw CompanionError.persistence }, hostData: { try records.currentSnapshot() }, personal: { try personal.snapshot() },
      deleteLocalData: { throw CompanionError.persistence }, clearPreviews: { _ in try photos.clearDisplayCache() })
    adapter.commitAccountDeletion = { r, p, file, state in
      faults.commits += 1
      try coordinator.commitAccountDeletion(expectedRecordsRevision: r, expectedPersonalRevision: p, companionFile: file, companionState: state as NSDictionary)
      if faults.failAfterCommit { throw CompanionError.persistence }
    }
    adapter.finishAccountDeletionCleanup = {
      faults.cleanups += 1
      if faults.failCleanup { throw CompanionError.persistence }
      try coordinator.finishAccountDeletionCleanup()
    }
    adapter.accountDeletionLocalDataExists = { coordinator.accountDeletionLocalDataExists() }
    return Fixture(store: store, records: records, personal: personal, coordinator: coordinator, adapter: adapter,
      directory: directory, relay: Relay(now: instant, password: password), faults: faults, recordsKey: recordsKey, personalKey: personalKey)
  }
  private func service(_ f: Fixture, now: Date? = nil) -> CompanionService {
    CompanionService(storage: f.store, http: f.relay, data: f.adapter, now: { now ?? self.instant })
  }
  private func cleanup(_ f: Fixture) {
    NativeStoreRecoveryGate.unblock([f.records.encryptedFile.url, f.personal.file.url, f.store.file.url])
    try? FileManager.default.removeItem(at: f.directory)
  }
  private func start(_ f: Fixture, password: String? = nil, keep: Bool = false) throws -> NSDictionary {
    try service(f).execute("deleteAccount", params: ["password": password ?? self.password, "deleteLocalData": !keep])
  }
  private func intent(_ f: Fixture) throws -> [String: Any] { try XCTUnwrap(f.store.load()["pendingAccountDeletion"] as? [String: Any]) }
  private func assertOwnFiles(_ f: Fixture, exist: Bool, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(FileManager.default.fileExists(atPath: f.records.encryptedFile.url.path), exist, file: file, line: line)
    XCTAssertEqual(FileManager.default.fileExists(atPath: f.personal.file.url.path), exist, file: file, line: line)
  }
  func testPreparedWriteFailureSendsNoHTTPAndKeepsLocalData() throws {
    let f = try fixture(); defer { cleanup(f) }; f.faults.failPrepared = true
    XCTAssertThrowsError(try start(f)); XCTAssertEqual(f.relay.requests, 0)
    XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull); assertOwnFiles(f, exist: true)
  }
  func testUnauthorizedNewDeviceCannotPrepareDeletionAndCanStillSignOut() throws {
    let f = try fixture(); defer { cleanup(f) }
    var state = try f.store.load(); state["deviceAuthorized"] = false; try f.store.write(state)
    XCTAssertThrowsError(try start(f)) { error in XCTAssertEqual((error as? CompanionError)?.code, "not-authorized") }
    XCTAssertEqual(f.relay.requests, 0); XCTAssertEqual(f.relay.deletes, 0)
    XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull)
    XCTAssertNoThrow(try service(f).execute("logout"))
    XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull); assertOwnFiles(f, exist: true)
  }
  func testWrongPasswordAndMissingReceiptNeverProveDeletionOrAutomaticallyRetry() throws {
    let f = try fixture(); defer { cleanup(f) }
    XCTAssertThrowsError(try start(f, password: "PUBLIC incorrect password"))
    XCTAssertEqual(f.relay.deletes, 0); XCTAssertEqual(try intent(f)["phase"] as? String, "prepared")
    let response = try service(f).execute("getState")
    XCTAssertEqual((response["runtime"] as! NSDictionary)["errorCode"] as? String, "account-deletion-unconfirmed")
    XCTAssertTrue((response["companion"] as! NSDictionary)["account"] is NSNull)
    XCTAssertEqual(f.relay.deletes, 0); assertOwnFiles(f, exist: true)
    XCTAssertThrowsError(try service(f).execute("configure", params: ["endpoint": "https://other.example"]))
    XCTAssertThrowsError(try service(f).execute("sync"))
  }
  func testCommittedDeleteResponseLostRecoversFromProofAfterRestart() throws {
    let f = try fixture(); defer { cleanup(f) }; f.relay.loseDelete = true
    XCTAssertThrowsError(try start(f)); XCTAssertEqual(try intent(f)["phase"] as? String, "prepared")
    assertOwnFiles(f, exist: true)
    _ = try service(f).execute("getState")
    XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull); assertOwnFiles(f, exist: false)
    XCTAssertEqual(f.relay.deletes, 1); XCTAssertEqual(f.faults.commits, 1)
  }
  func testConfirmedBarrierFailureKeepsPreparedProofAndDoesNotWipe() throws {
    let f = try fixture(); defer { cleanup(f) }; f.faults.failConfirmed = true
    XCTAssertThrowsError(try start(f)); assertOwnFiles(f, exist: true)
    XCTAssertEqual(try intent(f)["phase"] as? String, "prepared"); XCTAssertEqual(f.faults.commits, 0)
    f.faults.failConfirmed = false; _ = try service(f).execute("getState")
    assertOwnFiles(f, exist: false); XCTAssertEqual(f.relay.deletes, 1)
  }
  func testUnmatchedAccountOrMalformedReceiptCannotWipe() throws {
    for mutation in ["account", "operation", "extra", "timestamp"] {
      let f = try fixture(); defer { cleanup(f) }; f.relay.malformed = mutation
      XCTAssertThrowsError(try start(f)); assertOwnFiles(f, exist: true)
      XCTAssertEqual(try intent(f)["phase"] as? String, "prepared"); XCTAssertEqual(f.faults.commits, 0)
    }
  }
  func testConcurrentLocalMutationNeedsExplicitCurrentCASOrKeepChoice() throws {
    for keep in [false, true] {
      let f = try fixture(); defer { cleanup(f) }
      f.relay.onDelete = { _ = try f.records.addWeight(date: "2026-10-06", weightKg: 79) }
      XCTAssertThrowsError(try start(f)); assertOwnFiles(f, exist: true)
      let response = try service(f).execute("getState"), runtime = response["runtime"] as! NSDictionary
      XCTAssertEqual((runtime["accountDeletion"] as! NSDictionary)["localDataChanged"] as? Bool, true)
      XCTAssertEqual(try intent(f)["phase"] as? String, "confirmed")
      let params: [String: Any] = ["deleteLocalData": !keep, "expectedRecordsRevision": try f.records.currentSnapshot()["revision"]!, "expectedPersonalRevision": try f.personal.snapshot()["revision"]!]
      _ = try service(f).execute("confirmAccountDeletionLocalData", params: params)
      assertOwnFiles(f, exist: keep); XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull)
    }
  }
  func testJournalFailureRollsBackAllStoresAndRetriesSameIntent() throws {
    let f = try fixture(); defer { cleanup(f) }; f.faults.failJournalParticipant = true
    XCTAssertThrowsError(try start(f)); assertOwnFiles(f, exist: true)
    XCTAssertEqual(try intent(f)["localDataCleared"] as? Bool, false)
    f.faults.failJournalParticipant = false; _ = try service(f).execute("getState")
    assertOwnFiles(f, exist: false); XCTAssertEqual(f.relay.deletes, 1)
  }
  func testCommittedLocalMarkerSurvivesCallbackFailureAndNeverRepeatsWipe() throws {
    let f = try fixture(); defer { cleanup(f) }; f.faults.failAfterCommit = true
    XCTAssertThrowsError(try start(f)); assertOwnFiles(f, exist: false)
    XCTAssertEqual(try intent(f)["localDataCleared"] as? Bool, true)
    f.faults.failAfterCommit = false; _ = try service(f).execute("getState")
    XCTAssertEqual(f.faults.commits, 1); XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull)
  }
  func testCleanupOrLocalCompleteWriteFailureRetriesWithoutRewritingNilData() throws {
    for completionWrite in [false, true] {
      let f = try fixture(); defer { cleanup(f) }
      f.faults.failCleanup = !completionWrite; f.faults.failLocalComplete = completionWrite
      XCTAssertThrowsError(try start(f)); assertOwnFiles(f, exist: false)
      XCTAssertEqual(try intent(f)["localDataCleared"] as? Bool, true)
      f.faults.failCleanup = false; f.faults.failLocalComplete = false
      _ = try service(f).execute("getState"); XCTAssertEqual(f.faults.commits, 1)
    }
  }
  func testRecreatedRecordsOrPersonalAfterCommittedMarkerPreserveAllBytesAndKeys() throws {
    for personal in [false, true] {
      let f = try fixture(); defer { cleanup(f) }; f.faults.failAfterCommit = true
      XCTAssertThrowsError(try start(f)); XCTAssertTrue(try intent(f)["localDataCleared"] as? Bool == true)
      if personal {
        _ = try f.personal.mutate(["operationId": "new-personal", "expectedRevision": 0,
          "mutation": ["type": "set-dietary-preferences", "preferences": ["pattern": "none", "excludedFoodIds": [String](), "notes": "New public data"]]])
      } else { _ = try f.records.addWeight(date: "2026-10-07", weightKg: 78) }
      let url = personal ? f.personal.file.url : f.records.encryptedFile.url, before = try Data(contentsOf: url)
      f.faults.failAfterCommit = false; _ = try service(f).execute("getState")
      XCTAssertEqual(before, try Data(contentsOf: url)); XCTAssertEqual(f.recordsKey.removals, 0); XCTAssertEqual(f.personalKey.removals, 0)
      XCTAssertEqual(try intent(f)["phase"] as? String, "confirmed"); XCTAssertEqual(f.faults.commits, 1)
      XCTAssertThrowsError(try service(f).execute("confirmAccountDeletionLocalData", params: ["deleteLocalData": true, "expectedRecordsRevision": 0, "expectedPersonalRevision": 0]))
      let response = try service(f).execute("getState"), runtime = response["runtime"] as! NSDictionary
      XCTAssertEqual(runtime["errorCode"] as? String, "account-deletion-key-cleanup-conflict")
      XCTAssertEqual((runtime["accountDeletion"] as! NSDictionary)["localDataChanged"] as? Bool, true)
      _ = try service(f).execute("confirmAccountDeletionLocalData", params: ["deleteLocalData": false,
        "expectedRecordsRevision": try f.records.currentSnapshot()["revision"]!, "expectedPersonalRevision": try f.personal.snapshot()["revision"]!])
      XCTAssertEqual(before, try Data(contentsOf: url)); XCTAssertEqual(f.recordsKey.removals, 0); XCTAssertEqual(f.personalKey.removals, 0)
      XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull)
    }
  }
  func testNewPreparationRejectsNumericBooleanAndPendingLoginStaysPrivateAndComplete() throws {
    let f = try fixture(); defer { cleanup(f) }
    XCTAssertThrowsError(try service(f).execute("deleteAccount", params: ["password": password, "deleteLocalData": 1]))
    XCTAssertEqual(f.relay.requests, 0)
    var state = try f.store.load(), identity = state["identity"] as! [String: Any]
    identity["login"] = String(repeating: "a", count: 128); state["identity"] = identity; try f.store.write(state)
    f.relay.offlineDelete = true; XCTAssertThrowsError(try start(f))
    XCTAssertEqual((try intent(f)["login"] as! String).utf16.count, 128)
    XCTAssertEqual((try intent(f)["displayName"] as! String).utf16.count, 100)
    let response = try service(f).execute("getState"), deletion = (response["runtime"] as! NSDictionary)["accountDeletion"] as! NSDictionary
    XCTAssertNil(deletion["login"]); XCTAssertNil(deletion["proof"])
  }
  func testLostAckLeavesLocalCompleteAndMissingAckIsAcceptedOnlyThere() throws {
    let f = try fixture(); defer { cleanup(f) }; f.relay.loseAck = true
    XCTAssertThrowsError(try start(f)); XCTAssertEqual(try intent(f)["phase"] as? String, "local-complete")
    assertOwnFiles(f, exist: false)
    _ = try f.records.addWeight(date: "2026-10-07", weightKg: 78)
    _ = try service(f).execute("getState")
    XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull); XCTAssertEqual(f.faults.commits, 1)
    XCTAssertTrue(FileManager.default.fileExists(atPath: f.records.encryptedFile.url.path), "ACK retry must never erase newly created local records")
  }
  func testExpiredSessionRetriesWithExplicitPasswordAndRejectsRecreatedAccount() throws {
    for recreated in [false, true] {
      let f = try fixture(); defer { cleanup(f) }; f.relay.offlineDelete = true
      XCTAssertThrowsError(try start(f)); f.relay.offlineDelete = false
      let expired = service(f, now: instant.addingTimeInterval(3600))
      _ = try expired.execute("getState")
      XCTAssertNotNil(try f.store.load()["identity"] as? [String: Any], "Keep private login solely for explicit same-account reauthentication")
      if recreated { f.relay.loginAccount = "recreated-account" }
      if recreated {
        XCTAssertThrowsError(try expired.execute("deleteAccount", params: ["password": password, "deleteLocalData": true]))
        XCTAssertEqual(f.relay.deletes, 0); assertOwnFiles(f, exist: true)
      } else {
        _ = try expired.execute("deleteAccount", params: ["password": password, "deleteLocalData": true])
        XCTAssertEqual(f.relay.deletes, 1); assertOwnFiles(f, exist: false)
      }
    }
  }
  func testReceiptOfflineOrUnauthorizedCannotTriggerLocalDeletion() throws {
    for failure in [CompanionError.http("offline", true), CompanionError.http("unauthorized", false)] {
      let f = try fixture(); defer { cleanup(f) }; f.relay.loseDelete = true
      XCTAssertThrowsError(try start(f)); f.relay.probeFailure = failure
      _ = try service(f).execute("getState"); assertOwnFiles(f, exist: true)
      XCTAssertEqual(try intent(f)["phase"] as? String, "prepared")
    }
  }
  func testAdditiveLegacyStateMigrationAndPrivateIntentNeverReachProjection() throws {
    let f = try fixture(); defer { cleanup(f) }
    var legacy = try f.store.load(); legacy.removeValue(forKey: "pendingAccountDeletion")
    try f.store.file.write(CompanionCrypto.json(legacy)); let before = try Data(contentsOf: f.store.file.url)
    XCTAssertTrue(try f.store.load()["pendingAccountDeletion"] is NSNull)
    XCTAssertEqual(before, try Data(contentsOf: f.store.file.url))
    f.relay.offlineDelete = true; XCTAssertThrowsError(try start(f))
    let pending = try intent(f), response = try service(f).execute("getState")
    let text = String(decoding: try CompanionCrypto.json(response), as: UTF8.self)
    for privateField in [pending["proof"] as! String, pending["operationId"] as! String, "PUBLIC-ONLY-TOKEN", "expectedRecordsRevision"] { XCTAssertFalse(text.contains(privateField)) }
    var bad = try f.store.load(), invalid = pending; invalid["password"] = password; bad["pendingAccountDeletion"] = invalid
    try f.store.file.write(CompanionCrypto.json(bad)); XCTAssertThrowsError(try f.store.load())
  }
  private final class Relay: CompanionHTTPTransport {
    let now: Date, password: String
    var requests = 0, deletes = 0, logins = 0, acknowledgments = 0
    var receipt: [String: Any]?, proof: String?, loginAccount = "public-deletion-account"
    var loseDelete = false, offlineDelete = false, loseAck = false, malformed: String?, probeFailure: CompanionError?
    var onDelete: (() throws -> Void)?
    init(now: Date, password: String) { self.now = now; self.password = password }
    func request(endpoint: URL, method: String, path: String, body: [String: Any]?, token: String?) throws -> [String: Any] {
      requests += 1; XCTAssertEqual(endpoint.absoluteString, "https://public-deletion.example")
      if path.hasSuffix("/receipt") {
        XCTAssertNil(token); if let probeFailure { throw probeFailure }
        guard var value = receipt, body?["proof"] as? String == proof else { throw CompanionError.http("deletion_not_found", false) }
        if malformed == "account" { value["accountId"] = "different-account" }
        if malformed == "operation" { value["operationId"] = UUID().uuidString }
        if malformed == "extra" { value["unexpected"] = true }
        if malformed == "timestamp" { value["deletedAt"] = true }
        return value
      }
      if path.hasSuffix("/ack") {
        XCTAssertNil(token); acknowledgments += 1
        guard let value = receipt, body?["proof"] as? String == proof else { throw CompanionError.http("deletion_not_found", false) }
        receipt = nil
        if loseAck { loseAck = false; throw CompanionError.http("offline", true) }
        return ["version": 1, "operationId": value["operationId"]!, "status": "acknowledged"]
      }
      if path == "/v1/sessions" {
        XCTAssertNil(token); logins += 1
        guard body?["password"] as? String == password else { throw CompanionError.http("invalid_credentials", false) }
        return ["accountId": loginAccount, "deviceId": body!["deviceId"]!, "vaultId": "public-vault", "token": "PUBLIC-RETRY-TOKEN", "deviceAuthorized": true, "expiresAt": Int64((now.timeIntervalSince1970 + 1800) * 1000)]
      }
      if method == "DELETE", path == "/v1/accounts/current" {
        if offlineDelete { throw CompanionError.http("offline", true) }
        XCTAssertEqual(token, "PUBLIC-RETRY-TOKEN"); XCTAssertEqual(Set(body!.keys), Set(["password", "operationId", "proof"]))
        deletes += 1; proof = body!["proof"] as? String
        _ = try CompanionCrypto.base64(proof, count: 32)
        receipt = ["version": 1, "operationId": body!["operationId"]!, "accountId": "public-deletion-account", "status": "deleted", "deletedAt": Int64(now.timeIntervalSince1970 * 1000)]
        try onDelete?()
        if loseDelete { loseDelete = false; throw CompanionError.http("offline", true) }
        return receipt!
      }
      throw CompanionError.invalidResponse
    }
  }
}
