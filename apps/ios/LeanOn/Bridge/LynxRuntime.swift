import Foundation
import Lynx

/// One-time Lynx environment setup, called from AppDelegate before any container
/// loads a page. Registers the native modules that back the bridge capability
/// domains; methods on each module match the contracts in packages/bridge.
enum LynxRuntime {

  static func initialize() {
    let config = LynxEnv.sharedInstance().config
    config.register(AppModule.self)
    config.register(HealthModule.self)
    config.register(StorageModule.self)
    config.register(ResourceModule.self)
    config.register(NotificationModule.self)
    config.register(ScaleModule.self)
  }
}
