import Foundation

/// Legacy bytes remain untouched on read. Only a successful explicit write migrates them.
final class EncryptedLegacyJSONFile {
  let url: URL
  private let keys: NativeDataKeyProviding
  private let prefix: Data
  private let aad: Data
  private let maximumBytes = 64 * 1024 * 1024
  init(url: URL, keys: NativeDataKeyProviding, context: String) {
    self.url = url; self.keys = keys; prefix = Data((context + " encrypted v1\n").utf8); aad = Data(context.utf8)
  }
  func read() throws -> Data? {
    try NativeStoreRecoveryGate.require(url)
    guard FileManager.default.fileExists(atPath:url.path) else { return nil }
    let bytes = try ProtectedAtomicBytes.read(url,maximumBytes:maximumBytes)
    if bytes.starts(with:prefix) { return try keys.open(bytes.dropFirst(prefix.count),aad:aad) }
    return bytes
  }
  func write(_ data: Data) throws {
    try NativeStoreRecoveryGate.require(url)
    guard data.count <= maximumBytes-prefix.count-28 else { throw NativeCryptoError.invalidEnvelope }
    var established = false
    if FileManager.default.fileExists(atPath:url.path) {
      let handle = try FileHandle(forReadingFrom:url);defer{try? handle.close()}
      established = try handle.read(upToCount:prefix.count)==prefix
    }
    let encrypted = try NativeCrypto.seal(data,key:keys.key(create:!established),aad:aad)
    try ProtectedAtomicBytes.write(prefix+encrypted,to:url)
  }
  func delete() throws {
    if FileManager.default.fileExists(atPath:url.path) {
      try FileManager.default.removeItem(at:url)
      try ProtectedAtomicBytes.synchronizeDirectory(url.deletingLastPathComponent())
    }
    try keys.remove()
  }
  func validateCurrentForRecovery() throws {
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    let bytes = try ProtectedAtomicBytes.read(url, maximumBytes: maximumBytes)
    if bytes.starts(with: prefix) { _ = try keys.open(bytes.dropFirst(prefix.count), aad: aad) }
  }
  func promoteAuthenticatedKey() throws { try keys.promoteAuthenticatedKey() }
}
