import XCTest
import CryptoKit
@testable import LeanOn

/// Opt-in loopback QA only. Credentials/codes/proofs remain in memory or disposable encrypted
/// stores; never print them. The relay and all accounts are isolated test infrastructure.
final class CompanionLiveTests: XCTestCase {
  final class DeletionFault { var remaining = 1 }
  struct Client {
    let service: CompanionService; let store: CompanionStateFile
    let records: RecordsStore; let personal: PersonalStore; let photos: PrivatePhotoStore
    let coordinator: BackupCoordinator; let directory: URL; let login: String; let password: String; let keyNamespace: String
  }
  func makeClient(endpoint: String, login: String? = nil, password: String? = nil, register: Bool = true, skew: TimeInterval = 0, directory: URL? = nil, persistent: Bool = false, authenticate: Bool = true, deletionFault: DeletionFault? = nil, transport: CompanionHTTPTransport = CompanionHTTP(), keyNamespaceDirectory: URL? = nil) throws -> Client {
    let dir = directory ?? FileManager.default.temporaryDirectory.appendingPathComponent("leanon-live-companion-" + UUID().uuidString)
    try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
    let namespace = "com.zzzode.leanon.uiqa.interop." + SHA256.hash(data:Data((keyNamespaceDirectory ?? dir).path.utf8)).map {String(format:"%02x",$0)}.joined()
    func key(_ name:String) throws -> NativeDataKeyProviding { persistent ? KeychainDataKey(service:namespace,account:name) : try MemoryDataKey() }
    let records = RecordsStore(recordsURL:dir.appendingPathComponent("records.json"),keys:try key("records"))
    let collection = PersonalCollection(file:EncryptedAtomicFile(url:dir.appendingPathComponent("personal.enc"),keys:try key("personal"),context:"public-live-personal"))
    let personal = PersonalStore(collection:collection,today:{"2026-10-07"})
    let photos = PrivatePhotoStore(collection:collection,cacheDirectory:dir.appendingPathComponent("previews"))
    let journal = EncryptedAtomicFile(url:dir.appendingPathComponent("journal.enc"),keys:try key("journal"),context:"public-live-journal",maximumBytes:384*1024*1024)
    let coordinator = BackupCoordinator(records:records,personal:personal,photos:photos,journal:journal)
    let companionFile = EncryptedAtomicFile(url:dir.appendingPathComponent("companion.enc"),keys:try key("companion"),context:"public-live-companion",maximumBytes:128*1024*1024)
    try coordinator.registerParticipant("companion",file:companionFile)
    let store = CompanionStateFile(file:companionFile)
    var adapter = CompanionDataAdapter(exportPayload:{try coordinator.exportPayload() as! [String:Any]},attach:{r,p,persist in
      try coordinator.attach(expectedRecordsRevision:r,expectedPersonalRevision:p){try persist($0 as! [String:Any])}
    },commitPayload:{value,r,p,file,state in
      try coordinator.commitPayload(value as NSDictionary,expectedRecordsRevision:r,expectedPersonalRevision:p,companionFile:file,companionState:state as NSDictionary)
    },hostData:{try records.currentSnapshot()},personal:{try personal.snapshot()},deleteLocalData:{
      if let deletionFault, deletionFault.remaining > 0 { deletionFault.remaining -= 1; throw CompanionError.persistence }
      try coordinator.deleteLocalData()
    },clearPreviews:{_ in coordinator.invalidatePreviews();try photos.clearDisplayCache()})
    adapter.commitAccountDeletion = { r,p,file,state in
      if let deletionFault, deletionFault.remaining > 0 { deletionFault.remaining -= 1; throw CompanionError.persistence }
      try coordinator.commitAccountDeletion(expectedRecordsRevision:r,expectedPersonalRevision:p,companionFile:file,companionState:state as NSDictionary)
    }
    adapter.finishAccountDeletionCleanup = { try coordinator.finishAccountDeletionCleanup() }
    adapter.accountDeletionLocalDataExists = { coordinator.accountDeletionLocalDataExists() }
    let service = CompanionService(storage:store,http:transport,data:adapter,now:{Date().addingTimeInterval(skew)})
    let user = login ?? "leanonqa_"+UUID().uuidString.lowercased().replacingOccurrences(of:"-",with:"")
    let secret = password ?? "LeanOn QA "+UUID().uuidString
    let client = Client(service:service,store:store,records:records,personal:personal,photos:photos,coordinator:coordinator,directory:dir,login:user,password:secret,keyNamespace:namespace)
    if authenticate {
      _ = try service.execute("configure",params:["endpoint":endpoint])
      _ = try service.execute(register ? "register" : "login",params:["login":user,"password":secret])
    }
    return client
  }
  func cleanup(_ client:Client,deleteAccount:Bool) {
    if deleteAccount { _ = try? client.service.execute("deleteAccount",params:["password":client.password,"deleteLocalData":true]) }
    else { _ = try? client.service.execute("logout") }
    NativeStoreRecoveryGate.unblock([client.records.encryptedFile.url,client.personal.file.url,client.store.file.url])
    try? FileManager.default.removeItem(at:client.directory)
  }
  func restorePublicPhoto(_ client:Client) throws {
    let url = try XCTUnwrap(Bundle(for:Self.self).url(forResource:"public-backup-v1",withExtension:"json"))
    let vector = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(contentsOf:url)) as? NSDictionary)
    let preview = try client.coordinator.inspect(JSONSerialization.data(withJSONObject:vector["envelope"]!),password:vector["password"] as! String)
    _ = try client.coordinator.restore(token:preview["token"] as! String,recordsRevision:preview["expectedRecordsRevision"] as! Int,personalRevision:preview["expectedPersonalRevision"] as! Int)
  }
  func attach(_ client:Client) throws {
    _ = try client.service.execute("attachLocalData",params:["expectedRecordsRevision":client.records.currentSnapshot()["revision"]!,"expectedPersonalRevision":client.personal.snapshot()["revision"]!])
  }
  func state(_ response:NSDictionary) throws -> NSDictionary { try XCTUnwrap(response["companion"] as? NSDictionary) }
  func invitation(_ creator:Client,kind:String) throws -> (code:String,id:String) {
    let response = try creator.service.execute("createInvitation",params:["kind":kind])
    let code = try XCTUnwrap(response["invitationCode"] as? String)
    return (code,try CompanionCrypto.parseInvitation(code).id)
  }

  func testRealKeychainRemoteDeletionThenLocalFailureReopensAndRecovers() throws {
    guard ProcessInfo.processInfo.environment["LEANON_COMPANION_LIVE_RELAY"] == "http://127.0.0.1:8787",
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit isolated loopback QA required") }
    let fault = DeletionFault()
    let a = try makeClient(endpoint:"http://127.0.0.1:8787",persistent:true,deletionFault:fault)
    defer {
      cleanup(a,deleteAccount:true)
      let namespace = "com.zzzode.leanon.uiqa.interop." + SHA256.hash(data:Data(a.directory.path.utf8)).map {String(format:"%02x",$0)}.joined()
      for name in ["records","personal","journal","companion"] { try? KeychainDataKey(service:namespace,account:name).remove() }
    }
    try restorePublicPhoto(a); try attach(a)
    XCTAssertThrowsError(try a.service.execute("deleteAccount",params:["password":a.password,"deleteLocalData":true]))
    let durable = try a.store.load()
    XCTAssertTrue(durable["pendingLocalDeletion"] as? Bool == true); XCTAssertTrue(durable["identity"] is NSNull)
    XCTAssertTrue(FileManager.default.fileExists(atPath:a.records.encryptedFile.url.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath:a.personal.file.url.path))
    // Fresh real store objects reopen their Keychain keys; no in-memory encryption key is reused.
    let reopened = try makeClient(endpoint:"http://127.0.0.1:8787",login:a.login,password:a.password,
      directory:a.directory,persistent:true,authenticate:false)
    let response = try reopened.service.execute("getState")
    XCTAssertTrue(try state(response)["account"] is NSNull)
    XCTAssertFalse(try reopened.store.load()["pendingLocalDeletion"] as? Bool == true)
    XCTAssertFalse(FileManager.default.fileExists(atPath:reopened.records.encryptedFile.url.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath:reopened.personal.file.url.path))
    _ = try reopened.service.execute("getState")
    XCTAssertFalse(try reopened.store.load()["pendingLocalDeletion"] as? Bool == true)
  }
  func testRealLoopbackFamilyPhotoACKReloginAndAuthorizedSecondDevice() throws {
    guard let endpoint = ProcessInfo.processInfo.environment["LEANON_COMPANION_LIVE_RELAY"],
      endpoint == "http://127.0.0.1:8787" else { throw XCTSkip("Explicit isolated loopback relay required") }
    let a = try makeClient(endpoint:endpoint,skew:120); defer {cleanup(a,deleteAccount:true)}
    let b = try makeClient(endpoint:endpoint); defer {cleanup(b,deleteAccount:true)}
    let initial = try a.service.execute("getState")
    XCTAssertTrue((initial["runtime"] as! NSDictionary)["localDataAccountId"] is NSNull)
    XCTAssertTrue((try a.store.load()["outbox"] as! [String:Any]).isEmpty)
    try restorePublicPhoto(a); try restorePublicPhoto(b); try attach(a); try attach(b)
    let invite = try invitation(a,kind:"family")
    let repeated = try invitation(a,kind:"family")
    XCTAssertTrue(repeated.code == invite.code,"An explicit retry must recover its original private code")
    let pending = try b.service.execute("acceptInvitation",params:["code":invite.code])
    XCTAssertTrue(try state(pending)["binding"] is NSNull)
    let creatorPending = try state(a.service.execute("getState"))
    let pendingInvites = try XCTUnwrap(creatorPending["invitations"] as? [NSDictionary])
    let pendingInvite = try XCTUnwrap(pendingInvites.first)
    XCTAssertEqual(pendingInvite["status"] as? String,"awaiting-confirmation")
    XCTAssertNotNil(pendingInvite["recipientId"] as? String); XCTAssertNotNil(pendingInvite["recipientDeviceId"] as? String)
    _ = try a.service.execute("confirmInvitation",params:["id":invite.id])
    _ = try b.service.execute("getState")
    for client in [a,b] {
      _ = try client.service.execute("setSharing",params:["categories":["photos","body_measurements","encouragement"]])
    }
    _ = try a.service.execute("sync"); _ = try b.service.execute("sync"); _ = try a.service.execute("sync")
    let peerPhoto = try b.service.peerPhoto("public-photo-1")
    XCTAssertEqual(peerPhoto.bytes,try a.photos.bytes("public-photo-1"))
    let queued = try state(a.service.execute("sendEncouragement",params:["text":"PUBLIC synthetic QA: walk together?"]))
    let queuedMessages = try XCTUnwrap(queued["messages"] as? [NSDictionary])
    XCTAssertEqual(queuedMessages.last?["status"] as? String,"pending")
    _ = try b.service.execute("sync")
    let delivered = try state(a.service.execute("sync"))
    let deliveredMessages = try XCTUnwrap(delivered["messages"] as? [NSDictionary])
    XCTAssertEqual(deliveredMessages.last?["status"] as? String,"delivered")
    let sent = try XCTUnwrap(deliveredMessages.last), created = try XCTUnwrap(sent["createdAt"] as? String), receipt = try XCTUnwrap(sent["deliveredAt"] as? String)
    XCTAssertTrue(receipt < created,"A real server ACK may precede a deliberately ahead sender clock")
    _ = try a.service.execute("logout")
    _ = try a.service.execute("login",params:["login":a.login,"password":a.password])
    _ = try a.service.execute("sync")
    XCTAssertNotNil(try a.store.load()["familyKey"] as? NSDictionary,"Relogin must recover the prior own-device durable keyring")
    let recovered = try state(a.service.execute("getState"))
    let recoveredHistory = try XCTUnwrap(recovered["messages"] as? [NSDictionary])
    XCTAssertTrue(recoveredHistory.contains {$0["direction"] as? String == "outgoing" && $0["status"] as? String == "delivered"}, "Empty device-local consent must not discard authenticated sender history")
    let privateAgain = recovered["shareSettings"] as! NSDictionary
    XCTAssertEqual((privateAgain["categories"] as! [String]).count,0,"Relogin does not restore this device's explicit outgoing consent")
    let tablet = try makeClient(endpoint:endpoint,login:a.login,password:a.password,register:false)
    defer {cleanup(tablet,deleteAccount:false)}
    XCTAssertFalse((try tablet.service.execute("getState")["runtime"] as! NSDictionary)["deviceAuthorized"] as! Bool)
    let deviceInvite = try invitation(a,kind:"device")
    _ = try tablet.service.execute("acceptInvitation",params:["code":deviceInvite.code])
    _ = try a.service.execute("confirmInvitation",params:["id":deviceInvite.id])
    let approved = try tablet.service.execute("getState")
    XCTAssertTrue((approved["runtime"] as! NSDictionary)["deviceAuthorized"] as! Bool,"Metadata refresh must unblock an approved device without upload")
    XCTAssertTrue((approved["runtime"] as! NSDictionary)["localDataAccountId"] is NSNull)
    _ = try tablet.service.execute("sync")
    XCTAssertNotNil(try tablet.store.load()["familyKey"] as? NSDictionary)
    XCTAssertEqual((try tablet.personal.snapshot()["photos"] as! [NSDictionary]).count,0,"Keyring sync never imports health photos before explicit attachment")
    try attach(tablet); _ = try tablet.service.execute("sync")
    XCTAssertEqual(try tablet.photos.bytes("public-photo-1"),try a.photos.bytes("public-photo-1"),"Own-device vault synchronization includes exact JPEG bytes")
    XCTAssertEqual(((try state(tablet.service.execute("getState"))["shareSettings"] as! NSDictionary)["categories"] as! [String]).count,0)
    let identity = try a.store.load()
    XCTAssertThrowsError(try CompanionHTTP().request(endpoint:URL(string:endpoint)!,method:"POST",path:"/v1/sessions",body:[
      "login":a.login,"password":a.password,"deviceId":identity["deviceId"]!,"deviceProof":NativeCrypto.random(32).base64EncodedString()],token:nil))
    _ = try a.service.execute("unlink",params:["deletePeerCache":true])
    XCTAssertThrowsError(try a.service.peerPhoto("public-photo-1"))
    _ = try b.service.execute("getState")
    XCTAssertTrue(try state(b.service.execute("getState"))["binding"] is NSNull)
  }
}
