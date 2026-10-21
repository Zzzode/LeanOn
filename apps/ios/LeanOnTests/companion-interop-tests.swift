import XCTest
import CryptoKit
@testable import LeanOn

/// Staged Swift/Kotlin QA. Only isolated .uiqa stores and short-lived synthetic accounts.
/// The private handoff contains credentials; it is mode 0600 and is never printed.
extension CompanionLiveTests {
  func testStagedRealNativeInteroperability() throws {
    let env = ProcessInfo.processInfo.environment
    guard let stage = env["LEANON_COMPANION_INTEROP_STAGE"], ["create","confirm","receive","revoke","cleanup"].contains(stage),
      env["LEANON_COMPANION_LIVE_RELAY"] == "http://127.0.0.1:8787",
      Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" else { throw XCTSkip("Explicit isolated native interoperability stage required") }
    let base = URL(fileURLWithPath:env["LEANON_COMPANION_INTEROP_DIR"] ?? "/tmp/leanon-native-companion-interop-2026-10-07",isDirectory:true)
    try FileManager.default.createDirectory(at:base,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
    func write(_ value:[String:Any],_ name:String,privateFile:Bool=false) throws {
      let url = base.appendingPathComponent(name)
      try CompanionCrypto.json(value).write(to:url,options:.atomic)
      try FileManager.default.setAttributes([.posixPermissions:privateFile ? 0o600 : 0o644],ofItemAtPath:url.path)
    }
    func read(_ name:String) throws -> [String:Any] { try XCTUnwrap(JSONSerialization.jsonObject(with:Data(contentsOf:base.appendingPathComponent(name))) as? [String:Any]) }
    let privateName = "ios-private.json", offerName = "ios-created.json", endpoint = "http://127.0.0.1:8787"
    if stage == "create" {
      guard !FileManager.default.fileExists(atPath:base.appendingPathComponent(privateName).path) else { throw CompanionError.invalidRequest }
      let a = try makeClient(endpoint:endpoint,directory:base.appendingPathComponent("a"),persistent:true)
      let b = try makeClient(endpoint:endpoint,directory:base.appendingPathComponent("b"),persistent:true)
      // Persist recovery credentials before further network operations. No production account.
      try write(["aLogin":a.login,"aPassword":a.password,"bLogin":b.login,"bPassword":b.password],privateName,privateFile:true)
      try restorePublicPhoto(a); try attach(a); try attach(b)
      _ = try a.records.addWeight(date:"2026-10-05",weightKg:81)
      let family = try invitation(a,kind:"family")
      _ = try b.service.execute("acceptInvitation",params:["code":family.code])
      _ = try a.service.execute("confirmInvitation",params:["id":family.id])
      _ = try b.service.execute("getState")
      for client in [a,b] { _ = try client.service.execute("setSharing",params:["categories":["photos","encouragement"]]) }
      _ = try a.service.execute("sync"); _ = try b.service.execute("sync")
      XCTAssertEqual(try b.service.peerPhoto("public-photo-1").bytes,try a.photos.bytes("public-photo-1"))
      let device = try invitation(a,kind:"device")
      try write(["version":1,"login":a.login,"password":a.password,"deviceInvitationCode":device.code],offerName,privateFile:true)
      try write(["stage":stage,"passed":true,"iosPhotoSha256":SHA256.hash(data:try a.photos.bytes("public-photo-1")).map {String(format:"%02x",$0)}.joined()],"ios-create-report.json")
      return
    }
    let credentials = try read(privateName)
    let a = try makeClient(endpoint:endpoint,login:credentials["aLogin"] as? String,password:credentials["aPassword"] as? String,directory:base.appendingPathComponent("a"),persistent:true,authenticate:false)
    let b = try makeClient(endpoint:endpoint,login:credentials["bLogin"] as? String,password:credentials["bPassword"] as? String,directory:base.appendingPathComponent("b"),persistent:true,authenticate:false)
    if stage == "revoke" || stage == "cleanup" {
      // The explicit approval pause can outlast the 30-minute session. Reuse only these approved QA accounts.
      for client in [a,b] {
        _ = try client.service.execute("login", params: ["login":client.login,"password":client.password])
      }
    }
    if stage == "confirm" {
      let offer = try read(offerName), code = try XCTUnwrap(offer["deviceInvitationCode"] as? String)
      _ = try a.service.execute("confirmInvitation",params:["id":try CompanionCrypto.parseInvitation(code).id])
      try write(["stage":stage,"passed":true],"ios-confirmed.json")
    } else if stage == "receive" {
      let report = try read("android-synced.json"), expected = try XCTUnwrap(report["androidPhotoSha256"] as? String)
      _ = try a.service.execute("sync")
      let weights = try XCTUnwrap(a.records.currentSnapshot()["weights"] as? [NSDictionary])
      XCTAssertTrue(weights.contains {$0["date"] as? String == "2026-10-05"})
      XCTAssertTrue(weights.contains {$0["date"] as? String == "2026-10-06"})
      let bytes = try a.photos.bytes("android-native-photo")
      XCTAssertEqual(SHA256.hash(data:bytes).map {String(format:"%02x",$0)}.joined(),expected)
      _ = try a.service.execute("setSharing",params:["categories":["photos","encouragement"]])
      _ = try a.service.execute("sync"); _ = try b.service.execute("sync"); _ = try a.service.execute("sync")
      XCTAssertEqual(try b.service.peerPhoto("android-native-photo").bytes,bytes)
      let incoming = try XCTUnwrap(try state(b.service.execute("getState"))["messages"] as? [NSDictionary])
      XCTAssertTrue(incoming.contains {$0["direction"] as? String == "incoming" && $0["status"] as? String == "delivered"})
      try write(["stage":stage,"passed":true,"androidPhotoSha256":expected,"weightDates":["2026-10-05","2026-10-06"]],"ios-received.json")
    } else if stage == "revoke" {
      _ = try b.service.execute("setSharing",params:["categories":[]])
      _ = try a.service.execute("unlink",params:["deletePeerCache":true])
      _ = try b.service.execute("getState")
      XCTAssertThrowsError(try b.service.peerPhoto("android-native-photo"))
      try write(["stage":stage,"passed":true],"ios-revoked.json")
    } else {
      for client in [a,b] {
        _ = try client.service.execute("deleteAccount",params:["password":client.password,"deleteLocalData":true])
        let namespace = "com.zzzode.leanon.uiqa.interop." + SHA256.hash(data:Data(client.directory.path.utf8)).map {String(format:"%02x",$0)}.joined()
        for name in ["records","personal","journal","companion"] { try KeychainDataKey(service:namespace,account:name).remove() }
        try FileManager.default.removeItem(at:client.directory)
      }
      try FileManager.default.removeItem(at:base.appendingPathComponent(privateName))
      try FileManager.default.removeItem(at:base.appendingPathComponent(offerName))
      try write(["stage":stage,"passed":true],"ios-cleaned.json")
    }
  }
}
