import UIKit
import Lynx

/// Native module backing the `app.*` methods.
@objc(LeanOnAppModule)
final class AppModule: NSObject, LynxModule {

  @objc static func name() -> String { "app" }

  @objc static func methodLookup() -> [String: String] {
    [
      "getInfo": NSStringFromSelector(#selector(getInfo(callback:))),
      "getCapabilities": NSStringFromSelector(#selector(getCapabilities(callback:))),
    ]
  }

  @objc func getInfo(callback: (NSDictionary) -> Void) {
    callback([
      "platform": "ios",
      "hostVersion": "0.1.0",
      "osVersion": UIDevice.current.systemVersion,
      "deviceModel": "iOS",
    ])
  }

  @objc func getCapabilities(callback: (NSDictionary) -> Void) {
    let caps = CapabilityRegistry()
    callback([
      "bridgeVersion": caps.bridgeVersion,
      "supportedMethods": caps.supportedMethods,
      "supportedEvents": caps.supportedEvents,
    ])
  }
}
