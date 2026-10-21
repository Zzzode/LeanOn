import Foundation
import CryptoKit
import Security

enum StoreKeyRole: String, CaseIterable {
  case records, personal, journal, companion
  case healthLedger = "health-ledger"
  var stableAccount: String { "store-v1-" + rawValue }
  var legacyPrefix: String {
    switch self {
    case .records: return "records-"
    case .personal: return "personal-"
    case .journal: return "journal-personal-"
    case .companion: return "companion-personal-"
    case .healthLedger: return "health-ledger-personal-"
    }
  }
  func acceptsLegacy(_ account: String) -> Bool {
    guard account.hasPrefix(legacyPrefix) else { return false }
    let suffix = account.dropFirst(legacyPrefix.count)
    return suffix.utf8.count == 64 && suffix.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
  }
}

protocol StoreKeychainAccess {
  func read(_ account: String) throws -> Data?
  func accounts() throws -> [String]
  func installIfAbsent(_ account: String, bytes: Data) throws
  func remove(_ account: String) throws
}

/// Exact app service only. Listing returns attributes, never unrelated key material.
final class KeychainStoreAccess: StoreKeychainAccess {
  private let service: String
  init(service: String) { self.service = service }
  private var base: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
     kSecAttrSynchronizable as String: false]
  }
  func read(_ account: String) throws -> Data? {
    var query = base; query[kSecAttrAccount as String] = account
    query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw NativeCryptoError.keychainStatus(status) }
    guard let data = item as? Data, data.count == 32 else { throw NativeCryptoError.keyUnavailable }
    return data
  }
  func accounts() throws -> [String] {
    var query = base; query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitAll
    var item: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return [] }
    guard status == errSecSuccess else { throw NativeCryptoError.keychainStatus(status) }
    guard let rows = item as? [NSDictionary], rows.count <= 256 else { throw NativeCryptoError.keyUnavailable }
    return try rows.map {
      guard let account = $0[kSecAttrAccount as String] as? String else { throw NativeCryptoError.keyUnavailable }
      return account
    }
  }
  func installIfAbsent(_ account: String, bytes: Data) throws {
    guard bytes.count == 32 else { throw NativeCryptoError.keyUnavailable }
    var query = base; query[kSecAttrAccount as String] = account
    query[kSecValueData as String] = bytes
    query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(query as CFDictionary, nil)
    if status == errSecDuplicateItem {
      guard try read(account) == bytes else { throw NativeCryptoError.keyUnavailable }; return
    }
    guard status == errSecSuccess else { throw NativeCryptoError.keychainStatus(status) }
  }
  func remove(_ account: String) throws {
    var query = base; query[kSecAttrAccount as String] = account
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeCryptoError.keychainStatus(status) }
  }
}

/// Resolves legacy keys by authenticating this role's actual ciphertext, never by path guessing.
/// Preflight is read-only; callers promote only after every journal participant validates.
final class RelocatableStoreKey: NativeDataKeyProviding {
  let role: StoreKeyRole
  private let url: URL
  private let aad: Data
  private let prefix: Data?
  private let maximumBytes: Int
  private let access: StoreKeychainAccess
  private let lock = NSRecursiveLock()
  private var authenticated: Data?
  private var observed: Data?

