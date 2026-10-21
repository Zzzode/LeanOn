import XCTest
import CryptoKit
import Darwin
@testable import LeanOn

extension CompanionLiveTests {
  private func deletionRelayEndpoint() throws -> String {
    guard let value = ProcessInfo.processInfo.environment["LEANON_COMPANION_DELETION_RELAY"],
      let components = URLComponents(string: value), components.scheme == "http", components.host == "127.0.0.1",
      let port = components.port, (1...65535).contains(port), port != 8787,
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else {
      throw XCTSkip("A new isolated random-port deletion relay is required; never use 8787 or old A/B/C/D fixtures")
    }
    return value
  }
  private func removeDeletionFixture(_ client: Client) {
    cleanup(client, deleteAccount: true)
    let namespace = client.keyNamespace
    for name in ["records", "personal", "journal", "companion"] { try? KeychainDataKey(service: namespace, account: name).remove() }
  }
  private func deletionProcessPointer() throws -> URL {
    let support = try XCTUnwrap(FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first)
    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
    return support.appendingPathComponent("leanon-qa-deletion-process-pointer.json")
  }
  func testNewRelayDeletionProcessPrepare() throws {
    guard ProcessInfo.processInfo.environment["LEANON_COMPANION_DELETION_STAGE"] == "prepare" else {
      throw XCTSkip("Explicit new isolated deletion process-prepare stage required")
    }
    let endpoint = try deletionRelayEndpoint(), pointer = try deletionProcessPointer()
    guard !FileManager.default.fileExists(atPath: pointer.path) else {
      XCTFail("An existing QA deletion pointer must not be overwritten"); return
    }
    let directory = pointer.deletingLastPathComponent().appendingPathComponent("leanon-qa-deletion-process-" + UUID().uuidString)
    let transport = DeletionLossTransport(), client = try makeClient(endpoint: endpoint, directory: directory, persistent: true, transport: transport)
    var retained = false
    defer { if !retained { removeDeletionFixture(client); try? FileManager.default.removeItem(at: pointer) } }
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
    try restorePublicPhoto(client)
    transport.loseDelete = true
    XCTAssertThrowsError(try client.service.execute("deleteAccount", params: ["password": client.password, "deleteLocalData": true]))
    let intent = try XCTUnwrap(client.store.load()["pendingAccountDeletion"] as? NSDictionary)
    XCTAssertEqual(intent["phase"] as? String, "prepared"); XCTAssertEqual(transport.deletedRequests, 1)
    XCTAssertFalse(intent["localDataCleared"] as? Bool ?? true)
    XCTAssertTrue(FileManager.default.fileExists(atPath: client.records.encryptedFile.url.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: client.personal.file.url.path))
    // Only a scoped path and PID cross launches; credentials remain in the encrypted store.
    try JSONSerialization.data(withJSONObject: ["directory": directory.path, "preparePID": getpid()], options: .sortedKeys).write(to: pointer, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: pointer.path)
    retained = true
    NSLog("[LeanOnDeletionProcessQA] stage=prepare pid=%d", getpid())
  }
  func testNewRelayDeletionProcessRecover() throws {
    guard ProcessInfo.processInfo.environment["LEANON_COMPANION_DELETION_STAGE"] == "recover" else {
      throw XCTSkip("Explicit new isolated deletion process-recover stage required")
    }
    let endpoint = try deletionRelayEndpoint(), pointer = try deletionProcessPointer()
    let descriptor = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: pointer)) as? NSDictionary)
    XCTAssertEqual(Set(descriptor.allKeys.compactMap { $0 as? String }), Set(["directory", "preparePID"]))
    let path = try XCTUnwrap(descriptor["directory"] as? String), oldPID = try XCTUnwrap(descriptor["preparePID"] as? Int32)
    let original = URL(fileURLWithPath: path).standardizedFileURL
    let prefix = "leanon-qa-deletion-process-", name = original.lastPathComponent
    let parent = pointer.deletingLastPathComponent().standardizedFileURL.resolvingSymlinksInPath()
    // Simulator reinstallation can migrate the app container while preserving its contents.
    // Read only its exact UUID-owned sibling in the current QA sandbox; the original path
    // remains solely the fixture's Keychain namespace and is never used for filesystem I/O.
    let directory = parent.appendingPathComponent(name), resolved = directory.resolvingSymlinksInPath()
    guard name.hasPrefix(prefix), UUID(uuidString: String(name.dropFirst(prefix.count))) != nil,
      resolved.deletingLastPathComponent().path == parent.path,
      resolved.lastPathComponent == name, FileManager.default.fileExists(atPath: directory.path) else {
      XCTFail("QA process recovery rejects a path outside its new scoped fixture"); return
    }
    guard oldPID != getpid(), kill(oldPID, 0) == -1, errno == ESRCH else {
      XCTFail("The prepare host must be terminated before launching the recovery host"); return
    }
    NSLog("[LeanOnDeletionProcessQA] stage=recover pid=%d previous=%d oldPidAbsent=true", getpid(), oldPID)
    let transport = DeletionLossTransport()
    let client = try makeClient(endpoint: endpoint, directory: directory, persistent: true, authenticate: false, transport: transport, keyNamespaceDirectory: original)
    defer { removeDeletionFixture(client); try? FileManager.default.removeItem(at: pointer) }
    let prepared = try XCTUnwrap(client.store.load()["pendingAccountDeletion"] as? NSDictionary)
    XCTAssertEqual(prepared["phase"] as? String, "prepared")
    let response = try client.service.execute("getState")
    XCTAssertTrue((response["companion"] as! NSDictionary)["account"] is NSNull)
    XCTAssertTrue(try client.store.load()["pendingAccountDeletion"] is NSNull)
    XCTAssertFalse(FileManager.default.fileExists(atPath: client.records.encryptedFile.url.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: client.personal.file.url.path))
    XCTAssertEqual(transport.deletedRequests, 0, "Recovery must only probe and acknowledge, without password/authentication/deletion replay")
    XCTAssertThrowsError(try CompanionHTTP().request(endpoint: URL(string: endpoint)!, method: "POST",
      path: "/v1/account-deletions/" + (prepared["operationId"] as! String) + "/receipt", body: ["proof": prepared["proof"]!], token: nil)) { error in
        XCTAssertEqual((error as? CompanionError)?.code, "deletion_not_found")
      }
    removeDeletionFixture(client)
    XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    let namespace = client.keyNamespace
    for name in ["records", "personal", "journal", "companion"] {
      XCTAssertThrowsError(try KeychainDataKey(service: namespace, account: name).key(create: false)) { error in
        guard case NativeCryptoError.keyUnavailable = error else { XCTFail("QA wrapping-key cleanup was not verified"); return }
      }
    }
    try FileManager.default.removeItem(at: pointer)
    XCTAssertFalse(FileManager.default.fileExists(atPath: pointer.path))
    NSLog("[LeanOnDeletionProcessQA] stage=cleanup pid=%d fixtureAbsent=true pointerAbsent=true keysAbsent=true", getpid())
  }
  func testNewRelayActualKeychainResponseLossRestartAndLostAcknowledgmentNeverRewipe() throws {
    let endpoint = try deletionRelayEndpoint(), transport = DeletionLossTransport()
    let a = try makeClient(endpoint: endpoint, persistent: true, transport: transport)
    defer { removeDeletionFixture(a) }
    try restorePublicPhoto(a)
    transport.loseDelete = true
    XCTAssertThrowsError(try a.service.execute("deleteAccount", params: ["password": a.password, "deleteLocalData": true]))
    let prepared = try XCTUnwrap(a.store.load()["pendingAccountDeletion"] as? NSDictionary)
    XCTAssertEqual(prepared["phase"] as? String, "prepared")
    XCTAssertTrue(FileManager.default.fileExists(atPath: a.records.encryptedFile.url.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: a.personal.file.url.path))
    let ackLoss = DeletionLossTransport(); ackLoss.loseAck = true
    let b = try makeClient(endpoint: endpoint, login: a.login, password: a.password, directory: a.directory,
      persistent: true, authenticate: false, transport: ackLoss)
    let response = try b.service.execute("getState")
    XCTAssertEqual(((response["runtime"] as! NSDictionary)["accountDeletion"] as! NSDictionary)["phase"] as? String, "local-complete")
    XCTAssertFalse(FileManager.default.fileExists(atPath: b.records.encryptedFile.url.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: b.personal.file.url.path))
    _ = try b.records.addWeight(date: "2026-10-07", weightKg: 78)
    let bytes = try Data(contentsOf: b.records.encryptedFile.url)
    // Fresh native objects reopen real Keychain keys, including the new local record key.
    let c = try makeClient(endpoint: endpoint, login: a.login, password: a.password, directory: a.directory,
      persistent: true, authenticate: false)
    _ = try c.service.execute("getState")
    XCTAssertTrue(try c.store.load()["pendingAccountDeletion"] is NSNull)
    XCTAssertEqual(bytes, try Data(contentsOf: c.records.encryptedFile.url))
    XCTAssertNoThrow(try c.records.currentSnapshot())
    XCTAssertEqual(transport.deletedRequests, 1); XCTAssertEqual(ackLoss.deletedRequests, 0)
    // The proof-authenticated ACK already removed the receipt. No session is used here.
    XCTAssertThrowsError(try CompanionHTTP().request(endpoint: URL(string: endpoint)!, method: "POST",
      path: "/v1/account-deletions/" + (prepared["operationId"] as! String) + "/receipt",
      body: ["proof": prepared["proof"]!], token: nil)) { error in
        XCTAssertEqual((error as? CompanionError)?.code, "deletion_not_found")
      }
  }
  func testNewRelayWrongPasswordMissingReceiptRestartNeedsExplicitSameAccountRetry() throws {
    let endpoint = try deletionRelayEndpoint(), transport = DeletionLossTransport()
    let a = try makeClient(endpoint: endpoint, persistent: true, transport: transport)
    defer { removeDeletionFixture(a) }
    try restorePublicPhoto(a)
    let bytes = try Data(contentsOf: a.records.encryptedFile.url)
    XCTAssertThrowsError(try a.service.execute("deleteAccount", params: ["password": "PUBLIC incorrect password", "deleteLocalData": true]))
    XCTAssertEqual(transport.deletedRequests, 0)
    let prepared = try XCTUnwrap(a.store.load()["pendingAccountDeletion"] as? NSDictionary)
    let reopened = try makeClient(endpoint: endpoint, login: a.login, password: a.password, skew: 3600,
      directory: a.directory, persistent: true, authenticate: false, transport: transport)
    let response = try reopened.service.execute("getState")
    XCTAssertEqual((response["runtime"] as! NSDictionary)["errorCode"] as? String, "account-deletion-unconfirmed")
    XCTAssertEqual(bytes, try Data(contentsOf: reopened.records.encryptedFile.url))
    XCTAssertEqual(transport.deletedRequests, 0)
    _ = try reopened.service.execute("deleteAccount", params: ["password": a.password, "deleteLocalData": true])
    XCTAssertEqual(transport.lastDeletedOperation, prepared["operationId"] as? String)
    XCTAssertEqual(transport.deletedRequests, 1)
    XCTAssertTrue(try reopened.store.load()["pendingAccountDeletion"] is NSNull)
    XCTAssertFalse(FileManager.default.fileExists(atPath: reopened.records.encryptedFile.url.path))
  }
  private final class DeletionLossTransport: CompanionHTTPTransport {
    let native = CompanionHTTP()
    var loseDelete = false, loseAck = false, deletedRequests = 0
    var lastDeletedOperation: String?
    func request(endpoint: URL, method: String, path: String, body: [String: Any]?, token: String?) throws -> [String: Any] {
      let response = try native.request(endpoint: endpoint, method: method, path: path, body: body, token: token)
      if method == "DELETE", path == "/v1/accounts/current" {
        deletedRequests += 1; lastDeletedOperation = body?["operationId"] as? String
        if loseDelete { loseDelete = false; throw CompanionError.http("offline", true) }
      }
      if path.hasSuffix("/ack"), loseAck { loseAck = false; throw CompanionError.http("offline", true) }
      return response
    }
  }
}
