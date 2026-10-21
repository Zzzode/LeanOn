import Foundation
import CryptoKit

/// Settings migration authority. Secrets stay native; activation uses the existing multi-store transaction.
final class CompanionMigrationController {
  private let source: CompanionService, backup: BackupCoordinator, target: CompanionMigrationCollection
  private let journal: EncryptedAtomicFile, control: EncryptedAtomicFile
  private let actionLock = NSRecursiveLock(), controlLock = NSRecursiveLock()
  private var running = false, pauseRequested = false
  var changed: ((NSDictionary) -> Void)?
  private func withControl<T>(_ operation: () throws -> T) rethrows -> T {
    controlLock.lock(); defer { controlLock.unlock() }; return try operation()
  }
  init(source: CompanionService, backup: BackupCoordinator, target: CompanionMigrationCollection, journal: EncryptedAtomicFile, control: EncryptedAtomicFile) {
    self.source = source; self.backup = backup; self.target = target; self.journal = journal; self.control = control
  }
  private func read() throws -> [String: Any] {
    controlLock.lock(); defer { controlLock.unlock() }
    guard let bytes = try control.read() else { return ["phase": "idle"] }
    guard let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw CompanionError.persistence }
    return value
  }
  private func save(_ value: [String: Any]) throws { controlLock.lock(); defer { controlLock.unlock() }; try control.write(CompanionCrypto.json(value)); changed?(projection(value)) }
  private func projection(_ value: [String: Any]) -> NSDictionary {
    var result = [String: Any](); result["phase"] = value["phase"] ?? "idle"
    for field in ["sourceEndpoint", "targetEndpoint", "targetServiceId", "accountId", "accountName", "operationId", "previewToken", "errorCode"] { result[field] = value[field] ?? NSNull() }
    result["counts"] = value["counts"] ?? ["weights": 0, "water": 0, "exercises": 0, "meals": 0, "measurements": 0, "photos": 0]
    return ["migration": result]
  }
  func state() throws -> NSDictionary {
    controlLock.lock(); defer { controlLock.unlock() }
    var value = try read()
    let own = try source.storage.load()
    if value["phase"] as? String == "idle", let identity = own["identity"] as? [String: Any] {
      value["sourceEndpoint"] = own["endpoint"]; value["accountId"] = identity["accountId"]; value["accountName"] = identity["login"]
    }
    if let identity = own["identity"] as? [String: Any], identity["accountId"] as? String == value["accountId"] as? String,
      own["endpoint"] as? String == value["targetEndpoint"] as? String, ["activating", "paused", "publishing", "prepared"].contains(value["phase"] as? String ?? "") { value["phase"] = "active"; try save(value) }
    if own["endpoint"] as? String == value["sourceEndpoint"] as? String, value["phase"] as? String == "active" { value["phase"] = "rolled-back"; try save(value) }
    if !running, ["preparing", "restoring", "publishing", "activating", "pausing"].contains(value["phase"] as? String ?? "") { value["phase"] = "paused"; try save(value) }
    return projection(value)
  }
  private func serviceIdentity(_ endpoint: String) throws -> String {
    guard CompanionService.validEndpoint(endpoint) else { throw CompanionError.invalidRequest }
    let value = try CompanionHTTP().request(endpoint: URL(string: endpoint)!, method: "GET", path: "/v2/service", body: nil, token: nil)
    guard value["protocol"] as? Int == 2, let id = value["serviceId"] as? String, id.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw CompanionError.invalidResponse }
    return id
  }
  func preview(endpoint: String, password: String) throws -> NSDictionary {
    actionLock.lock(); defer { actionLock.unlock() }
    guard !running else { throw CompanionError.invalidRequest }
    let existing = try read(); guard ["idle", "review", "rolled-back"].contains(existing["phase"] as? String ?? "idle") else { throw CompanionError.invalidRequest }
    _ = try source.execute("getState")
    let own = try source.storage.load()
    guard let account = own["identity"] as? [String: Any], own["deviceAuthorized"] as? Bool == true,
      own["localDataAccountId"] as? String == account["accountId"] as? String,
      own["pendingAccountDeletion"] is NSNull, let oldEndpoint = own["endpoint"] as? String, endpoint != oldEndpoint else { throw CompanionError.notAuthorized }
    let service = try serviceIdentity(endpoint), http = CompanionHTTP(), url = URL(string: endpoint)!
    let session = try http.request(endpoint: url, method: "POST", path: "/v1/sessions", body: ["login": account["login"]!, "password": password, "deviceId": own["deviceId"]!, "deviceProof": own["deviceProof"]!], token: nil)
    guard let token = session["token"] as? String else { throw CompanionError.invalidResponse }
    defer { _ = try? http.request(endpoint: url, method: "DELETE", path: "/v1/sessions/current", body: nil, token: token) }
    let me = try http.request(endpoint: url, method: "GET", path: "/v1/me", body: nil, token: token)
    guard session["deviceAuthorized"] as? Bool == true, session["accountId"] as? String == account["accountId"] as? String,
      session["vaultId"] as? String == account["vaultId"] as? String, let migration = me["migration"] as? [String: Any],
      let operation = migration["id"] as? String, CompanionCrypto.validId(operation) else { throw CompanionError.notAuthorized }
    let payload = try backup.exportPayload(), records = payload["records"] as! NSDictionary, personal = payload["personal"] as! NSDictionary
    let counts: [String: Int] = ["weights": (records["weights"] as! [Any]).count, "water": (records["water"] as! [Any]).count, "exercises": (records["exercises"] as! [Any]).count,
      "meals": (records["intakeEntries"] as! [Any]).count + (records["legacyIntake"] as! [Any]).count, "measurements": (personal["measurements"] as! [Any]).count, "photos": (personal["photos"] as! [Any]).count]
    let value: [String: Any] = ["phase": "review", "sourceEndpoint": oldEndpoint, "targetEndpoint": endpoint, "targetServiceId": service, "accountId": account["accountId"]!, "accountName": account["login"]!, "operationId": operation,
      "previewToken": UUID().uuidString, "expiresAt": Date().timeIntervalSince1970 + 600, "recordsRevision": records["revision"]!, "personalRevision": personal["revision"]!, "counts": counts]
    controlLock.lock(); defer { controlLock.unlock() }; try save(value); return projection(value)
  }
  func start(token: String, password: String, backupPassword: String, consent: Bool) throws -> NSDictionary {
    actionLock.lock(); defer { actionLock.unlock() }
    _ = try state()
    var value = try read()
    if consent, value["phase"] as? String == "active" { return projection(value) }
    guard consent, value["phase"] as? String == "review", value["previewToken"] as? String == token,
      (value["expiresAt"] as? Double ?? 0) > Date().timeIntervalSince1970 else { throw CompanionError.invalidRequest }
    let payload = try backup.exportPayload()
    guard (payload["records"] as! NSDictionary)["revision"] as? Int == value["recordsRevision"] as? Int,
      (payload["personal"] as! NSDictionary)["revision"] as? Int == value["personalRevision"] as? Int else { throw RecordTransactionError.conflict("Migration preview changed") }
    guard try serviceIdentity(value["targetEndpoint"] as! String) == value["targetServiceId"] as? String else { throw CompanionError.notAuthorized }
    defer { controlLock.lock(); running = false; controlLock.unlock() }
    try withControl { running = true; pauseRequested = false; value["phase"] = "preparing"; try save(value) }
    do {
      try CompanionCloudflareMigration.prepare(source: source, store: source.storage, backup: backup, journal: journal,
        target: value["targetEndpoint"] as! String, operation: value["operationId"] as! String, backupPassword: backupPassword)
      let paused = try withControl { value["phase"] = pauseRequested ? "paused" : "prepared"; value["previewToken"] = NSNull(); try save(value); return pauseRequested }
      if paused { return projection(value) }
      return try publish(password: password, backupPassword: backupPassword, consent: consent)
    } catch {
      value["phase"] = "paused"; value["errorCode"] = (error as? CompanionError)?.code ?? "unavailable"; try save(value); throw error
    }
  }

  func publish(password: String, backupPassword: String, consent: Bool) throws -> NSDictionary {
    actionLock.lock(); defer { actionLock.unlock() }
    var value = try read()
    if value["phase"] as? String == "active" { return projection(value) }
    guard consent, ["prepared", "paused"].contains(value["phase"] as? String ?? "") else { throw CompanionError.invalidRequest }
    let own = try source.storage.load()
    guard own["endpoint"] as? String == value["sourceEndpoint"] as? String,
      (own["identity"] as? [String: Any])?["accountId"] as? String == value["accountId"] as? String, own["pendingAccountDeletion"] is NSNull,
      try serviceIdentity(value["targetEndpoint"] as! String) == value["targetServiceId"] as? String else { throw CompanionError.notAuthorized }
    defer { controlLock.lock(); running = false; controlLock.unlock() }
    try withControl { if !running { pauseRequested = false }; running = true; value["phase"] = "publishing"; value["errorCode"] = NSNull(); try save(value) }
    do {
      if try journal.read() == nil {
        try CompanionCloudflareMigration.prepare(source: source, store: source.storage, backup: backup, journal: journal,
          target: value["targetEndpoint"] as! String, operation: value["operationId"] as! String, backupPassword: backupPassword)
      }
      try CompanionCloudflareMigration.publish(journal: journal, targetStore: target.store, targetBackup: target.backup, targetService: { self.target.service }, password: password, backupPassword: backupPassword)
      controlLock.lock(); let paused = pauseRequested; controlLock.unlock()
      if paused { value["phase"] = "paused"; try save(value); return projection(value) }
      _ = try target.service.execute("sync")
      guard try serviceIdentity(value["targetEndpoint"] as! String) == value["targetServiceId"] as? String else { throw CompanionError.notAuthorized }
      controlLock.lock(); defer { controlLock.unlock() }
      if pauseRequested { value["phase"] = "paused"; try save(value); return projection(value) }
      value["phase"] = "activating"; try save(value)
      let local = try backup.exportPayload() as! [String: Any], remote = try target.backup.exportPayload() as! [String: Any]
      var sourceState = try source.storage.load(), adopted = try target.store.load()
      let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
      let localDevice = sourceState["deviceId"] as! String, remoteDevice = adopted["deviceId"] as! String
      let localWire = try CompanionVault.export(local, state: &sourceState, clock: CompanionMergeClock(updatedAt: timestamp, deviceId: localDevice, changeId: UUID().uuidString))
      let remoteWire = try CompanionVault.export(remote, state: &adopted, clock: CompanionMergeClock(updatedAt: timestamp, deviceId: remoteDevice, changeId: UUID().uuidString))
      let merged = try CompanionVault.merge(local: localWire, remote: remoteWire), payload = merged["payload"] as! [String: Any]
      adopted["entityClocks"] = merged["clocks"]; adopted["lastExportValues"] = try CompanionVault.entities(payload); adopted["customFoodTombstones"] = (merged["tombstones"] as! [String: Any])["customFoods"]
      try backup.commitPayload(payload as NSDictionary, expectedRecordsRevision: (local["records"] as! NSDictionary)["revision"] as! Int,
        expectedPersonalRevision: (local["personal"] as! NSDictionary)["revision"] as! Int, companionFile: source.storage.file, companionState: adopted as NSDictionary)
      value["phase"] = "active"; try save(value); return projection(value)
    } catch {
      controlLock.lock(); defer { controlLock.unlock() }; value["phase"] = "paused"; value["errorCode"] = (error as? CompanionError)?.code ?? (error as? RecordTransactionError)?.code ?? "unavailable"; try save(value); throw error
    }
  }
  func pause() throws -> NSDictionary {
    controlLock.lock(); defer { controlLock.unlock() }; var value = try read()
    if running { pauseRequested = true; value["phase"] = "pausing" }
    else if ["review", "prepared", "paused"].contains(value["phase"] as? String ?? "") { value["phase"] = value["phase"] as? String == "review" ? "idle" : "paused"; value["previewToken"] = NSNull() }
    try save(value); return projection(value)
  }
  func rollback(consent: Bool) throws -> NSDictionary {
    actionLock.lock(); defer { actionLock.unlock() }
    guard consent, !running else { throw CompanionError.invalidRequest }
    var value = try read(); if value["phase"] as? String == "rolled-back" { return projection(value) }
    guard value["phase"] as? String == "active", let bytes = try journal.read(),
      let saved = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let old = saved["sourceState"] as? [String: Any] else { throw CompanionError.invalidRequest }
    let current = try source.storage.load()
    guard current["endpoint"] as? String == value["targetEndpoint"] as? String,
      (current["identity"] as? [String: Any])?["accountId"] as? String == value["accountId"] as? String,
      current["pendingAccountDeletion"] is NSNull else { throw CompanionError.notAuthorized }
    try source.storage.write(old)
    value["phase"] = "rolled-back"; value["errorCode"] = NSNull(); try save(value); return projection(value)
  }
}
