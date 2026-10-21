import Foundation
import CoreFoundation

struct CompanionMergeClock: Comparable {
  let updatedAt: Int64
  let deviceId: String
  let changeId: String
  var json: [String: Any] { ["updatedAt": updatedAt, "deviceId": deviceId, "id": changeId] }
  init(updatedAt: Int64, deviceId: String, changeId: String) { self.updatedAt = updatedAt; self.deviceId = deviceId; self.changeId = changeId }
  init(_ value: [String: Any]) throws {
    updatedAt = try CompanionStateFile.integer(value["updatedAt"])
    guard let device = value["deviceId"] as? String, CompanionCrypto.validId(device),
      let id = value["id"] as? String, CompanionCrypto.validId(id) else { throw CompanionError.invalidResponse }
    deviceId = device; changeId = id
  }
  static func < (a: Self, b: Self) -> Bool {
    if a.updatedAt != b.updatedAt { return a.updatedAt < b.updatedAt }
    if a.deviceId != b.deviceId { return a.deviceId < b.deviceId }
    return a.changeId < b.changeId
  }
}

/// The composition root provides real store transactions; no access to Documents or UI state.
struct CompanionDataAdapter {
  let exportPayload: () throws -> [String: Any]
  let attach: (_ recordsRevision: Int, _ personalRevision: Int, _ persist: (_ payload: [String: Any]) throws -> Void) throws -> Void
  let commitPayload: (_ payload: [String: Any], _ expectedRecordsRevision: Int, _ expectedPersonalRevision: Int, _ companionFile: EncryptedAtomicFile, _ companionState: [String: Any]) throws -> Void
  let hostData: () throws -> NSDictionary
  let personal: () throws -> NSDictionary
  let deleteLocalData: () throws -> Void
  let clearPreviews: (_ scope: String) throws -> Void
  var commitAccountDeletion: ((_ recordsRevision: Int, _ personalRevision: Int, _ companionFile: EncryptedAtomicFile, _ companionState: [String: Any]) throws -> Void)? = nil
  var finishAccountDeletionCleanup: (() throws -> Void)? = nil
  var accountDeletionLocalDataExists: (() throws -> Bool)? = nil
  var validateAccountDeletionCompletion: () throws -> Void = {}
}

