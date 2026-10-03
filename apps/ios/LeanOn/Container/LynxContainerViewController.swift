import UIKit
import Lynx

/// Hosts one LynxView rendering a single screen of the shared bundle. The
/// bundle URL is fixed (main.lynx); the screen to render is passed through
/// initData.route. Root tab screens hide the navigation bar and let pages
/// draw their own header; pushed secondary screens show the navigation bar
/// with the system back control.
final class LynxContainerViewController: UIViewController {

  private let screenRoute: String
  private let bundle: String
  private let isRootTab: Bool
  private let lifecycleLogger = LifecycleLogger()
  private var lynxView: LynxView?

  init(
    screenRoute: String,
    bundle: String = "main.lynx",
    isRootTab: Bool = true
  ) {
    self.screenRoute = screenRoute
    self.bundle = bundle
    self.isRootTab = isRootTab
    super.init(nibName: nil, bundle: nil)
    if !isRootTab {
      title = Self.pushedTitles[screenRoute] ?? screenRoute
    }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private static let pushedTitles: [String: String] = [
    "settings": String(localized: "settings.title"),
  ]

  override func viewDidLoad() {
    super.viewDidLoad()
    // Botanical background, matching the shared visual baseline (#edf2ef).
    view.backgroundColor = UIColor(red: 0.929, green: 0.949, blue: 0.937, alpha: 1.0)
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController?.setNavigationBarHidden(isRootTab, animated: animated)
  }

  /// Size available to the LynxView after applying the safe-area insets.
  /// The bottom inset is intentionally NOT subtracted: the LynxView extends
  /// to the screen bottom so the floating tab bar can sit on top of the page
  /// content. Pages add their own bottom padding to clear the tab bar.
  private func contentSize(for view: UIView) -> CGSize {
    let bounds = view.bounds.size
    let inset = view.safeAreaInsets
    return CGSize(
      width: bounds.width,
      height: max(0, bounds.height - inset.top),
    )
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let size = contentSize(for: view)
    #if DEBUG
    NSLog("[LeanOnLayout] route=\(screenRoute) size=\(size) existing=\(lynxView != nil)")
    #endif

    if let lynxView = lynxView {
      if lynxView.preferredLayoutWidth != size.width
        || lynxView.preferredLayoutHeight != size.height {
        lynxView.preferredLayoutWidth = size.width
        lynxView.preferredLayoutHeight = size.height
      }
      return
    }

    let lynxView = LynxView { builder in
      builder.config = LynxConfig(provider: BundleTemplateProvider())
      builder.screenSize = size
      builder.fontScale = 1.0
    }
    lynxView.translatesAutoresizingMaskIntoConstraints = false
    lynxView.preferredLayoutWidth = size.width
    lynxView.preferredLayoutHeight = size.height
    lynxView.layoutWidthMode = .exact
    lynxView.layoutHeightMode = .exact
    lynxView.addLifecycleClient(lifecycleLogger)

    view.addSubview(lynxView)
    let guide = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      lynxView.topAnchor.constraint(equalTo: guide.topAnchor),
      lynxView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      lynxView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      // Extend to the screen bottom (not safe-area) so the floating tab bar
      // sits on top of the page content, like Apple's Dock, instead of
      // showing a separate background strip behind it.
      lynxView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    self.lynxView = lynxView

    // Native -> JS events fan out to every mounted LynxView.
    ServiceRegistry.shared.events.bind(lynxView)

    let initData = LynxTemplateData(dictionary: bootstrapData())
    lynxView.loadTemplate(fromURL: bundle, initData: initData)
  }

  /// Bootstrap shape consumed by useInitData() in pages: { hostData, route, locale }.
  private func bootstrapData() -> [String: Any] {
    [
      "hostData": ServiceRegistry.shared.recordsStore.loadHostData(),
      "route": screenRoute,
      // Pages resolve this tag through resolveLocale(); pass the raw system
      // language so zh-Hans-* lands on zh-CN. The env var is a UI-test hook,
      // e.g. SIMCTL_CHILD_LEANON_LOCALE=zh-CN.
      "locale":
        ProcessInfo.processInfo.environment["LEANON_LOCALE"]
        ?? Locale.preferredLanguages.first ?? "en",
    ]
  }
}
