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

    // Fully clear the default edge-to-edge tab bar background so only the
    // floating capsule is visible.
    let appearance = UITabBarAppearance()
    appearance.configureWithTransparentBackground()
    appearance.backgroundColor = .clear
    appearance.backgroundEffect = nil
    tabBar.standardAppearance = appearance
    tabBar.scrollEdgeAppearance = appearance
    tabBar.backgroundImage = UIImage()
    tabBar.shadowImage = UIImage()
    tabBar.backgroundColor = .clear
    tabBar.isTranslucent = true

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

    setupFloatingCapsule()
  }

  /// Adds a floating liquid-glass blur capsule behind the tab bar items.
  private func setupFloatingCapsule() {
    // Shadow container — a clipped blur view cannot draw its own shadow.
    let shadow = UIView()
    shadow.layer.shadowColor = UIColor.black.cgColor
    shadow.layer.shadowOpacity = 0.10
    shadow.layer.shadowOffset = CGSize(width: 0, height: 4)
    shadow.layer.shadowRadius = 12
    shadow.translatesAutoresizingMaskIntoConstraints = false
    tabBar.insertSubview(shadow, at: 0)

    let capsule = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
    capsule.layer.cornerRadius = 30
    capsule.clipsToBounds = true
    capsule.isUserInteractionEnabled = false
    capsule.translatesAutoresizingMaskIntoConstraints = false
    shadow.addSubview(capsule)

    NSLayoutConstraint.activate([
      capsule.topAnchor.constraint(equalTo: shadow.topAnchor),
      capsule.leadingAnchor.constraint(equalTo: shadow.leadingAnchor),
      capsule.trailingAnchor.constraint(equalTo: shadow.trailingAnchor),
      capsule.bottomAnchor.constraint(equalTo: shadow.bottomAnchor),

      shadow.leadingAnchor.constraint(equalTo: tabBar.leadingAnchor, constant: 12),
      shadow.trailingAnchor.constraint(equalTo: tabBar.trailingAnchor, constant: -12),
      shadow.topAnchor.constraint(equalTo: tabBar.topAnchor, constant: 2),
      shadow.bottomAnchor.constraint(
        equalTo: tabBar.safeAreaLayoutGuide.bottomAnchor, constant: -8),
    ])
  }
}
