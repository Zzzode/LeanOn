import Foundation
import CoreFoundation

enum RecordTransactionError: LocalizedError {
  case invalidRequest(String), conflict(String), notAuthorized, notFound
  var code: String {
    switch self {
    case .invalidRequest: return "invalid-request"
    case .conflict: return "conflict"
    case .notAuthorized: return "not-authorized"
    case .notFound: return "invalid-request"
    }
  }
  var errorDescription: String? {
    switch self {
    case .invalidRequest(let field): return "Invalid record request: \(field)"
    case .conflict(let detail): return "Record conflict: \(detail)"
    case .notAuthorized: return "Imported records are read-only"
    case .notFound: return "Record not found"
    }
  }
}

/// JSON schema helpers shared by native writes and optimistic transactions.
enum RecordSchema {
  static let macroKeys = ["proteinG", "carbsG", "fatG"]
  static let microKeys = ["fiberG", "sugarG", "saturatedFatG", "sodiumMg"]
  static let activities = ["sedentary", "lightly_active", "moderately_active", "very_active", "extremely_active"]

  static func empty() -> NSMutableDictionary {
    ["schemaVersion": 2, "revision": 0, "setupCompleted": false,
     "profile": NSNull(), "goalWeightKg": NSNull(), "weeklyLossKg": NSNull(),
     "guidanceMode": "tracking-only",
     "safetyFlags": ["pregnant": NSNull(), "breastfeeding": NSNull(), "eatingDisorderRisk": NSNull()],
     "weights": [], "intake": [], "legacyIntake": [], "intakeEntries": [],
     "exercises": [], "water": [], "customFoods": [], "favoriteFoodIds": [], "recentFoodIds": [],
     "deletedRecords": [], "processedOperations": []]
  }

  static func number(_ value: Any?, _ field: String, min: Double = 0, max: Double = Double.greatestFiniteMagnitude) throws -> Double {
    guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
          value.doubleValue.isFinite, (min...max).contains(value.doubleValue) else {
      throw RecordTransactionError.invalidRequest(field)
    }
    return value.doubleValue
  }

  static func integer(_ value: Any?, _ field: String) throws -> Int {
    let value = try number(value, field, max: 9_007_199_254_740_991)
    guard value.rounded() == value else { throw RecordTransactionError.invalidRequest(field) }
    return Int(value)
  }

  static func string(_ value: Any?, _ field: String, max: Int = Int.max, allowOuterWhitespace: Bool = false) throws -> String {
    guard let value = value as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          (value as NSString).length <= max, (allowOuterWhitespace || value == value.trimmingCharacters(in: .whitespacesAndNewlines)) else { throw RecordTransactionError.invalidRequest(field) }
    return value
  }

  static func date(_ value: Any?) throws -> String {
    let value = try string(value, "date", max: 10)
    guard RecordsStore.validDate(value) else { throw RecordTransactionError.invalidRequest("date") }
    return value
  }

  static func owned(_ value: NSDictionary) throws {
    if let supplied = value["source"] {
      guard let source = supplied as? String else { throw RecordTransactionError.invalidRequest("source") }
      if source != "leanon" { throw RecordTransactionError.notAuthorized }
    }
  }

  static func array(_ data: NSMutableDictionary, _ key: String) throws -> NSMutableArray {
    if let array = data[key] as? NSMutableArray { return array }
    guard let array = data[key] as? NSArray else { throw RecordsStore.StoreError.invalidStore(key) }
    let mutable = array.mutableCopy() as! NSMutableArray
    data[key] = mutable
    return mutable
  }

  static func index(_ rows: NSMutableArray, key: String = "id", value: String) -> Int? {
    rows.enumerated().first { ($0.element as? NSDictionary)?[key] as? String == value }?.offset
  }

