import XCTest
import CryptoKit
@testable import LeanOn

extension CompanionLiveTests {
  final class PhotoReplyFaultTransport: CompanionHTTPTransport {
    let real = CompanionHTTP()
    var repliesToLose = 1, repeatedUploads = 0
    var packets = [String: Data]()
    func request(endpoint: URL, method: String, path: String, body: [String: Any]?, token: String?) throws -> [String: Any] {
      try real.request(endpoint: endpoint, method: method, path: path, body: body, token: token)
    }
    func binary(endpoint: URL, method: String, path: String, bytes: Data?, token: String) throws -> Data {
      if method == "PUT", let bytes {
        if let original = packets[path] { XCTAssertEqual(bytes, original); repeatedUploads += 1 } else { packets[path] = bytes }
      }
      let result = try real.binary(endpoint: endpoint, method: method, path: path, bytes: bytes, token: token)
      if method == "PUT", repliesToLose > 0 { repliesToLose -= 1; throw CompanionError.http("synthetic-lost-photo-response", true) }
      return result
    }
  }
  func testOfficialLocalCloudflarePhotoPairingDeviceRecoveryAndDeletion() throws {
    guard let endpoint = ProcessInfo.processInfo.environment["LEANON_CLOUDFLARE_QA_ENDPOINT"],
      let url = URL(string: endpoint), url.host == "127.0.0.1", url.port == 64036 else { throw XCTSkip("Explicit isolated local Cloudflare fixture required") }
    let transport = PhotoReplyFaultTransport(), password = "PUBLIC fictional Cloudflare password 2026"
    let a = try makeClient(endpoint: endpoint, login: "cloudflare-owner", password: password, authenticate: false, transport: transport)
    let b = try makeClient(endpoint: endpoint, login: "cloudflare-partner", password: password, authenticate: false)
    let d = try makeClient(endpoint: endpoint, login: "cloudflare-owner", password: password, register: false, authenticate: false)
    defer { cleanup(d, deleteAccount: false); cleanup(a, deleteAccount: true); cleanup(b, deleteAccount: true) }
    for client in [a,b,d] { _ = try client.service.execute("configure", params: ["endpoint": endpoint]) }
    _ = try a.service.execute("register", params: ["login": a.login, "password": password, "admissionToken": String(repeating: "o", count: 43)])
    _ = try b.service.execute("register", params: ["login": b.login, "password": password, "admissionToken": String(repeating: "p", count: 43)])
    XCTAssertTrue(try a.store.load()["localDataAccountId"] is NSNull)
    try restorePublicPhoto(a); try attach(a)
    XCTAssertThrowsError(try a.service.execute("sync"))
    let pending = try a.store.load()["outbox"] as! [String: [[String: Any]]]
    XCTAssertTrue(pending.values.flatMap { $0 }.contains { $0["_photoPackets"] != nil })
    _ = try a.service.execute("sync"); XCTAssertGreaterThan(transport.repeatedUploads, 0)
    let family = try invitation(a, kind: "family")
    _ = try b.service.execute("acceptInvitation", params: ["code": family.code]); _ = try a.service.execute("confirmInvitation", params: ["id": family.id]); _ = try b.service.execute("getState")
    _ = try a.service.execute("setSharing", params: ["categories": ["photos","encouragement"]]); _ = try b.service.execute("setSharing", params: ["categories": ["encouragement"]])
    _ = try a.service.execute("sync"); _ = try b.service.execute("sync")
    let payload = try a.coordinator.exportPayload() as! [String: Any], expected = (payload["photos"] as! [[String: Any]])[0]
    let peer = try b.service.peerPhoto(expected["id"] as! String)
    XCTAssertEqual(peer.bytes.base64EncodedString(), expected["bytesBase64"] as? String)
    _ = try a.service.execute("sendEncouragement", params: ["text": "PUBLIC Cloudflare encouragement"]); _ = try b.service.execute("sync")
    let delivered = try a.service.execute("sync")["companion"] as! NSDictionary
    XCTAssertEqual((delivered["messages"] as! [NSDictionary])[0]["status"] as? String, "delivered")
    _ = try d.service.execute("login", params: ["login": a.login, "password": password])
    XCTAssertFalse(try d.store.load()["deviceAuthorized"] as! Bool)
    let device = try invitation(a, kind: "device"); _ = try d.service.execute("acceptInvitation", params: ["code": device.code]); _ = try a.service.execute("confirmInvitation", params: ["id": device.id])
    _ = try d.service.execute("sync"); XCTAssertTrue(try d.store.load()["localDataAccountId"] is NSNull)
    try attach(d); _ = try d.service.execute("sync")
    let restored = try d.coordinator.exportPayload() as! [String: Any]
    XCTAssertEqual((restored["photos"] as! [[String: Any]])[0]["bytesBase64"] as? String, expected["bytesBase64"] as? String)
    _ = try a.service.execute("setSharing", params: ["categories": ["encouragement"]]); _ = try b.service.execute("sync")
    XCTAssertThrowsError(try b.service.peerPhoto(expected["id"] as! String))
    _ = try a.service.execute("unlink", params: ["deletePeerCache": true]); _ = try b.service.execute("getState")
    XCTAssertTrue(try b.store.load()["familyKey"] is NSNull)
    do { _ = try a.service.execute("deleteAccount", params: ["password": password, "deleteLocalData": false]) } catch {}
    for _ in 0..<24 where try a.store.load()["pendingAccountDeletion"] is [String: Any] { _ = try a.service.execute("getState") }
    XCTAssertTrue(try a.store.load()["identity"] is NSNull); XCTAssertTrue(try a.store.load()["pendingAccountDeletion"] is NSNull)
    XCTAssertGreaterThan(((try a.coordinator.exportPayload() as! [String: Any])["photos"] as! [[String: Any]]).count, 0)
  }
}

