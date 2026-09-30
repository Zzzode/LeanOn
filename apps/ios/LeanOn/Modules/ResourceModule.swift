import Lynx

/// Native module backing the `resource.*` methods; delegates to the bundle provider.
@objc(LeanOnResourceModule)
final class ResourceModule: NSObject, LynxModule {

  @objc static func name() -> String { "resource" }

  @objc static func methodLookup() -> [String: String] {
    [
      "fetch": NSStringFromSelector(#selector(fetch(_:callback:))),
    ]
  }

  @objc func fetch(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // TODO: resolve {uri, integrity?} via signed cache -> network;
    // callback {url, bytes?}.
  }
}
