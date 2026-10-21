import UIKit
import Lynx

/// Native module backing the `app.*` methods.
@objc(LeanOnAppModule)
final class AppModule: NSObject, LynxModule {

  private let appearance: AppAppearanceCoordinator

  @objc override init() {
    appearance = ServiceRegistry.shared.appearance
    super.init()
  }

  @objc init(param: Any) {
    appearance = ServiceRegistry.shared.appearance
    super.init()
  }

  init(appearance: AppAppearanceCoordinator) {
    self.appearance = appearance
    super.init()
  }

  @objc static var name: String { "app" }

  @objc static var methodLookup: [String: String] {
    [
      "getInfo": NSStringFromSelector(#selector(getInfo(_:callback:))),
      "getCapabilities": NSStringFromSelector(#selector(getCapabilities(_:callback:))),
      "openRoute": NSStringFromSelector(#selector(openRoute(_:callback:))),
      "setModalActive": NSStringFromSelector(#selector(setModalActive(_:callback:))),
      "setLocale": NSStringFromSelector(#selector(setLocale(_:callback:))),
      "getAppearance": NSStringFromSelector(#selector(getAppearance(_:callback:))),
      "setAppearance": NSStringFromSelector(#selector(setAppearance(_:callback:))),
    ]
  }

  @objc func getInfo(_ params: Any?, callback: (NSDictionary) -> Void) {
    callback([
      "platform": "ios",
      "hostVersion": "0.1.0",
      "osVersion": UIDevice.current.systemVersion,
      "deviceModel": "iOS",
    ])
  }

  @objc func getCapabilities(_ params: Any?, callback: (NSDictionary) -> Void) {
    let caps = CapabilityRegistry()
    callback([
      "bridgeVersion": caps.bridgeVersion,
      "supportedMethods": caps.supportedMethods,
      "supportedEvents": caps.supportedEvents,
    ])
  }

  @objc func openRoute(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    guard let route = params["route"] as? String else {
      callback(["success": false])
      return
    }
    DispatchQueue.main.async {
      let opened = ServiceRegistry.shared.router.open(route)
      callback(["success": opened])
    }
  }

  @objc func setModalActive(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    let active = params["active"] as? Bool ?? false
    DispatchQueue.main.async {
      (ServiceRegistry.shared.router.tabBarController as? RootTabBarController)?.setModalActive(active)
      if !active { ServiceRegistry.shared.clearPhotoPreviews() }
      callback(["success": true])
    }
  }

  @objc func setLocale(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    guard let locale = params["locale"] as? String, ["en", "zh-CN"].contains(locale) else {
      callback(["code": "invalid-request", "message": "Unsupported locale"])
      return
    }
    DispatchQueue.main.async {
      AppLocale.defaults.set(locale, forKey: "leanon.locale")
      (ServiceRegistry.shared.router.tabBarController as? RootTabBarController)?.applyLocale(locale)
      ServiceRegistry.shared.events.dispatch("app.localeChanged", payload: ["locale": locale])
      callback(["success": true, "locale": locale])
    }
  }

  @objc func getAppearance(_ params: Any?, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async { callback(self.appearance.snapshot.payload as NSDictionary) }
  }

  @objc func setAppearance(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    guard let preference = params["preference"] as? String,
          AppAppearancePreference(rawValue: preference) != nil else {
      callback(["code": "invalid-request", "message": "Unsupported appearance preference"])
      return
    }
    DispatchQueue.main.async {
      guard let snapshot = self.appearance.setPreference(preference) else { return }
      var result: [String: Any] = snapshot.payload
      result["success"] = true
      callback(result as NSDictionary)
    }
  }
}

/// Native chrome follows the same app preference as the shared pages.
enum AppLocale {
  static var defaults: UserDefaults {
    #if DEBUG
    if ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"] != nil {
      return UserDefaults(suiteName: "com.zzzode.leanon.uiqa") ?? .standard
    }
    #endif
    return .standard
  }

  static var current: String {
    ProcessInfo.processInfo.environment["LEANON_LOCALE"]
      ?? defaults.string(forKey: "leanon.locale")
      ?? Locale.preferredLanguages.first ?? "en"
  }

  static func string(_ key: String, locale: String = current) -> String {
    let language = locale.hasPrefix("zh") ? "zh-Hans" : "en"
    guard let path = Bundle.main.path(forResource: language, ofType: "lproj"), let bundle = Bundle(path: path) else { return key }
    return bundle.localizedString(forKey: key, value: key, table: nil)
  }
}
