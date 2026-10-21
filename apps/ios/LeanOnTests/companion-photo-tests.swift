import XCTest
@testable import LeanOn

final class CompanionPhotoTests: XCTestCase {
  func testFrozenIndependentNodePacketAndRoutingTamper() throws {
    let key = Data(0..<32), original = Data("PUBLIC photo fixture".utf8)
    let packet = try CompanionPhotos.packet(original, groupKey: key, group: "public-group", epoch: 1, owner: "public-owner", device: "public-device", object: "public-object", nonce: Data(0..<12))
    XCTAssertEqual(packet.base64EncodedString(), "AAECAwQFBgcICQoLXjUyYCopsRIz0yavJoWMMZd+KgMZxZ+7jQ4gRYE7t39njRPs")
    XCTAssertEqual(try CompanionPhotos.open(packet, groupKey: key, group: "public-group", epoch: 1, owner: "public-owner", device: "public-device", object: "public-object"), original)
    for (group, epoch, owner, device, object) in [
      ("wrong-group", Int64(1), "public-owner", "public-device", "public-object"),
      ("public-group", Int64(2), "public-owner", "public-device", "public-object"),
      ("public-group", Int64(1), "wrong-owner", "public-device", "public-object"),
      ("public-group", Int64(1), "public-owner", "wrong-device", "public-object"),
      ("public-group", Int64(1), "public-owner", "public-device", "wrong-object")
    ] { XCTAssertThrowsError(try CompanionPhotos.open(packet, groupKey: key, group: group, epoch: epoch, owner: owner, device: device, object: object)) }
  }
  func testAuthenticatedManifestPreservesBytesAndRejectsSubstitution() throws {
    let key = Data(0..<32), original: [String: Any] = ["version": 1, "kind": "family-category", "category": "photos", "data": [[String: Any]](), "photoBytes": [["id": "public-photo", "bytesBase64": Data("PUBLIC photo fixture".utf8).base64EncodedString()]]]
    let prepared = try CompanionPhotos.prepare(original, groupKey: key, group: "public-group", epoch: 1, owner: "public-owner", device: "public-device")
    XCTAssertFalse(String(decoding: try CompanionCrypto.json(prepared.plain), as: UTF8.self).contains("bytesBase64"))
    let packet = try CompanionCrypto.base64(prepared.packets[0]["bytesBase64"])
    let hydrated = try CompanionPhotos.hydrate(prepared.plain, change: ["objects": prepared.objects], groupKey: key, group: "public-group", epoch: 1, owner: "public-owner", device: "public-device") { _ in packet }
    XCTAssertEqual(try CompanionCrypto.json(original), try CompanionCrypto.json(hydrated))
    var altered = prepared.objects; altered[0]["digest"] = String(repeating: "0", count: 64)
    XCTAssertThrowsError(try CompanionPhotos.hydrate(prepared.plain, change: ["objects": altered], groupKey: key, group: "public-group", epoch: 1, owner: "public-owner", device: "public-device") { _ in packet })
  }
}
