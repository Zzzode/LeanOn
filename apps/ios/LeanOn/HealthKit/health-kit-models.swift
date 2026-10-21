import Foundation
import HealthKit

enum HealthKitSyncError: Error {
  case unsupported, permissionRequired, disabled, busy, invalidRecords, operationFailed
}

struct HealthKitExport: Equatable {
  enum Kind: String, Codable, CaseIterable {
    case weight, workout, energy, protein, carbohydrates, fat, fiber, sugar, saturatedFat, sodium
    static var nutrition: [Kind] { [.energy, .protein, .carbohydrates, .fat, .fiber, .sugar, .saturatedFat, .sodium] }
    var quantityIdentifier: HKQuantityTypeIdentifier? {
      switch self {
      case .weight: return .bodyMass
      case .workout: return nil
      case .energy: return .dietaryEnergyConsumed
      case .protein: return .dietaryProtein
      case .carbohydrates: return .dietaryCarbohydrates
      case .fat: return .dietaryFatTotal
      case .fiber: return .dietaryFiber
      case .sugar: return .dietarySugar
      case .saturatedFat: return .dietaryFatSaturated
      case .sodium: return .dietarySodium
      }
    }
    var nutritionUnit: HKUnit { self == .energy ? .kilocalorie() : .gram() }
  }
  let id: String
  let kind: Kind
  let start: Date
  let end: Date
  let weightKg: Double?
  let activity: HKWorkoutActivityType?
  var quantityValue: Double? = nil
  var indoor: Bool? = nil
  var fingerprint: String {
    let base = "\(kind.rawValue)|\(start.timeIntervalSince1970)|\(end.timeIntervalSince1970)|\(weightKg ?? 0)|\(activity?.rawValue ?? 0)"
    return base + (quantityValue.map { "|quantity:\($0)" } ?? "") + (indoor.map { "|indoor:\($0)" } ?? "")
  }
}

struct HealthKitExternalWeight {
  let id: String
  let date: Date
  let weightKg: Double
  let syncIdentifier: String?
  let sourceBundle: String
}

struct HealthKitExternalWorkout {
  let id: String
  let start: Date
  let end: Date
  let activity: HKWorkoutActivityType
  let syncIdentifier: String?
  let sourceBundle: String
  var indoor: Bool? = nil
}

/// No read-authorization flag: HealthKit intentionally does not expose it.
protocol HealthKitClient {
  var supported: Bool { get }
  var writeAuthorized: Bool { get }
  var nutritionWriteAuthorized: Bool { get }
  func isWriteAuthorized(for kind: HealthKitExport.Kind) -> Bool
  func requestPermission() async throws
  func readWeights(since: Date, until: Date) async throws -> [HealthKitExternalWeight]
  func readWorkouts(since: Date, until: Date) async throws -> [HealthKitExternalWorkout]
  func save(_ record: HealthKitExport, version: Int) async throws
  func delete(id: String, kind: HealthKitExport.Kind) async throws
}

extension HealthKitClient {
  var nutritionWriteAuthorized: Bool { HealthKitExport.Kind.nutrition.allSatisfy { isWriteAuthorized(for: $0) } }
  func isWriteAuthorized(for kind: HealthKitExport.Kind) -> Bool {
    // Older injected clients remain conservative for newly introduced scopes.
    !HealthKitExport.Kind.nutrition.contains(kind) && writeAuthorized
  }
}

