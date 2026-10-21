import XCTest
import CryptoKit
import Security
@testable import LeanOn

final class StoreKeyMigrationTests: XCTestCase {
  private struct Fixture {
    let service: String; let access: KeychainStoreAccess; let root: URL
    init() throws {
      service = "com.zzzode.leanon.uiqa.migration-" + UUID().uuidString
      access = KeychainStoreAccess(service: service)
      root = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-key-migration-" + UUID().uuidString)
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    func clean() {
      for account in (try? access.accounts()) ?? [] { try? access.remove(account) }
      try? FileManager.default.removeItem(at: root)
    }
    func legacy(_ role: StoreKeyRole, _ digit: String = "a") -> String { role.legacyPrefix + String(repeating: digit, count: 64) }
    func cipher(_ role: StoreKeyRole, account: String? = nil) throws -> (Data, Data) {
      let key = try KeychainDataKey(service: service, account: account ?? legacy(role)).key(create: true)
      return (try NativeCrypto.seal(Data("PUBLIC synthetic store".utf8), key: key, aad: Data(role.rawValue.utf8)), key.withUnsafeBytes { Data($0) })
    }
    func provider(_ role: StoreKeyRole, _ url: URL, prefix: Data? = nil) -> RelocatableStoreKey {
      RelocatableStoreKey(role: role, url: url, context: role.rawValue, prefix: prefix, service: service)
    }
  }

  func testActualQAKeychainAllRolesRelocateAndAdoptIdenticalKeysWithoutChangingCiphertext() throws {
    let f = try Fixture(); defer { f.clean() }
    let old = f.root.appendingPathComponent("old-container"), moved = f.root.appendingPathComponent("new-container")
    try FileManager.default.createDirectory(at: old, withIntermediateDirectories: true)
    var expected: [StoreKeyRole: Data] = [:]
    for role in StoreKeyRole.allCases {
      let (cipher, key) = try f.cipher(role); expected[role] = key
      try ProtectedAtomicBytes.write(cipher, to: old.appendingPathComponent(role.rawValue))
    }
    try FileManager.default.moveItem(at: old, to: moved)
    XCTAssertFalse(FileManager.default.fileExists(atPath: old.path))
    for role in StoreKeyRole.allCases {
      let url = moved.appendingPathComponent(role.rawValue), bytes = try Data(contentsOf: url)
      let keys = f.provider(role, url)
      try keys.validateEstablished()
      XCTAssertNil(try f.access.read(role.stableAccount), "Preflight must not provision aliases")
      try keys.promoteAuthenticatedKey()
      XCTAssertEqual(try f.access.read(role.stableAccount), expected[role])
      XCTAssertEqual(try f.access.read(f.legacy(role)), expected[role])
      XCTAssertEqual(try Data(contentsOf: url), bytes)
      let reopened = f.provider(role, url)
      XCTAssertEqual(try reopened.open(bytes, aad: Data(role.rawValue.utf8)), Data("PUBLIC synthetic store".utf8))
    }
  }

