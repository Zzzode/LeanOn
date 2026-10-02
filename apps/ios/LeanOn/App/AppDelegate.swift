import UIKit
import Lynx

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    #if DEBUG
    NSLog("[LeanOnBoot] application didFinishLaunching")
    #endif
    LynxRuntime.initialize()
    #if DEBUG
    NSLog("[LeanOnBoot] Lynx runtime initialized")
    #endif
    return true
  }

  // MARK: UISceneSession Lifecycle

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    #if DEBUG
    NSLog("[LeanOnBoot] configurationForConnecting session=\(connectingSceneSession.role)")
    #endif
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role,
    )
    configuration.delegateClass = SceneDelegate.self
    #if DEBUG
    NSLog("[LeanOnBoot] scene delegate wired")
    #endif
    return configuration
  }

  func application(
    _ application: UIApplication,
    didDiscardSceneSessions sceneSessions: Set<UISceneSession>
  ) {}
}