  /// Foundation compares NSNumber(true) equal to NSNumber(1); RPC retry
  /// identity follows JSON semantics instead and distinguishes those types.
  static func sameJSON(_ left: Any, _ right: Any) -> Bool {
    if let a = left as? NSNumber, let b = right as? NSNumber {
      let booleanA = CFGetTypeID(a) == CFBooleanGetTypeID(), booleanB = CFGetTypeID(b) == CFBooleanGetTypeID()
      return booleanA == booleanB && a.doubleValue == b.doubleValue
    }
    if let a = left as? NSDictionary, let b = right as? NSDictionary {
      guard a.count == b.count else { return false }
      return a.allKeys.allSatisfy { key in
        guard let valueA = a[key], let valueB = b[key] else { return false }
        return sameJSON(valueA, valueB)
      }
    }
    if let a = left as? NSArray, let b = right as? NSArray {
      return a.count == b.count && (0..<a.count).allSatisfy { sameJSON(a[$0], b[$0]) }
    }
    if left is NSNull { return right is NSNull }
    if let a = left as? String, let b = right as? String { return a == b }
    return false
  }

  static func today(_ now: Date, _ calendar: Calendar) -> String {
    let format = DateFormatter(); format.calendar = calendar; format.timeZone = calendar.timeZone
    format.locale = Locale(identifier: "en_US_POSIX"); format.dateFormat = "yyyy-MM-dd"
    return format.string(from: now)
  }

  static func profile(_ value: Any?, today: String) throws -> NSDictionary {
    guard let value = value as? NSDictionary else { throw RecordTransactionError.invalidRequest("profile") }
    let sex = try string(value["sex"], "sex")
    let birth = try date(value["birthDate"])
    let height = try number(value["heightCm"], "heightCm", min: 80, max: 250)
    let activity = try string(value["activityLevel"], "activityLevel")
    guard ["female", "male"].contains(sex), activities.contains(activity), birth <= today else {
      throw RecordTransactionError.invalidRequest("profile")
    }
    let result = value.mutableCopy() as! NSMutableDictionary
    result["sex"] = sex; result["birthDate"] = birth; result["heightCm"] = height; result["activityLevel"] = activity
    if let fat = value["bodyFatPercent"] {
      let fraction = try number(fat, "bodyFatPercent")
      guard fraction > 0, fraction < 1 else { throw RecordTransactionError.invalidRequest("bodyFatPercent") }
      result["bodyFatPercent"] = fraction
    }
    return result
  }

