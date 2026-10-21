import Foundation
import Lynx

/// Native module backing the `notification.*` methods.
@objc(LeanOnNotificationModule)
final class NotificationModule: NSObject, LynxModule {

  @objc override init() {
    super.init()
  }

  @objc init(param: Any) {
    super.init()
  }

  @objc static var name: String { "notification" }

  @objc static var methodLookup: [String: String] {
    [
      "schedule": NSStringFromSelector(#selector(schedule(_:callback:))),
      "getSettings": NSStringFromSelector(#selector(getSettings(_:callback:))),
      "updateSettings": NSStringFromSelector(#selector(updateSettings(_:callback:))),
      "requestPermission": NSStringFromSelector(#selector(requestPermission(_:callback:))),
    ]
  }

  @objc func schedule(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    callback(["code": "unavailable", "message": "Generic one-off notifications are not implemented"])
  }

  @objc func getSettings(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    do { callback(try ServiceRegistry.shared.reminders.getSettings()) }
    catch { callback(Self.failure(error)) }
  }
  @objc func updateSettings(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    do {
      let settings = try NativeReminderSettings(params["settings"])
      ServiceRegistry.shared.reminders.update(settings) { Self.resolve($0, callback) }
    } catch { callback(Self.failure(error)) }
  }
  @objc func requestPermission(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    ServiceRegistry.shared.reminders.requestPermission { Self.resolve($0, callback) }
  }
  private static func resolve(_ result: Result<NSDictionary, Error>, _ callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async {
      switch result { case .success(let value): callback(value); case .failure(let error): callback(failure(error)) }
    }
  }
  private static func failure(_ error: Error) -> NSDictionary {
    ["code": (error as? ReminderFailure)?.code ?? "unavailable", "message": String(describing: error)]
  }
}
