import Lynx

/// Native module backing the `notification.*` methods.
@objc(LeanOnNotificationModule)
final class NotificationModule: NSObject, LynxModule {

  @objc static func name() -> String { "notification" }

  @objc static func methodLookup() -> [String: String] {
    [
      "schedule": NSStringFromSelector(#selector(schedule(_:callback:))),
    ]
  }

  @objc func schedule(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: schedule/cancel local notifications from {enabled, reminderTypes,
    // quietHours}; callback {ok: true}.
  }
}
