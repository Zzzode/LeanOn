import Foundation
import CoreFoundation

enum PersonalSchema {
  static let views = ["front", "side", "back", "other"]
  static let dimensions = ["waistCm", "hipCm", "chestCm", "armCm", "thighCm", "neckCm"]
  static func empty() -> NSMutableDictionary {
    ["version": 1, "revision": 0,
     "dietaryPreferences": ["pattern": "none", "excludedFoodIds": [], "notes": ""],
     "measurements": NSMutableArray(), "photos": NSMutableArray(), "processedOperations": NSMutableArray()]
  }
  static func id(_ value: Any?) throws -> String {
    let id = try RecordSchema.string(value, "id", max: 256)
    guard id.unicodeScalars.allSatisfy({ $0.value >= 32 }) else { throw RecordTransactionError.invalidRequest("id") }
    return id
  }
  static func text(_ value: Any?, field: String, max: Int = 2000) throws -> String {
    guard let text = value as? String, (text as NSString).length <= max else { throw RecordTransactionError.invalidRequest(field) }
    return text
  }
  static func preferences(_ value: Any?) throws -> NSDictionary {
    guard let value = value as? NSDictionary,
      ["none", "vegetarian", "vegan"].contains(value["pattern"] as? String ?? ""),
      let excluded = value["excludedFoodIds"] as? [Any], excluded.count <= 1000 else {
      throw RecordTransactionError.invalidRequest("dietaryPreferences")
    }
    var ids = Set<String>()
    for candidate in excluded {
      let id = try self.id(candidate)
      guard ids.insert(id).inserted else { throw RecordTransactionError.invalidRequest("duplicate excludedFoodId") }
    }
    _ = try text(value["notes"], field: "notes")
    // Existing JSON attributes remain lossless; health interpretation belongs to shared code.
    try json(value)
    guard try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes]).count <= 32 * 1024 else {
      throw RecordTransactionError.invalidRequest("preferences size")
    }
    return value
  }
  static func measurement(_ value: Any?, today: String) throws -> NSDictionary {
    guard let value = value as? NSDictionary else { throw RecordTransactionError.invalidRequest("measurement") }
    _ = try id(value["id"])
    try exactKeys(value, ["id", "date", "note"] + dimensions)
    _ = try RecordSchema.date(value["date"])
    var supplied = false
    for field in dimensions where value[field] != nil {
      _ = try RecordSchema.number(value[field], field, min: 20, max: 300); supplied = true
    }
    guard supplied else { throw RecordTransactionError.invalidRequest("measurement values") }
    if value["note"] != nil { _ = try text(value["note"], field: "note") }
    return value
  }
  static func photo(_ value: Any?, today: String) throws -> NSDictionary {
    guard let value = value as? NSDictionary else { throw RecordTransactionError.invalidRequest("photo") }
    _ = try id(value["id"])
    try exactKeys(value, ["id", "date", "view", "note", "createdAt", "mime", "width", "height"])
    _ = try RecordSchema.date(value["date"])
    guard views.contains(value["view"] as? String ?? ""),
      ["image/jpeg", "image/png", "image/heic"].contains(value["mime"] as? String ?? ""),
      let created = value["createdAt"] as? String,
      validTimestamp(created) else { throw RecordTransactionError.invalidRequest("photo metadata") }
    for field in ["width", "height"] {
      let count = try RecordSchema.integer(value[field], field)
      guard (1...20000).contains(count) else { throw RecordTransactionError.invalidRequest(field) }
    }
    if value["note"] != nil { _ = try text(value["note"], field: "note") }
    return value
  }
  static func validate(_ state: NSMutableDictionary, today: String) throws {
    try exactKeys(state, ["version", "revision", "dietaryPreferences", "measurements", "photos", "processedOperations"])
    try json(state)
    guard try RecordSchema.integer(state["version"], "version") == 1 else { throw RecordTransactionError.invalidRequest("personal version") }
    _ = try RecordSchema.integer(state["revision"], "revision")
    _ = try preferences(state["dietaryPreferences"])
    for (key, validator) in [("measurements", measurement), ("photos", photo)] {
      let rows = try RecordSchema.array(state, key)
      guard rows.count <= (key == "photos" ? 1000 : 100_000) else { throw RecordTransactionError.invalidRequest(key + " count") }
      var ids = Set<String>()
      for value in rows {
        let row = try validator(value, today)
        guard ids.insert(try id(row["id"])).inserted else { throw RecordTransactionError.invalidRequest("duplicate " + key) }
      }
    }
    let operations = try RecordSchema.array(state, "processedOperations")
    guard operations.count <= 100_000 else { throw RecordTransactionError.invalidRequest("operation count") }
    var ids = Set<String>()
    for value in operations {
      guard let operation = value as? NSDictionary, operation["mutation"] is NSDictionary else { throw RecordTransactionError.invalidRequest("operation") }
      try exactKeys(operation, ["operationId", "mutation", "appliedRevision"])
      try validateMutation(operation["mutation"] as! NSDictionary, today: today)
      guard ids.insert(try id(operation["operationId"])).inserted else { throw RecordTransactionError.invalidRequest("operation identity") }
      let revision = try RecordSchema.integer(operation["appliedRevision"], "appliedRevision")
      guard revision > 0, revision <= (try RecordSchema.integer(state["revision"], "revision")) else { throw RecordTransactionError.invalidRequest("operation revision") }
    }
  }
  static func exactKeys(_ value: NSDictionary, _ allowed: [String]) throws {
    guard value.allKeys.allSatisfy({ ($0 as? String).map(allowed.contains) == true }) else {
      throw RecordTransactionError.invalidRequest("unsupported attributes")
    }
  }
  static func validateMutation(_ value: NSDictionary, today: String) throws {
    switch value["type"] as? String {
    case "set-dietary-preferences": try exactKeys(value, ["type", "preferences"]); _ = try preferences(value["preferences"])
    case "save-measurement": try exactKeys(value, ["type", "measurement"]); _ = try measurement(value["measurement"], today: today)
    case "add-photo", "update-photo": try exactKeys(value, ["type", "photo"]); _ = try photo(value["photo"], today: today)
    case "delete-photo", "delete-measurement": try exactKeys(value, ["type", "id"]); _ = try id(value["id"])
    default: throw RecordTransactionError.invalidRequest("mutation type")
    }
  }
  static func validTimestamp(_ value: String) -> Bool {
    guard value.range(of: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$", options: .regularExpression) != nil,
      RecordsStore.validDate(String(value.prefix(10))) else { return false }
    let format = ISO8601DateFormatter(); format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if format.date(from: value) != nil { return true }
    format.formatOptions = [.withInternetDateTime]; return format.date(from: value) != nil
  }
  static func json(_ value: Any, allowRecordUndoTokens: Bool = false) throws {
    var budget = 500_000
    try validateJSON(value, depth: 0, budget: &budget, allowRecordUndoTokens: allowRecordUndoTokens)
  }
  private static func validateJSON(_ value: Any, depth: Int, budget: inout Int, allowRecordUndoTokens: Bool) throws {
    budget -= 1
    guard depth <= 20, budget >= 0 else { throw RecordTransactionError.invalidRequest("JSON limits") }
    let forbidden = ["password", "passphrase", "accesstoken", "refreshtoken", "sessiontoken", "authorization", "credentials",
      "privatekey", "secretkey", "apikey", "session", "wrappedkey", "wrapped", "invitesecret", "devicesecret", "vaultkey",
      "familykey", "proof", "proofhash", "clientsecret", "secret", "encryptionkey", "token", "pendingaccountdeletion",
      "deletionproof", "capabilityproof", "deletecapability", "__proto__", "constructor", "prototype"]
    if let object = value as? NSDictionary {
      guard object.count <= 1000 else { throw RecordTransactionError.invalidRequest("JSON attributes") }
      for key in object.allKeys {
        guard let key = key as? String else { throw RecordTransactionError.invalidRequest("JSON key") }
        let normalized = key.replacingOccurrences(of: "-", with: "").replacingOccurrences(of: "_", with: "").lowercased()
        let undo = allowRecordUndoTokens && normalized == "token" && (object[key] as? String)?.hasPrefix("undo-") == true &&
          (object["type"] as? String == "restore-record" || (object["record"] is NSDictionary && object["deletedAt"] != nil &&
            ["weight", "water", "exercise", "intake", "legacy-intake"].contains(object["kind"] as? String ?? "")))
        guard (!forbidden.contains(normalized) || undo),
          !["__proto__", "constructor", "prototype"].contains(key) else { throw RecordTransactionError.invalidRequest("private attributes") }
        try validateJSON(object[key]!, depth: depth + 1, budget: &budget, allowRecordUndoTokens: allowRecordUndoTokens)
      }
    } else if let array = value as? NSArray {
      guard array.count <= 100_000 else { throw RecordTransactionError.invalidRequest("JSON collection") }
      for item in array { try validateJSON(item, depth: depth + 1, budget: &budget, allowRecordUndoTokens: allowRecordUndoTokens) }
    } else if let number = value as? NSNumber {
      guard number.doubleValue.isFinite else { throw RecordTransactionError.invalidRequest("JSON number") }
    } else if !(value is String) && !(value is NSNull) { throw RecordTransactionError.invalidRequest("JSON value") }
  }
}

