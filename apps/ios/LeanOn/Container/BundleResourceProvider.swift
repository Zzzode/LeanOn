import Foundation

/// A resolved Lynx bundle ready for the container to load.
struct LoadedBundle {
  let route: String
  let integrity: String?
}

/// Host-side loader for Lynx bundles. Lynx itself does not fetch resources.
/// Implementations resolve a route from the signed local cache first and fall
/// back to the network (see RFC 0007).
protocol BundleResourceProvider {
  func load(_ route: String) -> LoadedBundle
}

/// Default provider; cache and verification are completed in RFC 0007.
final class DefaultBundleResourceProvider: BundleResourceProvider {
  func load(_ route: String) -> LoadedBundle {
    fatalError("wire signed local cache and network fetch (RFC 0007)")
  }
}
