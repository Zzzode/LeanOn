import Foundation
import Lynx

/// One-time Lynx environment setup and module registration.
enum LynxRuntime {

  static func initialize() {
    // Configure the bundle loader / init data for the pinned Lynx version, then
    // register the native modules (exported names match capability domains):
    //   AppModule.self         -> "app"
    //   HealthModule.self      -> "health"
    //   ScaleModule.self       -> "scale"
    //   StorageModule.self     -> "storage"
    //   ResourceModule.self    -> "resource"
    //   NotificationModule.self -> "notification"
  }
}
