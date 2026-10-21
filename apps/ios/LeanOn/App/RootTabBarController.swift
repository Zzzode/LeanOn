import UIKit

/// Native bottom tab shell. Each of the five primary tabs is a navigation
/// controller whose root renders one screen of the shared Lynx bundle.
final class RootTabBarController: UITabBarController {

  private struct TabSpec {
    let route: String
    let title: String
    let symbol: String
  }

  // Native shell chrome; labels mirror the canonical catalog in packages/i18n
  // (Localizable.strings, en + zh-Hans) and follow the system language.
  private let tabSpecs: [TabSpec] = [
    TabSpec(route: "today", title: String(localized: "tab.today"), symbol: "sun.max"),
    TabSpec(route: "diary", title: String(localized: "tab.diary"), symbol: "book"),
    TabSpec(route: "progress", title: String(localized: "tab.progress"), symbol: "chart.bar"),
    TabSpec(route: "partner", title: String(localized: "tab.partner"), symbol: "heart"),
    TabSpec(route: "me", title: String(localized: "tab.me"), symbol: "person"),
  ]

  override func viewDidLoad() {
    super.viewDidLoad()

    let controllers = tabSpecs.map { spec -> UINavigationController in
      let screen = LynxContainerViewController(screenRoute: spec.route)
      screen.title = spec.title
      screen.tabBarItem = UITabBarItem(
        title: spec.title,
        image: UIImage(systemName: spec.symbol),
        selectedImage: UIImage(systemName: spec.symbol),
      )
      let navigation = UINavigationController(rootViewController: screen)
      navigation.navigationBar.isHidden = true
      return navigation
    }
    setViewControllers(controllers, animated: false)
    ServiceRegistry.shared.router.tabBarController = self
    applyLocale(AppLocale.current)
    applyAppearance(ServiceRegistry.shared.appearance.snapshot)
    #if DEBUG
    // Deterministic simulator coverage when a screen-control tool cannot
    // address UIKit's native tab items. This never changes persisted state.
    if let route = ProcessInfo.processInfo.environment["LEANON_INITIAL_ROUTE"],
       let index = tabSpecs.firstIndex(where: { $0.route == route }) {
      selectedIndex = index
    }
    #endif
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    applyAppearance(ServiceRegistry.shared.appearance.snapshot)
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if previousTraitCollection?.userInterfaceStyle != traitCollection.userInterfaceStyle {
      ServiceRegistry.shared.appearance.systemAppearanceChanged(traitCollection.userInterfaceStyle)
    }
  }

  func applyAppearance(_ snapshot: AppAppearanceSnapshot) {
    guard isViewLoaded else { return }
    let colors = snapshot.resolved
    view.backgroundColor = colors.canvas
    tabBar.tintColor = colors.tabTint
    // iOS 26 draws a native floating tab bar (_UITabBarPlatterView).
    // Give it a liquid-glass blur instead of the default opaque material.
    let appearance = UITabBarAppearance()
    appearance.configureWithTransparentBackground()
    appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
    appearance.shadowColor = .clear
    tabBar.standardAppearance = appearance
    tabBar.scrollEdgeAppearance = appearance
    for case let navigation as UINavigationController in viewControllers ?? [] {
      navigation.view.backgroundColor = colors.canvas
      let navAppearance = UINavigationBarAppearance()
      navAppearance.configureWithOpaqueBackground()
      navAppearance.backgroundColor = colors.canvas
      navAppearance.titleTextAttributes = [.foregroundColor: colors.ink]
      navAppearance.shadowColor = .clear
      navigation.navigationBar.standardAppearance = navAppearance
      navigation.navigationBar.scrollEdgeAppearance = navAppearance
      navigation.navigationBar.compactAppearance = navAppearance
      navigation.navigationBar.tintColor = colors.brand
      for case let screen as LynxContainerViewController in navigation.viewControllers {
        screen.applyAppearance(snapshot)
      }
    }
    setNeedsStatusBarAppearanceUpdate()
  }

  /// Keep native labels consistent with the language selected in Settings.
  func applyLocale(_ locale: String) {
    for (index, controller) in (viewControllers ?? []).enumerated() {
      guard index < tabSpecs.count, let navigation = controller as? UINavigationController else { continue }
      let title = AppLocale.string("tab.\(tabSpecs[index].route)", locale: locale)
      navigation.viewControllers.first?.title = title
      navigation.tabBarItem.title = title
      for pushed in navigation.viewControllers.dropFirst() {
        (pushed as? LynxContainerViewController)?.applySecondaryTitle()
      }
    }
  }

  /// Shared-page forms own the whole content surface while presented.
  func setModalActive(_ active: Bool) {
    if #available(iOS 18.0, *) {
      setTabBarHidden(active, animated: false)
    } else {
      tabBar.isHidden = active
    }
    tabBar.isUserInteractionEnabled = !active
  }
}
