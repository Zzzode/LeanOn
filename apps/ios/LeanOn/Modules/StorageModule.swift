import Lynx

/// Native module backing the `storage.*` methods; backed by encrypted storage (RFC 0008).
@objc(LeanOnStorageModule)
final class StorageModule: NSObject, LynxModule {

  @objc override init() {
    super.init()
  }

  @objc init(param: Any) {
    super.init()
  }

  @objc static var name: String { "storage" }

  @objc static var methodLookup: [String: String] {
    [
      "get": NSStringFromSelector(#selector(get(_:callback:))),
      "set": NSStringFromSelector(#selector(set(_:callback:))),
      "remove": NSStringFromSelector(#selector(remove(_:callback:))),
    ]
  }

  @objc func get(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: encrypted read of {key}; callback {value}.
  }

  @objc func set(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: encrypted write of {key, value}; callback {ok: true}.
  }

  @objc func remove(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: remove {key}; callback {ok: true}.
  }
}
