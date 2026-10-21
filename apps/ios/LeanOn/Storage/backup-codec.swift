import Foundation
import CryptoKit

enum BackupCodec {
  static let maximumPlaintextBytes = 48 * 1024 * 1024 - 4096
  static let maximumEnvelopeBytes = 64 * 1024 * 1024

  static func validatePassword(_ password: String) throws {
    guard (12...1024).contains(password.utf8.count) else { throw NativeCryptoError.invalidPassword }
  }

  static func encode(_ payload: Data, password: String, salt: Data? = nil, nonce: Data? = nil) throws -> Data {
    try validatePassword(password)
    guard payload.count <= maximumPlaintextBytes else { throw NativeCryptoError.invalidEnvelope }
    let salt = try salt ?? NativeCrypto.random(16)
    let key = try NativeCrypto.derive(password: password, salt: salt)
    let sealed = try NativeCrypto.seal(payload, key: key, aad: NativeCrypto.backupAAD, nonce: nonce)
    let envelope: [String: Any] = ["formatVersion": 1, "cipher": "AES-256-GCM", "kdf": "PBKDF2-HMAC-SHA256",
      "iterations": 600_000, "salt": salt.base64EncodedString(), "nonce": sealed.prefix(12).base64EncodedString(),
      "ciphertext": sealed.dropFirst(12).base64EncodedString()]
    let encoded = try JSONSerialization.data(withJSONObject: envelope, options: .sortedKeys)
    guard encoded.count <= maximumEnvelopeBytes else { throw NativeCryptoError.invalidEnvelope }
    return encoded
  }

  static func decode(_ data: Data, password: String) throws -> Data {
    try validatePassword(password)
    guard data.count <= maximumEnvelopeBytes,
      let envelope = try JSONSerialization.jsonObject(with: data) as? NSDictionary,
      try RecordSchema.integer(envelope["formatVersion"], "formatVersion") == 1,
      try RecordSchema.integer(envelope["iterations"], "iterations") == 600_000,
      envelope["cipher"] as? String == "AES-256-GCM", envelope["kdf"] as? String == "PBKDF2-HMAC-SHA256"
    else { throw NativeCryptoError.invalidEnvelope }
    let allowed = ["formatVersion", "cipher", "kdf", "iterations", "salt", "nonce", "ciphertext"]
    guard envelope.allKeys.allSatisfy({ ($0 as? String).map(allowed.contains) == true }) else {
      throw NativeCryptoError.invalidEnvelope
    }
    func bytes(_ name: String, count: Int? = nil) throws -> Data {
      guard let text = envelope[name] as? String, let bytes = Data(base64Encoded: text),
        bytes.base64EncodedString() == text, count == nil || bytes.count == count else { throw NativeCryptoError.invalidEnvelope }
      return bytes
    }
    let salt = try bytes("salt", count: 16), nonce = try bytes("nonce", count: 12), ciphertext = try bytes("ciphertext")
    guard ciphertext.count >= 16, ciphertext.count <= maximumPlaintextBytes + 16 else { throw NativeCryptoError.invalidEnvelope }
    return try NativeCrypto.open(nonce + ciphertext, key: NativeCrypto.derive(password: password, salt: salt), aad: NativeCrypto.backupAAD)
  }
}
