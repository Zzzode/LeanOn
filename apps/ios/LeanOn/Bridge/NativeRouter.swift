import UIKit

/// Pushes secondary Lynx screens onto the selected tab's navigation stack.
/// The root tab bar controller registers itself at launch. Only screens the
/// bundle currently implements are pushed; unknown routes are ignored.
final class NativeRouter {

  /// Secondary routes with a real implementation in the pages bundle.
  private let pushableRoutes: Set<String> = ["settings"]

  weak var tabBarController: UITabBarController?

  /// Returns true when the route was pushed.
  @discardableResult
  func open(_ route: String) -> Bool {
    guard pushableRoutes.contains(route),
          let tabBarController = tabBarController,
          let navigation = tabBarController.selectedViewController
            as? UINavigationController
    else {
      return false
    }
    navigation.pushViewController(
      LynxContainerViewController(screenRoute: route, isRootTab: false),
      animated: true,
    )
    return true
  }
}