  /// Upgrade in memory first; the store commits only with a successful write.
  static func migrate(_ data: NSMutableDictionary, now: Date, calendar: Calendar) throws -> Bool {
    let before = try JSONSerialization.data(withJSONObject: data, options: .sortedKeys)
    let version = data["schemaVersion"] == nil ? 1 : try integer(data["schemaVersion"], "schemaVersion")
    guard version == 1 || version == 2 else { throw RecordsStore.StoreError.invalidStore("schemaVersion") }
    // Established legacy files have these primary collections. An incomplete
    // root must not become an empty journal that a later write could overwrite.
    if version == 1 { _ = try array(data, "weights"); _ = try array(data, "intake") }
    for key in ["weights", "exercises", "water", "customFoods", "favoriteFoodIds", "recentFoodIds", "intake"] {
      if version == 1 && data[key] == nil { data[key] = NSMutableArray() }
      _ = try array(data, key)
    }
    if version == 1 {
      data["legacyIntake"] = try array(data, "intake").mutableCopy()
      data["intakeEntries"] = NSMutableArray()
      data["deletedRecords"] = NSMutableArray(); data["processedOperations"] = NSMutableArray()
      data["schemaVersion"] = 2; data["revision"] = 0
      let validProfile: NSDictionary?
      if let supplied = data["profile"], !(supplied is NSNull) { validProfile = try profile(supplied, today: today(now, calendar)) }
      else { validProfile = nil }
      data["profile"] = validProfile ?? NSNull()
      data["setupCompleted"] = validProfile != nil
      data["guidanceMode"] = "tracking-only"
      data["safetyFlags"] = ["pregnant": NSNull(), "breastfeeding": NSNull(), "eatingDisorderRisk": NSNull()]
      if let goal = data["goalWeightKg"], !(goal is NSNull) { data["goalWeightKg"] = try number(goal, "goalWeightKg", min: 20, max: 300) }
      else { data["goalWeightKg"] = NSNull() }
      if let rate = data["weeklyLossKg"], !(rate is NSNull) { data["weeklyLossKg"] = try number(rate, "weeklyLossKg") }
      else { data["weeklyLossKg"] = NSNull() }
      var legacyIds = Set<String>()
      for (index, row) in try array(data, "legacyIntake").enumerated() {
        guard let row = row as? NSMutableDictionary else { throw RecordsStore.StoreError.invalidStore("legacyIntake") }
        let base = "legacy-intake-" + (try date(row["date"]))
        let id = legacyIds.contains(base) ? base + "-\(index)" : base
        row["id"] = id; legacyIds.insert(id)
      }
    }
    _ = try integer(data["revision"], "revision")
    guard let complete = data["setupCompleted"] as? NSNumber, CFGetTypeID(complete) == CFBooleanGetTypeID() else {
      throw RecordsStore.StoreError.invalidStore("setupCompleted")
    }
    for key in ["legacyIntake", "intakeEntries", "deletedRecords", "processedOperations"] { _ = try array(data, key) }
    for key in ["weights", "water"] {
      for row in try array(data, key) {
        guard let row = row as? NSMutableDictionary else { throw RecordsStore.StoreError.invalidStore(key) }
        let day = try date(row["date"])
        if key == "weights" { _ = try number(row["weightKg"], "weightKg", min: 20, max: 300) }
        else { _ = try number(row["amountMl"], "amountMl") }
        if version == 1 && row["id"] == nil {
          let prefix = row["source"] as? String == "healthkit" ? "hk-weight-" : (key == "weights" ? "weight-" : "water-")
          row["id"] = prefix + day
        }
      }
    }
    try validateState(data)
    try projectIntake(data)
    return before != (try JSONSerialization.data(withJSONObject: data, options: .sortedKeys))
  }

