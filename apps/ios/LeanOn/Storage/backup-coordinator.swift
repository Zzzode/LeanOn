import Foundation

enum BackupSchema {
  static let recordKeys = ["schemaVersion", "revision", "setupCompleted", "profile", "goalWeightKg", "weeklyLossKg", "guidanceMode",
    "safetyFlags", "weights", "water", "exercises", "legacyIntake", "intakeEntries", "intake", "deletedRecords", "processedOperations"]
  static func validate(_ input: NSDictionary) throws -> NSMutableDictionary {
    let encoded = try JSONSerialization.data(withJSONObject: input, options: .sortedKeys)
    guard encoded.count <= BackupCodec.maximumPlaintextBytes,
      let root = try JSONSerialization.jsonObject(with: encoded, options: .mutableContainers) as? NSMutableDictionary,
      try RecordSchema.integer(root["formatVersion"], "formatVersion") == 1,
      let created = root["createdAt"] as? String, PersonalSchema.validTimestamp(created),
      let records = root["records"] as? NSMutableDictionary,
      let personal = root["personal"] as? NSMutableDictionary,
      let foods = root["customFoods"] as? NSMutableArray,
      let photos = root["photos"] as? [NSDictionary] else { throw NativeCryptoError.invalidEnvelope }
    try PersonalSchema.exactKeys(root, ["formatVersion", "createdAt", "records", "customFoods", "favoriteFoodIds", "recentFoodIds", "personal", "photos"])
    try PersonalSchema.json(root, allowRecordUndoTokens: true)
    try PersonalSchema.exactKeys(records, recordKeys)
    guard try RecordSchema.integer(records["schemaVersion"], "schemaVersion") == 2 else { throw NativeCryptoError.invalidEnvelope }
    try RecordSchema.validateState(records)
    let oldProjection = records["intake"]!
    try RecordSchema.projectIntake(records)
    guard RecordSchema.sameJSON(oldProjection, records["intake"]!) else { throw RecordTransactionError.invalidRequest("intake projection") }
    try PersonalSchema.validate(personal, today: "9999-12-31")
    guard foods.count <= 10_000 else { throw NativeCryptoError.invalidEnvelope }
    var ids = Set<String>()
    for row in foods {
      guard let food = row as? NSDictionary, let name = food["name"] as? NSDictionary,
        ["custom", "open-food-facts"].contains(food["source"] as? String ?? "") else { throw NativeCryptoError.invalidEnvelope }
      try PersonalSchema.exactKeys(food, ["id", "name", "kcal", "macros", "micros", "defaultGrams", "source", "barcode"])
      guard ids.insert(try PersonalSchema.id(food["id"])).inserted else { throw NativeCryptoError.invalidEnvelope }
      try PersonalSchema.exactKeys(name, ["en", "zh-CN"])
      for locale in ["en", "zh-CN"] { _ = try RecordSchema.string(name[locale], locale, max: 1000, allowOuterWhitespace: true) }
      _ = try RecordSchema.number(food["kcal"], "kcal", min: Double.leastNonzeroMagnitude, max: Double.greatestFiniteMagnitude)
      for (key, keys) in [("macros", RecordSchema.macroKeys), ("micros", RecordSchema.microKeys)] {
        guard let values = food[key] as? NSDictionary else { throw NativeCryptoError.invalidEnvelope }
        try PersonalSchema.exactKeys(values, keys)
        for field in keys { _ = try RecordSchema.number(values[field], field, max: Double.greatestFiniteMagnitude) }
      }
      if let grams = food["defaultGrams"] { _ = try RecordSchema.number(grams, "defaultGrams", min: Double.leastNonzeroMagnitude, max: Double.greatestFiniteMagnitude) }
      if let code = food["barcode"] { guard let code = code as? String, code.range(of: "^[0-9]{8,14}$", options: .regularExpression) != nil else { throw NativeCryptoError.invalidEnvelope } }
      try PersonalSchema.json(food)
    }
    for key in ["favoriteFoodIds", "recentFoodIds"] {
      guard let values = root[key] as? [Any], values.count <= (key == "recentFoodIds" ? 12 : 10_000) else { throw NativeCryptoError.invalidEnvelope }
      var ids = Set<String>()
      for id in values { guard ids.insert(try PersonalSchema.id(id)).inserted else { throw NativeCryptoError.invalidEnvelope } }
    }
    var blobs: [String: String] = [:]
    for photo in photos {
      try PersonalSchema.exactKeys(photo, ["id", "bytesBase64"])
      let id = try PersonalSchema.id(photo["id"])
      guard blobs[id] == nil, let bytes = photo["bytesBase64"] as? String else { throw NativeCryptoError.invalidEnvelope }
      blobs[id] = bytes
    }
    try PrivatePhotoStore.validateCollection(["personal": personal, "photoBytes": blobs])
    return root
  }
  static func summary(_ payload: NSDictionary) throws -> NSDictionary {
    let records = payload["records"] as! NSDictionary, personal = payload["personal"] as! NSDictionary
    var counts: [String: Int] = [:]
    for key in ["weights", "water", "exercises", "intakeEntries", "legacyIntake"] { counts[key] = (records[key] as! NSArray).count }
    counts["customFoods"] = (payload["customFoods"] as! NSArray).count
    counts["measurements"] = (personal["measurements"] as! NSArray).count
    counts["photos"] = (personal["photos"] as! NSArray).count
    var total = 0
    for row in payload["photos"] as! [NSDictionary] { total += Data(base64Encoded: row["bytesBase64"] as! String)!.count }
    return ["createdAt": payload["createdAt"]!, "recordRevision": records["revision"]!, "personalRevision": personal["revision"]!,
      "counts": counts, "photoBytes": total, "hasProfile": !(records["profile"] is NSNull), "includesPhotos": total > 0]
  }
}

