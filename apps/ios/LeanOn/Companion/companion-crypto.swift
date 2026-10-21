import Foundation
import CryptoKit
import CoreFoundation

/// Protocol v1 uses platform primitives and authenticates every routing field.
enum CompanionCrypto {
  static let invitePrefix = "leanon-invite-v1:"
  static func json(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes, .fragmentsAllowed])
  }
  static func base64(_ value: Any?, count: Int? = nil) throws -> Data {
    guard let text = value as? String, let bytes = Data(base64Encoded: text), bytes.base64EncodedString() == text,
      count == nil || bytes.count == count else { throw CompanionError.invalidRequest }
    return bytes
  }
  static func hkdf(secret: Data, id: String, info: String) -> SymmetricKey {
    HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: secret), salt: Data(id.utf8),
      info: Data(info.utf8), outputByteCount: 32)
  }
  static func proof(secret: Data, id: String) -> Data {
    hkdf(secret: secret, id: id, info: "leanon-invite-proof-v1").withUnsafeBytes { Data($0) }
  }
  static func proofHash(_ proof: Data) -> String {
    SHA256.hash(data: proof).map { String(format: "%02x", $0) }.joined()
  }
  static func seal(_ bytes: Data, key: Data, aad: Data, nonce: Data? = nil) throws -> [String: Any] {
    guard key.count == 32, bytes.count <= 64 * 1024 * 1024 else { throw CompanionError.invalidRequest }
    let nonce = try AES.GCM.Nonce(data: nonce ?? NativeCrypto.random(12))
    let box = try AES.GCM.seal(bytes, using: SymmetricKey(data: key), nonce: nonce, authenticating: aad)
    return ["algorithm": "AES-256-GCM", "nonce": Data(box.nonce).base64EncodedString(),
      "ciphertext": box.ciphertext.base64EncodedString(), "tag": box.tag.base64EncodedString()]
  }
  static func open(_ value: Any?, key: Data, aad: Data) throws -> Data {
    guard let value = value as? [String: Any], Set(value.keys) == Set(["algorithm", "nonce", "ciphertext", "tag"]),
      value["algorithm"] as? String == "AES-256-GCM", key.count == 32 else { throw CompanionError.invalidResponse }
    let nonce = try base64(value["nonce"], count: 12), tag = try base64(value["tag"], count: 16)
    let ciphertext = try base64(value["ciphertext"])
    guard ciphertext.count <= 64 * 1024 * 1024 else { throw CompanionError.invalidResponse }
    let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: ciphertext, tag: tag)
    return try AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: aad)
  }
  static func invitationCode(id: String, secret: Data) throws -> String {
    guard validId(id), secret.count == 32 else { throw CompanionError.invalidRequest }
    // Explicit order is frozen across hosts; parsing remains semantic.
    let idJSON = String(decoding: try json(id), as: UTF8.self)
    let secretJSON = String(decoding: try json(secret.base64EncodedString()), as: UTF8.self)
    let bytes = Data(("{\"id\":" + idJSON + ",\"inviteSecret\":" + secretJSON + "}").utf8)
    return invitePrefix + bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }
  static func parseInvitation(_ code: String) throws -> (id: String, secret: Data) {
    guard code.hasPrefix(invitePrefix), code.utf8.count <= 2048 else { throw CompanionError.invalidRequest }
    let suffix = String(code.dropFirst(invitePrefix.count))
    guard !suffix.isEmpty, suffix.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { throw CompanionError.invalidRequest }
    var base64 = suffix.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    guard let bytes = Data(base64Encoded: base64),
      bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") == suffix,
      let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      Set(value.keys) == Set(["id", "inviteSecret"]), let id = value["id"] as? String, validId(id) else { throw CompanionError.invalidRequest }
    return (id, try self.base64(value["inviteSecret"], count: 32))
  }
  static func validId(_ value: String) -> Bool {
    value.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
  }
  static func aad(group: String, epoch: Int, owner: String, device: String, change: [String: Any]) throws -> Data {
    guard validId(group), validId(owner), validId(device), epoch >= 0,
      let id = change["id"] as? String, validId(id), let record = change["recordId"] as? String, validId(record),
      let category = change["category"] as? String, let kind = change["kind"] as? String,
      let time = change["updatedAt"] as? NSNumber, CFGetTypeID(time) != CFBooleanGetTypeID(),
      time.doubleValue.isFinite, time.doubleValue.rounded() == time.doubleValue, time.doubleValue >= 0, time.doubleValue <= 9_007_199_254_740_991,
      let deleted = change["deleted"] as? NSNumber, CFGetTypeID(deleted) == CFBooleanGetTypeID() else { throw CompanionError.invalidResponse }
    return try json(["leanon-change-v1", group, epoch, owner, device, id, record, category, kind, time, deleted])
  }
}

enum CompanionError: Error {
  case invalidRequest, invalidResponse, notAuthenticated, notAuthorized, notPaired, sharingDisabled, missingKey, persistence, capacity, unsupportedIdentity, previewCleanupPending, accountDeletionPending, accountDeletionLocalDataChanged, accountDeletionKeyCleanupConflict, cancelled
  case http(String, Bool)
  var code: String {
    switch self {
    case .invalidRequest: return "invalid-request"
    case .invalidResponse: return "invalid-response"
    case .notAuthenticated: return "not-authenticated"
    case .notAuthorized: return "not-authorized"
    case .notPaired: return "not-paired"
    case .sharingDisabled: return "sharing-disabled"
    case .missingKey: return "missing-key"
    case .persistence: return "persistence-failed"
    case .capacity: return "capacity-exceeded"
    case .unsupportedIdentity: return "unsupported-unicode-identity"
    case .previewCleanupPending: return "preview-clear-pending"
    case .accountDeletionPending: return "account-deletion-unconfirmed"
    case .accountDeletionLocalDataChanged: return "account-deletion-local-data-changed"
    case .accountDeletionKeyCleanupConflict: return "account-deletion-key-cleanup-conflict"
    case .cancelled: return "cancelled"
    case .http(let code, _): return code
    }
  }
}