enum HealthKitMapping {
  private static let mappings: [String: HKWorkoutActivityType] = [
    "walking": .walking, "walking-brisk": .walking, "hiking": .hiking,
    "jogging": .running, "running": .running, "running-fast": .running,
    "cycling": .cycling, "cycling-stationary": .cycling,
    "swimming": .swimming, "swimming-slow": .swimming,
    "strength": .traditionalStrengthTraining, "strength-hard": .traditionalStrengthTraining,
    "hiit": .highIntensityIntervalTraining, "elliptical": .elliptical,
    "rope": .jumpRope, "yoga": .yoga, "pilates": .pilates, "stairs": .stairClimbing,
    "badminton": .badminton, "basketball": .basketball, "soccer": .soccer,
    "tennis": .tennis, "table-tennis": .tableTennis, "dance": .cardioDance,
  ]
  private static let reverse: [HKWorkoutActivityType: (String, Double)] = [
    .walking: ("walking", 2.5), .hiking: ("hiking", 6), .running: ("jogging", 7),
    .cycling: ("cycling", 7.5), .swimming: ("swimming-slow", 4.5),
    .traditionalStrengthTraining: ("strength", 5), .functionalStrengthTraining: ("strength", 5),
    .highIntensityIntervalTraining: ("hiit", 8), .elliptical: ("elliptical", 5),
    .yoga: ("yoga", 3), .pilates: ("pilates", 3), .stairClimbing: ("stairs", 8),
    .badminton: ("badminton", 5.5), .basketball: ("basketball", 6.5), .soccer: ("soccer", 7),
    .tennis: ("tennis", 7.3), .tableTennis: ("table-tennis", 4),
    .cardioDance: ("dance", 5), .socialDance: ("dance", 5), .dance: ("dance", 5),
  ]

  static func date(_ day: String, hour: Int) throws -> Date {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.isLenient = false
    guard day.count == 10, let date = formatter.date(from: day), formatter.string(from: date) == day else {
      throw HealthKitSyncError.invalidRecords
    }
    return date.addingTimeInterval(Double(hour) * 3600)
  }

