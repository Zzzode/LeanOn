import Foundation
import CryptoKit
import CommonCrypto
import Security
import Darwin

enum NativeCryptoError: Error {
  case invalidEnvelope, invalidPassword, keyUnavailable, randomFailure, keyDerivationFailure, keychainStatus(OSStatus)
}

/// Platform primitives; serialization and portable backup fields are shared contracts.
enum NativeCrypto {
  static let backupAAD = Data("LeanOn backup v1".utf8)

  static func random(_ count: Int) throws -> Data {
    var bytes = [UInt8](repeating: 0, count: count)
    guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
      throw NativeCryptoError.randomFailure
    }
    return Data(bytes)
  }

  static func derive(password: String, salt: Data, iterations: UInt32 = 600_000) throws -> SymmetricKey {
    var passwordBytes = Array(password.utf8)
    guard !passwordBytes.isEmpty, passwordBytes.count <= 1024, salt.count == 16, iterations == 600_000 else {
      throw NativeCryptoError.invalidPassword
    }
    var derived = [UInt8](repeating: 0, count: 32)
    defer {
      _ = derived.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
      _ = passwordBytes.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
    }
    let result = passwordBytes.withUnsafeBytes { secret in
      salt.withUnsafeBytes { saltBytes in
        CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
          secret.baseAddress!.assumingMemoryBound(to: Int8.self), passwordBytes.count,
          saltBytes.baseAddress!.assumingMemoryBound(to: UInt8.self), salt.count,
          CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), iterations, &derived, derived.count)
      }
    }
    guard result == kCCSuccess else { throw NativeCryptoError.keyDerivationFailure }
    return SymmetricKey(data: derived)
  }

  static func seal(_ bytes: Data, key: SymmetricKey, aad: Data, nonce: Data? = nil) throws -> Data {
    let nonce = try AES.GCM.Nonce(data: nonce ?? random(12))
    let box = try AES.GCM.seal(bytes, using: key, nonce: nonce, authenticating: aad)
    guard let result = box.combined else { throw NativeCryptoError.invalidEnvelope }
    return result
  }

  static func open(_ bytes: Data, key: SymmetricKey, aad: Data) throws -> Data {
    guard bytes.count >= 28 else { throw NativeCryptoError.invalidEnvelope }
    return try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key, authenticating: aad)
  }
}

protocol NativeDataKeyProviding {
  func key(create: Bool) throws -> SymmetricKey
  func remove() throws
  func open(_ ciphertext: Data, aad: Data) throws -> Data
  func promoteAuthenticatedKey() throws
  func validateDeletionCompletion() throws
}
extension NativeDataKeyProviding {
  func remove() throws {}
  func open(_ ciphertext: Data, aad: Data) throws -> Data {
    try NativeCrypto.open(ciphertext, key: key(create: false), aad: aad)
  }
  func promoteAuthenticatedKey() throws {}
  func validateDeletionCompletion() throws {}
}

/// Created lazily by an explicit write. Reading a missing file does not create credentials.
final class KeychainDataKey: NativeDataKeyProviding {
  private let service: String
  private let account: String
  init(service: String = (Bundle.main.bundleIdentifier ?? "com.zzzode.leanon") + ".encrypted-data", account: String) {
    self.service = service; self.account = account
  }

  private var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
     kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
  }

  func key(create: Bool) throws -> SymmetricKey {
    var read = query; read[kSecReturnData as String] = true; read[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data, data.count == 32 { return SymmetricKey(data: data) }
    guard status == errSecItemNotFound, create else { throw NativeCryptoError.keyUnavailable }
    let data = try NativeCrypto.random(32)
    var add = query; add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let added = SecItemAdd(add as CFDictionary, nil)
    if added == errSecDuplicateItem { return try key(create: false) }
    guard added == errSecSuccess else { throw NativeCryptoError.keyUnavailable }
    return SymmetricKey(data: data)
  }

  /// Tests may clean only their isolated .uiqa key services, never production keys.
  func removeTestKey() throws {
    guard service.hasPrefix("com.zzzode.leanon.uiqa.") else { throw NativeCryptoError.keyUnavailable }
    try remove()
  }
  func remove() throws {
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeCryptoError.keychainStatus(status) }
  }
}

