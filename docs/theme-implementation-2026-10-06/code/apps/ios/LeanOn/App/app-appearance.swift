import UIKit

enum AppAppearancePreference: String, CaseIterable {
  case system, light, dark

  var interfaceStyle: UIUserInterfaceStyle {
    switch self {
    case .system: return .unspecified
    case .light: return .light
    case .dark: return .dark
    }
  }

  func resolve(systemStyle: UIUserInterfaceStyle) -> AppResolvedAppearance {
    switch self {
    case .system: return systemStyle == .dark ? .dark : .light
    case .light: return .light
    case .dark: return .dark
    }
  }
}

enum AppResolvedAppearance: String {
  case light, dark

  var canvas: UIColor { self == .dark ? color(0x201D26) : color(0xF8F7F4) }
  var surface: UIColor { self == .dark ? color(0x2B2731) : .white }
  var ink: UIColor { self == .dark ? color(0xFAF5F3) : color(0x28242C) }
  var brand: UIColor { self == .dark ? color(0xD3B2D8) : color(0x573C58) }
  // Preserve the approved native bar's selected color in light mode.
  var tabTint: UIColor { self == .dark ? color(0x75CEAD) : color(0x218967) }

  private func color(_ hex: UInt32) -> UIColor {
    UIColor(red: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
  }
}

struct AppAppearanceSnapshot: Equatable {
  let preference: AppAppearancePreference
  let resolved: AppResolvedAppearance

  var payload: [String: String] {
    ["preference": preference.rawValue, "resolved": resolved.rawValue]
  }
}

final class AppAppearanceStore {
  private let defaults: UserDefaults
  private let key = "leanon.appearance"

  init(defaults: UserDefaults = AppLocale.defaults) { self.defaults = defaults }

  var preference: AppAppearancePreference {
    get { AppAppearancePreference(rawValue: defaults.string(forKey: key) ?? "") ?? .system }
    set { defaults.set(newValue.rawValue, forKey: key) }
  }
}

/// Owns the effective appearance before any shared-page view mounts.
final class AppAppearanceCoordinator {
  private let store: AppAppearanceStore
  private let sendEvent: ([String: String]) -> Void
  private weak var window: UIWindow?
  private var systemStyle: UIUserInterfaceStyle
  private var isApplying = false
  private(set) var snapshot: AppAppearanceSnapshot

  init(store: AppAppearanceStore = AppAppearanceStore(),
       systemStyle: UIUserInterfaceStyle = UIScreen.main.traitCollection.userInterfaceStyle,
       sendEvent: @escaping ([String: String]) -> Void) {
    self.store = store
    self.systemStyle = systemStyle
    self.sendEvent = sendEvent
    snapshot = AppAppearanceSnapshot(preference: store.preference,
                                     resolved: store.preference.resolve(systemStyle: systemStyle))
  }

  func attach(_ window: UIWindow) {
    self.window = window
    systemStyle = window.traitCollection.userInterfaceStyle
    apply(emit: false)
  }

  @discardableResult
  func setPreference(_ rawValue: String) -> AppAppearanceSnapshot? {
    guard let preference = AppAppearancePreference(rawValue: rawValue) else { return nil }
    store.preference = preference
    apply(emit: true)
    return snapshot
  }

  func systemAppearanceChanged(_ style: UIUserInterfaceStyle) {
    guard !isApplying, store.preference == .system else { return }
    systemStyle = style
    apply(emit: true)
  }

  private func apply(emit: Bool) {
    guard !isApplying else { return }
    isApplying = true
    let previous = snapshot
    // Clearing an explicit override restores UIKit's actual system traits.
    window?.overrideUserInterfaceStyle = store.preference.interfaceStyle
    if store.preference == .system, let window { systemStyle = window.traitCollection.userInterfaceStyle }
    snapshot = AppAppearanceSnapshot(preference: store.preference,
                                    resolved: store.preference.resolve(systemStyle: systemStyle))
    window?.backgroundColor = snapshot.resolved.canvas
    window?.tintColor = snapshot.resolved.brand
    (window?.rootViewController as? RootTabBarController)?.applyAppearance(snapshot)
    isApplying = false
    if emit, previous != snapshot { sendEvent(snapshot.payload) }
  }
}
