import Foundation
import Lynx

@objc(LeanOnHealthKitModule)
final class HealthKitModule: NSObject, LynxModule {
  private let manager: HealthKitManager
  @objc override init() { manager = ServiceRegistry.shared.healthKit; super.init() }
  @objc init(param: Any) { manager = ServiceRegistry.shared.healthKit; super.init() }
  init(manager: HealthKitManager) { self.manager = manager; super.init() }
  @objc static var name: String { "healthKit" }
  @objc static var methodLookup: [String: String] {
    ["getStatus": NSStringFromSelector(#selector(getStatus(_:callback:))),
     "requestPermission": NSStringFromSelector(#selector(requestPermission(_:callback:))),
     "setEnabled": NSStringFromSelector(#selector(setEnabled(_:callback:))),
     "sync": NSStringFromSelector(#selector(sync(_:callback:)))]
  }

  @objc func getStatus(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    respond(callback) { try await self.manager.status() }
  }
  @objc func requestPermission(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    respond(callback) { try await self.manager.requestPermission() }
  }
  @objc func setEnabled(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    guard let value = params["enabled"] as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else {
      callback(["code": "invalid-request", "message": "enabled must be a boolean"])
      return
    }
    respond(callback) {
      let result = try await self.manager.setEnabled(value.boolValue)
      if value.boolValue { self.manager.onRecordsChanged() }
      return result
    }
  }
  @objc func sync(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    respond(callback) { try await self.manager.sync() }
  }

  private func respond(_ callback: @escaping (NSDictionary) -> Void,
    operation: @escaping () async throws -> NSDictionary) {
    Task {
      let result: NSDictionary
      do { result = try await operation() }
      catch { result = Self.failure(error) }
      DispatchQueue.main.async { callback(result) }
    }
  }

  static func failure(_ error: Error) -> NSDictionary {
    switch error {
    case HealthKitSyncError.unsupported:
      return ["code": "unavailable", "message": "HealthKit is unavailable on this device"]
    case HealthKitSyncError.permissionRequired:
      return ["code": "not-authorized", "message": "Review HealthKit access before syncing"]
    case HealthKitSyncError.disabled:
      return ["code": "unavailable", "message": "HealthKit sync is disabled"]
    case HealthKitSyncError.busy:
      return ["code": "unavailable", "message": "A HealthKit operation is already running"]
    default:
      return ["code": "unavailable", "message": "HealthKit sync could not finish. Try again."]
    }
  }
}
