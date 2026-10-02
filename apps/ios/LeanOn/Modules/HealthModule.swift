import Lynx

/// Native module backing the `health.*` methods; delegates to native/health-adapter.
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
    // TODO: request HealthKit authorization; callback {granted, deniedTypes}.
    // Emit "health.authorizationChanged" when the grant set changes.
  }

  @objc func readSamples(_ params: NSDictionary, callback: @escaping (NSArray) -> Void) {
    // TODO: query HealthKit for the requested types/window; callback HealthSampleDto[].
  }

  @objc func writeWeight(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: write a weight sample; callback {ok: true}.
  }
}