  static func day(_ date: Date, timeZone: TimeZone) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = timeZone
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }

  static func own(_ sample: [String: Any]) -> Bool {
    sample["source"] == nil || sample["source"] as? String == "leanon"
  }

  private static func number(_ value: Any?) -> Double? {
    guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
    return value.doubleValue
  }

  static func exports(_ host: NSDictionary) throws -> [HealthKitExport] {
    guard let weights = host["weights"] as? [[String: Any]],
      let exercises = host["exercises"] as? [[String: Any]] else { throw HealthKitSyncError.invalidRecords }
    var result: [HealthKitExport] = []
    for sample in weights where own(sample) {
      guard let day = sample["date"] as? String, let kg = number(sample["weightKg"]),
        kg.isFinite, (20...300).contains(kg) else { throw HealthKitSyncError.invalidRecords }
      let start = try date(day, hour: 7)
      result.append(HealthKitExport(id: "leanon-weight-\(day)", kind: .weight,
        start: start, end: start, weightKg: kg, activity: nil))
    }
    for sample in exercises where own(sample) {
      guard let id = sample["id"] as? String, !id.isEmpty, let day = sample["date"] as? String,
        let type = sample["typeId"] as? String, let duration = number(sample["durationMin"]),
        duration.isFinite, (1...1440).contains(duration) else { throw HealthKitSyncError.invalidRecords }
      let start = try date(day, hour: 18)
      result.append(HealthKitExport(id: "leanon-exercise-\(id)", kind: .workout,
        start: start, end: start.addingTimeInterval(duration * 60), weightKg: nil,
        activity: mappings[type] ?? .other,
        indoor: type == "cycling-stationary" ? true : (type == "cycling" ? false : nil)))
    }
    if let raw = host["intake"] {
      guard let intake = raw as? [[String: Any]] else { throw HealthKitSyncError.invalidRecords }
      for sample in intake where own(sample) {
        guard let day = sample["date"] as? String,
          let kcal = number(sample["kcal"]), kcal.isFinite, kcal >= 0,
          let macros = sample["macros"] as? [String: Any] else { throw HealthKitSyncError.invalidRecords }
        let micros: [String: Any]
        if let rawMicros = sample["micros"] {
          guard let parsed = rawMicros as? [String: Any] else { throw HealthKitSyncError.invalidRecords }
          micros = parsed
        } else { micros = [:] }
        var quantities: [(HealthKitExport.Kind, Double)] = [(.energy, kcal)]
        for (key, kind) in [("proteinG", HealthKitExport.Kind.protein), ("carbsG", .carbohydrates), ("fatG", .fat)] {
          guard let value = number(macros[key]), value.isFinite, value >= 0 else { throw HealthKitSyncError.invalidRecords }
          quantities.append((kind, value))
        }
        for (key, kind) in [("fiberG", HealthKitExport.Kind.fiber), ("sugarG", .sugar),
                            ("saturatedFatG", .saturatedFat), ("sodiumMg", .sodium)] {
          guard micros[key] != nil else { continue }
          guard let value = number(micros[key]), value.isFinite, value >= 0 else { throw HealthKitSyncError.invalidRecords }
          if value > 0 { quantities.append((kind, kind == .sodium ? value / 1000 : value)) }
        }
        let start = try date(day, hour: 20)
        let end = try date(day, hour: 21)
        for (kind, value) in quantities {
          result.append(.init(id: "leanon-nutrition-\(day)-\(kind.rawValue)", kind: kind,
            start: start, end: end, weightKg: nil, activity: nil, quantityValue: value))
        }
      }
    }
    guard Set(result.map(\.id)).count == result.count else { throw HealthKitSyncError.invalidRecords }
    return result
  }

  static func mirrors(weights: [HealthKitExternalWeight], workouts: [HealthKitExternalWorkout],
    host: NSDictionary, bundle: String, timeZone: TimeZone) -> ([[String: Any]], [[String: Any]]) {
    func external(_ sync: String?, _ source: String) -> Bool {
      source != bundle && !(sync?.hasPrefix("leanon-") ?? false)
    }
    var byDay: [String: HealthKitExternalWeight] = [:]
    for weight in weights where external(weight.syncIdentifier, weight.sourceBundle) {
      guard weight.weightKg.isFinite, (20...300).contains(weight.weightKg) else { continue }
      let key = day(weight.date, timeZone: timeZone)
      if byDay[key].map({ $0.date < weight.date || ($0.date == weight.date && $0.id < weight.id) }) ?? true {
        byDay[key] = weight
      }
    }
    let weightMirrors: [[String: Any]] = byDay.keys.sorted().compactMap { key in
      guard let item = byDay[key] else { return nil }
      return ["id": "hk-weight-\(key)", "date": key, "weightKg": item.weightKg, "source": "healthkit"]
    }
    let localWeights = (host["weights"] as? [[String: Any]] ?? []).filter { own($0) }
    let localDays = Set(localWeights.compactMap { $0["date"] as? String })
    let effectiveWeights = localWeights + weightMirrors.filter { !localDays.contains($0["date"] as? String ?? "") }
    let current = effectiveWeights.sorted {
      ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "")
    }.last?["weightKg"] as? Double ?? 0
    guard current.isFinite, current > 0 else { return (weightMirrors, []) }
    var seen = Set<String>()
    let exerciseMirrors: [[String: Any]] = workouts.compactMap { item in
      guard external(item.syncIdentifier, item.sourceBundle), !item.id.isEmpty,
        seen.insert(item.id).inserted, let resolved = reverse[item.activity] else { return nil }
      let (type, met) = item.activity == .cycling && item.indoor == true ? ("cycling-stationary", 7.0) : resolved
      let minutes = (item.end.timeIntervalSince(item.start) / 60).rounded()
      guard minutes.isFinite, (1...1440).contains(minutes) else { return nil }
      let kcal = (met * current * minutes / 60).rounded()
      return ["id": "hk-\(item.id)", "date": day(item.start, timeZone: timeZone),
        "typeId": type, "durationMin": minutes, "kcal": kcal, "source": "healthkit"]
    }
    return (weightMirrors, exerciseMirrors)
  }
}
