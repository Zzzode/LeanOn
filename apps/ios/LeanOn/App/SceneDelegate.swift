import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

  var window: UIWindow?

  func sceneDidBecomeActive(_ scene: UIScene) {
    ServiceRegistry.shared.onForeground()
    ServiceRegistry.shared.events.dispatch("app.lifecycle", payload: ["state": "foreground"])
  }
  func sceneDidEnterBackground(_ scene: UIScene) {
    ServiceRegistry.shared.onBackground()
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    window.frame = windowScene.coordinateSpace.bounds
    ServiceRegistry.shared.appearance.attach(window)
    window.rootViewController = RootTabBarController()
    self.window = window
    window.makeKeyAndVisible()
  }
}
