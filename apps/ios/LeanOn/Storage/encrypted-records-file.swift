import Foundation
import CryptoKit

/// Schema 2 remains JSON inside an authenticated envelope. Legacy plaintext reads do not rewrite it.
final class EncryptedRecordsFile {
  static let prefix = Data("LeanOn records encrypted v1\n".utf8)
  static let aad = Data("LeanOn records v2".utf8)
  let url: URL
  private let keys: NativeDataKeyProviding
  init(url: URL, keys: NativeDataKeyProviding) { self.url = url; self.keys = keys }
  static func account(_ url: URL) -> String {
    "records-" + SHA256.hash(data: Data(url.standardizedFileURL.path.utf8)).map { String(format: "%02x", $0) }.joined()
  }
  func read() throws -> Data {
    try NativeStoreRecoveryGate.require(url)
    let bytes = try ProtectedAtomicBytes.read(url, maximumBytes: 64 * 1024 * 1024)
    if bytes.starts(with: Self.prefix) {
      return try keys.open(bytes.dropFirst(Self.prefix.count), aad: Self.aad)
    }
    return bytes
  }
  func encrypted(_ plaintext: Data) throws -> Data {
    try NativeStoreRecoveryGate.require(url)
    guard plaintext.count <= 64 * 1024 * 1024 - Self.prefix.count - 28 else { throw NativeCryptoError.invalidEnvelope }
    let established: Bool
    if FileManager.default.fileExists(atPath: url.path) {
      let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
      established = try handle.read(upToCount: Self.prefix.count) == Self.prefix
    }
    else { established = false }
    return Self.prefix + (try NativeCrypto.seal(plaintext, key: keys.key(create: !established), aad: Self.aad))
  }
  func write(_ plaintext: Data) throws {
    guard plaintext.count <= 64 * 1024 * 1024 - Self.prefix.count - 28 else { throw NativeCryptoError.invalidEnvelope }
    let bytes = try encrypted(plaintext)
    try ProtectedAtomicBytes.write(bytes, to: url)
  }
  func removeKeyAfterDataDeletion() throws {
    guard !FileManager.default.fileExists(atPath: url.path) else { throw NativeCryptoError.keyUnavailable }
    try keys.remove()
  }
  func validateRecoveryBytes(_ data: Data) throws {
    if data.starts(with: Self.prefix) { _ = try keys.open(data.dropFirst(Self.prefix.count), aad: Self.aad) }
    else {
      guard let value = try JSONSerialization.jsonObject(with: data) as? NSDictionary else { throw NativeCryptoError.invalidEnvelope }
      _ = value // Historical plaintext schema migration remains owned by RecordsStore.
    }
  }
  func validateCurrentForRecovery() throws {
    if FileManager.default.fileExists(atPath: url.path) {
      try validateRecoveryBytes(ProtectedAtomicBytes.read(url, maximumBytes: 64 * 1024 * 1024))
    }
  }
  func promoteAuthenticatedKey() throws { try keys.promoteAuthenticatedKey() }
  func validateDeletionCompletion() throws { try keys.validateDeletionCompletion() }
}

/// Explicit URL unit fixtures get ephemeral keys shared only within this process.
enum RecordFixtureKeys {
  private static var keys: [String: EphemeralDataKey] = [:]
  private static let lock = NSLock()
  static func forURL(_ url: URL) -> NativeDataKeyProviding {
    lock.lock(); defer { lock.unlock() }
    let name = url.standardizedFileURL.path
    if let old = keys[name] { return old }
    let key = EphemeralDataKey(); keys[name] = key; return key
  }
}

final class EphemeralDataKey: NativeDataKeyProviding {
  private var value: SymmetricKey?
  private let lock = NSLock()
  func key(create: Bool) throws -> SymmetricKey {
    lock.lock(); defer { lock.unlock() }
    if let value { return value }
    guard create else { throw NativeCryptoError.keyUnavailable }
    let generated = try SymmetricKey(data: NativeCrypto.random(32)); value = generated; return generated
  }
}
