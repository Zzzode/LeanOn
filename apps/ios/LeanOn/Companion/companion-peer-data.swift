import Foundation
import CoreFoundation

/// Validate decrypted family DTOs before committing the encrypted cache or acknowledging.
enum CompanionPeerData {
  static let fields = ["goal": "goal", "progress_band": "progressBand", "checkin_streak": "checkinStreak", "meals": "meals",
    "photos": "photos", "menstrual": "menstrual", "exact_weight": "exactWeightKg", "body_measurements": "measurements"]
  static func validate(_ category: String, value: [String: Any]) throws {
    guard value["kind"] as? String == "family-category", value["category"] as? String == category,
      try CompanionStateFile.integer(value["version"]) == 1, value["data"] != nil,
      Set(value.keys).isSubset(of: Set(category == "photos" ? ["version", "kind", "category", "data", "photoBytes"] : ["version", "kind", "category", "data"])) else { throw CompanionError.invalidResponse }
    try PersonalSchema.json(value)
    let input = value["data"]!
    switch category {
    case "goal":
      guard let data = input as? NSDictionary, ["weight-loss", "tracking-only"].contains(data["guidanceMode"] as? String ?? "") else { throw CompanionError.invalidResponse }
      try PersonalSchema.exactKeys(data, ["guidanceMode", "weeklyLossKg"])
      if let weekly = data["weeklyLossKg"] { try number(weekly, minimum: 0, maximum: 1) }
    case "progress_band": guard ["steady", "changing", "maintaining", "insufficient-data"].contains(input as? String ?? "") else { throw CompanionError.invalidResponse }
    case "checkin_streak": let count = try CompanionStateFile.integer(input); guard count <= 100000 else { throw CompanionError.invalidResponse }
    case "exact_weight": if !(input is NSNull) { try number(input, minimum: 20, maximum: 300) }
    case "meals":
      guard let rows = input as? [NSDictionary], rows.count <= 1000 else { throw CompanionError.invalidResponse }
      for row in rows {
        try PersonalSchema.exactKeys(row, ["date", "name", "kcal"]); _ = try RecordSchema.date(row["date"])
        guard let name = row["name"] as? String, name.utf16.count <= 1000 else { throw CompanionError.invalidResponse }
        try number(row["kcal"], minimum: 0, maximum: 1000000)
      }
    case "body_measurements":
      guard let rows = input as? [NSDictionary], rows.count <= 100000 else { throw CompanionError.invalidResponse }
      var ids = Set<String>()
      for row in rows { _ = try PersonalSchema.measurement(row, today: "9999-12-31"); guard ids.insert(try PersonalSchema.id(row["id"])).inserted else { throw CompanionError.invalidResponse } }
    case "photos":
      guard let metadata = input as? [NSDictionary], metadata.count <= 1000,
        let blobs = value["photoBytes"] as? [NSDictionary], blobs.count == metadata.count else { throw CompanionError.invalidResponse }
      var ids = Set<String>(), byteMap: [String: Data] = [:], total = 0
      for blob in blobs {
        try PersonalSchema.exactKeys(blob, ["id", "bytesBase64"])
        let id = try PersonalSchema.id(blob["id"]), bytes = try CompanionCrypto.base64(blob["bytesBase64"])
        guard byteMap[id] == nil, bytes.count <= 20 * 1024 * 1024 else { throw CompanionError.invalidResponse }
        total += bytes.count; guard total <= 32 * 1024 * 1024 else { throw CompanionError.invalidResponse }; byteMap[id] = bytes
      }
      for row in metadata {
        _ = try PersonalSchema.photo(row, today: "9999-12-31")
        let id = try PersonalSchema.id(row["id"])
        guard ids.insert(id).inserted, let bytes = byteMap[id] else { throw CompanionError.invalidResponse }
        try PrivatePhotoImage.validatePersisted(bytes, metadata: row)
      }
    case "menstrual":
      guard let rows = input as? [NSDictionary], rows.count <= 1000 else { throw CompanionError.invalidResponse }
      for row in rows {
        try PersonalSchema.exactKeys(row, ["startDate", "cycleLengthDays"]); _ = try RecordSchema.date(row["startDate"])
        if let length = row["cycleLengthDays"] { try number(length, minimum: 1, maximum: 365) }
      }
    default: throw CompanionError.invalidResponse
    }
  }
  static func number(_ value: Any?, minimum: Double, maximum: Double) throws {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
      (minimum...maximum).contains(number.doubleValue) else { throw CompanionError.invalidResponse }
  }
}