  static func apply(_ mutation: NSDictionary, operationId: String, revision: Int, to data: NSMutableDictionary,
                    now: Date, calendar: Calendar) throws -> String? {
    let type = try string(mutation["type"], "type")
    let day = today(now, calendar)
    switch type {
    case "save-profile":
      let values = try profile(mutation["profile"], today: day)
      let mode = try string(mutation["guidanceMode"], "guidanceMode")
      guard ["tracking-only", "weight-loss"].contains(mode), let flags = mutation["safetyFlags"] as? NSDictionary else {
        throw RecordTransactionError.invalidRequest("guidance")
      }
      let screened = NSMutableDictionary()
      for key in ["pregnant", "breastfeeding", "eatingDisorderRisk"] {
        if flags[key] is NSNull { screened[key] = NSNull() }
        else if let flag = flags[key] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() { screened[key] = flag }
        else { throw RecordTransactionError.invalidRequest(key) }
      }
      let goal: Any = mutation["goalWeightKg"] is NSNull ? NSNull() : try number(mutation["goalWeightKg"], "goalWeightKg", min: 20, max: 300)
      let weekly: Any = mutation["weeklyLossKg"] is NSNull ? NSNull() : try number(mutation["weeklyLossKg"], "weeklyLossKg")
      var initial: Double?
      if let supplied = mutation["initialWeightKg"] {
        guard (data["setupCompleted"] as? NSNumber)?.boolValue == false else { throw RecordTransactionError.invalidRequest("initialWeightKg after setup") }
        initial = try number(supplied, "initialWeightKg", min: 20, max: 300)
      }
      if mode == "weight-loss" {
        var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(secondsFromGMT: 0)!
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.calendar = utc; f.timeZone = utc.timeZone; f.locale = Locale(identifier: "en_US_POSIX")
        let age = utc.dateComponents([.year], from: f.date(from: values["birthDate"] as! String)!, to: f.date(from: day)!).year ?? 0
        let ownWeights = try array(data, "weights").compactMap { $0 as? NSDictionary }.filter { ($0["date"] as? String ?? "") <= day }.sorted { ($0["date"] as! String) < ($1["date"] as! String) }
        let current = initial ?? (ownWeights.last?["weightKg"] as? NSNumber)?.doubleValue
        let height = (values["heightCm"] as! NSNumber).doubleValue / 100
        guard age >= 20, ["pregnant", "breastfeeding", "eatingDisorderRisk"].allSatisfy({ (screened[$0] as? NSNumber)?.boolValue == false }),
              let goal = goal as? Double, let rate = weekly as? Double, (0.5...1).contains(rate),
              let current, current / (height * height) >= 18.5, goal / (height * height) >= 18.5 else {
          throw RecordTransactionError.invalidRequest("weight-loss safety eligibility")
        }
      } else if let rate = weekly as? Double, rate != 0 { throw RecordTransactionError.invalidRequest("tracking-only weeklyLossKg") }
      data["profile"] = values; data["guidanceMode"] = mode; data["safetyFlags"] = screened
      data["goalWeightKg"] = goal; data["weeklyLossKg"] = weekly; data["setupCompleted"] = true
      if let initial {
        _ = try apply(["type": "set-weight", "date": day, "weightKg": initial], operationId: operationId,
                      revision: revision, to: data, now: now, calendar: calendar)
      }
    case "set-weight", "set-water":
      let date = try self.date(mutation["date"]); guard date <= day else { throw RecordTransactionError.invalidRequest("future date") }
      let weight = type == "set-weight", key = weight ? "weights" : "water", amount = weight ? "weightKg" : "amountMl"
      let value = try number(mutation[amount], amount, min: weight ? 20 : 0, max: weight ? 300 : Double.greatestFiniteMagnitude)
      let rows = try array(data, key)
      let at: Int?, id: String
      if let supplied = mutation["id"] {
        id = try string(supplied, "id")
        guard let found = index(rows, value: id), let old = rows[found] as? NSDictionary else { throw RecordTransactionError.notFound }
        try owned(old)
        if let occupied = index(rows, key: "date", value: date), occupied != found { throw RecordTransactionError.conflict("date occupied") }
        at = found
      } else {
        at = index(rows, key: "date", value: date)
        if let at, let old = rows[at] as? NSDictionary, old["source"] == nil || old["source"] as? String == "leanon" {
          id = try string(old["id"], "id")
        } else {
          let base = (weight ? "weight-" : "water-") + date
          let occupied = index(rows, value: base)
          id = occupied != nil && occupied != at ? base + "-" + operationId : base
        }
      }
      if let occupied = index(rows, value: id), occupied != at { throw RecordTransactionError.conflict("record id occupied") }
      let record: NSMutableDictionary
      if let at, let prior = rows[at] as? NSDictionary, prior["source"] == nil || prior["source"] as? String == "leanon" {
        record = prior.mutableCopy() as! NSMutableDictionary
      } else { record = NSMutableDictionary() }
      record["id"] = id; record["date"] = date; record[amount] = value
      if let at { rows[at] = record } else { rows.add(record) }
      data[key] = NSMutableArray(array: rows.compactMap { $0 as? NSDictionary }.sorted { ($0["date"] as! String) < ($1["date"] as! String) })
    case "save-legacy-intake":
      guard let supplied = mutation["sample"] as? NSDictionary else { throw RecordTransactionError.invalidRequest("sample") }
      try validateNutrition(supplied)
      let id = try string(supplied["id"], "id"), date = try self.date(supplied["date"]), rows = try array(data, "legacyIntake")
      guard date <= day else { throw RecordTransactionError.invalidRequest("future date") }
      guard let at = index(rows, value: id), let prior = rows[at] as? NSDictionary else { throw RecordTransactionError.notFound }
      if prior["date"] as? String != date,
         rows.enumerated().contains(where: { $0.offset != at && ($0.element as? NSDictionary)?["date"] as? String == date }) {
        throw RecordTransactionError.conflict("legacy aggregate date occupied")
      }
      let record = prior.mutableCopy() as! NSMutableDictionary
      for key in ["date", "kcal", "macros", "micros"] { record[key] = supplied[key] }
      rows[at] = record
    case "save-exercise", "save-intake":
      let isExercise = type == "save-exercise", key = isExercise ? "exercises" : "intakeEntries"
      guard let supplied = mutation[isExercise ? "exercise" : "entry"] as? NSDictionary else { throw RecordTransactionError.invalidRequest(key) }
      let record = try validatedRecord(supplied, exercise: isExercise, today: day)
      let id = record["id"] as! String, rows = try array(data, key)
      let kind = isExercise ? "exercise" : "intake"
      if try array(data, "deletedRecords").contains(where: {
        guard let deletion = $0 as? NSDictionary, deletion["kind"] as? String == kind,
              let record = deletion["record"] as? NSDictionary else { return false }
        return record["id"] as? String == id
      }) { throw RecordTransactionError.conflict("record is deleted") }
      if let at = index(rows, value: id) {
        let old = rows[at] as! NSDictionary; try owned(old)
        let updated = old.mutableCopy() as! NSMutableDictionary
        for (key, value) in record { updated[key] = value }
        if !isExercise && record["foodId"] == nil { updated.removeObject(forKey: "foodId") }
        rows.removeObject(at: at); rows.add(updated)
      } else { rows.add(record) }
      if !isExercise, let food = record["foodId"] as? String {
        let recent = try array(data, "recentFoodIds").compactMap { $0 as? String }.filter { $0 != food }
        data["recentFoodIds"] = NSMutableArray(array: [food] + Array(recent.prefix(11)))
      }
    case "delete-record":
      let kind = try string(mutation["kind"], "kind"), id = try string(mutation["id"], "id")
      let key = try collection(kind), rows = try array(data, key)
      guard let at = index(rows, value: id), let record = rows[at] as? NSDictionary else { throw RecordTransactionError.notFound }
      try owned(record)
      let token = "undo-" + operationId
      try array(data, "deletedRecords").add(["token": token, "kind": kind, "record": record,
        "deletedAt": ISO8601DateFormatter().string(from: now), "deletedRevision": revision])
      rows.removeObject(at: at)
      return token
    case "restore-record":
      let token = try string(mutation["token"], "token"), deleted = try array(data, "deletedRecords")
      guard let at = index(deleted, key: "token", value: token), let item = deleted[at] as? NSDictionary,
            let record = item["record"] as? NSDictionary else { throw RecordTransactionError.invalidRequest("undo token") }
      let kind = try string(item["kind"], "kind"), key = try collection(kind), rows = try array(data, key)
      let id = try string(record["id"], "id")
      guard index(rows, value: id) == nil else { throw RecordTransactionError.conflict("restore target occupied") }
      if ["weight", "water"].contains(kind), let date = record["date"] as? String, index(rows, key: "date", value: date) != nil {
        throw RecordTransactionError.conflict("restore date occupied")
      }
      rows.add(record); deleted.removeObject(at: at)
      if kind == "weight" || kind == "water" { data[key] = NSMutableArray(array: rows.compactMap { $0 as? NSDictionary }.sorted { ($0["date"] as! String) < ($1["date"] as! String) }) }
    default: throw RecordTransactionError.invalidRequest("mutation type")
    }
    return nil
  }