  func testActualAmbiguousAuthenticatedAliasesFailClosedWithoutChoosingOrProvisioning() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, key) = try f.cipher(.personal)
    try f.access.installIfAbsent(f.legacy(.personal, "b"), bytes: key)
    let url = f.root.appendingPathComponent("personal"); try ProtectedAtomicBytes.write(cipher, to: url)
    let provider = f.provider(.personal, url)
    XCTAssertThrowsError(try provider.validateEstablished())
    try provider.promoteAuthenticatedKey()
    XCTAssertNil(try f.access.read(StoreKeyRole.personal.stableAccount))
    XCTAssertEqual(try f.access.read(f.legacy(.personal)), key)
    XCTAssertEqual(try f.access.read(f.legacy(.personal, "b")), key)
    XCTAssertEqual(try Data(contentsOf: url), cipher)
  }

  func testActualStableCollisionNeverFallsBackOrOverwritesExistingAlias() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, oldKey) = try f.cipher(.companion), different = try NativeCrypto.random(32)
    try f.access.installIfAbsent(StoreKeyRole.companion.stableAccount, bytes: different)
    let url = f.root.appendingPathComponent("companion"); try ProtectedAtomicBytes.write(cipher, to: url)
    let provider = f.provider(.companion, url)
    XCTAssertThrowsError(try provider.validateEstablished())
    XCTAssertThrowsError(try provider.key(create: true))
    XCTAssertEqual(try f.access.read(StoreKeyRole.companion.stableAccount), different)
    XCTAssertEqual(try f.access.read(f.legacy(.companion)), oldKey)
    XCTAssertEqual(try Data(contentsOf: url), cipher)
  }

  func testActualMissingOrCorruptEstablishedKeyNeverCreatesReplacementAndPreservesBytes() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, _) = try f.cipher(.records)
    let url = f.root.appendingPathComponent("records"); try ProtectedAtomicBytes.write(cipher, to: url)
    try f.access.remove(f.legacy(.records))
    let provider = f.provider(.records, url)
    XCTAssertThrowsError(try provider.validateEstablished()); XCTAssertThrowsError(try provider.key(create: true))
    XCTAssertTrue(try f.access.accounts().isEmpty); XCTAssertEqual(try Data(contentsOf: url), cipher)
    let (valid, _) = try f.cipher(.records)
    var bad = valid; bad[15] ^= 1; try ProtectedAtomicBytes.write(bad, to: url)
    XCTAssertThrowsError(try provider.validateEstablished())
    try provider.promoteAuthenticatedKey()
    XCTAssertNil(try f.access.read(StoreKeyRole.records.stableAccount))
    XCTAssertEqual(try Data(contentsOf: url), bad)
  }

  func testActualRoleAndServiceBoundariesNeverUseAnOtherwiseMatchingKey() throws {
    let f = try Fixture(); defer { f.clean() }
    let key = try KeychainDataKey(service: f.service, account: f.legacy(.personal)).key(create: true)
    let cipher = try NativeCrypto.seal(Data("PUBLIC".utf8), key: key, aad: Data("records".utf8))
    let url = f.root.appendingPathComponent("records"); try ProtectedAtomicBytes.write(cipher, to: url)
    XCTAssertThrowsError(try f.provider(.records, url).validateEstablished())
    XCTAssertNil(try f.access.read(StoreKeyRole.records.stableAccount))
    let other = "com.zzzode.leanon.uiqa.other-" + UUID().uuidString
    let provider = RelocatableStoreKey(role: .personal, url: url, context: "records", service: other)
    XCTAssertThrowsError(try provider.validateEstablished())
    XCTAssertTrue(try KeychainStoreAccess(service: other).accounts().isEmpty)
    XCTAssertEqual(try Data(contentsOf: url), cipher)
  }

  func testActualReadMissingOrHistoricalPlaintextIsLazyAndExplicitWriteCreatesStableKey() throws {
    let f = try Fixture(); defer { f.clean() }
    let url = f.root.appendingPathComponent("records"), prefix = Data("PUBLIC encrypted v1\n".utf8)
    let keys = f.provider(.records, url, prefix: prefix)
    try keys.validateEstablished(); try keys.promoteAuthenticatedKey()
    XCTAssertTrue(try f.access.accounts().isEmpty)
    let legacy = Data("{\"PUBLIC\":true}".utf8); try ProtectedAtomicBytes.write(legacy, to: url)
    try keys.validateEstablished(); try keys.promoteAuthenticatedKey()
    XCTAssertTrue(try f.access.accounts().isEmpty); XCTAssertEqual(try Data(contentsOf: url), legacy)
    let key = try keys.key(create: true)
    try ProtectedAtomicBytes.write(prefix + NativeCrypto.seal(legacy, key: key, aad: Data("records".utf8)), to: url)
    XCTAssertNotNil(try f.access.read(StoreKeyRole.records.stableAccount))
    XCTAssertNoThrow(try f.provider(.records, url, prefix: prefix).validateEstablished())
  }

  func testActualCleanupAfterObjectReopenRemovesMatchedAliasesOnlyAndKeepsNewDataOnConflict() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, key) = try f.cipher(.healthLedger)
    let url = f.root.appendingPathComponent("ledger"); try ProtectedAtomicBytes.write(cipher, to: url)
    let keys = f.provider(.healthLedger, url); try keys.validateEstablished(); try keys.promoteAuthenticatedKey()
    let unrelated = try NativeCrypto.random(32)
    try f.access.installIfAbsent(f.legacy(.healthLedger, "c"), bytes: unrelated)
    XCTAssertThrowsError(try keys.remove())
    XCTAssertEqual(try Data(contentsOf: url), cipher); XCTAssertEqual(try f.access.read(StoreKeyRole.healthLedger.stableAccount), key)
    try FileManager.default.removeItem(at: url)
    try f.provider(.healthLedger, url).remove()
    XCTAssertNil(try f.access.read(StoreKeyRole.healthLedger.stableAccount))
    XCTAssertNil(try f.access.read(f.legacy(.healthLedger)))
    XCTAssertEqual(try f.access.read(f.legacy(.healthLedger, "c")), unrelated)
  }

  func testActualAliasCopyRacePreservesCipherAndBothExistingKeys() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, key) = try f.cipher(.journal), url = f.root.appendingPathComponent("journal")
    try ProtectedAtomicBytes.write(cipher, to: url)
    let keys = f.provider(.journal, url); try keys.validateEstablished()
    let competing = try NativeCrypto.random(32)
    try f.access.installIfAbsent(StoreKeyRole.journal.stableAccount, bytes: competing)
    XCTAssertThrowsError(try keys.promoteAuthenticatedKey())
    XCTAssertEqual(try f.access.read(f.legacy(.journal)), key)
    XCTAssertEqual(try f.access.read(StoreKeyRole.journal.stableAccount), competing)
    XCTAssertEqual(try Data(contentsOf: url), cipher)
  }

  func testActualDifferentCurrentAndBeforeImageKeysFailBeforePromotion() throws {
    let f = try Fixture(); defer { f.clean() }
    let (current, keyA) = try f.cipher(.personal)
    let (before, keyB) = try f.cipher(.personal, account: f.legacy(.personal, "b"))
    let url = f.root.appendingPathComponent("personal"), oldURL = f.root.appendingPathComponent("before-image")
    try ProtectedAtomicBytes.write(current, to: url); try ProtectedAtomicBytes.write(before, to: oldURL)
    let keys = f.provider(.personal, url)
    try keys.validateEstablished()
    XCTAssertThrowsError(try keys.open(before, aad: Data("personal".utf8)))
    try keys.promoteAuthenticatedKey()
    XCTAssertNil(try f.access.read(StoreKeyRole.personal.stableAccount))
    XCTAssertEqual(try f.access.read(f.legacy(.personal)), keyA)
    XCTAssertEqual(try f.access.read(f.legacy(.personal, "b")), keyB)
    XCTAssertEqual(try Data(contentsOf: url), current); XCTAssertEqual(try Data(contentsOf: oldURL), before)
  }

  func testActualOldDeletionMarkerWithoutCiphertextRetainsUnverifiedLegacyKeysAndFailsCleanup() throws {
    let f = try Fixture(); defer { f.clean() }
    let (_, key) = try f.cipher(.records), url = f.root.appendingPathComponent("already-deleted")
    let keys = f.provider(.records, url)
    try keys.validateEstablished(); try keys.promoteAuthenticatedKey()
    XCTAssertThrowsError(try keys.remove())
    XCTAssertNil(try f.access.read(StoreKeyRole.records.stableAccount))
    XCTAssertEqual(try f.access.read(f.legacy(.records)), key)
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
  }

  func testActualSameProviderCanCreateAndReadNewStoreAfterSuccessfulExplicitDeletion() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, oldKey) = try f.cipher(.personal), url = f.root.appendingPathComponent("personal")
    try ProtectedAtomicBytes.write(cipher, to: url)
    let keys = f.provider(.personal, url)
    try keys.validateEstablished(); try keys.promoteAuthenticatedKey()
    try FileManager.default.removeItem(at: url); try keys.remove()
    let newKey = try keys.key(create: true)
    XCTAssertNotEqual(newKey.withUnsafeBytes { Data($0) }, oldKey)
    let plaintext = Data("PUBLIC new explicit store".utf8)
    let newCipher = try NativeCrypto.seal(plaintext, key: newKey, aad: Data("personal".utf8))
    try ProtectedAtomicBytes.write(newCipher, to: url)
    XCTAssertEqual(try keys.open(newCipher, aad: Data("personal".utf8)), plaintext)
    XCTAssertNil(try f.access.read(f.legacy(.personal)))
  }

  func testActualReadonlyCompletionRejectsOrphanStableAndLegacyWithoutRemovingOrProvisioning() throws {
    let f = try Fixture(); defer { f.clean() }
    let (_, oldKey) = try f.cipher(.records), url = f.root.appendingPathComponent("already-deleted")
    let keys = f.provider(.records, url)
    XCTAssertThrowsError(try keys.validateDeletionCompletion())
    XCTAssertNil(try f.access.read(StoreKeyRole.records.stableAccount))
    XCTAssertEqual(try f.access.read(f.legacy(.records)), oldKey)
    try f.access.remove(f.legacy(.records))
    try f.access.installIfAbsent(StoreKeyRole.records.stableAccount, bytes: oldKey)
    XCTAssertThrowsError(try keys.validateDeletionCompletion())
    XCTAssertEqual(try f.access.read(StoreKeyRole.records.stableAccount), oldKey)
    try f.access.remove(StoreKeyRole.records.stableAccount)
    XCTAssertNoThrow(try keys.validateDeletionCompletion())
    XCTAssertTrue(try f.access.accounts().isEmpty)
  }

  func testActualReadonlyCompletionPreservesNewGenerationWithoutDecryptOrKeyAccess() throws {
    let f = try Fixture(); defer { f.clean() }
    let (_, oldKey) = try f.cipher(.healthLedger), url = f.root.appendingPathComponent("new-ledger")
    let newBytes = Data("PUBLIC new generation deliberately not decryptable".utf8)
    try ProtectedAtomicBytes.write(newBytes, to: url)
    let access = FaultAccess(base: f.access); access.locked = true
    let keys = RelocatableStoreKey(role: .healthLedger, url: url, context: "health-ledger", access: access)
    XCTAssertNoThrow(try keys.validateDeletionCompletion())
    XCTAssertEqual(try Data(contentsOf: url), newBytes)
    XCTAssertEqual(try f.access.read(f.legacy(.healthLedger)), oldKey)
    XCTAssertNil(try f.access.read(StoreKeyRole.healthLedger.stableAccount))
  }

  func testActualTooManyRoleCandidatesFailClosedWithoutProvisioning() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, _) = try f.cipher(.personal)
    for n in 1...16 {
      let suffix = String(format: "%064x", n)
      try f.access.installIfAbsent(StoreKeyRole.personal.legacyPrefix + suffix, bytes: NativeCrypto.random(32))
    }
    let url = f.root.appendingPathComponent("personal"); try ProtectedAtomicBytes.write(cipher, to: url)
    XCTAssertThrowsError(try f.provider(.personal, url).validateEstablished())
    XCTAssertNil(try f.access.read(StoreKeyRole.personal.stableAccount)); XCTAssertEqual(try Data(contentsOf: url), cipher)
  }

  func testInjectedLockedKeychainAndFailedCopyPreserveBytesAndLegacyKey() throws {
    let f = try Fixture(); defer { f.clean() }
    let (cipher, key) = try f.cipher(.companion), url = f.root.appendingPathComponent("companion")
    try ProtectedAtomicBytes.write(cipher, to: url)
    let access = FaultAccess(base: f.access)
    let keys = RelocatableStoreKey(role: .companion, url: url, context: "companion", access: access)
    access.locked = true; XCTAssertThrowsError(try keys.validateEstablished())
    access.locked = false; try keys.validateEstablished(); access.failCopy = true
    XCTAssertThrowsError(try keys.promoteAuthenticatedKey())
    XCTAssertNil(try f.access.read(StoreKeyRole.companion.stableAccount))
    XCTAssertEqual(try f.access.read(f.legacy(.companion)), key); XCTAssertEqual(try Data(contentsOf: url), cipher)
  }
  private final class FaultAccess: StoreKeychainAccess {
    let base: StoreKeychainAccess; var locked = false; var failCopy = false
    init(base: StoreKeychainAccess) { self.base = base }
    func read(_ account: String) throws -> Data? {
      if locked { throw NativeCryptoError.keychainStatus(errSecInteractionNotAllowed) }; return try base.read(account)
    }
    func accounts() throws -> [String] { try base.accounts() }
    func installIfAbsent(_ account: String, bytes: Data) throws {
      if failCopy { throw NativeCryptoError.keychainStatus(errSecAuthFailed) }; try base.installIfAbsent(account, bytes: bytes)
    }
    func remove(_ account: String) throws { try base.remove(account) }
  }
}