/// Two-store commit with encrypted rollback journal. Neither observer can see a partial restore.
final class BackupCoordinator {
  private let records: RecordsStore
  private let personal: PersonalStore
  private let journal: EncryptedAtomicFile
  private let photos: PrivatePhotoStore
  private let clock: () -> Date
  private let uptime: () -> TimeInterval
  private let write: (Data, URL) throws -> Void
  private var participants: [String: EncryptedAtomicFile] = [:]
  private var preview: (token: String, payload: NSMutableDictionary, recordsRevision: Int, personalRevision: Int, deadline: TimeInterval)?
  private let previewLock = NSLock()
  init(records: RecordsStore, personal: PersonalStore, photos: PrivatePhotoStore, journal: EncryptedAtomicFile,
       clock: @escaping () -> Date = Date.init, uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
       write: @escaping (Data, URL) throws -> Void = ProtectedAtomicBytes.write) {
    self.records = records; self.personal = personal; self.photos = photos; self.journal = journal
    self.clock = clock; self.uptime = uptime; self.write = write
  }
  private func locked<T>(_ body: () throws -> T) rethrows -> T {
    try records.withExclusiveAccess { personal.lock.lock(); defer { personal.lock.unlock() }; return try body() }
  }
  func requireEmptyCutoverTarget() throws {
    guard !FileManager.default.fileExists(atPath: records.encryptedFile.url.path), !FileManager.default.fileExists(atPath: personal.file.url.path) else { throw CompanionError.invalidRequest }
  }
  func exportPayload() throws -> NSDictionary {
    try locked {
      try recoverLocked()
      let snapshot = try records.loadSnapshot(), own = try personal.snapshot()
      let state = NSMutableDictionary()
      for key in BackupSchema.recordKeys { state[key] = snapshot[key] }
      let metadata = own["photos"] as! [NSDictionary]
      let bytes = try metadata.map { row -> NSDictionary in
        let id = try PersonalSchema.id(row["id"])
        return ["id": id, "bytesBase64": try photos.bytes(id).base64EncodedString()]
      }
      return try BackupSchema.validate(["formatVersion": 1, "createdAt": ISO8601DateFormatter().string(from: clock()),
        "records": state, "personal": own, "customFoods": snapshot["customFoods"]!,
        "favoriteFoodIds": snapshot["favoriteFoodIds"]!, "recentFoodIds": snapshot["recentFoodIds"]!, "photos": bytes])
    }
  }
  func exportEncrypted(password: String) throws -> Data {
    try BackupCodec.encode(JSONSerialization.data(withJSONObject: exportPayload(), options: .sortedKeys), password: password)
  }
  func inspect(_ data: Data, password: String) throws -> NSDictionary {
    let decoded = try BackupCodec.decode(data, password: password)
    guard let value = try JSONSerialization.jsonObject(with: decoded) as? NSDictionary else { throw NativeCryptoError.invalidEnvelope }
    let payload = try BackupSchema.validate(value)
    return try locked {
      try recoverLocked()
      let recordsRevision = try RecordSchema.integer(records.loadSnapshot()["revision"], "revision")
      let personalRevision = try RecordSchema.integer(personal.snapshot()["revision"], "revision")
      let token = UUID().uuidString, expires = clock().addingTimeInterval(300)
      previewLock.lock(); preview = (token, payload, recordsRevision, personalRevision, uptime() + 300); previewLock.unlock()
      return ["cancelled": false, "token": token, "expiresAt": ISO8601DateFormatter().string(from: expires),
        "summary": try BackupSchema.summary(payload), "expectedRecordsRevision": recordsRevision, "expectedPersonalRevision": personalRevision]
    }
  }
  func invalidatePreviews() { previewLock.lock(); preview = nil; previewLock.unlock() }
  func registerParticipant(_ name: String, file: EncryptedAtomicFile, recoverImmediately: Bool = true) throws {
    guard name == "companion" else { throw RecordTransactionError.invalidRequest("transaction participant") }
    try locked { participants[name] = file; if recoverImmediately { try recoverLocked() } }
  }
  /// Authenticates every current file and journal before-image without writing files or keys.
  func preflightRecovery() throws { try locked { _ = try recoveryPlanLocked() } }
  func attach(expectedRecordsRevision: Int, expectedPersonalRevision: Int, persist: (NSDictionary) throws -> Void) throws {
    try locked {
      try recoverLocked()
      guard try RecordSchema.integer(records.loadSnapshot()["revision"], "revision") == expectedRecordsRevision,
        try RecordSchema.integer(personal.snapshot()["revision"], "revision") == expectedPersonalRevision else {
        throw RecordTransactionError.conflict("attachment preview is stale")
      }
      try persist(exportPayload())
    }
  }
  func commitPayload(_ value: NSDictionary, expectedRecordsRevision: Int, expectedPersonalRevision: Int,
                     companionFile: EncryptedAtomicFile, companionState: NSDictionary) throws {
    try locked {
      participants["companion"] = companionFile
      try recoverLocked()
      guard try RecordSchema.integer(records.loadSnapshot()["revision"], "revision") == expectedRecordsRevision,
        try RecordSchema.integer(personal.snapshot()["revision"], "revision") == expectedPersonalRevision else {
        throw RecordTransactionError.conflict("sync snapshot changed")
      }
      let payload = try BackupSchema.validate(value), state = payload["records"] as! NSMutableDictionary
      for key in ["customFoods", "favoriteFoodIds", "recentFoodIds"] { state[key] = payload[key] }
      var blobs: [String: String] = [:]
      for row in payload["photos"] as! [NSDictionary] { blobs[row["id"] as! String] = row["bytesBase64"] as? String }
      let own: NSMutableDictionary = ["personal": payload["personal"]!, "photoBytes": blobs]
      try PrivatePhotoStore.validateCollection(own)
      let recordData = try records.encryptedFile.encrypted(JSONSerialization.data(withJSONObject: state, options: .sortedKeys))
      let personalData = try personal.file.encrypted(JSONSerialization.data(withJSONObject: own, options: .sortedKeys))
      let companionData = try companionFile.encrypted(JSONSerialization.data(withJSONObject: companionState, options: .sortedKeys))
      try commitLocked(recordsData: recordData, personalData: personalData, additional: ["companion": companionData])
    }
  }
  func restore(token: String, recordsRevision: Int, personalRevision: Int) throws -> NSDictionary {
    previewLock.lock(); let plan = preview; previewLock.unlock()
    guard let plan, plan.token == token, uptime() < plan.deadline,
      plan.recordsRevision == recordsRevision, plan.personalRevision == personalRevision else { throw RecordTransactionError.conflict("restore preview expired or invalid") }
    return try locked {
      try recoverLocked()
      let current = try records.loadSnapshot(), own = try personal.snapshot()
      guard try RecordSchema.integer(current["revision"], "revision") == recordsRevision,
        try RecordSchema.integer(own["revision"], "revision") == personalRevision else { throw RecordTransactionError.conflict("restore preview is stale") }
      let payload = try BackupSchema.validate(plan.payload)
      let restored = payload["records"] as! NSMutableDictionary, restoredPersonal = payload["personal"] as! NSMutableDictionary
      let recordNext = max(recordsRevision, try RecordSchema.integer(restored["revision"], "revision")) + 1
      let personalNext = max(personalRevision, try RecordSchema.integer(restoredPersonal["revision"], "revision")) + 1
      guard recordNext <= 9_007_199_254_740_991, personalNext <= 9_007_199_254_740_991 else { throw NativeCryptoError.invalidEnvelope }
      restored["revision"] = recordNext; restoredPersonal["revision"] = personalNext
      for key in ["customFoods", "favoriteFoodIds", "recentFoodIds"] { restored[key] = payload[key] }
      var blobs: [String: String] = [:]
      for row in payload["photos"] as! [NSDictionary] { blobs[row["id"] as! String] = row["bytesBase64"] as? String }
      let newPersonal: NSMutableDictionary = ["personal": restoredPersonal, "photoBytes": blobs]
      try PrivatePhotoStore.validateCollection(newPersonal)
      let recordData = try records.encryptedFile.encrypted(JSONSerialization.data(withJSONObject: restored, options: .sortedKeys))
      let personalData = try personal.file.encrypted(JSONSerialization.data(withJSONObject: newPersonal, options: .sortedKeys))
      try commitLocked(recordsData: recordData, personalData: personalData)
      invalidatePreviews()
      return ["success": true, "hostData": try records.currentSnapshot(), "personal": try personal.snapshot()]
    }
  }
  private var transactionURLs: [String: URL] {
    var urls = ["records": records.encryptedFile.url, "personal": personal.file.url]
    for (name, file) in participants { urls[name] = file.url }
    return urls
  }
  func deleteLocalData() throws {
    try locked {
      try recoverLocked()
      try commitLocked(recordsData: nil, personalData: nil)
      invalidatePreviews()
      try records.encryptedFile.removeKeyAfterDataDeletion()
      try personal.file.removeKeyAfterDataDeletion()
      try journal.removeKeyAfterDataDeletion()
    }
  }
  /// CAS and the durable completion receipt share the existing three-store journal.
  func commitAccountDeletion(expectedRecordsRevision: Int, expectedPersonalRevision: Int,
                             companionFile: EncryptedAtomicFile, companionState: NSDictionary,
                             beforeCommit: () throws -> Void = {}) throws {
    try locked {
      participants["companion"] = companionFile
      try recoverLocked()
      guard try RecordSchema.integer(records.loadSnapshot()["revision"], "revision") == expectedRecordsRevision,
        try RecordSchema.integer(personal.snapshot()["revision"], "revision") == expectedPersonalRevision,
        let intent = companionState["pendingAccountDeletion"] as? NSDictionary,
        intent["phase"] as? String == "confirmed", intent["localDataCleared"] as? Bool == true else {
        throw RecordTransactionError.conflict("account deletion snapshot changed")
      }
      try beforeCommit()
      let bytes = try companionFile.encrypted(JSONSerialization.data(withJSONObject: companionState, options: .sortedKeys))
      try commitLocked(recordsData: nil, personalData: nil, additional: ["companion": bytes])
      invalidatePreviews()
    }
  }
  func accountDeletionLocalDataExists() -> Bool {
    locked {
      FileManager.default.fileExists(atPath: records.encryptedFile.url.path) ||
        FileManager.default.fileExists(atPath: personal.file.url.path)
    }
  }
  /// Read-only verification for old completion markers; never removes recreated stores or keys.
  func validateAccountDeletionCompletion() throws {
    try locked {
      try records.encryptedFile.validateDeletionCompletion()
      try personal.file.validateDeletionCompletion()
      try journal.validateDeletionCompletion()
      for name in participants.keys.sorted() { try participants[name]!.validateDeletionCompletion() }
    }
  }
  /// Never writes nil data again after the journal's localDataCleared receipt.
  func finishAccountDeletionCleanup(beforeKeyRemoval: () throws -> Void = {}) throws {
    try locked {
      try recoverLocked()
      guard !FileManager.default.fileExists(atPath: records.encryptedFile.url.path),
        !FileManager.default.fileExists(atPath: personal.file.url.path) else {
        throw RecordTransactionError.conflict("local data recreated after account deletion")
      }
      invalidatePreviews()
      try beforeKeyRemoval()
      try records.encryptedFile.removeKeyAfterDataDeletion()
      try personal.file.removeKeyAfterDataDeletion()
      try journal.removeKeyAfterDataDeletion()
    }
  }
  private func commitLocked(recordsData: Data?, personalData: Data?, additional: [String: Data] = [:]) throws {
    let urls = transactionURLs
    guard !FileManager.default.fileExists(atPath: journal.url.path),
      additional.keys.allSatisfy({ participants[$0] != nil }) else {
      throw RecordTransactionError.conflict("transaction recovery or participant required")
    }
    func previous(_ url: URL) throws -> Any {
      FileManager.default.fileExists(atPath: url.path) ? try ProtectedAtomicBytes.read(url, maximumBytes: nameLimit(url)).base64EncodedString() : NSNull()
    }
    var old: [String: Any] = [:]
    for (name, url) in urls { old[name] = try previous(url) }
    // Persist authenticated role anchors before a transaction can delete its last ciphertext.
    // A failed key copy may leave an identical stable alias, but never changes any store bytes.
    try validateCurrentFiles()
    for (name, value) in old { if let text = value as? String { try validateImage(name, bytes: decodeImage(text, name: name)) } }
    if let recordsData { try validateImage("records", bytes: recordsData) }
    if let personalData { try validateImage("personal", bytes: personalData) }
    for (name, bytes) in additional { try validateImage(name, bytes: bytes) }
    try promoteTransactionKeys()
    let rollback: NSDictionary = ["version": 1, "phase": "prepared", "files": old]
    let prepared = try JSONSerialization.data(withJSONObject: rollback, options: .sortedKeys)
    NativeStoreRecoveryGate.block(Array(urls.values))
    do { try journal.write(prepared) }
    catch {
      if FileManager.default.fileExists(atPath: journal.url.path) { try recoverLocked() }
      else { NativeStoreRecoveryGate.unblock(Array(urls.values)) }
      throw error
    }
    var markerStarted = false, committed = false
    do {
      try photos.clearDisplayCache()
      for (slot, bytes) in [("records", recordsData), ("personal", personalData)] {
        let url = urls[slot]!
        if let bytes { try write(bytes, url) }
        else if FileManager.default.fileExists(atPath: url.path) {
          try FileManager.default.removeItem(at: url)
          try ProtectedAtomicBytes.synchronizeDirectory(url.deletingLastPathComponent())
        }
      }
      for (name, data) in additional {
        guard let url = urls[name] else { throw RecordTransactionError.invalidRequest("transaction participant") }
        try write(data, url)
      }
      markerStarted = true
      try journal.write(JSONSerialization.data(withJSONObject: ["version": 1, "phase": "committed", "files": old], options: .sortedKeys))
      committed = true
      NativeStoreRecoveryGate.unblock(Array(urls.values))
      try FileManager.default.removeItem(at: journal.url)
      try ProtectedAtomicBytes.synchronizeDirectory(journal.url.deletingLastPathComponent())
    } catch {
      if committed {
        // The durable committed marker is authoritative; startup only retries its cleanup.
        return
      }
      if markerStarted {
        NativeStoreRecoveryGate.block(Array(urls.values))
        throw RecordTransactionError.conflict("transaction durability uncertain; recovery required")
      }
      do { try recoverLocked() } catch {
        NativeStoreRecoveryGate.block(Array(urls.values)); throw RecordTransactionError.conflict("restore recovery required")
      }
      throw error
    }
  }
  private func nameLimit(_ url: URL) -> Int {
    participants.values.contains(where: { $0.url == url }) ? 128 * 1024 * 1024 : 64 * 1024 * 1024
  }
  func recover() throws { try locked { try recoverLocked() } }
  private enum RecoveryImage { case absent; case bytes(Data) }
  private struct RecoveryPlan { let phase: String; let images: [String: RecoveryImage] }
  private func validateCurrentFiles() throws {
    try records.encryptedFile.validateCurrentForRecovery()
    try personal.file.validateCurrentForRecovery()
    for name in participants.keys.sorted() { try participants[name]!.validateCurrentForRecovery() }
  }
  private func decodeImage(_ text: String, name: String) throws -> Data {
    guard let url = transactionURLs[name], text.utf8.count <= ((nameLimit(url) + 2) / 3) * 4,
      let bytes = Data(base64Encoded: text), bytes.count <= nameLimit(url) else { throw NativeCryptoError.invalidEnvelope }
    return bytes
  }
  private func validateImage(_ name: String, bytes: Data) throws {
    switch name {
    case "records": try records.encryptedFile.validateRecoveryBytes(bytes)
    case "personal": try personal.file.validateRecoveryBytes(bytes)
    default:
      guard let file = participants[name] else { throw RecordTransactionError.conflict("transaction participant unavailable") }
      try file.validateRecoveryBytes(bytes)
    }
  }
  private func promoteTransactionKeys() throws {
    try records.encryptedFile.promoteAuthenticatedKey()
    try personal.file.promoteAuthenticatedKey()
    for name in participants.keys.sorted() { try participants[name]!.promoteAuthenticatedKey() }
    try journal.promoteAuthenticatedKey()
  }
  private func recoveryPlanLocked() throws -> RecoveryPlan? {
    guard FileManager.default.fileExists(atPath: journal.url.path) else { try validateCurrentFiles(); return nil }
    try journal.validateCurrentForRecovery()
    guard let bytes = try journal.read() else { throw NativeCryptoError.invalidEnvelope }
    guard let rollback = try JSONSerialization.jsonObject(with: bytes) as? NSDictionary,
      try RecordSchema.integer(rollback["version"], "version") == 1,
      let files = rollback["files"] as? NSDictionary else { throw NativeCryptoError.invalidEnvelope }
    try PersonalSchema.exactKeys(rollback, ["version", "phase", "files"])
    guard let phase = rollback["phase"] as? String, ["prepared", "committed"].contains(phase),
      files["records"] != nil, files["personal"] != nil else { throw NativeCryptoError.invalidEnvelope }
    var images: [String: RecoveryImage] = [:]
    for rawKey in files.allKeys {
      guard let name = rawKey as? String, transactionURLs[name] != nil else {
        throw RecordTransactionError.conflict("transaction participant unavailable")
      }
      if files[name] is NSNull { images[name] = .absent }
      else {
        guard let text = files[name] as? String else { throw NativeCryptoError.invalidEnvelope }
        images[name] = .bytes(try decodeImage(text, name: name))
      }
    }
    func validateBeforeImages() throws {
      for name in images.keys.sorted() { if case .bytes(let bytes) = images[name]! { try validateImage(name, bytes: bytes) } }
    }
    // Both generations must authenticate with the same role key before either is touched.
    if phase == "prepared" { try validateCurrentFiles(); try validateBeforeImages() }
    else { try validateBeforeImages(); try validateCurrentFiles() }
    return RecoveryPlan(phase: phase, images: images)
  }
  private func recoverLocked() throws {
    guard FileManager.default.fileExists(atPath: journal.url.path) else { return }
    let urls = transactionURLs
    NativeStoreRecoveryGate.block(Array(urls.values))
    guard let plan = try recoveryPlanLocked() else { return }
    try promoteTransactionKeys()
    if plan.phase == "committed" {
      try FileManager.default.removeItem(at: journal.url)
      try ProtectedAtomicBytes.synchronizeDirectory(journal.url.deletingLastPathComponent())
      NativeStoreRecoveryGate.unblock(Array(urls.values)); return
    }
    for key in plan.images.keys.sorted() {
      let url = urls[key]!
      if case .absent = plan.images[key]! {
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        try ProtectedAtomicBytes.synchronizeDirectory(url.deletingLastPathComponent())
      } else {
        guard case .bytes(let data) = plan.images[key]! else { throw NativeCryptoError.invalidEnvelope }
        try ProtectedAtomicBytes.write(data, to: url)
      }
    }
    try photos.clearDisplayCache()
    try FileManager.default.removeItem(at: journal.url)
    try ProtectedAtomicBytes.synchronizeDirectory(journal.url.deletingLastPathComponent())
    NativeStoreRecoveryGate.unblock(Array(urls.values))
  }
}
