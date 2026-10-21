import Foundation
import CryptoKit

/// Small authenticated manifests bind independent private R2 image objects.
enum CompanionPhotos {
  static func aad(group: String, epoch: Int64, owner: String, device: String, object: String) throws -> Data {
    try CompanionCrypto.json(["leanon-photo-v2", group, epoch, owner, device, object])
  }
  static func key(_ groupKey: Data, object: String) -> Data {
    CompanionCrypto.hkdf(secret: groupKey, id: object, info: "leanon-photo-key-v2").withUnsafeBytes { Data($0) }
  }
  static func packet(_ bytes: Data, groupKey: Data, group: String, epoch: Int64, owner: String, device: String, object: String, nonce: Data? = nil) throws -> Data {
    guard bytes.count <= 20 * 1024 * 1024 else { throw CompanionError.capacity }
    let sealed = try CompanionCrypto.seal(bytes, key: key(groupKey, object: object), aad: aad(group: group, epoch: epoch, owner: owner, device: device, object: object), nonce: nonce)
    return try CompanionCrypto.base64(sealed["nonce"], count: 12) + CompanionCrypto.base64(sealed["tag"], count: 16) + CompanionCrypto.base64(sealed["ciphertext"])
  }
  static func open(_ packet: Data, groupKey: Data, group: String, epoch: Int64, owner: String, device: String, object: String) throws -> Data {
    guard (28...(20 * 1024 * 1024 + 28)).contains(packet.count) else { throw CompanionError.invalidResponse }
    return try CompanionCrypto.open(["algorithm": "AES-256-GCM", "nonce": packet.prefix(12).base64EncodedString(),
      "tag": packet[12..<28].base64EncodedString(), "ciphertext": packet.dropFirst(28).base64EncodedString()], key: key(groupKey, object: object), aad: aad(group: group, epoch: epoch, owner: owner, device: device, object: object))
  }
  static func prepare(_ value: [String: Any], groupKey: Data, group: String, epoch: Int64, owner: String, device: String) throws -> (plain: [String: Any], objects: [[String: Any]], packets: [[String: Any]]) {
    let source: [[String: Any]]
    if value["kind"] as? String == "vault-snapshot" { source = (value["payload"] as? [String: Any])?["photos"] as? [[String: Any]] ?? [] }
    else if value["kind"] as? String == "family-category", value["category"] as? String == "photos" { source = value["photoBytes"] as? [[String: Any]] ?? [] }
    else { source = [] }
    if source.isEmpty { return (value, [], []) }; guard source.count <= 64 else { throw CompanionError.capacity }
    var stripped = value
    if var payload = value["payload"] as? [String: Any] { payload["photos"] = [[String: Any]](); stripped["payload"] = payload } else { stripped["photoBytes"] = [[String: Any]]() }
    var refs = [[String: Any]](), mappings = [[String: Any]](), packets = [[String: Any]](), ids = Set<String>()
    for blob in source {
      guard Set(blob.keys) == Set(["id", "bytesBase64"]), let photo = blob["id"] as? String, ids.insert(photo).inserted else { throw CompanionError.invalidRequest }
      let object = UUID().uuidString
      let bytes = try packet(CompanionCrypto.base64(blob["bytesBase64"]), groupKey: groupKey, group: group, epoch: epoch, owner: owner, device: device, object: object)
      let ref: [String: Any] = ["id": object, "digest": CompanionCrypto.proofHash(bytes), "size": bytes.count]
      refs.append(ref); mappings.append(["id": photo, "object": ref]); packets.append(["id": object, "bytesBase64": bytes.base64EncodedString()])
    }
    refs.sort { ($0["id"] as! String) < ($1["id"] as! String) }
    return (["version": 2, "kind": "photo-manifest", "value": stripped, "photos": mappings, "objects": refs], refs, packets)
  }
  static func hydrate(_ value: [String: Any], change: [String: Any], groupKey: Data, group: String, epoch: Int64, owner: String, device: String, read: (String) throws -> Data) throws -> [String: Any] {
    if try CompanionStateFile.integer(value["version"]) != 2 {
      guard (change["objects"] as? [[String: Any]] ?? []).isEmpty else { throw CompanionError.invalidResponse }; return value
    }
    guard Set(value.keys) == Set(["version", "kind", "value", "photos", "objects"]), value["kind"] as? String == "photo-manifest",
      let refs = value["objects"] as? [[String: Any]], (1...64).contains(refs.count), let exposed = change["objects"] as? [[String: Any]],
      try CompanionCrypto.json(refs) == CompanionCrypto.json(exposed), let mappings = value["photos"] as? [[String: Any]], mappings.count == refs.count,
      var original = value["value"] as? [String: Any] else { throw CompanionError.invalidResponse }
    var indexed = [String: [String: Any]](), previous = ""
    for ref in refs { guard Set(ref.keys) == Set(["id", "digest", "size"]), let id = ref["id"] as? String, CompanionCrypto.validId(id), id > previous else { throw CompanionError.invalidResponse }; indexed[id] = ref; previous = id }
    var photos = [[String: Any]](), photoIds = Set<String>(), used = Set<String>()
    for mapping in mappings {
      guard Set(mapping.keys) == Set(["id", "object"]), let photo = mapping["id"] as? String, photoIds.insert(photo).inserted,
        let ref = mapping["object"] as? [String: Any], let object = ref["id"] as? String, used.insert(object).inserted,
        let expected = indexed[object], try CompanionCrypto.json(ref) == CompanionCrypto.json(expected) else { throw CompanionError.invalidResponse }
      let packet = try read(object)
      guard try Int64(packet.count) == CompanionStateFile.integer(expected["size"]), CompanionCrypto.proofHash(packet) == expected["digest"] as? String else { throw CompanionError.invalidResponse }
      let bytes = try open(packet, groupKey: groupKey, group: group, epoch: epoch, owner: owner, device: device, object: object)
      photos.append(["id": photo, "bytesBase64": bytes.base64EncodedString()])
    }
    if var payload = original["payload"] as? [String: Any], original["kind"] as? String == "vault-snapshot" { payload["photos"] = photos; original["payload"] = payload }
    else if original["kind"] as? String == "family-category", original["category"] as? String == "photos" { original["photoBytes"] = photos }
    else { throw CompanionError.invalidResponse }
    return original
  }
  static func wire(_ change: [String: Any]) -> [String: Any] { var result = change; result.removeValue(forKey: "_photoPackets"); return result }
}