  private static func collection(_ kind: String) throws -> String {
    switch kind { case "weight": return "weights"; case "water": return "water"
    case "exercise": return "exercises"; case "intake": return "intakeEntries"; case "legacy-intake": return "legacyIntake"
    default: throw RecordTransactionError.invalidRequest("record kind") }
  }

  private static func validateNutrition(_ row: NSDictionary) throws {
    _ = try date(row["date"]); _ = try number(row["kcal"], "kcal")
    for (name, keys) in [("macros", macroKeys), ("micros", microKeys)] {
      guard let values = row[name] as? NSDictionary else { throw RecordTransactionError.invalidRequest(name) }
      for key in keys { _ = try number(values[key], key) }
    }
  }

  private static func validateFlags(_ value: Any?) throws -> NSDictionary {
    guard let flags = value as? NSDictionary else { throw RecordTransactionError.invalidRequest("safetyFlags") }
    for key in ["pregnant", "breastfeeding", "eatingDisorderRisk"] {
      if flags[key] is NSNull { continue }
      guard let flag = flags[key] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else { throw RecordTransactionError.invalidRequest(key) }
    }
    return flags
  }

  /// Validate the entire persisted envelope before exposing a projection or
  /// committing an unrelated write; malformed receipts cannot become replays.
  static func validateState(_ data: NSMutableDictionary) throws {
    let revision = try integer(data["revision"], "revision")
    guard let complete = data["setupCompleted"] as? NSNumber, CFGetTypeID(complete) == CFBooleanGetTypeID() else {
      throw RecordsStore.StoreError.invalidStore("setupCompleted")
    }
    if data["profile"] is NSNull {
      guard !complete.boolValue else { throw RecordsStore.StoreError.invalidStore("setup without profile") }
    } else { _ = try profile(data["profile"], today: "9999-12-31") }
    if !(data["goalWeightKg"] is NSNull) { _ = try number(data["goalWeightKg"], "goalWeightKg", min: 20, max: 300) }
    if !(data["weeklyLossKg"] is NSNull) { _ = try number(data["weeklyLossKg"], "weeklyLossKg") }
    let mode = try string(data["guidanceMode"], "guidanceMode"), flags = try validateFlags(data["safetyFlags"])
    guard ["tracking-only", "weight-loss"].contains(mode) else { throw RecordsStore.StoreError.invalidStore("guidanceMode") }
    if mode == "weight-loss" {
      guard complete.boolValue, !(data["profile"] is NSNull), !(data["goalWeightKg"] is NSNull),
            (0.5...1).contains(try number(data["weeklyLossKg"], "weeklyLossKg")),
            ["pregnant", "breastfeeding", "eatingDisorderRisk"].allSatisfy({ (flags[$0] as? NSNumber)?.boolValue == false }) else {
        throw RecordsStore.StoreError.invalidStore("weight-loss settings")
      }
    }
    func record(_ row: NSDictionary, kind: String) throws {
      _ = try string(row["id"], "id")
      _ = try date(row["date"])
      if let source = row["source"] {
        guard let source = source as? String, ["leanon", "healthkit", "health_connect"].contains(source) else {
          throw RecordsStore.StoreError.invalidStore("source")
        }
      }
      switch kind {
      case "weight": _ = try number(row["weightKg"], "weightKg", min: 20, max: 300)
      case "water": _ = try number(row["amountMl"], "amountMl")
      case "exercise":
        _ = try string(row["typeId"], "typeId"); _ = try number(row["durationMin"], "durationMin", min: 1, max: 1440)
        _ = try number(row["kcal"], "kcal")
      case "intake": _ = try validatedRecord(row, exercise: false, today: "9999-12-31")
      case "legacy-intake": try validateNutrition(row)
      default: throw RecordsStore.StoreError.invalidStore("kind")
      }
    }
    for (key, kind) in [("weights", "weight"), ("water", "water"), ("exercises", "exercise"),
                        ("intakeEntries", "intake"), ("legacyIntake", "legacy-intake")] {
      var ids = Set<String>(), dates = Set<String>()
      for row in try array(data, key) {
        guard let row = row as? NSDictionary else { throw RecordsStore.StoreError.invalidStore(key) }
        try record(row, kind: kind)
        let id = row["id"] as! String, date = row["date"] as! String
        guard ids.insert(id).inserted else { throw RecordsStore.StoreError.invalidStore("duplicate id") }
        if kind == "weight" || kind == "water", !dates.insert(date).inserted { throw RecordsStore.StoreError.invalidStore("duplicate date") }
      }
    }
    for row in try array(data, "intake") {
      guard let row = row as? NSDictionary else { throw RecordsStore.StoreError.invalidStore("intake") }
      try validateNutrition(row)
    }
    var tokens = Set<String>()
    for row in try array(data, "deletedRecords") {
      guard let row = row as? NSDictionary, let saved = row["record"] as? NSDictionary else { throw RecordsStore.StoreError.invalidStore("deletedRecords") }
      let token = try string(row["token"], "token"), kind = try string(row["kind"], "kind")
      guard tokens.insert(token).inserted, let timestamp = row["deletedAt"] as? String,
            ISO8601DateFormatter().date(from: timestamp) != nil else { throw RecordsStore.StoreError.invalidStore("deletion metadata") }
      let deletedRevision = try integer(row["deletedRevision"], "deletedRevision")
      guard deletedRevision > 0, deletedRevision <= revision else { throw RecordsStore.StoreError.invalidStore("deletedRevision") }
      try record(saved, kind: kind); try owned(saved)
    }
    var operations = Set<String>()
    var deletionReceipts: [String: NSDictionary] = [:]
    for row in try array(data, "processedOperations") {
      guard let row = row as? NSDictionary, let mutation = row["mutation"] as? NSDictionary else { throw RecordsStore.StoreError.invalidStore("processedOperations") }
      let id = try string(row["operationId"], "operationId"), applied = try integer(row["appliedRevision"], "appliedRevision")
      guard operations.insert(id).inserted, applied > 0, applied <= revision else { throw RecordsStore.StoreError.invalidStore("operation receipt") }
      try validateMutation(mutation)
      if mutation["type"] as? String == "delete-record" {
        guard let token = row["undoToken"] as? String, token == "undo-" + id else { throw RecordsStore.StoreError.invalidStore("undo receipt") }
        deletionReceipts[token] = row
      } else if row["undoToken"] != nil { throw RecordsStore.StoreError.invalidStore("unexpected undo receipt") }
    }
    for value in try array(data, "deletedRecords") {
      let row = value as! NSDictionary, token = row["token"] as! String
      guard let receipt = deletionReceipts[token], let mutation = receipt["mutation"] as? NSDictionary,
            let saved = row["record"] as? NSDictionary,
            mutation["kind"] as? String == row["kind"] as? String,
            mutation["id"] as? String == saved["id"] as? String,
            receipt["appliedRevision"] as? Int == row["deletedRevision"] as? Int else {
        throw RecordsStore.StoreError.invalidStore("deletion receipt link")
      }
    }
  }

