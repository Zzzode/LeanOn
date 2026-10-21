import Foundation
import Lynx

@objc(LeanOnScannerModule)
final class ScannerModule: NSObject, LynxModule {
  private let coordinator: BarcodeScanCoordinator
  @objc override init() { coordinator = .shared; super.init() }
  @objc init(param: Any) { coordinator = .shared; super.init() }
  init(coordinator: BarcodeScanCoordinator) { self.coordinator = coordinator; super.init() }

  @objc static var name: String { "scanner" }
  @objc static var methodLookup: [String: String] {
    ["scanBarcode": NSStringFromSelector(#selector(scanBarcode(_:callback:))),
     "getStatus": NSStringFromSelector(#selector(getStatus(_:callback:)))]
  }

  @objc func getStatus(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async { [coordinator] in callback(coordinator.status) }
  }

  @objc func scanBarcode(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async { [coordinator] in
      coordinator.scan { result in callback(result.payload) }
    }
  }
}
