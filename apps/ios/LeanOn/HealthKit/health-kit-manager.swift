import Foundation

/// Durable preference and export ledger; the record file remains the local authority.
private struct HealthKitSyncState: Codable {
  struct Exported: Codable {
    var kind: HealthKitExport.Kind
    var version: Int
    var fingerprint: String?
    var deleted: Bool?
  }
  var enabled = false
  var authorizationRequested = false
  var lastSyncEpochMs: Int64 = 0
  var exported: [String: Exported] = [:]
}

private actor HealthKitSyncEngine {
  let client: HealthKitClient
  let stateURL: URL
  let stateFile: EncryptedLegacyJSONFile
  var generation = 0
  let loadHostData: () throws -> NSDictionary
  let replaceMirrors: ([[String: Any]], [[String: Any]]) throws -> NSDictionary
  let changed: (NSDictionary) -> Void
  let now: () -> Date
  let bundle: String
  let timeZone: () -> TimeZone
  var syncing = false
  var syncRequested = false

  init(client: HealthKitClient, stateURL: URL, loadHostData: @escaping () throws -> NSDictionary,
    replaceMirrors: @escaping ([[String: Any]], [[String: Any]]) throws -> NSDictionary,
    changed: @escaping (NSDictionary) -> Void, now: @escaping () -> Date,
    bundle: String, timeZone: @escaping () -> TimeZone, keys: NativeDataKeyProviding) {
    self.client = client; self.stateURL = stateURL; self.loadHostData = loadHostData
    self.replaceMirrors = replaceMirrors; self.changed = changed
    self.now = now; self.bundle = bundle; self.timeZone = timeZone
    stateFile = EncryptedLegacyJSONFile(url:stateURL,keys:keys,context:"LeanOn HealthKit ledger v1")
  }

  func loadState() throws -> HealthKitSyncState {
    guard let bytes = try stateFile.read() else { return HealthKitSyncState() }
    return try JSONDecoder().decode(HealthKitSyncState.self, from:bytes)
  }

  func persist(_ state: HealthKitSyncState) throws {
    try stateFile.write(JSONEncoder().encode(state))
  }

  func status() throws -> NSDictionary {
    let state = try loadState()
    return ["supported": client.supported, "enabled": state.enabled,
      "writeAuthorized": client.writeAuthorized, "readAccess": "unknown",
      "nutritionWriteAuthorized": client.nutritionWriteAuthorized,
      "authorizationRequested": state.authorizationRequested, "lastSyncEpochMs": state.lastSyncEpochMs]
  }

  func requestPermission() async throws -> NSDictionary {
    guard client.supported else { throw HealthKitSyncError.unsupported }
    guard !syncing else { throw HealthKitSyncError.busy }
    syncing = true
    defer { finishOperation() }
    let operationGeneration = generation
    try await client.requestPermission()
    guard operationGeneration == generation else { throw HealthKitSyncError.disabled }
    var state = try loadState()
    state.authorizationRequested = true
    try persist(state)
    return ["completed": true, "writeAuthorized": client.writeAuthorized,
      "nutritionWriteAuthorized": client.nutritionWriteAuthorized, "readAccess": "unknown"]
  }

  func setEnabled(_ enabled: Bool) async throws -> NSDictionary {
    guard !syncing else { throw HealthKitSyncError.busy }
    var state = try loadState()
    if enabled {
      guard client.supported else { throw HealthKitSyncError.unsupported }
      guard state.authorizationRequested else { throw HealthKitSyncError.permissionRequired }
    }
    state.enabled = enabled
    try persist(state)
    return ["success": true]
  }

  func sync() async throws -> NSDictionary {
    guard !syncing else { throw HealthKitSyncError.busy }
    var state = try loadState()
    guard client.supported else { throw HealthKitSyncError.unsupported }
    guard state.enabled else { throw HealthKitSyncError.disabled }
    guard state.authorizationRequested else { throw HealthKitSyncError.permissionRequired }
    syncing = true
    defer { finishOperation() }
    let operationGeneration = generation
    let host = try loadHostData()
    // Validate authoritative records before performing any system mutation.
    let records = try HealthKitMapping.exports(host)
    let instant = now()
    let syncTimeZone = timeZone()
    let weights = try await client.readWeights(since: instant.addingTimeInterval(-90 * 86400), until: instant)
    let workouts = try await client.readWorkouts(since: instant.addingTimeInterval(-30 * 86400), until: instant)
    guard operationGeneration == generation else { throw HealthKitSyncError.disabled }
    let mirrors = HealthKitMapping.mirrors(weights: weights, workouts: workouts,
      host: host, bundle: bundle, timeZone: syncTimeZone)
    let currentIds = Set(records.map(\.id))
    for id in state.exported.keys.sorted() where !currentIds.contains(id) {
      guard let exported = state.exported[id] else { continue }
      guard client.isWriteAuthorized(for: exported.kind) else { continue }
      if exported.deleted == true { continue }
      guard operationGeneration == generation else { throw HealthKitSyncError.disabled }
      try await client.delete(id: id, kind: exported.kind)
      guard operationGeneration == generation else { throw HealthKitSyncError.disabled }
      // Keep a tombstone so restoring the same logical day/id uses a newer
      // sync version, and repeated syncs do not repeat a completed deletion.
      state.exported[id]?.deleted = true
      state.exported[id]?.fingerprint = nil
      try persist(state)
    }
    for record in records {
      // Read-only access remains useful. Preserve the ledger while writes are denied
      // so pending edits/deletions reconcile if the user later restores write access.
      guard client.isWriteAuthorized(for: record.kind) else { continue }
      let old = state.exported[record.id]
      if old?.fingerprint == record.fingerprint { continue }
      // Reserve a monotonically increasing version before the system write.
      // If either save or final ledger commit fails, retry uses a newer version.
      let version = (old?.version ?? 0) + 1
      state.exported[record.id] = .init(kind: record.kind, version: version, fingerprint: nil, deleted: false)
      try persist(state)
      guard operationGeneration == generation else { throw HealthKitSyncError.disabled }
      try await client.save(record, version: version)
      guard operationGeneration == generation else { throw HealthKitSyncError.disabled }
      state.exported[record.id]?.fingerprint = record.fingerprint
      try persist(state)
    }
    guard operationGeneration == generation else { throw HealthKitSyncError.disabled }
    let updated = try replaceMirrors(mirrors.0, mirrors.1)
    state.lastSyncEpochMs = Int64(instant.timeIntervalSince1970 * 1000)
    try persist(state)
    changed(updated)
    return ["success": true, "hostData": updated]
  }

  func clearLocalState() throws {
    try Task.checkCancellation()
    generation += 1; syncRequested = false
    try stateFile.delete()
  }

  func automaticallySync() async {
    if syncing { syncRequested = true; return }
    do {
      guard try loadState().enabled else { return }
      _ = try await sync()
    } catch { NSLog("[LeanOnHealthKit] background sync failed: %@", String(describing: error)) }
  }

  private func finishOperation() {
    syncing = false
    if syncRequested {
      syncRequested = false
      Task { await self.automaticallySync() }
    }
  }
}