/// Metadata and sanitized photo bytes commit in one authenticated atomic document.
final class PersonalCollection {
  let file: EncryptedAtomicFile
  let lock = NSRecursiveLock()
  init(file: EncryptedAtomicFile) { self.file = file }
  func load() throws -> NSMutableDictionary {
    guard let data = try file.read() else { return ["personal": PersonalSchema.empty(), "photoBytes": NSMutableDictionary()] }
    guard let collection = try JSONSerialization.jsonObject(with: data, options: .mutableContainers) as? NSMutableDictionary,
      let state = collection["personal"] as? NSMutableDictionary, collection["photoBytes"] is NSMutableDictionary else {
      throw RecordTransactionError.invalidRequest("personal collection")
    }
    try PersonalSchema.validate(state, today: "9999-12-31")
    try PersonalSchema.exactKeys(collection, ["personal", "photoBytes"])
    try PrivatePhotoStore.validateCollection(collection)
    return collection
  }
  func write(_ collection: NSMutableDictionary) throws {
    let bytes = try JSONSerialization.data(withJSONObject: collection, options: .sortedKeys)
    guard bytes.count <= 64 * 1024 * 1024 else { throw RecordTransactionError.invalidRequest("personal collection size") }
    try file.write(bytes)
  }
}

final class PersonalStore {
  let collection: PersonalCollection
  var file: EncryptedAtomicFile { collection.file }
  var lock: NSRecursiveLock { collection.lock }
  private let today: () -> String
  init(collection: PersonalCollection, today: @escaping () -> String = {
    RecordSchema.today(RecordsStore.currentTime(), RecordsStore.currentCalendar())
  }) { self.collection = collection; self.today = today }
  private func load() throws -> NSMutableDictionary {
    try collection.load()["personal"] as! NSMutableDictionary
  }
  func snapshot() throws -> NSDictionary {
    lock.lock(); defer { lock.unlock() }
    return try load().copy() as! NSDictionary
  }
  func mutate(_ request: NSDictionary, photoBytes: Data? = nil) throws -> NSDictionary {
    lock.lock(); defer { lock.unlock() }
    try PersonalSchema.exactKeys(request, ["operationId", "expectedRevision", "mutation"])
    let operationId = try PersonalSchema.id(request["operationId"])
    let expected = try RecordSchema.integer(request["expectedRevision"], "expectedRevision")
    guard let mutation = request["mutation"] as? NSDictionary else { throw RecordTransactionError.invalidRequest("mutation") }
    try PersonalSchema.validateMutation(mutation, today: today())
    let root = try collection.load(), state = root["personal"] as! NSMutableDictionary
    let blobs = root["photoBytes"] as! NSMutableDictionary
    let operations = try RecordSchema.array(state, "processedOperations")
    if let old = operations.first(where: { ($0 as? NSDictionary)?["operationId"] as? String == operationId }) as? NSDictionary {
      guard let previous = old["mutation"], RecordSchema.sameJSON(previous, mutation) else { throw RecordTransactionError.conflict("operationId reused") }
      return ["success": true, "personal": state, "appliedRevision": old["appliedRevision"]!, "replayed": true]
    }
    let revision = try RecordSchema.integer(state["revision"], "revision")
    guard expected == revision, revision < 9_007_199_254_740_991 else { throw RecordTransactionError.conflict("personal revision changed") }
    let type = try RecordSchema.string(mutation["type"], "type")
    switch type {
    case "set-dietary-preferences":
      let preferences = (state["dietaryPreferences"] as! NSDictionary).mutableCopy() as! NSMutableDictionary
      preferences.addEntries(from: try PersonalSchema.preferences(mutation["preferences"]) as! [AnyHashable: Any])
      state["dietaryPreferences"] = preferences
    case "save-measurement":
      let row = try PersonalSchema.measurement(mutation["measurement"], today: today()), rows = try RecordSchema.array(state, "measurements")
      guard (row["date"] as! String) <= today() else { throw RecordTransactionError.invalidRequest("future date") }
      if let index = RecordSchema.index(rows, value: try PersonalSchema.id(row["id"])) { rows[index] = row } else { rows.add(row) }
      let sorted = (rows as! [NSDictionary]).sorted {
        let a = $0["date"] as! String, b = $1["date"] as! String
        if a != b { return a < b }
        return ($0["id"] as! String).compare($1["id"] as! String, locale: Locale(identifier: "en_US")) == .orderedAscending
      }
      state["measurements"] = NSMutableArray(array: sorted)
    case "add-photo":
      let row = try PersonalSchema.photo(mutation["photo"], today: today()), id = try PersonalSchema.id(row["id"])
      let rows = try RecordSchema.array(state, "photos")
      guard let photoBytes, RecordSchema.index(rows, value: id) == nil else { throw RecordTransactionError.invalidRequest("photo bytes or identity") }
      try PrivatePhotoImage.validatePersisted(photoBytes, metadata: row)
      guard (row["date"] as! String) <= today() else { throw RecordTransactionError.invalidRequest("future date") }
      blobs[id] = photoBytes.base64EncodedString()
      rows.add(row)
    case "update-photo":
      let row = try PersonalSchema.photo(mutation["photo"], today: today()), id = try PersonalSchema.id(row["id"])
      let rows = try RecordSchema.array(state, "photos")
      guard let index = RecordSchema.index(rows, value: id), let old = rows[index] as? NSDictionary,
        row["mime"] as? String == old["mime"] as? String,
        RecordSchema.sameJSON(row["width"]!, old["width"]!), RecordSchema.sameJSON(row["height"]!, old["height"]!),
        row["createdAt"] as? String == old["createdAt"] as? String else { throw RecordTransactionError.invalidRequest("immutable photo metadata") }
      guard (row["date"] as! String) <= today() else { throw RecordTransactionError.invalidRequest("future date") }
      rows[index] = row
    case "delete-measurement", "delete-photo":
      let rows = try RecordSchema.array(state, type == "delete-photo" ? "photos" : "measurements")
      guard let index = RecordSchema.index(rows, value: try PersonalSchema.id(mutation["id"])) else { throw RecordTransactionError.notFound }
      rows.removeObject(at: index)
      if type == "delete-photo" { blobs.removeObject(forKey: try PersonalSchema.id(mutation["id"])) }
    default: throw RecordTransactionError.invalidRequest("personal mutation type")
    }
    let next = revision + 1; state["revision"] = next
    operations.add(["operationId": operationId, "mutation": mutation, "appliedRevision": next])
    try PersonalSchema.validate(state, today: today())
    try PrivatePhotoStore.validateCollection(root)
    try collection.write(root)
    return ["success": true, "personal": state, "appliedRevision": next, "replayed": false]
  }
}
