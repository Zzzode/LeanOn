import Foundation

/// Process-wide composition root for native services shared by the container
/// and the Lynx modules. Modules are instantiated by the engine, so they reach
/// these collaborators through this single registry rather than via injection.
/// Later slices add health, notification, scale and sync services here.
final class ServiceRegistry {

  static let shared = ServiceRegistry()

  let recordsStore: RecordsStore
  let events = GlobalEventDispatcher()
  let router = NativeRouter()

  private init() {
    recordsStore = RecordsStore()
  }
}