final class MemoryDataKey: NativeDataKeyProviding {
  private let value: SymmetricKey
  init(data: Data? = nil) throws { value = try SymmetricKey(data: data ?? NativeCrypto.random(32)) }
  func key(create: Bool) throws -> SymmetricKey { value }
}

/// Authenticated encrypted bytes; callers serialize their validated versioned schema.
final class EncryptedAtomicFile {
  let url: URL
  private let keys: NativeDataKeyProviding
  private let aad: Data
  private let maximumBytes: Int
  init(url: URL, keys: NativeDataKeyProviding, context: String, maximumBytes: Int = 64 * 1024 * 1024) {
    self.url = url; self.keys = keys; aad = Data(context.utf8); self.maximumBytes = maximumBytes
  }
  func read() throws -> Data? {
    try NativeStoreRecoveryGate.require(url)
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    return try keys.open(ProtectedAtomicBytes.read(url, maximumBytes: maximumBytes), aad: aad)
  }
  func encrypted(_ data: Data) throws -> Data {
    try NativeStoreRecoveryGate.require(url)
    guard data.count <= maximumBytes - 28 else { throw NativeCryptoError.invalidEnvelope }
    return try NativeCrypto.seal(data, key: keys.key(create: !FileManager.default.fileExists(atPath: url.path)), aad: aad)
  }
  func write(_ data: Data) throws {
    let encrypted = try self.encrypted(data)
    try ProtectedAtomicBytes.write(encrypted, to: url)
  }
  func removeKeyAfterDataDeletion() throws {
    guard !FileManager.default.fileExists(atPath: url.path) else { throw NativeCryptoError.keyUnavailable }
    try keys.remove()
  }
  func validateRecoveryBytes(_ data: Data) throws { _ = try keys.open(data, aad: aad) }
  func validateCurrentForRecovery() throws {
    if FileManager.default.fileExists(atPath: url.path) {
      try validateRecoveryBytes(ProtectedAtomicBytes.read(url, maximumBytes: maximumBytes))
    }
  }
  func promoteAuthenticatedKey() throws { try keys.promoteAuthenticatedKey() }
  func validateDeletionCompletion() throws { try keys.validateDeletionCompletion() }
}

enum ProtectedAtomicBytes {
  static func read(_ url: URL, maximumBytes: Int) throws -> Data {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard let size = attributes[.size] as? NSNumber, size.intValue >= 0, size.intValue <= maximumBytes else { throw NativeCryptoError.invalidEnvelope }
    let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
    let bytes = try handle.read(upToCount: maximumBytes + 1) ?? Data()
    guard bytes.count <= maximumBytes else { throw NativeCryptoError.invalidEnvelope }
    return bytes
  }
  static func write(_ data: Data, to url: URL) throws {
    let directory = url.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let staged = directory.appendingPathComponent(".leanon-stage-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: staged) }
    try data.write(to: staged, options: .completeFileProtection)
    var protected = staged, values = URLResourceValues(); values.isExcludedFromBackup = true
    try protected.setResourceValues(values)
    let handle = try FileHandle(forWritingTo: staged)
    defer { try? handle.close() }
    try handle.synchronize()
    let result = staged.path.withCString { source in url.path.withCString { destination in rename(source, destination) } }
    guard result == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    try synchronizeDirectory(directory)
  }
  static func synchronizeDirectory(_ directory: URL) throws {
    let descriptor = directory.path.withCString { Darwin.open($0, O_RDONLY) }
    guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    defer { Darwin.close(descriptor) }
    guard fsync(descriptor) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
  }
}
