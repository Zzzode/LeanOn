import Lynx

/// Native module backing the `scale.*` methods; delegates to native/ble-scale.
@objc(LeanOnScaleModule)
final class ScaleModule: NSObject, LynxModule {

  @objc override init() {
    super.init()
  }

  @objc init(param: Any) {
    super.init()
  }

  @objc static var name: String { "scale" }

  @objc static var methodLookup: [String: String] {
    [
      "scan": NSStringFromSelector(#selector(scan(callback:))),
      "connect": NSStringFromSelector(#selector(connect(_:callback:))),
    ]
  }

  @objc func scan(callback: @escaping (NSDictionary) -> Void) {
    // TODO: start BLE scan. Devices are pushed via "scale.discovered";
    // callback {scanning: true}.
  }

  @objc func connect(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: connect to {deviceId}; readings are pushed via "scale.reading".
  }
}