/// A Keychain-held master key protects session, device proof, E2EE keys and pending writes.
/// A damaged established file is never replaced by a signed-out seed.
final class CompanionStateFile {
  let file: EncryptedAtomicFile
  let lock = NSRecursiveLock()
  private let persistBytes: (Data) throws -> Void
  init(file: EncryptedAtomicFile, write: ((Data) throws -> Void)? = nil) {
    self.file = file; persistBytes = write ?? { try file.write($0) }
  }
  static func empty() -> [String: Any] {
    ["pendingAccountDeletion": NSNull(), "pendingPreviewClear": NSNull(), "pendingLocalDeletion": false, "version": 1, "endpoint": NSNull(), "deviceId": "", "deviceProof": NSNull(), "identity": NSNull(),
      "deviceAuthorized": false, "accountKeys": [String: Any](), "familyKey": NSNull(), "groups": [String: Any](),
      "invitations": [[String: Any]](), "pendingInvites": [String: Any](), "outbox": [String: Any](),
      "cursors": [String: Any](), "acks": [String: Any](), "peerCategories": [String: Any](),
      "familyExports": [String: Any](), "messages": [[String: Any]](), "lastSyncAt": NSNull(), "localDataAccountId": NSNull(),
      "lastVault": NSNull(), "lastExportValues": [String: Any](), "entityClocks": [String: Any](),
      "pendingAccountKeys": [String: Any](), "revokedFamilies": [String: Any](), "selectedOutgoingCategories": [String: Any](), "localDataEndpoint": NSNull(), "lastKeyring": NSNull(), "customFoodTombstones": [String](), "latestTimestamp": 0, "bindingCreatedAt": NSNull()]
  }
  func load() throws -> [String: Any] {
    guard let bytes = try file.read() else { return Self.empty() }
    guard bytes.count <= 128 * 1024 * 1024,
      var state = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw CompanionError.persistence }
    // The new private cleanup receipt is additive; established version-1 stores stay readable.
    if state["pendingPreviewClear"] == nil { state["pendingPreviewClear"] = NSNull() }
    if state["pendingAccountDeletion"] == nil { state["pendingAccountDeletion"] = NSNull() }
    guard
      Set(state.keys) == Set(Self.empty().keys), try Self.integer(state["version"]) == 1,
      state["deviceId"] is String, state["deviceAuthorized"] is NSNumber, state["pendingLocalDeletion"] is Bool,
      (state["pendingPreviewClear"] is NSNull || ["partner", "all"].contains(state["pendingPreviewClear"] as? String ?? "")),
      ["accountKeys", "groups", "pendingInvites", "outbox", "cursors", "acks", "peerCategories", "lastExportValues", "entityClocks", "familyExports", "selectedOutgoingCategories", "revokedFamilies", "pendingAccountKeys"].allSatisfy({state[$0] is [String: Any]}),
      state["invitations"] is [[String: Any]], state["messages"] is [[String: Any]], state["customFoodTombstones"] is [String]
    else { throw CompanionError.persistence }
    if let identity = state["identity"] as? [String: Any] {
      guard let account = identity["accountId"] as? String, CompanionCrypto.validId(account),
        let token = identity["token"] as? String, !token.isEmpty,
        let login = identity["login"] as? String, !login.isEmpty,
        let vault = identity["vaultId"] as? String, CompanionCrypto.validId(vault) else { throw CompanionError.persistence }
      _ = try Self.integer(identity["expiresAt"])
    } else if !(state["identity"] is NSNull) { throw CompanionError.persistence }
    if !(state["deviceProof"] is NSNull) { _ = try CompanionCrypto.base64(state["deviceProof"], count: 32) }
    if !(state["pendingAccountDeletion"] is NSNull) { try Self.validateAccountDeletion(state["pendingAccountDeletion"]) }
    return state
  }
  static func validateAccountDeletion(_ value: Any?) throws {
    guard let intent = value as? [String: Any], Set(intent.keys) == Set(["version", "operationId", "proof", "endpoint", "accountId", "displayName", "login", "deleteLocalData", "expectedRecordsRevision", "expectedPersonalRevision", "phase", "localDataCleared"]),
      try integer(intent["version"]) == 1,
      let operation = intent["operationId"] as? String, UUID(uuidString: operation) != nil,
      let account = intent["accountId"] as? String, CompanionCrypto.validId(account),
      let endpoint = intent["endpoint"] as? String, CompanionService.validEndpoint(endpoint),
      let displayName = intent["displayName"] as? String, !displayName.isEmpty, displayName.utf16.count <= 100,
      let login = intent["login"] as? String, login.utf16.count >= 3, login.utf16.count <= 128,
      let deleteLocal = try? boolean(intent["deleteLocalData"]), let cleared = try? boolean(intent["localDataCleared"]),
      let phase = intent["phase"] as? String, ["prepared", "confirmed", "local-complete"].contains(phase),
      phase != "prepared" || !cleared,
      phase != "local-complete" || !deleteLocal || cleared else { throw CompanionError.persistence }
    _ = try CompanionCrypto.base64(intent["proof"], count: 32)
    _ = try integer(intent["expectedRecordsRevision"]); _ = try integer(intent["expectedPersonalRevision"])
  }
  func write(_ state: [String: Any]) throws {
    let bytes = try CompanionCrypto.json(state)
    guard bytes.count <= 128 * 1024 * 1024 - 28 else { throw CompanionError.capacity }
    try persistBytes(bytes)
  }
  func read<T>(_ action: ([String: Any]) throws -> T) throws -> T {
    lock.lock(); defer { lock.unlock() }; return try action(load())
  }
  static func integer(_ value: Any?) throws -> Int64 {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
      number.doubleValue.isFinite, number.doubleValue >= 0,
      number.doubleValue <= 9_007_199_254_740_991, number.doubleValue.rounded() == number.doubleValue else { throw CompanionError.invalidResponse }
    return number.int64Value
  }
  static func boolean(_ value: Any?) throws -> Bool {
    guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { throw CompanionError.invalidRequest }
    return number.boolValue
  }
}
