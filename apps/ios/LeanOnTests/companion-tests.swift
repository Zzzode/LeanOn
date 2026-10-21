import XCTest
import CryptoKit
@testable import LeanOn

/// Disposable stores and PUBLIC vectors only; never reads a user's Documents or relay account.
final class CompanionTests: XCTestCase {
  func testEveryImplementedCompanionMethodIsAdvertisedToSharedPages() {
    let capabilities = CapabilityRegistry()
    for method in CompanionModule.methodLookup.keys {
      XCTAssertTrue(capabilities.supports(method: "companion." + method), "Shared pages must be able to use implemented method \(method)")
    }
  }
  private let instant = Date(timeIntervalSince1970: 1_791_367_200)
  private func fixture(_ name: String) throws -> [String: Any] {
    let bundle = Bundle(for: Self.self)
    let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json"), "Add public data fixture to the unit-test resources")
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
  }
  private func temporaryStore() throws -> (CompanionStateFile, URL) {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-companion-test-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return (CompanionStateFile(file: EncryptedAtomicFile(url: dir.appendingPathComponent("companion.enc"),
      keys: try MemoryDataKey(), context: "LeanOn companion v1")), dir)
  }
  private func adapter(payload: [String: Any], exports: Counter = Counter(), deletion: (() throws -> Void)? = nil, preview: ((String) throws -> Void)? = nil) -> CompanionDataAdapter {
    var result = CompanionDataAdapter(exportPayload: { exports.value += 1; return payload },
      attach: { records, personal, persist in
        guard records == (payload["records"] as! [String: Any])["revision"] as! Int,
          personal == (payload["personal"] as! [String: Any])["revision"] as! Int else { throw RecordTransactionError.conflict("test CAS") }
        try persist(payload)
      }, commitPayload: { _, _, _, _, _ in throw CompanionError.persistence },
      hostData: { payload["records"] as! NSDictionary }, personal: { payload["personal"] as! NSDictionary }, deleteLocalData: { if let deletion { try deletion() } }, clearPreviews: {scope in if let preview { try preview(scope) }})
    result.commitAccountDeletion = { _, _, file, state in
      if let deletion { try deletion() }; try file.write(CompanionCrypto.json(state))
    }
    result.finishAccountDeletionCleanup = {}
    result.accountDeletionLocalDataExists = { false }
    return result
  }
  func testEndpointPortsAndCredentialFreeRootAreValidated() {
    XCTAssertTrue(CompanionService.validEndpoint("https://qa.example"))
    XCTAssertTrue(CompanionService.validEndpoint("https://qa.example:1/"))
    XCTAssertTrue(CompanionService.validEndpoint("https://qa.example:65535"))
    for invalid in ["https://qa.example:0", "https://qa.example:65536", "https://qa.example:99999", "https://qa.example:999999999999999999999999", "https://qa.example:", "https://qa.example:/", "https://qa.example:-1", "https://qa.example:null", "https://qa.example:false", "https://qa.example/path", "https://qa.example?query=x", "https://qa.example#fragment", "https://user:secret@qa.example", "https:///", "http://qa.example"] {
      XCTAssertFalse(CompanionService.validEndpoint(invalid), invalid)
    }
  }
  func testPublicHKDFInvitationAndAADMatchIndependentNodeVector() throws {
    let secret = Data(0..<32), id = "fixture-invite-01"
    let proof = CompanionCrypto.proof(secret: secret, id: id)
    XCTAssertEqual(proof.base64EncodedString(), "z/3R/iwZ6/Xn1MHNCnsCQ0YS0YzRizcYBXVfnuWLaU8=")
    XCTAssertEqual(CompanionCrypto.proofHash(proof), "b0a0c227bbd503a12c875d314ac68824b68da7370ebcae1638d0fb4a40a4371d")
    let key = CompanionCrypto.hkdf(secret: secret, id: id, info: "leanon-invite-wrap-v1").withUnsafeBytes { Data($0) }
    XCTAssertEqual(key.base64EncodedString(), "dsempNw27j3+3o/mINJldNnmTcc/huOaAb2Q7V2pvXM=")
    let groupKey = Data((0..<32).map { UInt8(255-$0) })
    let sealed = try CompanionCrypto.seal(groupKey, key: key, aad: Data(id.utf8), nonce: Data(0..<12))
    XCTAssertEqual(sealed["ciphertext"] as? String, "EEB3gYbAMy8VXZEAd4D8dVqszIOl58FnMUxlxsM6Szc=")
    XCTAssertEqual(sealed["tag"] as? String, "sAIW3ARUIOZCO4jDKnozJg==")
    XCTAssertEqual(try CompanionCrypto.open(sealed, key: key, aad: Data(id.utf8)), groupKey)
    XCTAssertThrowsError(try CompanionCrypto.open(sealed, key: key, aad: Data("wrong-id".utf8)))
    let code = try CompanionCrypto.invitationCode(id: id, secret: secret)
    XCTAssertTrue(code.hasPrefix("leanon-invite-v1:")); XCTAssertFalse(code.contains("="))
    let parsed = try CompanionCrypto.parseInvitation(code); XCTAssertEqual(parsed.id,id); XCTAssertEqual(parsed.secret,secret)
    XCTAssertThrowsError(try CompanionCrypto.parseInvitation(code+"="))
    let change: [String: Any] = ["id":"fixture-change","recordId":"fixture-record","category":"body_measurements","kind":"record","updatedAt":1791367200123,"deleted":false]
    let aad = try CompanionCrypto.aad(group:"fixture-group-01",epoch:1,owner:"fixture-owner",device:"fixture-device",change:change)
    XCTAssertEqual(String(decoding:aad,as:UTF8.self), "[\"leanon-change-v1\",\"fixture-group-01\",1,\"fixture-owner\",\"fixture-device\",\"fixture-change\",\"fixture-record\",\"body_measurements\",\"record\",1791367200123,false]")
    var tampered = change; tampered["deleted"] = true
    XCTAssertNotEqual(try CompanionCrypto.aad(group:"fixture-group-01",epoch:1,owner:"fixture-owner",device:"fixture-device",change:tampered),aad)
  }
  func testEightPublicMergeCasesMatchTheCanonicalTypeScriptReference() throws {
    let vector = try fixture("public-vault-merge-v1")
    let cases = try XCTUnwrap(vector["cases"] as? [[String: Any]])
    XCTAssertEqual(cases.count,8)
    for item in cases {
      let local = try XCTUnwrap(item["local"] as? [String: Any]), remote = try XCTUnwrap(item["remote"] as? [String: Any])
      let before = try CompanionCrypto.json(local)
      if item["expectedError"] != nil { XCTAssertThrowsError(try CompanionVault.merge(local:local,remote:remote), item["name"] as? String ?? "") }
      else {
        let expected = try XCTUnwrap(item["expected"] as? [String: Any])
        XCTAssertEqual(try CompanionCrypto.json(CompanionVault.merge(local:local,remote:remote)),try CompanionCrypto.json(expected),item["name"] as? String ?? "")
      }
      XCTAssertEqual(try CompanionCrypto.json(local),before)
    }
  }
  func testUnrelatedEntityEditDoesNotAdvanceTheProfileOrPreferenceClock() throws {
    let payload = try XCTUnwrap(fixture("public-backup-v1")["payload"] as? [String: Any])
    var state = CompanionStateFile.empty()
    _ = try CompanionVault.export(payload,state:&state,clock:CompanionMergeClock(updatedAt:1,deviceId:"public-device",changeId:"first"))
    let clocks = state["entityClocks"] as! [String: [String: Any]]
    var changed = payload, records = payload["records"] as! [String: Any]
    records["weights"] = [["id":"public-weight","date":"2026-10-07","weightKg":80]]; changed["records"] = records
    let wire = try CompanionVault.export(changed,state:&state,clock:CompanionMergeClock(updatedAt:2,deviceId:"public-device",changeId:"second"))
    let next = wire["clocks"] as! [String: [String: Any]]
    XCTAssertEqual(try CompanionCrypto.json(clocks["profile"]!),try CompanionCrypto.json(next["profile"]!))
    XCTAssertEqual(try CompanionCrypto.json(clocks["preferences"]!),try CompanionCrypto.json(next["preferences"]!))
    XCTAssertEqual(next["weight:public-weight"]?["updatedAt"] as? Int64,2)
  }
  func testReadOnlyStateCreatesNoFileAndRegisterNeverAttachesOrExportsHealthData() throws {
    let (store,dir) = try temporaryStore(); defer { try? FileManager.default.removeItem(at:dir) }
    let payload = try XCTUnwrap(fixture("public-backup-v1")["payload"] as? [String: Any]), exports = Counter()
    let relay = FakeRelay(now:instant)
    let service = CompanionService(storage:store,http:relay,data:adapter(payload:payload,exports:exports),now:{self.instant})
    _ = try service.execute("getState"); XCTAssertFalse(FileManager.default.fileExists(atPath:store.file.url.path))
    _ = try service.execute("configure",params:["endpoint":"http://127.0.0.1:8787"])
    let response = try service.execute("register",params:["login":"publicalice","password":"PUBLIC password only"])
    XCTAssertEqual(exports.value,0)
    XCTAssertTrue((response["runtime"] as! NSDictionary)["localDataAccountId"] is NSNull)
    XCTAssertFalse(String(decoding:try CompanionCrypto.json(response),as:UTF8.self).contains("PUBLIC-TEST-TOKEN"))
    XCTAssertNil(try Data(contentsOf:store.file.url).range(of:Data("PUBLIC-TEST-TOKEN".utf8)))
    XCTAssertThrowsError(try service.execute("attachLocalData",params:["expectedRecordsRevision":1,"expectedPersonalRevision":0]))
    XCTAssertTrue(try store.load()["localDataAccountId"] is NSNull)
    _ = try service.execute("attachLocalData",params:["expectedRecordsRevision":0,"expectedPersonalRevision":0])
    XCTAssertEqual(try store.load()["localDataAccountId"] as? String,"public-account")
    XCTAssertFalse((try store.load()["outbox"] as! [String: Any]).isEmpty)
    _ = try service.execute("logout")
    let signedOut = try service.execute("getState")["companion"] as! NSDictionary
    XCTAssertTrue(signedOut["account"] is NSNull); XCTAssertEqual(signedOut["messages"] as? [String],[])
    XCTAssertEqual((try store.load()["accountKeys"] as! [String: Any]).count,1)
  }
  func testAuthenticatedCacheAndCursorPersistBeforeTheNextRequestAcknowledges() throws {
    let (store,dir) = try temporaryStore(); defer { try? FileManager.default.removeItem(at:dir) }
    let payload = try XCTUnwrap(fixture("public-backup-v1")["payload"] as? [String: Any])
    let relay = FakeRelay(now:instant), service = CompanionService(storage:store,http:relay,data:adapter(payload:payload),now:{self.instant})
    _ = try service.execute("configure",params:["endpoint":"http://127.0.0.1:8787"])
    _ = try service.execute("register",params:["login":"publicalice","password":"PUBLIC password only"])
    try seedFamily(store, relay:relay)
    let group = relay.family!, key = Data(repeating:42,count:32), created = "2026-10-07T10:00:00Z"
    var change: [String: Any] = ["id":"public-message","recordId":"public-message","category":"encouragement","kind":"encouragement","updatedAt":1791367200000,"deleted":false,"ownerId":"public-peer","deviceId":"peer-device","sequence":1]
    let aad = try CompanionCrypto.aad(group:"public-family",epoch:1,owner:"public-peer",device:"peer-device",change:change)
    change["payload"] = try CompanionCrypto.seal(CompanionCrypto.json(["version":1,"kind":"encouragement","text":"Public test encouragement","createdAt":created]),key:key,aad:aad)
    var acknowledged = false
    relay.onSync = { body in
      let acks = body["acks"] as! [String]
      if !acks.isEmpty {
        let durable = try store.load()
        XCTAssertEqual((durable["messages"] as! [[String: Any]]).count,1)
        XCTAssertEqual((durable["cursors"] as! [String: Any])["public-family"] as? Int,1)
        acknowledged = true
        return ["epoch":1,"cursor":1,"group":group,"changes":[],"receipts":[["id":"public-message","recipientId":"public-account","acknowledgedAt":1791367200001]]]
      }
      return ["epoch":1,"cursor":1,"group":group,"changes":try CompanionStateFile.integer(body["cursor"]) == 0 ? [change] : [],"receipts":[]]
    }
    let result = try service.execute("sync")
    XCTAssertTrue(acknowledged)
    let companion = try XCTUnwrap(result["companion"] as? NSDictionary)
    let messages = try XCTUnwrap(companion["messages"] as? [NSDictionary])
    let message = try XCTUnwrap(messages.first)
    XCTAssertEqual(message["status"] as? String,"delivered"); XCTAssertNotNil(message["deliveredAt"])
  }
  func testLocalDeletionFailureRemainsDurableAndRetriesAfterRelaunch() throws {
    let (store,dir) = try temporaryStore(); defer {try? FileManager.default.removeItem(at:dir)}
    let payload = try XCTUnwrap(fixture("public-backup-v1")["payload"] as? [String:Any]), relay = FakeRelay(now:instant)
    var attempts = 0
    let port = adapter(payload:payload,deletion:{attempts += 1; if attempts == 1 {throw CompanionError.persistence}})
    let service = CompanionService(storage:store,http:relay,data:port,now:{self.instant})
    _ = try service.execute("configure",params:["endpoint":"http://127.0.0.1:8787"])
    _ = try service.execute("register",params:["login":"publicalice","password":"PUBLIC password only"])
    XCTAssertThrowsError(try service.execute("deleteAccount",params:["password":"PUBLIC password only","deleteLocalData":true]))
    XCTAssertTrue(try store.load()["pendingLocalDeletion"] as? Bool == true)
    XCTAssertTrue(try store.load()["identity"] is NSNull)
    let relaunched = CompanionService(storage:store,http:relay,data:port,now:{self.instant})
    _ = try relaunched.execute("getState")
    XCTAssertEqual(attempts,2); XCTAssertFalse(try store.load()["pendingLocalDeletion"] as? Bool == true)
    _ = try relaunched.execute("getState"); XCTAssertEqual(attempts,2)
  }
  func testRemovedFamilyIsDurableBeforePreviewFailureAndCannotReturnAfterRetry() throws { try exercisePreviewFailure("removed-family") }
  func testRevokedHealthCategoriesAndOutboxAreDurableBeforePreviewFailure() throws { try exercisePreviewFailure("categories") }
  func testLogoutRemainsSignedOutWhenPreviewCleanupFails() throws { try exercisePreviewFailure("logout") }
  func testExpiredSessionIsPurgedBeforePreviewFailure() throws { try exercisePreviewFailure("expiry") }
  func testUnauthorizedSessionIsPurgedBeforePreviewFailure() throws { try exercisePreviewFailure("unauthorized") }
  func testEndpointRealmChangeIsDurableBeforePreviewFailure() throws { try exercisePreviewFailure("realm") }
  func testUnlinkIsDurableBeforePreviewFailure() throws { try exercisePreviewFailure("unlink") }
  private func exercisePreviewFailure(_ kind:String) throws {
    let (store,dir) = try temporaryStore(); defer {try? FileManager.default.removeItem(at:dir)}
    let payload = try XCTUnwrap(fixture("public-backup-v1")["payload"] as? [String:Any]), relay = FakeRelay(now:instant)
    var failPreview = false
    let port = adapter(payload:payload,preview:{scope in
      // Assert revocation ordering only while the synthetic peer is present or pending.
      let durable = try store.load()
      if durable["deviceId"] as? String == "" { return }
      XCTAssertEqual(durable["pendingPreviewClear"] as? String, ["categories","removed-family","unlink"].contains(kind) ? "partner" : "all")
      if kind == "categories" {
        XCTAssertTrue((durable["peerCategories"] as! [String:Any]).isEmpty)
        XCTAssertTrue(((durable["outbox"] as! [String:Any])["public-family"] as? [Any] ?? []).isEmpty)
      } else if ["removed-family","unlink"].contains(kind) {
        XCTAssertTrue((durable["peerCategories"] as! [String:Any]).isEmpty)
        XCTAssertNil((durable["groups"] as! [String:Any])["public-family"])
        XCTAssertTrue(durable["familyKey"] is NSNull)
      } else {
        XCTAssertTrue(durable["identity"] is NSNull)
        XCTAssertEqual(durable["deviceAuthorized"] as? Bool,false)
        XCTAssertTrue((durable["peerCategories"] as! [String:Any]).isEmpty)
      }
      if failPreview { throw CompanionError.persistence }
    })
    let base = CompanionService(storage:store,http:relay,data:port,now:{self.instant})
    _ = try base.execute("configure",params:["endpoint":"http://127.0.0.1:8787"])
    // Initial configure also clears caches; let it succeed before fault injection.
    failPreview = false
    _ = try base.execute("getState")
    _ = try base.execute("register",params:["login":"publicalice","password":"PUBLIC password only"])
    try seedFamily(store,relay:relay)
    var seeded = try store.load(), group = relay.family!
    group["grants"] = ["public-account":["public-peer":["photos","encouragement"]],"public-peer":["public-account":["photos","exact_weight","encouragement"]]]
    relay.family = group; var groups = seeded["groups"] as! [String:Any]; groups["public-family"] = group; seeded["groups"] = groups
    seeded["peerCategories"] = ["photos":["value":["data":[]]],"exact_weight":["value":["data":84]]]
    seeded["outbox"] = ["public-family":[["id":"public-unsent","category":"photos"]]]
    try store.write(seeded); failPreview = true
    if kind == "removed-family" {relay.family = nil}
    if kind == "categories" {group["grants"] = ["public-account":["public-peer":["encouragement"]],"public-peer":["public-account":[]]]; relay.family = group}
    if kind == "unauthorized" {relay.meFailure = .http("unauthorized",false)}
    let service = kind == "expiry" ? CompanionService(storage:store,http:relay,data:port,now:{self.instant.addingTimeInterval(3600)}) : base
    if kind == "logout" {XCTAssertThrowsError(try service.execute("logout"))}
    else if kind == "realm" {XCTAssertThrowsError(try service.execute("configure",params:["endpoint":"https://other-public.example"]))}
    else if kind == "unlink" {XCTAssertThrowsError(try service.execute("unlink",params:["deletePeerCache":true]))}
    else {_ = try service.execute("getState")}
    let durable = try store.load()
    XCTAssertNotNil(durable["pendingPreviewClear"] as? String)
    if kind == "realm" {XCTAssertEqual(durable["endpoint"] as? String,"https://other-public.example"); XCTAssertTrue(durable["localDataAccountId"] is NSNull)}
    XCTAssertThrowsError(try service.peerPhoto("public-photo-1"))
    XCTAssertThrowsError(try service.execute("sync"))
    let fresh = CompanionService(storage:store,http:relay,data:port,now:{self.instant})
    let blocked = try fresh.execute("getState")
    XCTAssertEqual((blocked["runtime"] as! NSDictionary)["errorCode"] as? String,"preview-clear-pending")
    let projected = blocked["companion"] as! NSDictionary
    if kind == "categories" {
      XCTAssertNil((projected["peerSnapshot"] as? NSDictionary)?["exactWeightKg"])
    } else if ["removed-family","unlink"].contains(kind) {XCTAssertTrue(projected["binding"] is NSNull)}
    else {XCTAssertTrue(projected["account"] is NSNull)}
    failPreview = false; relay.meFailure = nil
    let recovered = try fresh.execute("getState")
    XCTAssertTrue((recovered["runtime"] as! NSDictionary)["errorCode"] is NSNull)
    XCTAssertTrue(try store.load()["pendingPreviewClear"] is NSNull)
    XCTAssertTrue((try store.load()["peerCategories"] as! [String:Any]).isEmpty)
    if ["removed-family","unlink"].contains(kind) {
      relay.family = group
      _ = try fresh.execute("getState")
      XCTAssertNil((try store.load()["groups"] as! [String:Any])["public-family"])
    }
  }
  private func seedFamily(_ store:CompanionStateFile,relay:FakeRelay) throws {
    let group: [String: Any] = ["id":"public-family","kind":"family","epoch":1,"members":["public-account","public-peer"],
      "grants":["public-account":["public-peer":["encouragement"]],"public-peer":["public-account":["encouragement"]]]]
    relay.family = group
    var state = try store.load(), groups = state["groups"] as! [String: Any]; groups["public-family"] = group; state["groups"] = groups
    state["familyKey"] = ["groupId":"public-family","accountId":"public-account","key":Data(repeating:42,count:32).base64EncodedString()]
    state["bindingCreatedAt"] = "2026-10-07T00:00:00Z"
    let realm = SHA256.hash(data:Data("http://127.0.0.1:8787".utf8)).map {String(format:"%02x",$0)}.joined()
    state["selectedOutgoingCategories"] = [realm+":public-account:public-family":["encouragement"]]
    try store.write(state)
  }
  private final class Counter { var value = 0 }
  private final class FakeRelay: CompanionHTTPTransport {
    let now: Date; var device = "", family: [String: Any]?; var meFailure: CompanionError?; var onSync: (([String: Any]) throws -> [String: Any])?
    var deletionReceipt: [String: Any]?, deletionProof: String?
    init(now:Date) { self.now = now }
    func request(endpoint:URL,method:String,path:String,body:[String: Any]?,token:String?) throws -> [String: Any] {
      if path.hasPrefix("/v1/account-deletions/") {
        XCTAssertNil(token)
        guard let receipt = deletionReceipt, body?["proof"] as? String == deletionProof else { throw CompanionError.http("deletion_not_found", false) }
        if path.hasSuffix("/receipt") { return receipt }
        deletionReceipt = nil; return ["version":1,"operationId":receipt["operationId"]!,"status":"acknowledged"]
      }
      if path == "/v1/accounts" || path == "/v1/sessions" {
        device = body!["deviceId"] as! String; XCTAssertEqual(try CompanionCrypto.base64(body!["deviceProof"],count:32).count,32)
        return ["accountId":"public-account","deviceId":device,"vaultId":"public-vault","token":"PUBLIC-TEST-TOKEN","expiresAt":Int64((now.timeIntervalSince1970+1800)*1000),"deviceAuthorized":true]
      }
      XCTAssertEqual(token,"PUBLIC-TEST-TOKEN")
      if path == "/v1/me" { if let meFailure {throw meFailure}; return ["accountId":"public-account","deviceId":device,"vaultId":"public-vault","deviceAuthorized":true,"family":family as Any? ?? NSNull(),"invites":[]] }
      if path == "/v1/groups/public-vault/sync" {
        return ["epoch":1,"cursor":0,"group":["id":"public-vault","kind":"vault","epoch":1,"members":["public-account"],"grants":[:]],"changes":[],"receipts":[]]
      }
      if path.hasSuffix("/sync"), let body, let onSync { return try onSync(body) }
      if path == "/v1/groups/public-family", method == "DELETE" {family = nil; return ["ok":true]}
      if path == "/v1/accounts/current" {
        deletionProof = body?["proof"] as? String
        deletionReceipt = ["version":1,"operationId":body!["operationId"]!,"accountId":"public-account","status":"deleted","deletedAt":Int64(now.timeIntervalSince1970*1000)]
        return deletionReceipt!
      }
      if path == "/v1/sessions/current" { return ["ok":true] }
      throw CompanionError.invalidResponse
    }
  }
}