extension CompanionLiveTests {
  func testLegacyAggregateCutoverUsesEncryptedBackupAndRecoversLostPhotoReply() throws {
    guard ProcessInfo.processInfo.environment["LEANON_CLOUDFLARE_MIGRATION_QA"] == "isolated-64041-64043" else { throw XCTSkip("Explicit disposable legacy migration fixture required") }
    let password = "PUBLIC fictional migration password 2026", backupPassword = "PUBLIC encrypted cutover backup 2026"
    let oldEndpoint = "http://127.0.0.1:64041", targetEndpoint = "http://127.0.0.1:64043", operation = "PUBLIC-cloudflare-cutover-01"
    let a = try makeClient(endpoint: oldEndpoint, login: "migration-owner", password: password, persistent: true)
    let b = try makeClient(endpoint: oldEndpoint, login: "migration-partner", password: password, persistent: true)
    let fault = PhotoReplyFaultTransport()
    let ta = try makeClient(endpoint: targetEndpoint, login: a.login, password: password, persistent: true, authenticate: false, transport: fault)
    let tb = try makeClient(endpoint: targetEndpoint, login: b.login, password: password, persistent: true, authenticate: false)
    let d = try makeClient(endpoint: targetEndpoint, login: a.login, password: password, register: false, persistent: true, authenticate: false)
    let namespace = "com.zzzode.leanon.uiqa.cutover." + UUID().uuidString
    func journal(_ client: Client, _ name: String) -> EncryptedAtomicFile { EncryptedAtomicFile(url: client.directory.appendingPathComponent("cutover.enc"), keys: KeychainDataKey(service: namespace, account: name), context: "LeanOn cutover v1", maximumBytes: 128 * 1024 * 1024) }
    defer {
      for c in [d,ta,tb,a,b] { cleanup(c, deleteAccount: c.directory != d.directory); for name in ["records","personal","journal","companion"] { try? KeychainDataKey(service: c.keyNamespace, account: name).remove() } }
      for name in ["owner","partner"] { try? KeychainDataKey(service: namespace, account: name).remove() }
    }
    for c in [a,b] { try restorePublicPhoto(c); try attach(c); _ = try c.service.execute("sync") }
    let invite = try invitation(a, kind: "family"); _ = try b.service.execute("acceptInvitation", params: ["code": invite.code]); _ = try a.service.execute("confirmInvitation", params: ["id": invite.id]); _ = try b.service.execute("getState")
    for c in [a,b] { _ = try c.service.execute("setSharing", params: ["categories": ["photos","exact_weight"]]) }
    try CompanionCloudflareMigration.prepare(source: a.service, store: a.store, backup: a.coordinator, journal: journal(a,"owner"), target: targetEndpoint, operation: operation, backupPassword: backupPassword)
    try CompanionCloudflareMigration.prepare(source: b.service, store: b.store, backup: b.coordinator, journal: journal(b,"partner"), target: targetEndpoint, operation: operation, backupPassword: backupPassword)
    let prepared = try CompanionHTTP().request(endpoint: URL(string:"http://127.0.0.1:64042")!, method:"POST", path:"/v1/prepare", body:[:], token:nil)
    XCTAssertEqual(prepared["status"] as? String,"prepared")
    let sourceIdentity = (try a.store.load())["identity"] as! [String:Any]
    let sourceSnapshot = try a.coordinator.exportPayload()
    XCTAssertThrowsError(try CompanionCloudflareMigration.publish(journal: journal(a,"owner"), targetStore:ta.store,targetBackup:ta.coordinator,targetService:{ta.service},password:password,backupPassword:backupPassword))
    let interrupted = try JSONSerialization.jsonObject(with: journal(a,"owner").read()!) as! [String:Any]
    XCTAssertEqual(interrupted["phase"] as? String,"publishing")
    XCTAssertEqual((try a.store.load())["endpoint"] as? String, oldEndpoint)
    func health(_ snapshot: NSDictionary) throws -> Data {
      let v = try JSONSerialization.jsonObject(with: CompanionCrypto.json(snapshot), options: .mutableContainers) as! NSMutableDictionary
      v.removeObject(forKey: "createdAt"); (v["records"] as! NSMutableDictionary).removeObject(forKey: "revision"); (v["personal"] as! NSMutableDictionary).removeObject(forKey: "revision")
      return try CompanionCrypto.json(v)
    }
    XCTAssertEqual(try health(a.coordinator.exportPayload()), try health(sourceSnapshot))
    // Fresh journal/key-provider objects recover the persisted cutover after the fault.
    try CompanionCloudflareMigration.publish(journal:journal(a,"owner"),targetStore:ta.store,targetBackup:ta.coordinator,targetService:{ta.service},password:password,backupPassword:backupPassword)
    try CompanionCloudflareMigration.publish(journal:journal(b,"partner"),targetStore:tb.store,targetBackup:tb.coordinator,targetService:{tb.service},password:password,backupPassword:backupPassword)
    XCTAssertGreaterThan(fault.repeatedUploads,0)
    let targetIdentity = (try ta.store.load())["identity"] as! [String:Any]
    XCTAssertEqual(sourceIdentity["accountId"] as? String,targetIdentity["accountId"] as? String)
    XCTAssertEqual(sourceIdentity["vaultId"] as? String,targetIdentity["vaultId"] as? String)
    XCTAssertEqual(((try ta.store.load())["groups"] as! [String:[String:Any]])[targetIdentity["vaultId"] as! String]?["epoch"] as? Int,2)
    _ = try ta.service.execute("sync"); _ = try tb.service.execute("sync")
    let expected = (sourceSnapshot["photos"] as! [NSDictionary])[0]
    XCTAssertEqual(try tb.service.peerPhoto(expected["id"] as! String).bytes.base64EncodedString(),expected["bytesBase64"] as? String)
    _ = try d.service.execute("configure",params:["endpoint":targetEndpoint]); _ = try d.service.execute("login",params:["login":a.login,"password":password])
    let device = try invitation(ta,kind:"device"); _ = try d.service.execute("acceptInvitation",params:["code":device.code]); _ = try ta.service.execute("confirmInvitation",params:["id":device.id]); _ = try d.service.execute("sync"); try attach(d); _ = try d.service.execute("sync")
    let recovered = try d.coordinator.exportPayload()
    XCTAssertEqual((recovered["photos"] as! [NSDictionary])[0]["bytesBase64"] as? String,expected["bytesBase64"] as? String)
    XCTAssertEqual(try health(recovered), try health(sourceSnapshot))
    XCTAssertEqual((try JSONSerialization.jsonObject(with:journal(a,"owner").read()!) as! [String:Any])["phase"] as? String,"complete")
  }
}

