import Foundation
import Lynx

/// Loads embedded Lynx bundles from the app bundle. The engine itself does not
/// fetch resources; this is the v1 local provider (RFC 0027). The signed cache
/// and network fallback from RFC 0007 are layered on later without changing
/// the container.
final class BundleTemplateProvider: NSObject, LynxTemplateProvider {

  func loadTemplate(
    withUrl url: String!,
    onComplete callback: LynxTemplateLoadBlock!
  ) {
    #if DEBUG
    NSLog("[LeanOnLifecycle] provider request url=\(url ?? "nil")")
    #endif
    guard
      let path = Bundle.main.path(forResource: url, ofType: "bundle"),
      let data = try? Data(contentsOf: URL(fileURLWithPath: path))
    else {
      #if DEBUG
      NSLog("[LeanOnLifecycle] provider MISS for url=\(url ?? "nil")")
      #endif
      let error = NSError(
        domain: "com.zzzode.leanon",
        code: 404,
        userInfo: [NSLocalizedDescriptionKey: "Embedded Lynx bundle not found"],
      )
      callback(nil, error)
      return
    }
    #if DEBUG
    NSLog("[LeanOnLifecycle] provider found bytes=\(data.count)")
    #endif
    callback(data, nil)
  }
}
