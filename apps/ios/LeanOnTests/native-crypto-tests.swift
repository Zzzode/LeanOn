import XCTest
import CryptoKit
@testable import LeanOn

final class NativeCryptoTests: XCTestCase {
  func testExactUTF8PasswordDerivationMatchesIndependentWorkedFixture() throws {
    let key = try NativeCrypto.derive(password: "LeanOn fixture 密码", salt: Data(0..<16))
    let hex = key.withUnsafeBytes { $0.map { String(format: "%02x", $0) }.joined() }
    XCTAssertEqual(hex, "f46b45614b83e7fbce6a7a5aae4812dbbc0b83ba8072b3d62b88a239c26fec6b")
    let decomposed = try NativeCrypto.derive(password: "fixture-健康🔑e\u{0301}-pass", salt: Data(0..<16))
    XCTAssertEqual(decomposed.withUnsafeBytes { $0.map { String(format: "%02x", $0) }.joined() },
      "b04e161e38244b8a3e1249d0e2fa1ceb980bc1e1722dd0ae16836a870fdac870")
  }

  func testEncryptedAtomicBytesAreAuthenticatedAndNeverPlaintextOnDisk() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-crypto-" + UUID().uuidString)
    defer { if FileManager.default.fileExists(atPath: dir.path) { try? FileManager.default.removeItem(at: dir) } }
    let keys = try MemoryDataKey()
    let file = EncryptedAtomicFile(url: dir.appendingPathComponent("private.enc"), keys: keys, context: "personal-v1")
    XCTAssertNil(try file.read())
    let plain = Data("synthetic-not-health-record".utf8)
    try file.write(plain)
    let encrypted = try Data(contentsOf: file.url)
    XCTAssertNil(encrypted.range(of: plain))
    XCTAssertEqual(try file.read(), plain)
    var changed = encrypted; changed[15] ^= 1
    try changed.write(to: file.url)
    XCTAssertThrowsError(try file.read())
    XCTAssertEqual(try Data(contentsOf: file.url), changed)
  }

  func testContextAndWrongKeysFailInsteadOfReturningEmptyData() throws {
    let key = SymmetricKey(size: .bits256), plain = Data("synthetic fixture".utf8)
    let encrypted = try NativeCrypto.seal(plain, key: key, aad: Data("personal-v1".utf8))
    XCTAssertThrowsError(try NativeCrypto.open(encrypted, key: key, aad: Data("photos-v1".utf8)))
    XCTAssertThrowsError(try NativeCrypto.open(encrypted, key: SymmetricKey(size: .bits256), aad: Data("personal-v1".utf8)))
  }

  func testPortableBackupRoundTripWrongPasswordTamperAndKDFValidation() throws {
    let plain = Data("{\"formatVersion\":1,\"synthetic\":true}".utf8)
    let encoded = try BackupCodec.encode(plain, password: "LeanOn fixture 密码", salt: Data(0..<16), nonce: Data(0..<12))
    XCTAssertNil(encoded.range(of: Data("synthetic".utf8)))
    XCTAssertEqual(try BackupCodec.decode(encoded, password: "LeanOn fixture 密码"), plain)
    XCTAssertThrowsError(try BackupCodec.decode(encoded, password: "wrong password!"))
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    var tampered = object; tampered["iterations"] = 1
    XCTAssertThrowsError(try BackupCodec.decode(JSONSerialization.data(withJSONObject: tampered), password: "LeanOn fixture 密码"))
    tampered = object
    var cipher = try XCTUnwrap(Data(base64Encoded: object["ciphertext"] as! String)); cipher[0] ^= 1
    tampered["ciphertext"] = cipher.base64EncodedString()
    XCTAssertThrowsError(try BackupCodec.decode(JSONSerialization.data(withJSONObject: tampered), password: "LeanOn fixture 密码"))
  }

  func testQAKeychainKeyIsLazyAndRemovedAfterIsolatedTest() throws {
    let keys = KeychainDataKey(service: "com.zzzode.leanon.uiqa.crypto-test-" + UUID().uuidString, account: "fixture")
    defer { try? keys.removeTestKey() }
    XCTAssertThrowsError(try keys.key(create: false))
    let first = try keys.key(create: true).withUnsafeBytes { Data($0) }
    XCTAssertEqual(try keys.key(create: false).withUnsafeBytes { Data($0) }, first)
    try keys.removeTestKey()
    XCTAssertThrowsError(try keys.key(create: false))
  }

  func testMissingEstablishedKeyNeverReplacesExistingCiphertext() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-missing-key-" + UUID().uuidString)
    defer { if FileManager.default.fileExists(atPath: dir.path) { try? FileManager.default.removeItem(at: dir) } }
    let keys = KeychainDataKey(service: "com.zzzode.leanon.uiqa.missing-test-" + UUID().uuidString, account: "fixture")
    defer { try? keys.removeTestKey() }
    let file = EncryptedAtomicFile(url: dir.appendingPathComponent("personal.enc"), keys: keys, context: "fixture-v1")
    try file.write(Data("synthetic original".utf8)); let before = try Data(contentsOf: file.url)
    try keys.removeTestKey()
    XCTAssertThrowsError(try file.read())
    XCTAssertThrowsError(try file.write(Data("replacement".utf8)))
    XCTAssertEqual(try Data(contentsOf: file.url), before)
  }

  func testLegacyRecordsReadIsBytePreservingAndExplicitWriteMigratesEncryptedSchemaTwo() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-record-encryption-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let url = dir.appendingPathComponent("records.json")
    let original = try JSONSerialization.data(withJSONObject: RecordSchema.empty())
    try original.write(to: url)
    let keys = try MemoryDataKey(), store = RecordsStore(recordsURL: url, keys: keys)
    XCTAssertEqual(try store.loadSnapshot()["schemaVersion"] as? Int, 2)
    XCTAssertEqual(try Data(contentsOf: url), original)
    _ = try store.addWeight(date: "2026-10-03", weightKg: 80)
    let persisted = try Data(contentsOf: url)
    XCTAssertTrue(persisted.starts(with: EncryptedRecordsFile.prefix))
    XCTAssertThrowsError(try JSONSerialization.jsonObject(with: persisted))
    XCTAssertEqual((try RecordsStore(recordsURL: url, keys: keys).loadSnapshot()["weights"] as? [NSDictionary])?.first?["weightKg"] as? Int, 80)
  }
}
