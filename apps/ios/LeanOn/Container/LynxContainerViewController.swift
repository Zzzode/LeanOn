import UIKit
import Lynx

/// Hosts the single LynxView and loads the shared bundle with bootstrap data,
/// driving navigation by route. The LynxView is laid out within the safe area
/// and kept in sync when the container is laid out again. The area outside the
/// safe area is filled with the same botanical background, matching Android.
final class LynxContainerViewController: UIViewController {

  private let route: String
  private let lifecycleLogger = LifecycleLogger()
  private var lynxView: LynxView?

  init(route: String) {
    self.route = route
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    // Botanical background, matching the shared visual baseline (#edf2ef).
    view.backgroundColor = UIColor(red: 0.929, green: 0.949, blue: 0.937, alpha: 1.0)
  }

  /// Size available to the LynxView after applying the safe-area insets.
  private func contentSize(for view: UIView) -> CGSize {
    let bounds = view.bounds.size
    let inset = view.safeAreaInsets
    return CGSize(
      width: bounds.width,
      height: max(0, bounds.height - inset.top - inset.bottom),
    )
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let size = contentSize(for: view)
    #if DEBUG
    NSLog("[LeanOnLayout] didLayout contentSize=\(size) existing=\(lynxView != nil)")
    #endif

    if let lynxView = lynxView {
      // Follow container/safe-area changes (rotation, keyboard, etc.).
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
      lynxView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
    ])
    self.lynxView = lynxView

    // Native -> JS events flow through this LynxView.
    ServiceRegistry.shared.events.bind(lynxView)

    let initData = LynxTemplateData(dictionary: bootstrapData())
    lynxView.loadTemplate(fromURL: route, initData: initData)
  }

  /// Bootstrap shape consumed by useInitData() in pages: { hostData, locale }.
  /// The HostData comes from the persistent record store, not a static bundle.
  private func bootstrapData() -> [String: Any] {
    let hostData = ServiceRegistry.shared.recordsStore.loadHostData()
    var data: [String: Any] = [
      "hostData": hostData,
      // UI-test hook, e.g. SIMCTL_CHILD_LEANON_LOCALE=zh-CN.
      "locale":
        ProcessInfo.processInfo.environment["LEANON_LOCALE"] == "zh-CN"
        ? "zh-CN" : "en",
    ]
    // UI-test/deep-link hook, e.g. SIMCTL_CHILD_LEANON_INITIAL_ROUTE=settings.
    if let route = ProcessInfo.processInfo.environment["LEANON_INITIAL_ROUTE"],
       ["today", "insights", "settings"].contains(route) {
      data["initialRoute"] = route
    }
    return data
  }
}