  init(role: StoreKeyRole, url: URL, context: String, prefix: Data? = nil,
       maximumBytes: Int = 64 * 1024 * 1024,
       service: String = (Bundle.main.bundleIdentifier ?? "com.zzzode.leanon") + ".encrypted-data",
       access: StoreKeychainAccess? = nil) {
    self.role = role; self.url = url; aad = Data(context.utf8); self.prefix = prefix
    self.maximumBytes = maximumBytes; self.access = access ?? KeychainStoreAccess(service: service)
  }
  private func legacyAccounts() throws -> [String] {
    let accounts = try access.accounts().filter(role.acceptsLegacy)
    guard accounts.count <= 16 else { throw NativeCryptoError.keyUnavailable }
    return accounts.sorted()
  }
  func open(_ ciphertext: Data, aad: Data) throws -> Data {
    lock.lock(); defer { lock.unlock() }
    authenticated = nil
    guard aad == self.aad, ciphertext.count <= maximumBytes else { throw NativeCryptoError.invalidEnvelope }
    // An established stable alias may never be overwritten or silently bypassed.
    if let stable = try access.read(role.stableAccount) {
      let plain = try NativeCrypto.open(ciphertext, key: SymmetricKey(data: stable), aad: aad)
      guard observed == nil || observed == stable else { throw NativeCryptoError.keyUnavailable }
      observed = stable
      authenticated = stable; return plain
    }
    var matches: [(Data, Data)] = []
    for account in try legacyAccounts() {
      guard let bytes = try access.read(account) else { continue }
      if let plain = try? NativeCrypto.open(ciphertext, key: SymmetricKey(data: bytes), aad: aad) {
        matches.append((bytes, plain))
        guard matches.count == 1 else { throw NativeCryptoError.keyUnavailable }
      }
    }
    guard matches.count == 1 else { throw NativeCryptoError.keyUnavailable }
    guard observed == nil || observed == matches[0].0 else { throw NativeCryptoError.keyUnavailable }
    observed = matches[0].0
    authenticated = matches[0].0; return matches[0].1
  }
  private func establishedCiphertext() throws -> Data? {
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    let bytes = try ProtectedAtomicBytes.read(url, maximumBytes: maximumBytes)
    if let prefix {
      guard bytes.starts(with: prefix) else { return nil } // Historical plaintext remains read-only compatible.
      return bytes.dropFirst(prefix.count)
    }
    return bytes
  }
  func validateEstablished() throws {
    lock.lock(); defer { lock.unlock() }
    if let cipher = try establishedCiphertext() { _ = try open(cipher, aad: aad) }
  }
  func promoteAuthenticatedKey() throws {
    lock.lock(); defer { lock.unlock() }
    guard let authenticated else { return } // Missing files and plaintext never provision keys on read.
    try access.installIfAbsent(role.stableAccount, bytes: authenticated)
  }
  func key(create: Bool) throws -> SymmetricKey {
    lock.lock(); defer { lock.unlock() }
    if let cipher = try establishedCiphertext() {
      _ = try open(cipher, aad: aad)
      guard let authenticated else { throw NativeCryptoError.keyUnavailable }
      return SymmetricKey(data: authenticated)
    }
    if let stable = try access.read(role.stableAccount) { return SymmetricKey(data: stable) }
    guard create else { throw NativeCryptoError.keyUnavailable }
    let created = try NativeCrypto.random(32)
    try access.installIfAbsent(role.stableAccount, bytes: created)
    guard let stable = try access.read(role.stableAccount) else { throw NativeCryptoError.keyUnavailable }
    return SymmetricKey(data: stable)
  }
  func remove() throws {
    lock.lock(); defer { lock.unlock() }
    guard !FileManager.default.fileExists(atPath: url.path) else { throw NativeCryptoError.keyUnavailable }
    guard let stable = try access.read(role.stableAccount) else {
      // An old deletion marker can outlive its last authenticating ciphertext.
      // Unverified legacy aliases must be retained and cleanup must remain pending.
      guard try legacyAccounts().isEmpty else { throw NativeCryptoError.keyUnavailable }
      return
    }
    // Remove only aliases containing this exact authenticated DEK. Stable stays until the end for retry.
    for account in try legacyAccounts() where try access.read(account) == stable { try access.remove(account) }
    try access.remove(role.stableAccount)
    authenticated = nil
    observed = nil
  }
  func validateDeletionCompletion() throws {
    lock.lock(); defer { lock.unlock() }
    // New local data after completion belongs to a new generation and is never touched.
    guard !FileManager.default.fileExists(atPath: url.path) else { return }
    guard try access.read(role.stableAccount) == nil, try legacyAccounts().isEmpty else {
      throw NativeCryptoError.keyUnavailable
    }
  }
}

enum NativeStoreKeys {
  static func make(role: StoreKeyRole, url: URL, legacyAccount: String, context: String,
                   prefix: Data? = nil, maximumBytes: Int = 64 * 1024 * 1024) -> NativeDataKeyProviding {
    #if DEBUG
    if let path = ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"], !path.isEmpty {
      return KeychainDataKey(account: legacyAccount)
    }
    #endif
    return RelocatableStoreKey(role: role, url: url, context: context, prefix: prefix, maximumBytes: maximumBytes)
  }
}
