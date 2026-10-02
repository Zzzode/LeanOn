import Lynx

/// Native module backing the health.* methods; delegates to the record store.
@objc(LeanOnHealthModule)
final class HealthModule: NSObject, LynxModule {

  @objc override init() {
    super.init()
  }

  @objc init(param: Any) {
    super.init()
  }

  @objc static var name: String { "health" }

  @objc static var methodLookup: [String: String] {
    [
      "authorize": NSStringFromSelector(#selector(authorize(_:callback:))),
      "readSamples": NSStringFromSelector(#selector(readSamples(_:callback:))),
      "writeWeight": NSStringFromSelector(#selector(writeWeight(_:callback:))),
    ]
  }

  @objc func authorize(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: request HealthKit authorization; callback {granted, denied}.
    // Emit health.authorizationChanged when the grant set changes.
  }

  @objc func readSamples(_ params: NSDictionary, callback: @escaping (NSArray) -> Void) {
    // TODO: query HealthKit for the requested window; callback HealthSampleDto[].
  }

  /// Persist today's weight and return the updated HostData in one round trip
  /// (RFC 0010). After the write the host emits records.changed (RFC 0011).
  @objc func writeWeight(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    guard let date = params["date"] as? String else {
      callback(Self.error("invalid-request", "Missing date"))
      return
    }
    guard let weightValue = params["weightKg"] as? NSNumber else {
      callback(Self.error("invalid-request", "Missing weightKg"))
      return
    }
    let weightKg = weightValue.doubleValue
    guard weightKg.isFinite, weightKg >= 20, weightKg <= 300 else {
      callback(Self.error("invalid-request", "Weight must be between 20 and 300 kg"))
      return
    }

    let services = ServiceRegistry.shared
    let hostData = services.recordsStore.addWeight(date: date, weightKg: weightKg)
    services.events.dispatch("records.changed", payload: ["hostData": hostData])
    callback([
      "success": true,
      "hostData": hostData,
    ])
  }

  private static func error(_ code: String, _ message: String) -> NSDictionary {
    [
      "code": code,
      "message": message,
    ]
  }
}
