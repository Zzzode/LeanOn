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
    ]
  }

  @objc func schedule(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: schedule/cancel local notifications from {enabled, reminderTypes,
    // quietHours}; callback {ok: true}.
  }
}