extension CompanionLiveTests {
  final class CrossPlatformPhotoTransport: CompanionHTTPTransport {
    let real = CompanionHTTP()
    var fetched = [String]()
    func request(endpoint: URL, method: String, path: String, body: [String: Any]?, token: String?) throws -> [String: Any] {
      try real.request(endpoint: endpoint, method: method, path: path, body: body, token: token)
    }
    func binary(endpoint: URL, method: String, path: String, bytes: Data?, token: String) throws -> Data {
      let result = try real.binary(endpoint: endpoint, method: method, path: path, bytes: bytes, token: token)
      if method == "GET" { fetched.append(path) }
      return result
    }
  }
  func testStagedCloudflareCrossPlatformPartnerInteroperability() throws {
    let env = ProcessInfo.processInfo.environment
    guard let stage = env["LEANON_CLOUDFLARE_CROSS_STAGE"], ["create","confirm","receive","verify","revoke","revoked","cleanup"].contains(stage),
      let directory = env["LEANON_CLOUDFLARE_CROSS_DIR"], directory.hasPrefix("/tmp/leanon-cloudflare-cross-"),
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit isolated cross-platform stage required") }
    let base = URL(fileURLWithPath: directory, isDirectory: true), endpoint = "http://127.0.0.1:64045"
    try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    func write(_ value: [String: Any], _ name: String) throws {
      let file = base.appendingPathComponent(name); try CompanionCrypto.json(value).write(to: file, options: .atomic)
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
    func read(_ name: String) throws -> [String: Any] { try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: base.appendingPathComponent(name))) as? [String: Any]) }
    func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    let transport = CrossPlatformPhotoTransport(), password = "PUBLIC fictional cross-platform password 2026"
    let a = try makeClient(endpoint: endpoint, login: "cloudflare-owner", password: password,
      directory: base.appendingPathComponent("ios-owner"), persistent: true, authenticate: false, transport: transport)
    var checks = [String](), report: [String: Any] = ["stage": stage, "platform": "iOS", "capturedUtc": ISO8601DateFormatter().string(from: Date())]
    if stage == "create" {
      XCTAssertTrue(try a.store.load()["identity"] is NSNull)
      _ = try a.service.execute("configure", params: ["endpoint": endpoint])
      _ = try a.service.execute("register", params: ["login": a.login, "password": password, "admissionToken": String(repeating: "o", count: 43)])
      try restorePublicPhoto(a); _ = try a.records.addWeight(date: "2026-10-07", weightKg: 81); try attach(a); _ = try a.service.execute("sync")
      let offer = try invitation(a, kind: "family")
      try write(["familyCode": offer.code, "familyId": offer.id], "private-offer.json")
      report["iosPhotoSha256"] = digest(try a.photos.bytes("public-photo-1")); checks.append("ios-independent-owner-registers-and-publishes-protocol2-vault")
    } else if stage == "confirm" {
      let offer = try read("private-offer.json")
      _ = try a.service.execute("confirmInvitation", params: ["id": offer["familyId"]!])
      _ = try a.service.execute("setSharing", params: ["categories": ["photos", "exact_weight", "encouragement"]]); _ = try a.service.execute("sync")
      checks.append("ios-confirms-android-partner-and-explicit-sharing")
    } else if stage == "receive" {
      let expected = try read("android-publish.json")
      _ = try a.service.execute("sync"); _ = try a.service.execute("sync")
      let companion = try state(a.service.execute("getState"))
      XCTAssertEqual((companion["peerSnapshot"] as! NSDictionary)["exactWeightKg"] as? Double, 78.9)
      let bytes = try a.service.peerPhoto("android-native-photo").bytes
      XCTAssertEqual(digest(bytes), expected["androidPhotoSha256"] as? String)
      XCTAssertNotEqual(digest(bytes), expected["iosPhotoSha256"] as? String)
      let group = (companion["binding"] as! NSDictionary)["id"] as! String
      try write(["path": try XCTUnwrap(transport.fetched.first { $0.contains("/groups/" + group + "/") })], "private-photo-path.json")
      report["androidPhotoSha256"] = digest(bytes)
      checks.append("android-to-ios-real-weight-and-independent-r2-jpeg-exact-bytes")
      XCTAssertTrue((companion["messages"] as! [NSDictionary]).contains { $0["direction"] as? String == "incoming" && $0["text"] as? String == "PUBLIC Android to iOS encouragement" })
      _ = try a.service.execute("sendEncouragement", params: ["text": "PUBLIC iOS to Android encouragement"])
      checks.append("android-encrypted-message-received-and-ios-reply-published")
    } else if stage == "verify" {
      _ = try a.service.execute("sync")
      let messages = try state(a.service.execute("getState"))["messages"] as! [NSDictionary]
      XCTAssertTrue(messages.contains { $0["direction"] as? String == "outgoing" && $0["status"] as? String == "delivered" })
      checks.append("android-durable-recipient-ack-delivers-ios-message")
    } else if stage == "revoke" {
      _ = try a.service.execute("setSharing", params: ["categories": [String]()]); checks.append("ios-withdrawal-committed-for-android-observation")
    } else if stage == "revoked" {
      _ = try a.service.execute("sync")
      XCTAssertNil((try state(a.service.execute("getState"))["peerSnapshot"] as! NSDictionary)["exactWeightKg"])
      XCTAssertThrowsError(try a.service.peerPhoto("android-native-photo"))
      let path = try XCTUnwrap(read("private-photo-path.json")["path"] as? String)
      let token = ((try a.store.load())["identity"] as! NSDictionary)["token"] as! String
      do {
        _ = try CompanionHTTP().binary(endpoint: URL(string: endpoint)!, method: "GET", path: path, bytes: nil, token: token)
        XCTFail("Revoked private photo endpoint returned ciphertext")
      } catch CompanionError.http(let code, let retryable) {
        XCTAssertEqual(code, "private-photo-request-failed"); XCTAssertFalse(retryable)
      }
      XCTAssertEqual(try CompanionHTTP().request(endpoint: URL(string: endpoint)!, method: "GET", path: "/v1/me", body: nil, token: token)["protocol"] as? Int, 2)
      do {
        _ = try CompanionHTTP().request(endpoint: URL(string: endpoint)!, method: "GET", path: path, body: nil, token: token)
        XCTFail("Revoked private object became readable")
      } catch CompanionError.http(let code, let retryable) {
        XCTAssertTrue(["object_unavailable", "sharing_not_authorized"].contains(code)); XCTAssertFalse(retryable)
        report["revokedPhotoErrorCode"] = code
      }
      XCTAssertTrue((try a.store.load()["peerCategories"] as! [String: Any]).isEmpty)
      checks.append("android-withdrawal-purges-ios-peer-cache-and-worker-denies-prior-photo-url")
    } else {
      _ = try a.service.execute("deleteAccount", params: ["password": password, "deleteLocalData": true])
      for _ in 0..<24 where try a.store.load()["pendingAccountDeletion"] is [String: Any] { _ = try a.service.execute("getState") }
      XCTAssertTrue(try a.store.load()["pendingAccountDeletion"] is NSNull)
      for name in ["records", "personal", "journal", "companion"] { try KeychainDataKey(service: a.keyNamespace, account: name).remove() }
      try FileManager.default.removeItem(at: a.directory)
      for name in ["private-offer.json", "private-photo-path.json"] { try FileManager.default.removeItem(at: base.appendingPathComponent(name)) }
      checks.append("cross-platform-ios-fixture-files-and-keychain-keys-removed")
    }
    report["checks"] = checks; report["passed"] = true
    try write(report, "ios-" + stage + ".json")
  }
}
