import Foundation
import Lynx

@objc(LeanOnFoodModule)
final class FoodModule: NSObject, LynxModule {
  private let client: FoodProductLookingUp

  @objc override init() { client = OpenFoodFactsClient(); super.init() }
  @objc init(param: Any) { client = OpenFoodFactsClient(); super.init() }
  init(client: FoodProductLookingUp) { self.client = client; super.init() }

  @objc static var name: String { "food" }
  @objc static var methodLookup: [String: String] {
    ["lookupProduct": NSStringFromSelector(#selector(lookupProduct(_:callback:)))]
  }

  @objc func lookupProduct(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    guard let barcode = params["barcode"] as? String,
      (try? OpenFoodFactsClient.request(barcode)) != nil else {
      callback(["code": "invalid-request", "message": "Missing or invalid barcode"]); return
    }
    client.lookup(barcode) { result in
      DispatchQueue.main.async {
        switch result {
        case .success(let product):
          if let product { callback(["found": true, "product": product]) }
          else { callback(["found": false]) }
        case .failure(let error):
          callback(["code": "unavailable", "message": "Product lookup failed", "retriable": true,
                    "details": ["reason": Self.failureReason(error)]])
        }
      }
    }
  }

  private static func failureReason(_ error: Error) -> String {
    let error = error as NSError
    guard error.domain == NSURLErrorDomain else { return "service-response" }
    switch error.code {
    case URLError.timedOut.rawValue: return "timeout"
    case URLError.notConnectedToInternet.rawValue, URLError.networkConnectionLost.rawValue,
      URLError.cannotConnectToHost.rawValue, URLError.cannotFindHost.rawValue, URLError.dnsLookupFailed.rawValue:
      return "offline"
    default: return "service-response"
    }
  }
}
