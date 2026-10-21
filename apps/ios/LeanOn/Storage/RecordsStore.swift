import Foundation

/// Native persistence authority for the existing HostData JSON format.
/// Writes are serialized, atomic and throwing. Unreadable established records
/// are preserved rather than silently replaced with demonstration data.
final class RecordsStore {
  enum StoreError: LocalizedError {
    case seedNotFound
    case invalidStore(String)
    case invalidValue(String)
    case exerciseNotFound(String)
    case foodNotFound(String)

    var errorDescription: String? {
      switch self {
      case .seedNotFound: return "The initial record fixture is unavailable"
      case .invalidStore(let field): return "Invalid stored records: \(field)"
      case .invalidValue(let field): return "Invalid record value: \(field)"
      case .exerciseNotFound(let id): return "Exercise session not found: \(id)"
      case .foodNotFound(let id): return "User food not found: \(id)"
      }
    }
  }

  private let recordsURL: URL
  let encryptedFile: EncryptedRecordsFile
  private let seedURL: URL?
  private let lock = NSRecursiveLock()
  private let clock: () -> Date
  private let calendar: () -> Calendar

  convenience init() {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    var destination = documents.appendingPathComponent("records.json")
    #if DEBUG
    // Simulator regression runs can use a disposable fixture. Release uses Documents.
    if let path = ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"], !path.isEmpty {
      destination = URL(fileURLWithPath: path)
    }
    #endif
    self.init(recordsURL: destination, keys: NativeStoreKeys.make(role: .records, url: destination,
      legacyAccount: EncryptedRecordsFile.account(destination), context: "LeanOn records v2", prefix: EncryptedRecordsFile.prefix))
  }

  /// Explicit URLs keep tests away from the app's normal Documents directory.
  init(recordsURL: URL, seedURL: URL? = nil,
       clock: @escaping () -> Date = RecordsStore.currentTime,
       calendar: @escaping () -> Calendar = RecordsStore.currentCalendar,
       keys: NativeDataKeyProviding? = nil) {
    self.recordsURL = recordsURL
    encryptedFile = EncryptedRecordsFile(url: recordsURL, keys: keys ?? RecordFixtureKeys.forURL(recordsURL))
    self.seedURL = seedURL
    self.clock = clock
    self.calendar = calendar
  }

  /// Compatibility read used by app initialization. A failure never destroys
  /// the existing file; mutations propagate the underlying error.
  func loadHostData() -> NSDictionary {
    lock.lock()
    defer { lock.unlock() }
    do { return try snapshot(loadMutableAndMigrate()) }
    catch {
      NSLog("[LeanOnStore] load failed: \(error)")
      return NSDictionary()
    }
  }

  /// Runtime metadata is derived from the local clock, never the seed's frozen date.
  func currentSnapshot() throws -> NSDictionary {
    lock.lock()
    defer { lock.unlock() }
    return runtimeSnapshot(try snapshot(loadMutableAndMigrate()))
  }

  /// Throwing read for adapters: unreadable established records must never export as empty.
  func loadSnapshot() throws -> NSDictionary {
    lock.lock()
    defer { lock.unlock() }
    return try snapshot(loadMutableAndMigrate())
  }

  @discardableResult
  func addWeight(date: String, weightKg: Double) throws -> NSDictionary {
    guard !date.isEmpty, weightKg.isFinite, (20...300).contains(weightKg) else {
      throw StoreError.invalidValue("weight")
    }
    return try mutate { data in
      let weights = try self.array(data, key: "weights")
      let at = self.index(in: weights, matching: "date", value: date)
      let sample: NSMutableDictionary
      if let at, let old = weights[at] as? NSDictionary, old["source"] == nil || old["source"] as? String == "leanon" {
        sample = old.mutableCopy() as! NSMutableDictionary
      } else {
        let base = "weight-" + date
        let occupied = self.index(in: weights, matching: "id", value: base)
        let id = occupied != nil && occupied != at ? base + "-" + UUID().uuidString : base
        sample = NSMutableDictionary(dictionary: ["id": id])
      }
      sample["date"] = date; sample["weightKg"] = weightKg
      if let at { weights[at] = sample } else { weights.add(sample) }
      data["weights"] = try self.sortedWeights(weights)
    }
  }

  /// Accumulate food into the daily total, preserving older aggregate records.
  @discardableResult
  func addIntake(
    date: String, kcal: Double, proteinG: Double, carbsG: Double, fatG: Double,
    fiberG: Double = 0, sugarG: Double = 0, saturatedFatG: Double = 0,
    sodiumMg: Double = 0, foodId: String? = nil
  ) throws -> NSDictionary {
    let macros = ["proteinG": proteinG, "carbsG": carbsG, "fatG": fatG]
    let micros = ["fiberG": fiberG, "sugarG": sugarG, "saturatedFatG": saturatedFatG, "sodiumMg": sodiumMg]
    guard !date.isEmpty,
          ([kcal] + Array(macros.values) + Array(micros.values)).allSatisfy({ $0.isFinite && $0 >= 0 }) else {
      throw StoreError.invalidValue("nutrition")
    }
    return try mutate { data in
      let intake = try self.array(data, key: "legacyIntake")
      if let index = self.index(in: intake, matching: "date", value: date) {
        guard let sample = intake[index] as? NSMutableDictionary,
              let oldKcal = sample["kcal"] as? NSNumber,
              let storedMacros = sample["macros"] as? NSMutableDictionary,
              let storedMicros = sample["micros"] as? NSMutableDictionary else {
          throw StoreError.invalidStore("intake")
        }
        sample["kcal"] = try self.total(oldKcal.doubleValue, adding: kcal)
        try self.accumulate(macros, into: storedMacros)
        try self.accumulate(micros, into: storedMicros)
      } else {
        let base = "legacy-intake-" + date
        let id = self.index(in: intake, matching: "id", value: base) == nil ? base : base + "-" + UUID().uuidString
        intake.add(["id": id, "date": date, "kcal": kcal, "macros": macros, "micros": micros])
      }
      if let foodId, !foodId.isEmpty { try self.touchRecent(data, foodId: foodId) }
    }
  }

  @discardableResult
  func addExercise(date: String, typeId: String, durationMin: Double, kcal: Double) throws -> NSDictionary {
    try validateExercise(date: date, typeId: typeId, durationMin: durationMin, kcal: kcal)
    return try mutate { data in
      try self.array(data, key: "exercises").add([
        "id": Self.newExerciseId(), "date": date, "typeId": typeId,
        "durationMin": durationMin, "kcal": kcal,
      ])
    }
  }

  @discardableResult
  func updateExercise(id: String, date: String, typeId: String, durationMin: Double, kcal: Double) throws -> NSDictionary {
    try validateExercise(date: date, typeId: typeId, durationMin: durationMin, kcal: kcal)
    return try mutate { data in
      let exercises = try self.array(data, key: "exercises")
      guard let index = self.index(in: exercises, matching: "id", value: id),
            let session = exercises[index] as? NSMutableDictionary else {
        throw StoreError.exerciseNotFound(id)
      }
      try self.validateEditableExercise(session)
      session["date"] = date
      session["typeId"] = typeId
      session["durationMin"] = durationMin
      session["kcal"] = kcal
    }
  }

  @discardableResult
  func deleteExercise(id: String) throws -> NSDictionary {
    return try mutate { data in
      let exercises = try self.array(data, key: "exercises")
      guard let index = self.index(in: exercises, matching: "id", value: id) else {
        throw StoreError.exerciseNotFound(id)
      }
      guard let session = exercises[index] as? NSDictionary else { throw StoreError.invalidStore("exercises") }
      try self.validateEditableExercise(session)
      exercises.removeObject(at: index)
    }
  }

  struct FoodFields {
    let name: String
    let kcal: Double
    var proteinG: Double = 0
    var carbsG: Double = 0
    var fatG: Double = 0
    var fiberG: Double = 0
    var sugarG: Double = 0
    var saturatedFatG: Double = 0
    var sodiumMg: Double = 0
    var defaultGrams: Double? = nil
  }

  /// Absolute daily total, including zero after removing the last cup.
  @discardableResult
  func upsertWater(date: String, amountMl: Double) throws -> NSDictionary {
    guard Self.validDate(date), amountMl.isFinite, amountMl >= 0 else {
      throw StoreError.invalidValue("water")
    }
    return try mutate { data in
      let water = try self.array(data, key: "water")
      let at = self.index(in: water, matching: "date", value: date)
      let sample: NSMutableDictionary
      if let at, let old = water[at] as? NSDictionary { sample = old.mutableCopy() as! NSMutableDictionary }
      else {
        let base = "water-" + date
        let id = self.index(in: water, matching: "id", value: base) == nil ? base : base + "-" + UUID().uuidString
        sample = NSMutableDictionary(dictionary: ["id": id])
      }
      sample["date"] = date; sample["amountMl"] = amountMl
      if let at { water[at] = sample } else { water.add(sample) }
    }
  }

  /// Unknown ids are allowed so bundled foods need no native catalog.
  @discardableResult
  func setFoodFavorite(id: String, favorite: Bool) throws -> NSDictionary {
    try validateFoodId(id)
    return try mutate { data in
      let current = try self.array(data, key: "favoriteFoodIds")
      let result = NSMutableArray()
      for item in current {
        guard let existing = item as? String else { throw StoreError.invalidStore("favoriteFoodIds") }
        if existing != id || favorite { result.add(existing) }
      }
      if favorite && !result.contains(id) { result.add(id) }
      data["favoriteFoodIds"] = result
    }
  }

  @discardableResult
  func addCustomFood(_ fields: FoodFields) throws -> NSDictionary {
    let item = try foodItem(fields, id: "custom-\(UUID().uuidString.lowercased())", source: "custom")
    return try mutate { data in try self.array(data, key: "customFoods").add(item) }
  }

  /// Full editable-field replacement preserves origin, barcode and future metadata.
  @discardableResult
  func updateCustomFood(id: String, fields: FoodFields) throws -> NSDictionary {
    try validateFoodId(id)
    let editable = try foodItem(fields, id: id, source: "custom")
    return try mutate { data in
      let foods = try self.array(data, key: "customFoods")
      guard let index = self.index(in: foods, matching: "id", value: id),
            let item = foods[index] as? NSMutableDictionary else { throw StoreError.foodNotFound(id) }
      try self.validateUserFood(item)
      for key in ["name", "kcal", "macros", "micros"] { item[key] = editable[key] }
      if let grams = editable["defaultGrams"] { item["defaultGrams"] = grams }
      else { item.removeObject(forKey: "defaultGrams") }
    }
  }

  @discardableResult
  func deleteCustomFood(id: String) throws -> NSDictionary {
    try validateFoodId(id)
    return try mutate { data in
      let foods = try self.array(data, key: "customFoods")
      guard let index = self.index(in: foods, matching: "id", value: id),
            let item = foods[index] as? NSDictionary else { throw StoreError.foodNotFound(id) }
      try self.validateUserFood(item)
      foods.removeObject(at: index)
      for key in ["favoriteFoodIds", "recentFoodIds"] {
        let references = try self.array(data, key: key)
        let remaining = NSMutableArray()
        for value in references {
          guard let existing = value as? String else { throw StoreError.invalidStore(key) }
          if existing != id { remaining.add(existing) }
        }
        data[key] = remaining
      }
    }
  }

  /// Persistence only; camera scanning and network lookup are separate capabilities.
  @discardableResult
  func upsertScannedFood(barcode: String, fields: FoodFields) throws -> NSDictionary {
    try validateFoodId(barcode)
    let id = "off-\(barcode)"
    let item = try foodItem(fields, id: id, source: "open-food-facts")
    item["barcode"] = barcode
    return try mutate { data in
      let foods = try self.array(data, key: "customFoods")
      if let index = self.index(in: foods, matching: "id", value: id) { foods[index] = item }
      else { foods.add(item) }
    }
  }

  private func foodItem(_ fields: FoodFields, id: String, source: String) throws -> NSMutableDictionary {
    let name = fields.name.trimmingCharacters(in: .whitespacesAndNewlines)
    let values = [fields.proteinG, fields.carbsG, fields.fatG, fields.fiberG,
                  fields.sugarG, fields.saturatedFatG, fields.sodiumMg]
    guard !name.isEmpty, fields.kcal.isFinite, fields.kcal > 0,
          values.allSatisfy({ $0.isFinite && $0 >= 0 }),
          fields.defaultGrams.map({ $0.isFinite && $0 > 0 }) ?? true else {
      throw StoreError.invalidValue("food")
    }
    let item = NSMutableDictionary(dictionary: [
      "id": id, "name": ["en": name, "zh-CN": name], "kcal": fields.kcal, "source": source,
      "macros": ["proteinG": fields.proteinG, "carbsG": fields.carbsG, "fatG": fields.fatG],
      "micros": ["fiberG": fields.fiberG, "sugarG": fields.sugarG,
                 "saturatedFatG": fields.saturatedFatG, "sodiumMg": fields.sodiumMg],
    ])
    if let grams = fields.defaultGrams { item["defaultGrams"] = grams }
    return item
  }

  private func validateUserFood(_ item: NSDictionary) throws {
    let source = item["source"] as? String ?? "custom"
    guard source == "custom" || source == "open-food-facts" else {
      throw StoreError.invalidValue("food is not user-owned")
    }
  }

  private func validateFoodId(_ id: String) throws {
    guard !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw StoreError.invalidValue("food id")
    }
  }

  static func validDate(_ value: String) -> Bool {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.isLenient = false
    guard value.count == 10, let parsed = formatter.date(from: value) else { return false }
    return formatter.string(from: parsed) == value
  }

  /// Replace only HealthKit mirrors, preserving all local and other-source records.
  @discardableResult
  func replaceHealthKitMirrors(weights: [[String: Any]], exercises: [[String: Any]]) throws -> NSDictionary {
    var mirroredWeights: [String: [String: Any]] = [:]
    for weight in weights {
      guard let date = weight["date"] as? String, Self.validDate(date),
            let kg = Self.mirrorNumber(weight["weightKg"]), (20...300).contains(kg) else {
        throw StoreError.invalidValue("HealthKit weight")
      }
      mirroredWeights[date] = ["id": "hk-weight-\(date)", "date": date, "weightKg": kg, "source": "healthkit"]
    }
    var mirroredExercises: [[String: Any]] = []
    var ids = Set<String>()
    for exercise in exercises {
      guard let id = exercise["id"] as? String, id.hasPrefix("hk-"), !ids.contains(id),
            let date = exercise["date"] as? String, Self.validDate(date),
            let typeId = exercise["typeId"] as? String, !typeId.isEmpty,
            let duration = Self.mirrorNumber(exercise["durationMin"]), (1...1440).contains(duration),
            let kcal = Self.mirrorNumber(exercise["kcal"]), kcal >= 0 else {
        throw StoreError.invalidValue("HealthKit exercise")
      }
      ids.insert(id)
      mirroredExercises.append(["id": id, "date": date, "typeId": typeId,
        "durationMin": duration, "kcal": kcal, "source": "healthkit"])
    }
    return try mutate { data in
      let localWeights = NSMutableArray()
      var ownDates = Set<String>()
      for item in try self.array(data, key: "weights") {
        guard let weight = item as? NSDictionary, let date = weight["date"] as? String else {
          throw StoreError.invalidStore("weights")
        }
        if weight["source"] as? String == "healthkit" { continue }
        ownDates.insert(date); localWeights.add(weight)
      }
      for date in mirroredWeights.keys.sorted() where !ownDates.contains(date) {
        localWeights.add(mirroredWeights[date]!)
      }
      let localExercises = NSMutableArray()
      for item in try self.array(data, key: "exercises") {
        guard let exercise = item as? NSDictionary else { throw StoreError.invalidStore("exercises") }
        if exercise["source"] as? String != "healthkit" { localExercises.add(exercise) }
      }
      for item in mirroredExercises { localExercises.add(item) }
      data["weights"] = try self.sortedWeights(localWeights)
      data["exercises"] = localExercises
    }
  }

  private func sortedWeights(_ weights: NSMutableArray) throws -> NSMutableArray {
    var records: [NSDictionary] = []
    for value in weights {
      guard let sample = value as? NSDictionary, let date = sample["date"] as? String,
            Self.validDate(date) else { throw StoreError.invalidStore("weights") }
      records.append(sample)
    }
    return NSMutableArray(array: records.sorted {
      ($0["date"] as! String) < ($1["date"] as! String)
    })
  }

  private func validateEditableExercise(_ session: NSDictionary) throws {
    guard session["source"] as? String != "healthkit" else {
      throw StoreError.invalidValue("HealthKit exercise is read-only")
    }
  }

  private static func mirrorNumber(_ value: Any?) -> Double? {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          number.doubleValue.isFinite else { return nil }
    return number.doubleValue
  }

  // MARK: Atomic transactions

  private func mutate(_ operation: (NSMutableDictionary) throws -> Void) throws -> NSDictionary {
    lock.lock()
    defer { lock.unlock() }
    // Migrations are committed with the requested mutation, never beforehand.
    let data = try loadMutableAndMigrate(persistMigration: false)
    try operation(data)
    try RecordSchema.projectIntake(data)
    let revision = try RecordSchema.integer(data["revision"], "revision")
    guard revision < 9_007_199_254_740_991 else { throw StoreError.invalidStore("revision exhausted") }
    data["revision"] = revision + 1
    try RecordSchema.validateState(data)
    let result = runtimeSnapshot(try snapshot(data))
    try persist(data)
    return result
  }

  private func runtimeSnapshot(_ raw: NSDictionary) -> NSDictionary {
    let result = raw.mutableCopy() as! NSMutableDictionary
    let now = clock()
    let localCalendar = calendar()
    let formatter = DateFormatter()
    formatter.calendar = localCalendar
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = localCalendar.timeZone
    formatter.dateFormat = "yyyy-MM-dd"
    let today = formatter.string(from: now)
    result["today"] = today
    result["todayHour"] = localCalendar.component(.hour, from: now)
    var recorded = Set<String>()
    for (key, positiveKey) in [("weights", "weightKg"), ("intake", "kcal"),
                               ("exercises", "durationMin"), ("water", "amountMl")] {
      for row in raw[key] as? [[String: Any]] ?? [] {
        if let day = row["date"] as? String, Self.validDate(day), day <= today,
           let amount = Self.mirrorNumber(row[positiveKey]), amount > 0 { recorded.insert(day) }
      }
    }
    var cursor = localCalendar.startOfDay(for: now)
    if !recorded.contains(today), let yesterday = localCalendar.date(byAdding: .day, value: -1, to: cursor) {
      cursor = yesterday
    }
    var streak = 0
    while recorded.contains(formatter.string(from: cursor)) {
      streak += 1
      guard let previous = localCalendar.date(byAdding: .day, value: -1, to: cursor) else { break }
      cursor = previous
    }
    result["streak"] = streak
    return result.copy() as! NSDictionary
  }

  /// QA time and zone overrides are ignored outside an isolated DEBUG record run.
  static func currentTime() -> Date {
    #if DEBUG
    let environment = ProcessInfo.processInfo.environment
    if environment["LEANON_QA_CLOCK_PATH"] != nil { return isolatedQAClock(environment)?.now ?? Date() }
    if let path = environment["LEANON_RECORDS_PATH"], !path.isEmpty,
       let value = environment["LEANON_QA_NOW"], let date = ISO8601DateFormatter().date(from: value) { return date }
    #endif
    return Date()
  }

  static func currentCalendar() -> Calendar {
    var result = Calendar(identifier: .gregorian)
    result.timeZone = .current
    #if DEBUG
    let environment = ProcessInfo.processInfo.environment
    if environment["LEANON_QA_CLOCK_PATH"] != nil {
      if let clock = isolatedQAClock(environment) { result.timeZone = clock.zone }
      return result
    }
    if let path = environment["LEANON_RECORDS_PATH"], !path.isEmpty,
       let value = environment["LEANON_QA_TIME_ZONE"], let zone = TimeZone(identifier: value) { result.timeZone = zone }
    #endif
    return result
  }

  #if DEBUG
  /// Only the exact disposable app may read its explicitly paired clock fixture.
  private static func isolatedQAClock(_ environment: [String: String]) -> (now: Date, zone: TimeZone)? {
    guard Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa",
          let records = environment["LEANON_RECORDS_PATH"], records.hasPrefix("/tmp/leanon-daily-ui-"),
          let path = environment["LEANON_QA_CLOCK_PATH"], path == records + ".clock.json",
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return nil }
    return parseQAClock(data)
  }
  static func parseQAClock(_ data: Data) -> (now: Date, zone: TimeZone)? {
    guard let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let instant = value["now"] as? String, let now = ISO8601DateFormatter().date(from: instant),
          let name = value["timeZone"] as? String, let zone = TimeZone(identifier: name) else { return nil }
    return (now, zone)
  }
  #endif

  private func snapshot(_ data: NSMutableDictionary) throws -> NSDictionary {
    let raw = try JSONSerialization.data(withJSONObject: data)
    guard let result = try JSONSerialization.jsonObject(with: raw) as? NSDictionary else {
      throw StoreError.invalidStore("root")
    }
    return result
  }

  private func array(_ data: NSMutableDictionary, key: String) throws -> NSMutableArray {
    if data[key] == nil { data[key] = NSMutableArray() }
    guard let result = data[key] as? NSMutableArray else { throw StoreError.invalidStore(key) }
    return result
  }

  private func index(in array: NSMutableArray, matching key: String, value: String) -> Int? {
    array.enumerated().first { (_, item) in
      (item as? NSDictionary)?[key] as? String == value
    }?.offset
  }

  private func validateExercise(date: String, typeId: String, durationMin: Double, kcal: Double) throws {
    guard !date.isEmpty, !typeId.isEmpty, durationMin.isFinite, durationMin > 0,
          durationMin <= 1440, kcal.isFinite, kcal >= 0 else { throw StoreError.invalidValue("exercise") }
  }

  private func total(_ old: Double, adding value: Double) throws -> Double {
    let result = old + value
    guard old.isFinite, old >= 0, result.isFinite else { throw StoreError.invalidStore("nutrition total") }
    return result
  }

  private func accumulate(_ values: [String: Double], into stored: NSMutableDictionary) throws {
    for (key, value) in values {
      guard let old = stored[key] as? NSNumber else { throw StoreError.invalidStore(key) }
      stored[key] = try total(old.doubleValue, adding: value)
    }
  }

  /// Latest first, capped at the same 12 entries as Android.
  private func touchRecent(_ data: NSMutableDictionary, foodId: String) throws {
    let current = try array(data, key: "recentFoodIds")
    let updated = NSMutableArray(object: foodId)
    for item in current {
      guard let id = item as? String else { throw StoreError.invalidStore("recentFoodIds") }
      if id == foodId { continue }
      if updated.count >= 12 { break }
      updated.add(id)
    }
    data["recentFoodIds"] = updated
  }

  // MARK: Loading and compatible migrations

  private func loadMutableAndMigrate(persistMigration: Bool = false) throws -> NSMutableDictionary {
    try NativeStoreRecoveryGate.require(recordsURL)
    let exists = FileManager.default.fileExists(atPath: recordsURL.path)
    let raw: Data
    if exists { raw = try encryptedFile.read() }
    else if let seedURL { raw = try Data(contentsOf: seedURL) }
    else { raw = try JSONSerialization.data(withJSONObject: RecordSchema.empty()) }
    guard let data = try JSONSerialization.jsonObject(with: raw, options: [.mutableContainers]) as? NSMutableDictionary else {
      throw StoreError.invalidStore("root")
    }
    var changed = !exists
    let legacy = data["schemaVersion"] == nil || (try? RecordSchema.integer(data["schemaVersion"], "schemaVersion")) == 1
    if legacy {
      if try ensureExerciseIds(data) { changed = true }
      if try ensureMicros(data) { changed = true }
    }
    do {
      if try RecordSchema.migrate(data, now: clock(), calendar: calendar()) { changed = true }
      try RecordSchema.projectIntake(data)
    } catch { throw StoreError.invalidStore(error.localizedDescription) }
    // Only explicit isolated fixture injection can initialize during a read.
    // Established legacy files and formal empty setup remain byte-unchanged.
    if changed && (persistMigration || (!exists && seedURL != nil)) { try persist(data) }
    return data
  }

  private func ensureExerciseIds(_ data: NSMutableDictionary) throws -> Bool {
    let wasMissing = data["exercises"] == nil
    let exercises = try array(data, key: "exercises")
    var changed = wasMissing
    for (index, item) in exercises.enumerated() {
      guard let session = item as? NSMutableDictionary else { throw StoreError.invalidStore("exercises") }
      if (session["id"] as? String ?? "").isEmpty {
        session["id"] = "ex-legacy-\(index)-\(session["date"] as? String ?? "unknown")"
        changed = true
      }
    }
    return changed
  }

  private func ensureMicros(_ data: NSMutableDictionary) throws -> Bool {
    var changed = false
    for key in ["intake", "customFoods"] {
      guard data[key] != nil else { continue }
      for item in try array(data, key: key) {
        guard let record = item as? NSMutableDictionary else { throw StoreError.invalidStore(key) }
        if record["micros"] == nil {
          record["micros"] = NSMutableDictionary(dictionary: Self.zeroMicros())
          changed = true
        }
      }
    }
    return changed
  }

  private func persist(_ object: Any) throws {
    let raw = try JSONSerialization.data(withJSONObject: object)
    try encryptedFile.write(raw)
  }

  /// Backup holds this lock, then the personal collection lock, throughout CAS and journal commit.
  func withExclusiveAccess<T>(_ body: () throws -> T) rethrows -> T {
    lock.lock(); defer { lock.unlock() }; return try body()
  }

  /// Receipt lookup happens before the revision check, so retrying an already
  /// committed operation can recover after a lost bridge response.
  func transact(_ request: NSDictionary) throws -> NSDictionary {
    lock.lock(); defer { lock.unlock() }
    let data = try loadMutableAndMigrate(persistMigration: false)
    let operationId = try RecordSchema.string(request["operationId"], "operationId")
    let expected = try RecordSchema.integer(request["expectedRevision"], "expectedRevision")
    guard let mutation = request["mutation"] as? NSDictionary else { throw RecordTransactionError.invalidRequest("mutation") }
    guard JSONSerialization.isValidJSONObject(mutation) else { throw RecordTransactionError.invalidRequest("non-JSON mutation") }
    try RecordSchema.validateMutation(mutation)
    let receipts = try RecordSchema.array(data, "processedOperations")
    if let index = RecordSchema.index(receipts, key: "operationId", value: operationId), let receipt = receipts[index] as? NSDictionary {
      guard let prior = receipt["mutation"] as? NSDictionary, RecordSchema.sameJSON(prior, mutation) else {
        throw RecordTransactionError.invalidRequest("operationId reused with another mutation")
      }
      let response = NSMutableDictionary(dictionary: ["success": true, "hostData": runtimeSnapshot(try snapshot(data)),
        "appliedRevision": receipt["appliedRevision"]!, "replayed": true])
      if let token = receipt["undoToken"] { response["undoToken"] = token }
      return response
    }
    let revision = try RecordSchema.integer(data["revision"], "revision")
    guard expected == revision else { throw RecordTransactionError.conflict("stale revision") }
    guard revision < 9_007_199_254_740_991 else { throw StoreError.invalidStore("revision exhausted") }
    let next = revision + 1
    let token = try RecordSchema.apply(mutation, operationId: operationId, revision: next, to: data, now: clock(), calendar: calendar())
    try RecordSchema.projectIntake(data)
    data["revision"] = next
    let receipt = NSMutableDictionary(dictionary: ["operationId": operationId, "mutation": mutation, "appliedRevision": next])
    if let token { receipt["undoToken"] = token }
    receipts.add(receipt)
    try RecordSchema.validateState(data)
    let response = NSMutableDictionary(dictionary: ["success": true, "hostData": runtimeSnapshot(try snapshot(data)), "appliedRevision": next, "replayed": false])
    if let token { response["undoToken"] = token }
    try persist(data)
    return response
  }

  private static func zeroMicros() -> [String: Double] {
    ["fiberG": 0, "sugarG": 0, "saturatedFatG": 0, "sodiumMg": 0]
  }

  private static func newExerciseId() -> String {
    "ex-\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
  }
}
