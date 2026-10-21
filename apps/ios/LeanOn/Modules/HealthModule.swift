import Foundation
import Lynx

/// Native module backing local health records; HealthKit access is separate.
@objc(LeanOnHealthModule)
final class HealthModule: NSObject, LynxModule {
  private let recordsStore: RecordsStore
  private var publish: (NSDictionary) -> Void = { hostData in
    ServiceRegistry.shared.didWriteRecords(hostData)
  }

  @objc override init() {
    recordsStore = ServiceRegistry.shared.recordsStore
    super.init()
  }

  @objc init(param: Any) {
    recordsStore = ServiceRegistry.shared.recordsStore
    super.init()
  }

  init(recordsStore: RecordsStore, publish: ((NSDictionary) -> Void)? = nil) {
    self.recordsStore = recordsStore
    if let publish { self.publish = publish }
    super.init()
  }

  @objc static var name: String { "health" }

  @objc static var methodLookup: [String: String] {
    [
      "authorize": NSStringFromSelector(#selector(authorize(_:callback:))),
      "readSamples": NSStringFromSelector(#selector(readSamples(_:callback:))),
      "writeWeight": NSStringFromSelector(#selector(writeWeight(_:callback:))),
      "writeIntake": NSStringFromSelector(#selector(writeIntake(_:callback:))),
      "writeWater": NSStringFromSelector(#selector(writeWater(_:callback:))),
      "setFoodFavorite": NSStringFromSelector(#selector(setFoodFavorite(_:callback:))),
      "writeCustomFood": NSStringFromSelector(#selector(writeCustomFood(_:callback:))),
      "updateCustomFood": NSStringFromSelector(#selector(updateCustomFood(_:callback:))),
      "deleteCustomFood": NSStringFromSelector(#selector(deleteCustomFood(_:callback:))),
      "writeScannedFood": NSStringFromSelector(#selector(writeScannedFood(_:callback:))),
      "writeExercise": NSStringFromSelector(#selector(writeExercise(_:callback:))),
      "updateExercise": NSStringFromSelector(#selector(updateExercise(_:callback:))),
      "deleteExercise": NSStringFromSelector(#selector(deleteExercise(_:callback:))),
    ]
  }

  @objc func authorize(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    callback(Self.error("unavailable", "HealthKit authorization is not implemented"))
  }

  @objc func readSamples(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    callback(Self.error("unavailable", "Use the platform HealthKit sync APIs."))
  }

  @objc func writeWeight(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      let date = try Self.date(params)
      let weight = try Self.number(params, "weightKg")
      guard weight >= 20, weight <= 300 else {
        throw InvalidRequest("Weight must be between 20 and 300 kg")
      }
      return try recordsStore.addWeight(date: date, weightKg: weight)
    }
  }

  /// Add to the existing daily aggregate; this does not invent meal entries.
  @objc func writeIntake(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      let date = try Self.date(params)
      let kcal = try Self.number(params, "kcal", positive: true)
      guard let macros = params["macros"] as? NSDictionary else {
        throw InvalidRequest("Missing macros")
      }
      let protein = try Self.number(macros, "proteinG")
      let carbs = try Self.number(macros, "carbsG")
      let fat = try Self.number(macros, "fatG")
      var micros = NSDictionary()
      if let supplied = params["micros"], !(supplied is NSNull) {
        guard let values = supplied as? NSDictionary else { throw InvalidRequest("Invalid micros") }
        micros = values
      }
      let fiber = try Self.number(micros, "fiberG", defaultValue: 0)
      let sugar = try Self.number(micros, "sugarG", defaultValue: 0)
      let saturated = try Self.number(micros, "saturatedFatG", defaultValue: 0)
      let sodium = try Self.number(micros, "sodiumMg", defaultValue: 0)
      let foodId: String?
      if let supplied = params["foodId"], !(supplied is NSNull) {
        guard let id = supplied as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
          throw InvalidRequest("Invalid foodId")
        }
        foodId = id
      } else { foodId = nil }
      return try recordsStore.addIntake(
        date: date, kcal: kcal, proteinG: protein, carbsG: carbs, fatG: fat,
        fiberG: fiber, sugarG: sugar, saturatedFatG: saturated, sodiumMg: sodium,
        foodId: foodId
      )
    }
  }

  @objc func writeWater(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      try recordsStore.upsertWater(date: Self.date(params), amountMl: Self.number(params, "amountMl"))
    }
  }

  @objc func setFoodFavorite(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      let id = try Self.string(params, "id")
      guard let value = params["favorite"] as? NSNumber,
            CFGetTypeID(value) == CFBooleanGetTypeID() else { throw InvalidRequest("Invalid favorite") }
      return try recordsStore.setFoodFavorite(id: id, favorite: value.boolValue)
    }
  }

  @objc func writeCustomFood(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) { try recordsStore.addCustomFood(Self.food(params)) }
  }

  @objc func updateCustomFood(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      try recordsStore.updateCustomFood(id: Self.string(params, "id"), fields: Self.food(params))
    }
  }

  @objc func deleteCustomFood(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) { try recordsStore.deleteCustomFood(id: Self.string(params, "id")) }
  }

  @objc func writeScannedFood(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      guard let barcode = ProductBarcode.normalize(try Self.string(params, "barcode")) else {
        throw InvalidRequest("Invalid product barcode")
      }
      return try recordsStore.upsertScannedFood(barcode: barcode, fields: Self.food(params))
    }
  }

  @objc func writeExercise(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      let values = try Self.exercise(params)
      return try recordsStore.addExercise(date: values.date, typeId: values.typeId,
        durationMin: values.duration, kcal: values.kcal)
    }
  }

  @objc func updateExercise(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) {
      let id = try Self.string(params, "id")
      let values = try Self.exercise(params)
      return try recordsStore.updateExercise(id: id, date: values.date, typeId: values.typeId,
        durationMin: values.duration, kcal: values.kcal)
    }
  }

  @objc func deleteExercise(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    mutate(callback) { try recordsStore.deleteExercise(id: Self.string(params, "id")) }
  }

  /// Only a successfully persisted snapshot is broadcast or returned as success.
  private func mutate(_ callback: (NSDictionary) -> Void, operation: () throws -> NSDictionary) {
    do {
      let hostData = try operation()
      publish(hostData)
      callback(["success": true, "hostData": hostData])
    } catch let error as InvalidRequest {
      callback(Self.error("invalid-request", error.message))
    } catch let error as RecordsStore.StoreError {
      switch error {
      case .invalidValue: callback(Self.error("invalid-request", error.localizedDescription))
      case .foodNotFound, .exerciseNotFound: callback(Self.error("not-found", error.localizedDescription))
      default: callback(Self.error("unavailable", error.localizedDescription))
      }
    } catch {
      callback(Self.error("unavailable", error.localizedDescription))
    }
  }

  private struct InvalidRequest: Error {
    let message: String
    init(_ message: String) { self.message = message }
  }

  private static func string(_ params: NSDictionary, _ key: String) throws -> String {
    guard let value = params[key] as? String,
      !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw InvalidRequest("Missing or invalid \(key)")
    }
    return value
  }

  private static func date(_ params: NSDictionary) throws -> String {
    let value = try string(params, "date")
    guard RecordsStore.validDate(value) else { throw InvalidRequest("Invalid date") }
    return value
  }

  private static func number(_ params: NSDictionary, _ key: String,
    positive: Bool = false, defaultValue: Double? = nil) throws -> Double {
    if params[key] == nil, let fallback = defaultValue { return fallback }
    guard let number = params[key] as? NSNumber,
      CFGetTypeID(number) != CFBooleanGetTypeID() else { throw InvalidRequest("Invalid \(key)") }
    let value = number.doubleValue
    guard value.isFinite, positive ? value > 0 : value >= 0 else {
      throw InvalidRequest("Invalid \(key)")
    }
    return value
  }

  private static func food(_ params: NSDictionary) throws -> RecordsStore.FoodFields {
    var fields = RecordsStore.FoodFields(name: try string(params, "name"),
                                        kcal: try number(params, "kcal", positive: true))
    fields.proteinG = try number(params, "proteinG", defaultValue: 0)
    fields.carbsG = try number(params, "carbsG", defaultValue: 0)
    fields.fatG = try number(params, "fatG", defaultValue: 0)
    fields.fiberG = try number(params, "fiberG", defaultValue: 0)
    fields.sugarG = try number(params, "sugarG", defaultValue: 0)
    fields.saturatedFatG = try number(params, "saturatedFatG", defaultValue: 0)
    fields.sodiumMg = try number(params, "sodiumMg", defaultValue: 0)
    if let grams = params["defaultGrams"], !(grams is NSNull) {
      fields.defaultGrams = try number(params, "defaultGrams", positive: true)
    }
    return fields
  }

  private static func exercise(_ params: NSDictionary) throws -> (date: String, typeId: String, duration: Double, kcal: Double) {
    let duration = try number(params, "durationMin", positive: true)
    guard duration >= 1, duration <= 1440 else { throw InvalidRequest("Duration must be between 1 and 1440 minutes") }
    return (try date(params), try string(params, "typeId"), duration, try number(params, "kcal", positive: true))
  }

  private static func error(_ code: String, _ message: String) -> NSDictionary {
    ["code": code, "message": message]
  }
}
