import Foundation
import CryptoKit

/// Explicit operator-assisted cutover. Keep the source collection and relay intact;
/// use a separate target collection and existing password-encrypted backup format.
/// This encrypted native journal is not a portable companion-key export.
enum CompanionCloudflareMigration {
  static func prepare(source: CompanionService, store: CompanionStateFile, backup: BackupCoordinator,
                      journal: EncryptedAtomicFile, target: String, operation: String, backupPassword: String) throws {
    store.lock.lock(); defer { store.lock.unlock() }
    guard CompanionService.validEndpoint(target), CompanionCrypto.validId(operation) else { throw CompanionError.invalidRequest }
    if let bytes = try journal.read() {
      let saved = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
      guard saved["operation"] as? String == operation, saved["target"] as? String == target else { throw CompanionError.invalidRequest }; return
    }
    _ = try source.execute("sync")
    let old = try store.load()
    guard let identity = old["identity"] as? [String: Any], old["deviceAuthorized"] as? Bool == true,
      old["localDataAccountId"] as? String == identity["accountId"] as? String,
      old["endpoint"] as? String != target, old["pendingAccountDeletion"] is NSNull else { throw CompanionError.notAuthorized }
    let payload = try backup.exportPayload()
    guard (payload["photos"] as! [NSDictionary]).count <= 64 else { throw CompanionError.capacity }
    let envelope = try backup.exportEncrypted(password: backupPassword)
    let account = identity["accountId"] as! String, vault = identity["vaultId"] as! String
    let oldRealm = SHA256.hash(data: Data((old["endpoint"] as! String).utf8)).map { String(format: "%02x", $0) }.joined()
    let newRealm = SHA256.hash(data: Data(target.utf8)).map { String(format: "%02x", $0) }.joined()
    let oldKey = (old["accountKeys"] as! [String: [String: Any]])[oldRealm + ":" + account]!
    var seed = CompanionStateFile.empty()
    seed["endpoint"] = target; seed["deviceId"] = old["deviceId"]; seed["deviceProof"] = old["deviceProof"]
    func rotate(_ value: Any?, _ group: String) throws -> String {
      let key = try CompanionCrypto.base64(value, count: 32)
      return CompanionCrypto.hkdf(secret: key, id: operation + ":" + group, info: "leanon-cutover-key-v2").withUnsafeBytes { Data($0) }.base64EncodedString()
    }
    seed["accountKeys"] = [newRealm + ":" + account: ["vaultId": vault, "key": try rotate(oldKey["key"], vault)]]
    if let family = old["familyKey"] as? [String: Any], let group = family["groupId"] as? String {
      seed["familyKey"] = ["groupId": group, "accountId": account, "key": try rotate(family["key"], group)]
      let oldConsent = (old["selectedOutgoingCategories"] as! [String: Any])[oldRealm + ":" + account + ":" + group] ?? [String]()
      seed["selectedOutgoingCategories"] = [newRealm + ":" + account + ":" + group: oldConsent]
    }
    try journal.write(CompanionCrypto.json(["version": 1, "operation": operation, "target": target, "phase": "prepared", "sourceState": old,
      "seed": seed, "backup": envelope.base64EncodedString()]))
  }
  static func publish(journal: EncryptedAtomicFile, targetStore: CompanionStateFile, targetBackup: BackupCoordinator,
                      targetService: () -> CompanionService, password: String, backupPassword: String) throws {
    targetStore.lock.lock(); defer { targetStore.lock.unlock() }
    guard let bytes = try journal.read(), var saved = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      let seed = saved["seed"] as? [String: Any], let old = saved["sourceState"] as? [String: Any],
      let original = old["identity"] as? [String: Any], let operation = saved["operation"] as? String,
      let target = saved["target"] as? String else { throw CompanionError.persistence }
    if saved["phase"] as? String == "complete" { return }
    if saved["phase"] as? String == "prepared" {
      try targetBackup.requireEmptyCutoverTarget(); saved["phase"] = "restoring"; try journal.write(CompanionCrypto.json(saved))
    }
    if saved["phase"] as? String == "restoring" {
      let envelope = try CompanionCrypto.base64(saved["backup"])
      let preview = try targetBackup.inspect(envelope, password: backupPassword)
      _ = try targetBackup.restore(token: preview["token"] as! String, recordsRevision: preview["expectedRecordsRevision"] as! Int, personalRevision: preview["expectedPersonalRevision"] as! Int)
      saved["phase"] = "restored"; try journal.write(CompanionCrypto.json(saved))
    }
    if try targetStore.file.read() == nil { try targetStore.write(seed) }
    let previous = try targetStore.load()
    let login = original["login"] as! String
    if (((previous["identity"] as? [String: Any])?["expiresAt"] as? NSNumber)?.doubleValue ?? 0) <= Date().timeIntervalSince1970 * 1000 {
      _ = try targetService().execute("login", params: ["login": login, "password": password])
    }
    var current = try targetStore.load()
    guard let session = current["identity"] as? [String: Any], session["accountId"] as? String == original["accountId"] as? String,
      session["vaultId"] as? String == original["vaultId"] as? String, current["deviceAuthorized"] as? Bool == true else { throw CompanionError.notAuthorized }
    let http = CompanionHTTP(), endpoint = URL(string: target)!, token = session["token"] as! String
    let me = try http.request(endpoint: endpoint, method: "GET", path: "/v1/me", body: nil, token: token)
    guard (me["migration"] as? [String: Any])?["id"] as? String == operation else { throw CompanionError.notAuthorized }
    current["familyKey"] = seed["familyKey"]; current["selectedOutgoingCategories"] = seed["selectedOutgoingCategories"]
    for field in ["outbox", "cursors", "acks"] { if let value = previous[field] { current[field] = value } }
    try targetStore.write(current)
    let service = targetService()
    if current["localDataAccountId"] as? String != session["accountId"] as? String {
      let payload = try targetBackup.exportPayload()
      _ = try service.execute("attachLocalData", params: ["expectedRecordsRevision": (payload["records"] as! NSDictionary)["revision"]!, "expectedPersonalRevision": (payload["personal"] as! NSDictionary)["revision"]!])
    }
    saved["phase"] = "publishing"; try journal.write(CompanionCrypto.json(saved))
    _ = try service.execute("sync")
    guard (try targetStore.load()["outbox"] as! [String: [[String: Any]]]).values.allSatisfy({ $0.isEmpty }) else { throw CompanionError.capacity }
    let count = ((try targetBackup.exportPayload())["photos"] as! [NSDictionary]).count
    let receipt = try http.request(endpoint: endpoint, method: "POST", path: "/v2/migrations/complete", body: ["id": operation, "photoCount": count], token: token)
    guard receipt["id"] as? String == operation, receipt["status"] as? String == "complete" else { throw CompanionError.invalidResponse }
    saved["phase"] = "complete"; try journal.write(CompanionCrypto.json(saved))
  }
}
