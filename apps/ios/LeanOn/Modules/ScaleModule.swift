import Foundation
import Lynx

/// Native scale RPCs use a single process-wide owner across every Lynx route.
@objc(LeanOnScaleModule)
final class ScaleModule: NSObject, LynxModule {
  private let manager: ScaleManager

  @objc override init() {
    manager = ServiceRegistry.shared.scale
    super.init()
  }

  @objc init(param: Any) {
    manager = ServiceRegistry.shared.scale
    super.init()
  }

  init(manager: ScaleManager) { self.manager = manager; super.init() }

  @objc static var name: String { "scale" }

  @objc static var methodLookup: [String: String] {
    [
      "scan": NSStringFromSelector(#selector(scan(_:callback:))),
      "connect": NSStringFromSelector(#selector(connect(_:callback:))),
      "disconnect": NSStringFromSelector(#selector(disconnect(_:callback:))),
      "getStatus": NSStringFromSelector(#selector(getStatus(_:callback:))),
    ]
  }

  @objc func scan(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    onMain { self.manager.scan(callback) }
  }

  @objc func connect(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    guard let id = params["deviceId"] as? String else {
      callback(ScaleManager.error("invalid-request", "Missing scale identifier")); return
    }
    onMain { self.manager.connect(id, callback) }
  }

  @objc func disconnect(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    onMain { self.manager.disconnect(callback) }
  }

  @objc func getStatus(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    onMain { callback(self.manager.getStatus()) }
  }

  private func onMain(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() } else { DispatchQueue.main.async(execute: action) }
  }
}