final class HealthKitManager {
  private let engine: HealthKitSyncEngine
  init(client: HealthKitClient = SystemHealthKitClient(), stateURL: URL,
    loadHostData: @escaping () throws -> NSDictionary,
    replaceMirrors: @escaping ([[String: Any]], [[String: Any]]) throws -> NSDictionary,
    onRecordsChanged: @escaping (NSDictionary) -> Void,
    now: @escaping () -> Date = Date.init,
    bundle: String = Bundle.main.bundleIdentifier ?? "com.zzzode.leanon",
    timeZone: TimeZone? = nil,
    timeZoneProvider: @escaping () -> TimeZone = { .current }, keys: NativeDataKeyProviding? = nil) {
    let currentTimeZone: () -> TimeZone
    if let timeZone { currentTimeZone = { timeZone } }
    else { currentTimeZone = timeZoneProvider }
    engine = HealthKitSyncEngine(client: client, stateURL: stateURL, loadHostData: loadHostData,
      replaceMirrors: replaceMirrors, changed: onRecordsChanged, now: now, bundle: bundle, timeZone: currentTimeZone, keys: keys ?? RecordFixtureKeys.forURL(stateURL))
  }

  func status() async throws -> NSDictionary { try await engine.status() }
  func requestPermission() async throws -> NSDictionary { try await engine.requestPermission() }
  func setEnabled(_ enabled: Bool) async throws -> NSDictionary { try await engine.setEnabled(enabled) }
  func sync() async throws -> NSDictionary { try await engine.sync() }
  func clearLocalState() async throws { try await engine.clearLocalState() }
  func onRecordsChanged() { Task { await engine.automaticallySync() } }
  func onForeground() { onRecordsChanged() }
}
