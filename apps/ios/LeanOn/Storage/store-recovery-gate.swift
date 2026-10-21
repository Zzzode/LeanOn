import Foundation

/// A failed multi-store rollback must stop reads and writes until journal recovery succeeds.
enum NativeStoreRecoveryGate {
  private static let lock = NSLock()
  private static var blocked = Set<String>()
  static func require(_ url: URL) throws {
    lock.lock(); defer { lock.unlock() }
    guard !blocked.contains(url.standardizedFileURL.path) else { throw RecordTransactionError.conflict("store recovery required") }
  }
  static func block(_ urls: [URL]) {
    lock.lock(); defer { lock.unlock() }; for url in urls { blocked.insert(url.standardizedFileURL.path) }
  }
  static func unblock(_ urls: [URL]) {
    lock.lock(); defer { lock.unlock() }; for url in urls { blocked.remove(url.standardizedFileURL.path) }
  }
}