  static func validateMutation(_ mutation: NSDictionary) throws {
    switch try string(mutation["type"], "type") {
    case "save-profile":
      _ = try profile(mutation["profile"], today: "9999-12-31"); _ = try validateFlags(mutation["safetyFlags"])
      guard ["tracking-only", "weight-loss"].contains(try string(mutation["guidanceMode"], "guidanceMode")) else { throw RecordTransactionError.invalidRequest("guidanceMode") }
      if !(mutation["goalWeightKg"] is NSNull) { _ = try number(mutation["goalWeightKg"], "goalWeightKg", min: 20, max: 300) }
      if !(mutation["weeklyLossKg"] is NSNull) { _ = try number(mutation["weeklyLossKg"], "weeklyLossKg") }
      if let initial = mutation["initialWeightKg"] { _ = try number(initial, "initialWeightKg", min: 20, max: 300) }
    case "set-weight", "set-water":
      let weight = mutation["type"] as? String == "set-weight"
      _ = try date(mutation["date"]); _ = try number(mutation[weight ? "weightKg" : "amountMl"], "amount", min: weight ? 20 : 0, max: weight ? 300 : Double.greatestFiniteMagnitude)
      if let id = mutation["id"] { _ = try string(id, "id") }
    case "save-exercise":
      guard let row = mutation["exercise"] as? NSDictionary else { throw RecordTransactionError.invalidRequest("exercise") }
      _ = try validatedRecord(row, exercise: true, today: "9999-12-31")
    case "save-intake":
      guard let row = mutation["entry"] as? NSDictionary else { throw RecordTransactionError.invalidRequest("entry") }
      _ = try validatedRecord(row, exercise: false, today: "9999-12-31")
    case "save-legacy-intake":
      guard let row = mutation["sample"] as? NSDictionary else { throw RecordTransactionError.invalidRequest("sample") }
      _ = try string(row["id"], "id"); try validateNutrition(row)
    case "delete-record": _ = try collection(string(mutation["kind"], "kind")); _ = try string(mutation["id"], "id")
    case "restore-record": _ = try string(mutation["token"], "token")
    default: throw RecordTransactionError.invalidRequest("mutation type")
    }
  }

