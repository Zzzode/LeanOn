import Foundation
import Lynx
import XElement

/// One-time Lynx environment setup, called from AppDelegate before any container
/// loads a page. Registers the native modules that back the bridge capability
/// domains; methods on each module match the contracts in packages/bridge.
enum LynxRuntime {

  static func initialize() {
    // LynxEnv starts without a config. Registering on that nil Objective-C
    // property silently discards every module and custom element.
    let config = LynxConfig(provider: BundleTemplateProvider())
    config.registerUI(LynxUIInput.self, withName: "input")
    config.registerShadowNode(LynxUIInputShadowNode.self, withName: "input")
    config.registerUI(LynxUISVG.self, withName: "svg")
    config.register(AppModule.self)
    config.register(HealthModule.self)
    config.register(RecordsModule.self)
    config.register(StorageModule.self)
    config.register(ResourceModule.self)
    config.register(NotificationModule.self)
    config.register(ScaleModule.self)
    config.register(ScannerModule.self)
    config.register(FoodModule.self)
    config.register(HealthKitModule.self)
    config.register(PersonalModule.self)
    config.register(BackupModule.self)
    config.register(CompanionModule.self)
    LynxEnv.sharedInstance().prepareConfig(config)
  }
}
