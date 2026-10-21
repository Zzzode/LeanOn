import Foundation
import CoreFoundation

enum ReminderFailure: Error {
  case invalidRequest, permissionDenied, busy
  var code: String {
    switch self { case .invalidRequest: return "invalid-request"
    case .permissionDenied: return "not-authorized"
    case .busy: return "unavailable" }
  }
}

struct ReminderSlot: Codable, Equatable {
  let enabled: Bool
  let hour: Int
  let minute: Int

  init(enabled: Bool, hour: Int, minute: Int) throws {
    guard (0...23).contains(hour), (0...59).contains(minute) else { throw ReminderFailure.invalidRequest }
    self.enabled = enabled; self.hour = hour; self.minute = minute
  }
  init(_ value: Any?) throws {
    guard let value = value as? NSDictionary,
          let enabled = value["enabled"] as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID(),
          let hour = value["hour"] as? NSNumber, CFGetTypeID(hour) != CFBooleanGetTypeID(),
          let minute = value["minute"] as? NSNumber, CFGetTypeID(minute) != CFBooleanGetTypeID(),
          hour.doubleValue.isFinite, minute.doubleValue.isFinite,
          hour.doubleValue.rounded() == hour.doubleValue, minute.doubleValue.rounded() == minute.doubleValue,
          (0...23).contains(hour.doubleValue), (0...59).contains(minute.doubleValue)
    else { throw ReminderFailure.invalidRequest }
    try self.init(enabled: enabled.boolValue, hour: hour.intValue, minute: minute.intValue)
  }
  var dictionary: [String: Any] { ["enabled": enabled, "hour": hour, "minute": minute] }
}

struct NativeReminderSettings: Codable, Equatable {
  let weight: ReminderSlot
  let meals: ReminderSlot
  static let defaults = NativeReminderSettings(
    weight: try! ReminderSlot(enabled: true, hour: 7, minute: 30),
    meals: try! ReminderSlot(enabled: true, hour: 21, minute: 0)
  )
  init(weight: ReminderSlot, meals: ReminderSlot) { self.weight = weight; self.meals = meals }
  init(_ value: Any?) throws {
    guard let value = value as? NSDictionary else { throw ReminderFailure.invalidRequest }
    weight = try ReminderSlot(value["weight"]); meals = try ReminderSlot(value["meals"])
  }
  var dictionary: NSDictionary { ["weight": weight.dictionary, "meals": meals.dictionary] }
}

final class ReminderSettingsStore {
  let url: URL
  private let writer: (Data, URL) throws -> Void
  init(url: URL, writer: @escaping (Data, URL) throws -> Void = { try $0.write(to: $1, options: .atomic) }) {
    self.url = url; self.writer = writer
  }
  func load() throws -> NativeReminderSettings {
    guard FileManager.default.fileExists(atPath: url.path) else { return .defaults }
    return try NativeReminderSettings(JSONSerialization.jsonObject(with: Data(contentsOf: url)))
  }
  func save(_ settings: NativeReminderSettings) throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try writer(JSONEncoder().encode(settings), url)
  }
}

struct ReminderOccurrence: Equatable {
  let kind: String
  let date: Date
  let identifier: String
}

enum ReminderPlanner {
  static let horizonDays = 28
  static let prefix = "leanon.reminder."
  static func plan(settings: NativeReminderSettings, records: NSDictionary, now: Date, calendar: Calendar) -> [ReminderOccurrence] {
    let start = calendar.startOfDay(for: now)
    let day = DateFormatter(); day.calendar = calendar; day.timeZone = calendar.timeZone
    day.locale = Locale(identifier: "en_US_POSIX"); day.dateFormat = "yyyy-MM-dd"
    var result: [ReminderOccurrence] = []
    for offset in 0..<horizonDays {
      guard let date = calendar.date(byAdding: .day, value: offset, to: start) else { continue }
      let dateKey = day.string(from: date)
      for (kind, slot, key) in [("weight", settings.weight, "weights"), ("meals", settings.meals, "intake")] {
        guard slot.enabled, let fire = calendar.date(bySettingHour: slot.hour, minute: slot.minute, second: 0, of: date), fire > now else { continue }
        if (records[key] as? [[String: Any]] ?? []).contains(where: { $0["date"] as? String == dateKey }) { continue }
        result.append(ReminderOccurrence(kind: kind, date: fire, identifier: prefix + kind + "." + dateKey))
      }
    }
    return result
  }
}