  private static func validatedRecord(_ row: NSDictionary, exercise: Bool, today: String) throws -> NSDictionary {
    try owned(row)
    let id = try string(row["id"], "id"), date = try self.date(row["date"])
    guard date <= today else { throw RecordTransactionError.invalidRequest("future date") }
    let result = row.mutableCopy() as! NSMutableDictionary
    result["id"] = id; result["date"] = date; result["kcal"] = try number(row["kcal"], "kcal")
    if exercise {
      result["typeId"] = try string(row["typeId"], "typeId")
      result["durationMin"] = try number(row["durationMin"], "durationMin", min: 1, max: 1440)
    } else {
      let meal = try string(row["meal"], "meal")
      guard ["breakfast", "lunch", "dinner", "snack"].contains(meal) else { throw RecordTransactionError.invalidRequest("meal") }
      let grams = try number(row["grams"], "grams"); guard grams > 0 else { throw RecordTransactionError.invalidRequest("grams") }
      result["meal"] = meal; result["grams"] = grams; result["name"] = try string(row["name"], "name", allowOuterWhitespace: true)
      for (name, keys) in [("macros", macroKeys), ("micros", microKeys)] {
        guard let values = row[name] as? NSDictionary else { throw RecordTransactionError.invalidRequest(name) }
        let nutrients = NSMutableDictionary(); for key in keys { nutrients[key] = try number(values[key], key) }; result[name] = nutrients
      }
      if let food = row["foodId"] { result["foodId"] = try string(food, "foodId") }
    }
    return result
  }

