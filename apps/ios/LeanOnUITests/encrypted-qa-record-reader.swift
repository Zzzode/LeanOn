import Foundation
import CryptoKit
import Security

/// Reads only disposable .uiqa fixture bytes using the simulator QA access group.
/// This helper is compiled into the test runner, never the production app.
enum EncryptedQARecordReader {
  static func bytes(_ url: URL) throws -> Data {
    guard url.path.hasPrefix("/tmp/leanon-") else { throw CocoaError(.fileReadNoPermission) }
    let data = try Data(contentsOf: url), prefix = Data("LeanOn records encrypted v1\n".utf8)
    guard data.starts(with: prefix) else { return data }
    let account = "records-" + SHA256.hash(data: Data(url.standardizedFileURL.path.utf8)).map { String(format: "%02x", $0) }.joined()
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.zzzode.leanon.uiqa.encrypted-data", kSecAttrAccount as String: account,
      kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var value: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess, let raw = value as? Data, raw.count == 32 else {
      throw CocoaError(.fileReadNoPermission)
    }
    return try AES.GCM.open(AES.GCM.SealedBox(combined: data.dropFirst(prefix.count)), using: SymmetricKey(data: raw), authenticating: Data("LeanOn records v2".utf8))
  }
  static func snapshot(_ url: URL) throws -> NSDictionary {
    guard let value = try JSONSerialization.jsonObject(with: bytes(url)) as? NSDictionary else { throw CocoaError(.fileReadCorruptFile) }
    return value
  }
}
