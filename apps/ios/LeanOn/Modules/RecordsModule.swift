import Foundation
import Lynx

@objc(LeanOnRecordsModule)
final class RecordsModule: NSObject, LynxModule {
  private let store: RecordsStore
  private let publish: (NSDictionary) -> Void

  @objc override init() {
    store = ServiceRegistry.shared.recordsStore
    publish = ServiceRegistry.shared.didWriteRecords
    super.init()
  }
  @objc init(param: Any) {
    store = ServiceRegistry.shared.recordsStore
    publish = ServiceRegistry.shared.didWriteRecords
    super.init()
  }
  init(store: RecordsStore, publish: @escaping (NSDictionary) -> Void) {
    self.store = store; self.publish = publish; super.init()
  }
  @objc static var name: String { "records" }
  @objc static var methodLookup: [String: String] {
    ["getSnapshot": NSStringFromSelector(#selector(getSnapshot(_:callback:))),
     "mutate": NSStringFromSelector(#selector(mutate(_:callback:)))]
  }

  @objc func getSnapshot(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    do { callback(["hostData": try store.currentSnapshot()]) }
    catch { callback(["code": "unavailable", "message": "Records could not be read"] ) }
  }

  @objc func mutate(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    do {
      let response = try store.transact(Self.decodeRequest(params))
      if (response["replayed"] as? NSNumber)?.boolValue == false, let host = response["hostData"] as? NSDictionary { publish(host) }
      callback(response)
    } catch let error as RecordTransactionError {
      callback(["code": error.code, "message": error.localizedDescription])
    } catch {
      callback(["code": "unavailable", "message": "Records could not be saved"])
    }
  }

  /// Lynx's iOS object converter omits null-valued dictionary properties.
  /// The private wire envelope preserves JSON null without relaxing direct validation.
  static func decodeRequest(_ params: NSDictionary) throws -> NSDictionary {
    let key = "__leanonRecordsRequestJSON"
    guard params[key] != nil else { return params }
    guard params.count == 1, let json = params[key] as? String, let bytes = json.data(using: .utf8),
          let decoded = try? JSONSerialization.jsonObject(with: bytes, options: [.mutableContainers]),
          let request = decoded as? NSDictionary else { throw RecordTransactionError.invalidRequest("records wire envelope") }
    return request
  }
}
