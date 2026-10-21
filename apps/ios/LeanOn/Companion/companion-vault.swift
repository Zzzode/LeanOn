import Foundation
import CryptoKit

/// Mirrors packages/data/src/vault-merge.ts; entity clocks survive unrelated edits.
enum CompanionVault {
  static let collections = [("weights", "weight"), ("water", "water"), ("exercises", "exercise"),
    ("legacyIntake", "legacy-intake"), ("intakeEntries", "intake")]
  static let profileFields = ["setupCompleted", "profile", "goalWeightKg", "weeklyLossKg", "guidanceMode", "safetyFlags"]
  static func entities(_ payload: [String: Any]) throws -> [String: Any] {
    guard let records = payload["records"] as? [String: Any], let personal = payload["personal"] as? [String: Any] else { throw CompanionError.invalidResponse }
    var result: [String: Any] = [:], profile: [String: Any] = [:]
    for field in profileFields { guard let value = records[field] else { throw CompanionError.invalidResponse }; profile[field] = value }
    result["profile"] = profile
    for (field, scope) in collections { for row in try rows(records[field]) { result[scope + ":" + (try id(row))] = row } }
    guard let preferences = personal["dietaryPreferences"] else { throw CompanionError.invalidResponse }
    result["preferences"] = preferences
    for (field, scope) in [("measurements", "measurement"), ("photos", "photo")] {
      for row in try rows(personal[field]) { result[scope + ":" + (try id(row))] = row }
    }
    for row in try rows(payload["customFoods"]) { result["custom-food:" + (try id(row))] = row }
    guard let favorites = payload["favoriteFoodIds"] as? [String], let recent = payload["recentFoodIds"] as? [String] else { throw CompanionError.invalidResponse }
    result["favorites"] = favorites; result["recent"] = recent
    return result
  }
  static func export(_ payload: [String: Any], state: inout [String: Any], clock: CompanionMergeClock) throws -> [String: Any] {
    let current = try entities(payload), previous = state["lastExportValues"] as? [String: Any] ?? [:]
    var clocks = state["entityClocks"] as? [String: Any] ?? [:]
    var tombs = Set(state["customFoodTombstones"] as? [String] ?? [])
    let records = payload["records"] as! [String: Any], personal = payload["personal"] as! [String: Any]
    let recordReceipts = records["processedOperations"] as? [[String: Any]] ?? [], personalReceipts = personal["processedOperations"] as? [[String: Any]] ?? []
    for (key, value) in current where try previous[key] == nil || !same(value, previous[key]!) {
      var stamp = clock
      if previous[key] == nil {
        let defaultProfile = key == "profile" && records["profile"] is NSNull && !recordReceipts.contains { ($0["mutation"] as? [String: Any])?["type"] as? String == "save-profile" }
        let defaultPreferences = try key == "preferences" && (same(value, ["pattern":"none","excludedFoodIds":[],"notes":""])) && !personalReceipts.contains { ($0["mutation"] as? [String: Any])?["type"] as? String == "set-dietary-preferences" }
        let emptyList = ["favorites", "recent"].contains(key) && (value as? [String])?.isEmpty == true
        if defaultProfile || defaultPreferences || emptyList { stamp = CompanionMergeClock(updatedAt:0,deviceId:clock.deviceId,changeId:clock.changeId) }
      }
      clocks[key] = stamp.json
    }
    for key in previous.keys where current[key] == nil && key.hasPrefix("custom-food:") {
      tombs.insert(String(key.dropFirst("custom-food:".count))); clocks[key] = clock.json
    }
    state["lastExportValues"] = current; state["entityClocks"] = clocks; state["customFoodTombstones"] = tombs.sorted()
    let wire: [String: Any] = ["version": 1, "kind": "vault-snapshot", "payload": payload, "clocks": clocks,
      "tombstones": ["customFoods": tombs.sorted()]]
    return wire
  }
  static func validate(_ value: [String: Any]) throws {
    guard Set(value.keys) == Set(["version", "kind", "payload", "clocks", "tombstones"]),
      try CompanionStateFile.integer(value["version"]) == 1, value["kind"] as? String == "vault-snapshot",
      let payload = value["payload"] as? [String: Any], let clocks = value["clocks"] as? [String: [String: Any]],
      let tombs = value["tombstones"] as? [String: Any], Set(tombs.keys) == Set(["customFoods"]),
      let foods = tombs["customFoods"] as? [String], foods.count <= 10_000, Set(foods).count == foods.count else { throw CompanionError.invalidResponse }
    _ = try BackupSchema.validate(payload as NSDictionary)
    for (key, clock) in clocks { guard !key.isEmpty, key.count <= 256, Set(clock.keys) == Set(["updatedAt", "deviceId", "id"]) else { throw CompanionError.invalidResponse }; _ = try CompanionMergeClock(clock) }
    for key in try entities(payload).keys where clocks[key] == nil { throw CompanionError.invalidResponse }
  }
  static func merge(local: [String: Any], remote: [String: Any]) throws -> [String: Any] {
    try validate(local); try validate(remote)
    let a = local["payload"] as! [String: Any], b = remote["payload"] as! [String: Any]
    let ac = local["clocks"] as! [String: [String: Any]], bc = remote["clocks"] as! [String: [String: Any]]
    let ar = a["records"] as! [String: Any], br = b["records"] as! [String: Any]
    let ap = a["personal"] as! [String: Any], bp = b["personal"] as! [String: Any]
    let ae = try entities(a), be = try entities(b)
    // Swift normalizes String identity; never silently collapse distinct JS UTF-16 IDs.
    for left in ae.keys {
      if let right = be.keys.first(where: {$0 == left}), Array(left.utf16) != Array(right.utf16) { throw CompanionError.unsupportedIdentity }
    }
    var clocks = ac
    for (key, stamp) in bc {
      if try clocks[key] == nil || CompanionMergeClock(clocks[key]!) < CompanionMergeClock(stamp) { clocks[key] = stamp }
    }
    func choose(_ key: String) throws -> Any? {
      guard let right = be[key] else { return ae[key] }
      guard let left = ae[key] else { return right }
      guard let acl = ac[key], let bcl = bc[key] else { throw CompanionError.invalidResponse }
      let x = try CompanionMergeClock(acl), y = try CompanionMergeClock(bcl)
      if try x == y && !same(left, right) { throw CompanionError.invalidResponse }
      return x < y ? right : left
    }
    var payload = a, records = ar, personal = ap
    let ro = try unionRows(ar["processedOperations"], br["processedOperations"], key: "operationId")
    let po = try unionRows(ap["processedOperations"], bp["processedOperations"], key: "operationId")
    let restored = Set(ro.compactMap { row -> String? in
      let mutation = row["mutation"] as? [String: Any]; return mutation?["type"] as? String == "restore-record" ? mutation?["token"] as? String : nil
    })
    let deletions = try unionRows(ar["deletedRecords"], br["deletedRecords"], key: "token").filter { !restored.contains($0["token"] as? String ?? "") }
    records["processedOperations"] = ro; records["deletedRecords"] = deletions; personal["processedOperations"] = po
    for (field, scope) in collections {
      let removed = Set(deletions.filter {$0["kind"] as? String == scope}.compactMap { ($0["record"] as? [String: Any])?["id"] as? String })
      var selected = try Set(ae.keys).union(be.keys).filter {$0.hasPrefix(scope + ":")}.sorted(by: utf16Less).compactMap { key -> [String: Any]? in
        guard !removed.contains(String(key.dropFirst(scope.count + 1))) else { return nil }; return try choose(key) as? [String: Any]
      }
      if field == "weights" || field == "water" {
        var daily: [String: [String: Any]] = [:]
        for row in selected {
          guard let date = row["date"] as? String else { throw CompanionError.invalidResponse }
          if let previous = daily[date] {
            let first = try CompanionMergeClock(clocks[scope + ":" + (try id(previous))]!)
            let second = try CompanionMergeClock(clocks[scope + ":" + (try id(row))]!)
            if try first == second && !same(previous, row) { throw CompanionError.invalidResponse }
            if first < second { daily[date] = row }
          } else { daily[date] = row }
        }
        selected = daily.values.sorted { utf16Less($0["id"] as! String, $1["id"] as! String) }
      }
      records[field] = selected
    }
    guard let profile = try choose("profile") as? [String: Any] else { throw CompanionError.invalidResponse }
    for field in profileFields { records[field] = profile[field] }
    personal["dietaryPreferences"] = try choose("preferences")
    for (field, scope, type) in [("measurements", "measurement", "delete-measurement"), ("photos", "photo", "delete-photo")] {
      let removed = Set(po.compactMap { row -> String? in
        let mutation = row["mutation"] as? [String: Any]; return mutation?["type"] as? String == type ? mutation?["id"] as? String : nil
      })
      personal[field] = try Set(ae.keys).union(be.keys).filter {$0.hasPrefix(scope + ":")}.sorted(by: utf16Less).compactMap { key -> [String: Any]? in
        guard !removed.contains(String(key.dropFirst(scope.count + 1))) else { return nil }; return try choose(key) as? [String: Any]
      }
    }
    let tombA = (local["tombstones"] as! [String: Any])["customFoods"] as! [String]
    let tombB = (remote["tombstones"] as! [String: Any])["customFoods"] as! [String]
    let tombs = Set(tombA + tombB)
    payload["customFoods"] = try Set(ae.keys).union(be.keys).filter {$0.hasPrefix("custom-food:")}.sorted(by: utf16Less).compactMap { key -> [String: Any]? in
      guard !tombs.contains(String(key.dropFirst("custom-food:".count))) else { return nil }; return try choose(key) as? [String: Any]
    }
    payload["favoriteFoodIds"] = try choose("favorites"); payload["recentFoodIds"] = try choose("recent")
    payload["photos"] = try (personal["photos"] as! [[String: Any]]).map { photo -> [String: Any] in
      let photoId = try id(photo), key = "photo:" + photoId
      let useRemote: Bool
      if ae[key] == nil { useRemote = true }
      else if be[key] == nil { useRemote = false }
      else {
        let first = try CompanionMergeClock(ac[key]!), second = try CompanionMergeClock(bc[key]!)
        if first == second {
          let firstBytes = try rows(a["photos"]).first(where: {$0["id"] as? String == photoId})
          let secondBytes = try rows(b["photos"]).first(where: {$0["id"] as? String == photoId})
          guard let firstBytes, let secondBytes, try same(firstBytes, secondBytes) else { throw CompanionError.invalidResponse }
        }
        useRemote = first < second
      }
      guard let bytes = try rows((useRemote ? b : a)["photos"]).first(where: {$0["id"] as? String == photoId}) else { throw CompanionError.invalidResponse }
      return bytes
    }
    let projected = NSMutableDictionary(dictionary: records); try RecordSchema.projectIntake(projected); records = projected as! [String: Any]
    payload["records"] = records; payload["personal"] = personal
    if !(try same(comparable(payload), comparable(a))) {
      let rr = max(try CompanionStateFile.integer(ar["revision"]), try CompanionStateFile.integer(br["revision"]))
      let pr = max(try CompanionStateFile.integer(ap["revision"]), try CompanionStateFile.integer(bp["revision"]))
      guard rr < 9_007_199_254_740_991, pr < 9_007_199_254_740_991 else { throw CompanionError.invalidResponse }
      records["revision"] = rr + 1; personal["revision"] = pr + 1
      payload["records"] = records; payload["personal"] = personal
    }
    _ = try BackupSchema.validate(payload as NSDictionary)
    return ["version": 1, "kind": "vault-snapshot", "payload": payload, "clocks": clocks, "tombstones": ["customFoods": tombs.sorted()]]
  }
  private static func comparable(_ value: [String: Any]) -> [String: Any] {
    var copy = value; copy["createdAt"] = "2000-01-01T00:00:00Z"
    var records = copy["records"] as! [String: Any], personal = copy["personal"] as! [String: Any]
    records["revision"] = 0; personal["revision"] = 0; copy["records"] = records; copy["personal"] = personal; return copy
  }
  static func utf16Less(_ a: String, _ b: String) -> Bool { a.utf16.lexicographicallyPrecedes(b.utf16) }
  static func digest(_ value: Any) throws -> String {
    SHA256.hash(data: try CompanionCrypto.json(value)).map { String(format: "%02x", $0) }.joined()
  }
  static func wireDigest(_ wire: [String: Any]) throws -> String {
    var copy = wire
    if var payload = copy["payload"] as? [String: Any] { payload["createdAt"] = "2000-01-01T00:00:00Z"; copy["payload"] = payload }
    return try digest(copy)
  }
  static func same(_ a: Any, _ b: Any) throws -> Bool { try CompanionCrypto.json(a) == CompanionCrypto.json(b) }
  static func rows(_ value: Any?) throws -> [[String: Any]] { guard let rows = value as? [[String: Any]], rows.count <= 100_000 else { throw CompanionError.invalidResponse }; return rows }
  static func id(_ row: [String: Any]) throws -> String { guard let id = row["id"] as? String, !id.isEmpty else { throw CompanionError.invalidResponse }; return id }
  private static func unionRows(_ a: Any?, _ b: Any?, key: String) throws -> [[String: Any]] {
    var result: [String: [String: Any]] = [:]
    for row in try rows(a) + rows(b) {
      guard let id = row[key] as? String else { throw CompanionError.invalidResponse }
      if let old = result[id], !(try same(old, row)) { throw CompanionError.invalidResponse }
      result[id] = row
    }
    return result.keys.sorted(by: utf16Less).compactMap { result[$0] }
  }
}
