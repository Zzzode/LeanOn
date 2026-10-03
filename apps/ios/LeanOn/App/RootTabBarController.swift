import UIKit

/// Native bottom tab shell. Each of the five primary tabs is a navigation
/// controller whose root renders one screen of the shared Lynx bundle.
final class RootTabBarController: UITabBarController {

  private struct TabSpec {
    let route: String
    let title: String
    let symbol: String
  }

  private let tabSpecs: [TabSpec] = [
    TabSpec(route: "today", title: "Today", symbol: "sun.max"),
    TabSpec(route: "diary", title: "Diary", symbol: "book"),
    TabSpec(route: "progress", title: "Progress", symbol: "chart.bar"),
    TabSpec(route: "partner", title: "Partner", symbol: "heart"),
    TabSpec(route: "me", title: "Me", symbol: "person"),
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
        selectedImage: UIImage(systemName:spec.symbol),
      )
      let navigation = UINavigationController(rootViewController: screen)
      navigation.navigationBar.isHidden = true
      return navigation
    }
    setViewControllers(controllers, animated: false)
    ServiceRegistry.shared.router.tabBarController = self
  }
}
