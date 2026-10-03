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
    // Brand the selected tab with the botanical primary color (#218967).
    tabBar.tintColor = UIColor(red: 0.129, green: 0.537, blue: 0.404, alpha: 1.0)

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
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    // iOS 26 draws a native floating tab bar (_UITabBarPlatterView).
    // Give it a liquid-glass blur instead of the default opaque material.
    let appearance = UITabBarAppearance()
    appearance.configureWithTransparentBackground()
    appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
    appearance.shadowColor = .clear
    tabBar.standardAppearance = appearance
    tabBar.scrollEdgeAppearance = appearance
  }
}