  /// Aggregate projections are rebuilt from preserved legacy daily totals and
  /// identifiable active entries; editing an entry never edits its old total.
  static func projectIntake(_ data: NSMutableDictionary) throws {
    var totals: [String: NSMutableDictionary] = [:]
    for key in ["legacyIntake", "intakeEntries"] {
      for row in try array(data, key) {
        guard let row = row as? NSDictionary else { throw RecordsStore.StoreError.invalidStore(key) }
        let date = try self.date(row["date"])
        let kcal = try number(row["kcal"], "kcal")
        guard let macros = row["macros"] as? NSDictionary, let micros = row["micros"] as? NSDictionary else {
          throw RecordsStore.StoreError.invalidStore(key + " nutrients")
        }
        let total = totals[date] ?? NSMutableDictionary(dictionary: ["date": date, "kcal": 0,
          "macros": NSMutableDictionary(dictionary: Dictionary(uniqueKeysWithValues: macroKeys.map { ($0, 0.0) })),
          "micros": NSMutableDictionary(dictionary: Dictionary(uniqueKeysWithValues: microKeys.map { ($0, 0.0) }))])
        total["kcal"] = try number(total["kcal"], "total") + kcal
        for (keys, source, name) in [(macroKeys, macros, "macros"), (microKeys, micros, "micros")] {
          guard let target = total[name] as? NSMutableDictionary else { throw RecordsStore.StoreError.invalidStore(name) }
          for key in keys {
            target[key] = try number(target[key], key) + number(source[key], key)
            _ = try number(target[key], key)
          }
        }
        _ = try number(total["kcal"], "total")
        totals[date] = total
      }
    }
    data["intake"] = NSMutableArray(array: totals.keys.sorted().map { totals[$0]! })
  }
}
