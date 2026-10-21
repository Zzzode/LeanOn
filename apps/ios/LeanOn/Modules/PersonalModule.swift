import Foundation
import Lynx

enum NativePersonalRequest {
  static func parse(_ params: NSDictionary) throws -> NSDictionary {
    guard params["__leanonPersonalRequestJSON"] != nil else { return params }
    guard params.count == 1, let text = params["__leanonPersonalRequestJSON"] as? String,
      text.utf8.count <= 1024 * 1024 else {
      throw RecordTransactionError.invalidRequest("personal JSON request")
    }
    do {
      guard let value = try JSONSerialization.jsonObject(with: Data(text.utf8), options: .mutableContainers) as? NSDictionary else {
        throw RecordTransactionError.invalidRequest("personal JSON request")
      }
      return value
    } catch { throw RecordTransactionError.invalidRequest("personal JSON request") }
  }
}

@objc(LeanOnPersonalModule)
final class PersonalModule: NSObject, LynxModule {
  private static let worker = DispatchQueue(label: "com.zzzode.leanon.personal-io")
  @objc static var name: String { "personal" }
  @objc static var methodLookup: [String: String] {
    ["getState": NSStringFromSelector(#selector(getState(_:callback:))),
     "mutate": NSStringFromSelector(#selector(mutate(_:callback:))),
     "pickPhoto": NSStringFromSelector(#selector(pickPhoto(_:callback:))),
     "getPhoto": NSStringFromSelector(#selector(getPhoto(_:callback:)))]
  }
  @objc override init() { super.init() }
  @objc init(param: Any) { super.init() }
  @objc func getState(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    execute(callback) { ["personal": try ServiceRegistry.shared.personal.snapshot()] }
  }
  @objc func mutate(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    execute(callback) {
      let request = try NativePersonalRequest.parse(params)
      try ServiceRegistry.shared.photos.clearDisplayCache()
      let result = try ServiceRegistry.shared.personal.mutate(request)
      ServiceRegistry.shared.events.dispatch("personal.changed", payload: ["personal": result["personal"]!])
      return result
    }
  }
  @objc func pickPhoto(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async { ServiceRegistry.shared.photoPicker.pick(params, callback: callback) }
  }
  @objc func getPhoto(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    execute(callback) {
      let id = try PersonalSchema.id(params["id"])
      let scope = params["scope"] as? String ?? "own"
      guard ["own", "partner"].contains(scope) else { throw RecordTransactionError.invalidRequest("photo scope") }
      let generation = try ServiceRegistry.shared.photos.previewToken(scope:scope)
      if scope == "partner" {
        let peer = try ServiceRegistry.shared.companion.peerPhoto(id)
        try PrivatePhotoImage.validatePersisted(peer.bytes, metadata: peer.metadata)
        let uri = try ServiceRegistry.shared.photos.displayURL(id, bytes: peer.bytes, scope: "partner", expectedGeneration:generation).absoluteString
        return ["uri": uri, "width": peer.metadata["width"]!, "height": peer.metadata["height"]!]
      }
      let state = try ServiceRegistry.shared.personal.snapshot()
      guard let photo = (state["photos"] as? [NSDictionary])?.first(where: { $0["id"] as? String == id }) else {
        throw RecordTransactionError.notFound
      }
      let bytes = try ServiceRegistry.shared.photos.bytes(id)
      let uri = try ServiceRegistry.shared.photos.displayURL(id,bytes:bytes,expectedGeneration:generation).absoluteString
      return ["uri": uri, "width": photo["width"]!, "height": photo["height"]!]
    }
  }
  private func execute(_ callback: @escaping (NSDictionary) -> Void, body: @escaping () throws -> NSDictionary) {
    DispatchQueue.main.async {
      _ = ServiceRegistry.shared
      Self.worker.async {
        let response: NSDictionary
        do { response = try body() }
        catch { response = NativePersonalError.payload(error) }
        DispatchQueue.main.async { callback(response) }
      }
    }
  }
}

enum NativePersonalError {
  static func payload(_ error: Error) -> NSDictionary {
    if let error = error as? RecordTransactionError { return ["code": error.code, "message": error.localizedDescription] }
    if error is NativeCryptoError { return ["code": "unavailable", "message": "Protected personal data is unavailable", "retriable": true] }
    return ["code": "unavailable", "message": "Personal data operation failed", "retriable": true]
  }
}
